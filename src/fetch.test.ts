import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import {
  clampResponseBytes,
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_RETRY_ATTEMPTS,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_TIMEOUT_MS,
  headerCrossesOrigin,
  MAX_REDIRECTS,
  MAX_RESPONSE_BYTES,
  MAX_RETRY_ATTEMPTS,
  MAX_TIMEOUT_MS,
  maxBytesConfigField,
  readArrayBuffer,
  readJsonOrText,
  readText,
  retryConfigFields,
  safeFetch,
  timeoutConfigField,
} from './fetch.js';
import { NodeError } from './errors.js';
import { toErrorResult } from './nodeErrors.js';
import type { IConfigField } from './types.js';
import { ssrfResolver } from './ssrf.js';

// Helper: a fetch mock that waits `delayMs` before resolving, and respects the
// AbortSignal so timeout/cancel behaviour can be observed.
function delayedFetch(delayMs: number, status = 200): typeof globalThis.fetch {
  return (_url, opts) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => resolve(new Response(null, { status })),
        delayMs,
      );
      opts?.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    });
}

// Helper: restore global fetch after each patched test.
function withFetch(mock: typeof globalThis.fetch, fn: () => Promise<void>): Promise<void> {
  // biome-ignore lint/nursery/noJsRestrictedProperties: saving the global to restore it after the test — the seam that installs the mock, not a request
  const orig = globalThis.fetch;
  globalThis.fetch = mock;
  return fn().finally(() => {
    globalThis.fetch = orig;
  });
}

// ------------------------------------------------------------------ safeFetch

// AC-2 — A request that answers in time returns its response
test('returns the response when fetch succeeds within the timeout [@spec:request-budget:AC-2]', () =>
  withFetch(delayedFetch(0), async () => {
    const res = await safeFetch('https://93.184.216.34', { timeoutMs: 500 });
    assert.equal(res.status, 200);
  }));

// AC-1 — A request that does not answer in time fails as a timeout
test('throws NodeError TIMEOUT when fetch takes longer than timeoutMs [@spec:request-budget:AC-1]', () =>
  withFetch(delayedFetch(200), async () => {
    await assert.rejects(
      () => safeFetch('https://93.184.216.34', { timeoutMs: 30 }),
      (err: unknown) => {
        assert.ok(err instanceof NodeError);
        assert.equal(err.code, 'TIMEOUT');
        assert.match(err.message, /30ms/);
        return true;
      },
    );
  }));

test('clamps timeoutMs to MAX_TIMEOUT_MS when scheduling the timeout', () => {
  const capturedDelays: number[] = [];
  const orig = globalThis.setTimeout;
  // @ts-expect-error partial overload patch
  globalThis.setTimeout = (fn: () => void, delay: number) => {
    capturedDelays.push(delay);
    return orig(fn, delay);
  };
  return withFetch(delayedFetch(0), async () => {
    try {
      await safeFetch('https://93.184.216.34', { timeoutMs: MAX_TIMEOUT_MS + 99_999 });
      assert.ok(
        capturedDelays.includes(MAX_TIMEOUT_MS),
        `expected ${MAX_TIMEOUT_MS} among captured delays: ${capturedDelays.join(', ')}`,
      );
    } finally {
      globalThis.setTimeout = orig;
    }
  });
});

// AC-3 — A budget above the ceiling is treated as the ceiling
test('TIMEOUT error message contains the clamped MAX_TIMEOUT_MS value [@spec:request-budget:AC-3]', () => {
  const orig = globalThis.setTimeout;
  // @ts-expect-error partial overload patch
  globalThis.setTimeout = (fn: () => void, _delay: number) => orig(fn, 0);
  return withFetch(delayedFetch(500), async () => {
    try {
      await assert.rejects(
        () => safeFetch('https://93.184.216.34', { timeoutMs: MAX_TIMEOUT_MS + 99_999 }),
        (err: unknown) => {
          assert.ok(err instanceof NodeError);
          assert.equal(err.code, 'TIMEOUT');
          assert.match(err.message, new RegExp(`${MAX_TIMEOUT_MS}ms`));
          return true;
        },
      );
    } finally {
      globalThis.setTimeout = orig;
    }
  });
});

test('NaN timeoutMs falls back to DEFAULT_TIMEOUT_MS', () => {
  const capturedDelays: number[] = [];
  const orig = globalThis.setTimeout;
  // @ts-expect-error partial overload patch
  globalThis.setTimeout = (fn: () => void, delay: number) => {
    capturedDelays.push(delay);
    return orig(fn, delay);
  };
  return withFetch(delayedFetch(0), async () => {
    try {
      await safeFetch('https://93.184.216.34', { timeoutMs: NaN });
      assert.ok(
        capturedDelays.includes(DEFAULT_TIMEOUT_MS),
        `expected ${DEFAULT_TIMEOUT_MS} among captured delays: ${capturedDelays.join(', ')}`,
      );
    } finally {
      globalThis.setTimeout = orig;
    }
  });
});

test('negative timeoutMs falls back to DEFAULT_TIMEOUT_MS', () => {
  const capturedDelays: number[] = [];
  const orig = globalThis.setTimeout;
  // @ts-expect-error partial overload patch
  globalThis.setTimeout = (fn: () => void, delay: number) => {
    capturedDelays.push(delay);
    return orig(fn, delay);
  };
  return withFetch(delayedFetch(0), async () => {
    try {
      await safeFetch('https://93.184.216.34', { timeoutMs: -1 });
      assert.ok(
        capturedDelays.includes(DEFAULT_TIMEOUT_MS),
        `expected ${DEFAULT_TIMEOUT_MS} among captured delays: ${capturedDelays.join(', ')}`,
      );
    } finally {
      globalThis.setTimeout = orig;
    }
  });
});

// AC-5 — Cancelling outranks the budget when both end together
test('ctxSignal reason wins over TIMEOUT when both abort simultaneously [@spec:request-budget:AC-5]', () => {
  const userAc = new AbortController();
  const orig = globalThis.setTimeout;
  // Intercept the per-attempt timer: also abort ctxSignal in the same turn so both
  // ac.signal and ctxSignal are aborted before the catch block runs.
  // @ts-expect-error partial overload patch
  globalThis.setTimeout = (fn: () => void, _delay: number) =>
    orig(() => { userAc.abort(); fn(); }, 0);

  // Fetch mock that blocks until the signal fires — no internal setTimeout so the
  // mock above only intercepts safeFetch's per-attempt timer.
  const blockingFetch: typeof globalThis.fetch = (_url, opts) =>
    new Promise<Response>((_resolve, reject) => {
      opts?.signal?.addEventListener('abort', () =>
        reject(new DOMException('The operation was aborted.', 'AbortError')),
      );
    });

  return withFetch(blockingFetch, async () => {
    try {
      await assert.rejects(
        () => safeFetch('https://93.184.216.34', { signal: userAc.signal }),
        (err: unknown) => {
          // Must be ctxSignal.reason (DOMException AbortError), not NodeError TIMEOUT
          assert.ok(err instanceof DOMException, `expected DOMException, got ${String(err)}`);
          assert.equal((err as DOMException).name, 'AbortError');
          return true;
        },
      );
    } finally {
      globalThis.setTimeout = orig;
    }
  });
});

// AC-4 — Cancelling ends the call, before or during flight
test('propagates AbortError when ctx.signal is already aborted [@spec:request-budget:AC-4]', async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(
    () => safeFetch('https://93.184.216.34', { signal: ac.signal }),
    (err: unknown) => {
      assert.ok(err instanceof DOMException);
      assert.equal((err as DOMException).name, 'AbortError');
      return true;
    },
  );
});

// AC-4 — Cancelling ends the call, before or during flight
test('propagates AbortError when ctx.signal is aborted mid-flight [@spec:request-budget:AC-4]', () =>
  withFetch(delayedFetch(500), async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 30);
    await assert.rejects(
      () => safeFetch('https://93.184.216.34', { timeoutMs: 5_000, signal: ac.signal }),
      (err: unknown) => {
        assert.ok(err instanceof DOMException);
        assert.equal((err as DOMException).name, 'AbortError');
        return true;
      },
    );
  }));

// ------------------------------------------- the budget over the whole exchange
//
// These run against a real server on loopback, not a fetch mock: a mocked
// Response's body is not tied to the request's signal, so a mock would pass on
// code that leaves a stalled body unbounded. The local-development relaxation is
// switched on for the duration of each test so the guard lets loopback through.

type Handler = Parameters<typeof createServer>[1];

/** A loopback server for one test; `closed` resolves once the server saw its client go. */
async function withServer(
  handler: NonNullable<Handler>,
  fn: (base: string, closed: Promise<void>) => Promise<void>,
): Promise<void> {
  let sawClose!: () => void;
  const closed = new Promise<void>((resolve) => { sawClose = resolve; });
  const server = createServer((req, res) => {
    res.on('close', sawClose);
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const key = 'RVNXX_SSRF_ALLOW_PRIVATE';
  const prev = process.env[key];
  process.env[key] = '1';
  try {
    await fn(`http://127.0.0.1:${port}`, closed);
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
    server.closeAllConnections();
    server.close();
  }
}

/** Answers with headers and one chunk, then sends nothing more. */
const stallAfterFirstChunk: NonNullable<Handler> = (_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.write('{"partial":');
};

function isTimeout(err: unknown): boolean {
  return err instanceof NodeError && err.code === 'TIMEOUT';
}

// AC-12 — An answer that stalls once it has started fails as a timeout
test('an answer that stalls after its first chunk ends as TIMEOUT at the budget, not before [@spec:request-budget:AC-12]', () =>
  withServer(stallAfterFirstChunk, async (base) => {
    const started = Date.now();
    const res = await safeFetch(base, { timeoutMs: 300 });
    assert.equal(res.status, 200);
    await assert.rejects(() => readJsonOrText(res), isTimeout);
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 280, `ended after ${elapsed}ms, before the 300ms budget`);
    assert.ok(elapsed < 1_500, `ended after ${elapsed}ms, long past the 300ms budget`);
  }));

// AC-12 — An answer that stalls once it has started fails as a timeout
test('a node that reads the body itself gets the same TIMEOUT, with nothing extra to pass [@spec:request-budget:AC-12]', () =>
  withServer(stallAfterFirstChunk, async (base) => {
    const res = await safeFetch(base, { timeoutMs: 200 });
    await assert.rejects(() => res.text(), isTimeout);
  }));

// AC-13 — One budget up to the answer, then a limit on how long it may go silent
test('an answer that keeps arriving is read whole, however long it takes in total [@spec:request-budget:AC-13]', () =>
  withServer(
    (_req, res) => {
      // Eight chunks 100ms apart: about 800ms in total against a 300ms budget,
      // never silent for more than a third of it.
      res.writeHead(200, { 'content-type': 'text/plain' });
      let sent = 0;
      const tick = setInterval(() => {
        sent++;
        if (sent < 8) res.write('x');
        else { clearInterval(tick); res.end('x'); }
      }, 100);
      res.on('close', () => clearInterval(tick));
    },
    async (base) => {
      const started = Date.now();
      const res = await safeFetch(base, { timeoutMs: 300 });
      assert.equal(res.url, `${base}/`);
      assert.equal(await readText(res), 'xxxxxxxx');
      assert.ok(Date.now() - started > 300, 'the answer finished inside one budget and proves nothing');
    },
  ));

// AC-13 — One budget up to the answer, then a limit on how long it may go silent
test('a redirect chain spends one budget, not one per hop [@spec:request-budget:AC-13]', () =>
  withServer(
    (req, res) => {
      // Each hop answers after 300ms: one hop fits the 500ms budget with 200ms to
      // spare, two overrun it by 100ms, so neither outcome rests on a tight race.
      setTimeout(() => {
        if (req.url === '/start') res.writeHead(302, { location: '/end' }).end();
        else res.end('done');
      }, 300);
    },
    async (base) => {
      // One hop alone fits, so the two-hop failure below is the shared budget.
      assert.equal(await (await safeFetch(`${base}/end`, { timeoutMs: 500 })).text(), 'done');
      await assert.rejects(() => safeFetch(`${base}/start`, { timeoutMs: 500 }), isTimeout);
    },
  ));

// AC-13 — One budget up to the answer, then a limit on how long it may go silent
test('an answer that finishes inside the budget is read whole [@spec:request-budget:AC-13]', () =>
  withServer(
    (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{"a":');
      setTimeout(() => res.end('1}'), 100);
    },
    async (base) => {
      const res = await safeFetch(base, { timeoutMs: 1_000 });
      assert.deepEqual(await readJsonOrText(res), { a: 1 });
    },
  ));

// AC-13 — One budget up to the answer, then a limit on how long it may go silent
test('an answer with a status the runtime passes on but cannot rebuild is still returned [@spec:request-budget:AC-13]', async () => {
  const server = createNetServer((socket) => {
    socket.on('data', () => socket.end('HTTP/1.1 600 Odd\r\nContent-Length: 2\r\n\r\nok'));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const key = 'RVNXX_SSRF_ALLOW_PRIVATE';
  const prev = process.env[key];
  process.env[key] = '1';
  try {
    const res = await safeFetch(`http://127.0.0.1:${port}/`, { timeoutMs: 1_000 });
    assert.equal(res.status, 600);
    assert.equal(await res.text(), 'ok');
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
    server.close();
  }
});

// AC-14 — Cancelling a stalled answer ends it as a cancellation
test('cancelling while an answer stalls ends the read with the cancellation, not a timeout [@spec:request-budget:AC-14]', () =>
  withServer(stallAfterFirstChunk, async (base) => {
    const ac = new AbortController();
    const reason = new Error('run cancelled');
    const res = await safeFetch(base, { timeoutMs: 5_000, signal: ac.signal });
    setTimeout(() => ac.abort(reason), 100);
    const started = Date.now();
    await assert.rejects(() => readArrayBuffer(res), (err: unknown) => err === reason);
    assert.ok(Date.now() - started < 1_000, 'the read waited for the budget instead of the cancellation');
  }));

// AC-15 — An answer that ran out of time lets go of its connection
test('an answer that times out closes its connection [@spec:request-budget:AC-15]', () =>
  withServer(stallAfterFirstChunk, async (base, closed) => {
    const res = await safeFetch(base, { timeoutMs: 200 });
    await assert.rejects(() => readArrayBuffer(res), isTimeout);
    await Promise.race([
      closed,
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error('the server never saw the connection close')), 1_000)),
    ]);
  }));

// AC-2 (response-reading) — the cap still holds while the budget runs over the body
test('the size cap still refuses a body without a length while the budget is running [@spec:response-reading:AC-2]', () =>
  withServer(
    (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.write(Buffer.alloc(64));
      res.write(Buffer.alloc(64));
    },
    async (base) => {
      const res = await safeFetch(base, { timeoutMs: 2_000 });
      await assert.rejects(
        () => readArrayBuffer(res, 100),
        (err: unknown) => err instanceof NodeError && err.code === 'RESPONSE_TOO_LARGE',
      );
    },
  ));

// ------------------------------------------------------------------ retry

// AC-6 — A failed attempt is retried, and the last failure is the one raised
test('retries on network error and throws after exhausting attempts [@spec:request-budget:AC-6]', async () => {
  let calls = 0;
  const failingFetch: typeof globalThis.fetch = () => {
    calls++;
    return Promise.reject(new Error('Network error'));
  };

  await withFetch(failingFetch, () =>
    assert.rejects(
      () => safeFetch('https://93.184.216.34', { retry: { attempts: 2, delayMs: 0 } }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error).message, 'Network error');
        assert.equal(calls, 3); // 1 initial + 2 retries
        return true;
      },
    ),
  );
});

// AC-7 — An attempt that succeeds after a failure returns its answer
test('succeeds on the second attempt [@spec:request-budget:AC-7]', async () => {
  let calls = 0;
  const flakyFetch: typeof globalThis.fetch = () => {
    calls++;
    if (calls === 1) return Promise.reject(new Error('flaky'));
    return Promise.resolve(new Response(null, { status: 200 }));
  };

  await withFetch(flakyFetch, async () => {
    const res = await safeFetch('https://93.184.216.34', { retry: { attempts: 1, delayMs: 0 } });
    assert.equal(res.status, 200);
    assert.equal(calls, 2);
  });
});

// AC-8 — Cancelling stops the retrying, without waiting the delay out
test('stops retrying immediately when ctx.signal is aborted between attempts [@spec:request-budget:AC-8]', async () => {
  const ac = new AbortController();
  let calls = 0;
  const failingFetch: typeof globalThis.fetch = () => {
    calls++;
    ac.abort(); // abort after first call
    return Promise.reject(new Error('fail'));
  };

  await withFetch(failingFetch, () =>
    assert.rejects(
      () =>
        safeFetch('https://93.184.216.34', {
          signal: ac.signal,
          retry: { attempts: 3, delayMs: 0 },
        }),
      () => {
        assert.equal(calls, 1); // only one attempt despite 3 retries configured
        return true;
      },
    ),
  );
});

// AC-8 — Cancelling stops the retrying, without waiting the delay out
test('abort during retry delay interrupts the sleep immediately [@spec:request-budget:AC-8]', async () => {
  const userAc = new AbortController();
  let calls = 0;
  const failingFetch: typeof globalThis.fetch = () => {
    calls++;
    return Promise.reject(new Error('network error'));
  };

  // Abort the signal shortly after the first attempt fails, while the 5 s delay is running.
  const abortTimer = setTimeout(() => userAc.abort(), 30);

  const start = Date.now();
  await withFetch(failingFetch, async () => {
    await assert.rejects(
      () =>
        safeFetch('https://93.184.216.34', {
          signal: userAc.signal,
          retry: { attempts: 3, delayMs: 5_000 },
        }),
      () => true,
    );
  });
  clearTimeout(abortTimer);
  const elapsed = Date.now() - start;

  assert.equal(calls, 1);
  assert.ok(elapsed < 1_000, `expected <1 s but took ${elapsed} ms`);
});

// ----------------------------------------------------------- config factories

// AC-9 — The budget can be handed to the workflow author as a setting, bounded
test('timeoutConfigField returns a number field with correct key and defaults [@spec:request-budget:AC-9]', () => {
  const field = timeoutConfigField();
  assert.equal(field.key, 'timeoutMs');
  assert.equal(field.type, 'number');
  assert.equal(field.default, DEFAULT_TIMEOUT_MS);
  assert.equal(field.validation?.min, 100);
  assert.equal(field.validation?.max, MAX_TIMEOUT_MS);
});

// AC-9 — The budget can be handed to the workflow author as a setting, bounded
test('timeoutConfigField accepts custom default and max [@spec:request-budget:AC-9]', () => {
  const field = timeoutConfigField({ default: 5_000, max: 60_000 });
  assert.equal(field.default, 5_000);
  assert.equal(field.validation?.max, 60_000);
});

// AC-10 — The retry policy can be handed over the same way
test('retryConfigFields returns two fields with correct keys and defaults [@spec:request-budget:AC-10]', () => {
  const [attemptsField, delayField] = retryConfigFields();
  assert.equal(attemptsField?.key, 'retryAttempts');
  assert.equal(attemptsField?.type, 'number');
  assert.equal(attemptsField?.default, DEFAULT_RETRY_ATTEMPTS);
  assert.equal(attemptsField?.validation?.min, 0);
  assert.equal(attemptsField?.validation?.max, MAX_RETRY_ATTEMPTS);

  assert.equal(delayField?.key, 'retryDelayMs');
  assert.equal(delayField?.default, DEFAULT_RETRY_DELAY_MS);
  assert.equal(delayField?.validation?.min, 100);
});

// AC-10 — The retry policy can be handed over the same way
test('retryConfigFields accepts custom defaults [@spec:request-budget:AC-10]', () => {
  const [attemptsField, delayField] = retryConfigFields({ defaultAttempts: 3, defaultDelayMs: 2_000 });
  assert.equal(attemptsField?.default, 3);
  assert.equal(delayField?.default, 2_000);
});

// Every setting these factories produce, so a new factory is one row rather than
// a forgotten test — and so AC-1 and AC-2 below are proven over all of them
// rather than over whichever one somebody remembered.
const offeredSettings: [string, IConfigField][] = [
  ['maxBytesConfigField', maxBytesConfigField()],
  ['timeoutConfigField', timeoutConfigField()],
  ...retryConfigFields().map(
    (field, i) => [`retryConfigFields[${i}]`, field] as [string, IConfigField],
  ),
];

// The languages the node packages write every author-facing string in. A third
// one arriving here is a change to what these factories promise, which is why
// this list is written down rather than inferred from whatever the fields hold.
const LANGUAGES = ['en', 'de'] as const;

// One field's worth of AC-1, as a function rather than inline in the loop, so the
// control below can aim the *same* check at a field written the old way and watch
// it fail. A check that is only ever run over fields that pass says nothing about
// itself.
function assertLocalized(name: string, value: unknown, what: string): void {
  assert.equal(typeof value, 'object', `${name}: the ${what} is not a locale map`);
  for (const lang of LANGUAGES) {
    const text = (value as Record<string, string> | null)?.[lang];
    assert.equal(typeof text, 'string', `${name}: no ${lang} ${what}`);
    assert.notEqual((text as string).trim(), '', `${name}: blank ${lang} ${what}`);
  }
}

// AC-1 — A setting this package offers is written in every language the packages write
test('every offered setting carries a label in each language [@spec:offered-settings:AC-1]', () => {
  assert.ok(offeredSettings.length > 0, 'no setting was checked at all');
  for (const [name, field] of offeredSettings) {
    assertLocalized(name, field.label, 'label');
  }
});

// AC-1 — A setting this package offers is written in every language the packages write
test('every offered setting carries an explanation in each language [@spec:offered-settings:AC-1]', () => {
  assert.ok(offeredSettings.length > 0, 'no setting was checked at all');
  for (const [name, field] of offeredSettings) {
    assertLocalized(name, field.description, 'description');
  }
});

// The control for AC-1 — the check itself, aimed at a field written the way these
// factories used to write one. It has to reject it, or the two tests above are
// green because the check objects to nothing rather than because the settings pass.
test('the check AC-1 makes rejects a field written the old way [@spec:offered-settings:AC-1]', () => {
  const bare: IConfigField = { key: 'timeoutMs', label: 'Timeout (ms)', type: 'number' };

  assert.throws(() => assertLocalized('bare', bare.label, 'label'));
  assert.throws(() => assertLocalized('bare', bare.description, 'description'));
});

// AC-2 — A setting says what it does, not only what it is called
test('every offered setting explains itself in more than its label [@spec:offered-settings:AC-2]', () => {
  assert.ok(offeredSettings.length > 0, 'no setting was checked at all');
  for (const [name, field] of offeredSettings) {
    for (const lang of LANGUAGES) {
      const label = (field.label as Record<string, string>)[lang] ?? '';
      const description = (field.description as Record<string, string>)[lang] ?? '';
      assert.notEqual(description, label, `${name}: the ${lang} description restates the label`);
      assert.ok(
        description.length > label.length,
        `${name}: the ${lang} description says no more than the label`,
      );
    }
  }
});

// ------------------------------------------------ size cap: read* helpers

// Build a Response whose body is a stream of the given chunks. Streams carry no
// intrinsic length, so no Content-Length header is set unless `init` adds one —
// letting us exercise the streaming-enforcement path independently of the
// fast-reject path.
function streamResponse(chunks: Uint8Array[], init?: ResponseInit): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Response(stream, init);
}

function bytes(n: number): Uint8Array {
  return new Uint8Array(n).fill(65); // 'A'
}

// AC-1 — An answer within the cap is returned whole
test('readArrayBuffer returns the full body when under the cap [@spec:response-reading:AC-1]', async () => {
  const res = streamResponse([bytes(4), bytes(4)]);
  const buf = await readArrayBuffer(res, 100);
  assert.equal(buf.byteLength, 8);
});

// AC-2 — An answer that outgrows the cap while arriving is refused
test('readArrayBuffer enforces the cap while streaming (no Content-Length) [@spec:response-reading:AC-2]', async () => {
  const res = streamResponse([bytes(6), bytes(6)]); // 12 bytes, cap 10
  await assert.rejects(
    () => readArrayBuffer(res, 10),
    (err: unknown) => {
      assert.ok(err instanceof NodeError);
      assert.equal(err.code, 'RESPONSE_TOO_LARGE');
      assert.equal(err.meta?.['status'], 200);
      return true;
    },
  );
});

// A Response-shaped fake whose body records what was done to it: reading it is an
// error, cancelling it is not. (A real undici Response eagerly drains a stream body
// on construction, so a read-side-effect flag can't observe this.) The fast-reject
// must take the second and never the first — AC-3 is the not-read half, AC-12 the
// let-go half.
function fastRejectFake(): { res: Response; state: { read: boolean; cancelled: boolean } } {
  const state = { read: false, cancelled: false };
  const body = {
    async cancel(): Promise<void> {
      state.cancelled = true;
    },
    getReader(): never {
      state.read = true;
      throw new Error('body must not be read on fast-reject');
    },
  };
  return {
    res: { status: 200, headers: new Headers({ 'content-length': '1000000' }), body } as unknown as Response,
    state,
  };
}

// AC-3 — An answer that declares an oversized length is refused untouched
test('readArrayBuffer fast-rejects on an oversized Content-Length without reading the body [@spec:response-reading:AC-3]', async () => {
  const { res, state } = fastRejectFake();
  await assert.rejects(
    () => readArrayBuffer(res, 100),
    (err: unknown) => err instanceof NodeError && err.code === 'RESPONSE_TOO_LARGE',
  );
  assert.equal(state.read, false, 'body must not be read when Content-Length already exceeds the cap');
});

// PO-185: this exit used to be the one way out of a read that left the connection
// held — `guardedFetch` cancels a 3xx body ahead of every throw, and the streaming
// overrun below cancels too, but the header fast-reject threw straight past the
// body. A bare `res.text()` never reached it, because it always consumed the body;
// the token exchange reaching it is what made it observable.
// AC-12 — An answer refused for its size lets go of its connection
test('readArrayBuffer cancels the body when it refuses on Content-Length [@spec:response-reading:AC-12]', async () => {
  const { res, state } = fastRejectFake();
  await assert.rejects(
    () => readArrayBuffer(res, 100),
    (err: unknown) => err instanceof NodeError && err.code === 'RESPONSE_TOO_LARGE',
  );
  assert.equal(state.cancelled, true, 'the body must be discarded so the connection is released');
});

// AC-12 — An answer refused for its size lets go of its connection
test('readArrayBuffer cancels the body when it overruns the cap while streaming [@spec:response-reading:AC-12]', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    // Left open for the reason AC-4's test spells out: an already-closed stream is
    // cancelled without the underlying source hearing about it.
    start(controller) {
      controller.enqueue(bytes(20));
    },
    cancel() {
      cancelled = true;
    },
  });
  const fake = { status: 200, headers: new Headers(), body: stream } as unknown as Response;
  await assert.rejects(
    () => readArrayBuffer(fake, 10),
    (err: unknown) => err instanceof NodeError && err.code === 'RESPONSE_TOO_LARGE',
  );
  assert.equal(cancelled, true, 'the body must be discarded so the connection is released');
});

// AC-1 — An answer within the cap is returned whole
// Positive control for the two AC-12 tests above: a read that stays under the cap
// consumes the body to completion, so nothing is left for a cancel to release.
test('readArrayBuffer consumes the body it is allowed to keep [@spec:response-reading:AC-1]', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes(4));
      controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  const fake = { status: 200, headers: new Headers(), body: stream } as unknown as Response;
  assert.equal((await readArrayBuffer(fake, 100)).byteLength, 4);
  assert.equal(cancelled, false, 'a body read to the end needs no cancelling');
});

// AC-4 — An oversized answer is reported as oversized even if discarding it fails
test('readArrayBuffer surfaces RESPONSE_TOO_LARGE even when the stream cancel rejects [@spec:response-reading:AC-4]', async () => {
  // Underlying cancel() throws → reader.cancel() rejects. The overrun must still
  // surface as RESPONSE_TOO_LARGE, not the cancellation error.
  //
  // The stream is deliberately left open. Cancelling an already-closed stream
  // resolves without the underlying source hearing about it, so a
  // `controller.close()` here would leave the throwing cancel uncalled and the
  // test green for the wrong reason — and a body cancelled mid-overrun is open by
  // definition.
  let cancelAttempted = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes(20));
    },
    cancel() {
      cancelAttempted = true;
      throw new Error('cancel failed');
    },
  });
  const fake = { status: 200, headers: new Headers(), body: stream } as unknown as Response;
  await assert.rejects(
    () => readArrayBuffer(fake, 10),
    (err: unknown) => err instanceof NodeError && err.code === 'RESPONSE_TOO_LARGE',
  );
  assert.equal(cancelAttempted, true, 'the failing cancel must actually have been attempted');
});

// AC-1 — An answer within the cap is returned whole
test('readArrayBuffer accepts a body exactly at the cap [@spec:response-reading:AC-1]', async () => {
  const res = streamResponse([bytes(10)]);
  const buf = await readArrayBuffer(res, 10);
  assert.equal(buf.byteLength, 10);
});

// AC-6 — Text is decoded as UTF-8
test('readText decodes the body as UTF-8 [@spec:response-reading:AC-6]', async () => {
  const res = new Response('héllo', { headers: { 'content-type': 'text/plain' } });
  assert.equal(await readText(res, 100), 'héllo');
});

// AC-7 — JSON is parsed when the answer says it is JSON, and only then
test('readJsonOrText parses JSON when Content-Type is application/json [@spec:response-reading:AC-7]', async () => {
  const res = new Response(JSON.stringify({ a: 1 }), {
    headers: { 'content-type': 'application/json' },
  });
  assert.deepEqual(await readJsonOrText(res, 100), { a: 1 });
});

// AC-7 — JSON is parsed when the answer says it is JSON, and only then
test('readJsonOrText returns raw text for non-JSON content types [@spec:response-reading:AC-7]', async () => {
  const res = new Response('plain body', { headers: { 'content-type': 'text/plain' } });
  assert.equal(await readJsonOrText(res, 100), 'plain body');
});

// AC-7 — JSON is parsed when the answer says it is JSON, and only then
test('readJsonOrText matches Content-Type case-insensitively and ignores parameters [@spec:response-reading:AC-7]', async () => {
  const res = new Response(JSON.stringify({ a: 1 }), {
    headers: { 'content-type': 'Application/JSON; charset=utf-8' },
  });
  assert.deepEqual(await readJsonOrText(res, 100), { a: 1 });
});

// AC-7 — JSON is parsed when the answer says it is JSON, and only then
test('readJsonOrText recognises +json structured-syntax suffixes [@spec:response-reading:AC-7]', async () => {
  const res = new Response(JSON.stringify({ a: 1 }), {
    headers: { 'content-type': 'application/vnd.api+json' },
  });
  assert.deepEqual(await readJsonOrText(res, 100), { a: 1 });
});

// AC-7 — JSON is parsed when the answer says it is JSON, and only then
test('readJsonOrText does not mis-detect application/jsonp as JSON [@spec:response-reading:AC-7]', async () => {
  const res = new Response('callback({"a":1})', {
    headers: { 'content-type': 'application/jsonp' },
  });
  assert.equal(await readJsonOrText(res, 100), 'callback({"a":1})');
});

// AC-8 — An answer that claims to be JSON and is not is reported as such
test('readJsonOrText throws RESPONSE_PARSE_ERROR on malformed JSON [@spec:response-reading:AC-8]', async () => {
  const res = new Response('{not valid json', {
    headers: { 'content-type': 'application/json' },
  });
  await assert.rejects(
    () => readJsonOrText(res, 100),
    (err: unknown) => {
      assert.ok(err instanceof NodeError);
      assert.equal(err.code, 'RESPONSE_PARSE_ERROR');
      assert.equal(err.meta?.['status'], 200);
      return true;
    },
  );
});

// AC-9 — The cap holds for JSON answers too
test('readJsonOrText enforces the cap on JSON bodies too [@spec:response-reading:AC-9]', async () => {
  const big = JSON.stringify({ v: 'x'.repeat(50) });
  const res = new Response(big, { headers: { 'content-type': 'application/json' } });
  await assert.rejects(
    () => readJsonOrText(res, 10),
    (err: unknown) => err instanceof NodeError && err.code === 'RESPONSE_TOO_LARGE',
  );
});

// AC-10 — Reading without naming a cap uses the package default
test('read* helpers default to DEFAULT_MAX_RESPONSE_BYTES [@spec:response-reading:AC-10]', async () => {
  const res = new Response('small');
  const buf = await readArrayBuffer(res);
  assert.equal(buf.byteLength, 5);
  assert.ok(DEFAULT_MAX_RESPONSE_BYTES > 1_000_000);
});

// AC-11 — The cap can be handed to the workflow author as a setting, bounded
test('maxBytesConfigField returns a number field defaulting to the SDK cap [@spec:response-reading:AC-11]', () => {
  const field = maxBytesConfigField();
  assert.equal(field.key, 'maxBytes');
  assert.equal(field.type, 'number');
  assert.equal(field.default, DEFAULT_MAX_RESPONSE_BYTES);
  assert.equal(field.validation?.min, 1);
  // No explicit max → hard ceiling, so a workflow author can't defeat the guard.
  assert.equal(field.validation?.max, MAX_RESPONSE_BYTES);
});

// AC-11 — The cap can be handed to the workflow author as a setting, bounded
test('maxBytesConfigField accepts custom default and max [@spec:response-reading:AC-11]', () => {
  const field = maxBytesConfigField({ default: 1024, max: 4096 });
  assert.equal(field.default, 1024);
  assert.equal(field.validation?.max, 4096);
});

// AC-11 — The cap can be handed to the workflow author as a setting, bounded
test('maxBytesConfigField clamps a custom max above the hard ceiling [@spec:response-reading:AC-11]', () => {
  const field = maxBytesConfigField({ max: MAX_RESPONSE_BYTES * 4 });
  assert.equal(field.validation?.max, MAX_RESPONSE_BYTES);
});

// ------------------------------------------------ size cap: hard ceiling

// AC-5 — A cap above the hard ceiling does not lift it
test('clampResponseBytes bounds a request into [1, MAX_RESPONSE_BYTES] [@spec:response-reading:AC-5]', () => {
  assert.equal(clampResponseBytes(1024), 1024);
  assert.equal(clampResponseBytes(MAX_RESPONSE_BYTES), MAX_RESPONSE_BYTES);
  assert.equal(clampResponseBytes(MAX_RESPONSE_BYTES + 1), MAX_RESPONSE_BYTES);
  assert.equal(clampResponseBytes(Number.POSITIVE_INFINITY), MAX_RESPONSE_BYTES);
  assert.equal(clampResponseBytes(0), MAX_RESPONSE_BYTES);
  assert.equal(clampResponseBytes(-5), MAX_RESPONSE_BYTES);
  assert.ok(MAX_RESPONSE_BYTES > DEFAULT_MAX_RESPONSE_BYTES);
});

// AC-5 — A cap above the hard ceiling does not lift it
test('readArrayBuffer clamps maxBytes to the hard ceiling (Content-Length fast-reject) [@spec:response-reading:AC-5]', async () => {
  // A caller passing a maxBytes above the ceiling must not lift the guard: a
  // Content-Length just over MAX_RESPONSE_BYTES is still rejected. The body is
  // cancelled rather than read on the way out (AC-12), so reading it is the error
  // here, not touching it.
  let read = false;
  const fake = {
    status: 200,
    headers: new Headers({ 'content-length': String(MAX_RESPONSE_BYTES + 1) }),
    body: {
      async cancel(): Promise<void> {},
      getReader(): never {
        read = true;
        throw new Error('body must not be read on fast-reject');
      },
    },
  } as unknown as Response;
  await assert.rejects(
    () => readArrayBuffer(fake, MAX_RESPONSE_BYTES * 10),
    (err: unknown) => err instanceof NodeError && err.code === 'RESPONSE_TOO_LARGE',
  );
  assert.equal(read, false, 'the ceiling refuses before the body is read');
});

// ------------------------------------------------ SSRF guard + redirects

interface RequestRecord {
  url: string;
  method: string;
  headers: Headers;
  hasBody: boolean;
}

// A fetch mock that records each request and replays a scripted list of
// responses (last entry reused once exhausted). Each response may be a factory
// so it can react to the recorded request.
function scriptedFetch(
  responses: Array<Response | ((req: RequestRecord) => Response)>,
): { fetch: typeof globalThis.fetch; calls: RequestRecord[] } {
  const calls: RequestRecord[] = [];
  let i = 0;
  const fetchMock: typeof globalThis.fetch = async (input, init) => {
    const url = input instanceof URL ? input.href : String(input);
    const rec: RequestRecord = {
      url,
      method: (init?.method ?? 'GET').toUpperCase(),
      headers: new Headers(init?.headers ?? undefined),
      hasBody: init?.body != null,
    };
    calls.push(rec);
    const entry = responses[Math.min(i, responses.length - 1)]!;
    i++;
    return typeof entry === 'function' ? entry(rec) : entry;
  };
  return { fetch: fetchMock, calls };
}

function redirect(status: number, location: string): Response {
  return new Response(null, { status, headers: { location } });
}

// Run `fn` with the guard's default resolver pointed at fixed address(es). The
// resolver seam is used here (rather than a per-call option) because safeFetch
// intentionally exposes no `lookup` on its public options — the guard is not
// opt-out-able by callers.
function withLookup(addresses: string[], fn: () => Promise<void>): Promise<void> {
  const orig = ssrfResolver.lookup;
  ssrfResolver.lookup = async () =>
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  return fn().finally(() => {
    ssrfResolver.lookup = orig;
  });
}

// AC-1 — A request to a private or reserved target is refused before it is sent
test('safeFetch blocks a host that resolves to a private address before any fetch [@spec:ssrf-guard:AC-1]', () => {
  const { fetch: mock, calls } = scriptedFetch([new Response(null, { status: 200 })]);
  return withLookup(['10.0.0.5'], () =>
    withFetch(mock, async () => {
      await assert.rejects(
        () => safeFetch('https://intranet.example'),
        (err: unknown) => {
          assert.ok(err instanceof NodeError);
          assert.equal(err.code, 'BLOCKED_ADDRESS');
          assert.equal(err.meta?.['status'], 0);
          return true;
        },
      );
      assert.equal(calls.length, 0, 'fetch must not be called for a blocked address');
    }),
  );
});

// AC-2 — A public target is allowed through, by each of the three ways in
test('safeFetch allows a host that resolves to a public address [@spec:ssrf-guard:AC-2]', () => {
  const { fetch: mock, calls } = scriptedFetch([new Response(null, { status: 200 })]);
  return withLookup(['93.184.216.34'], () =>
    withFetch(mock, async () => {
      const res = await safeFetch('https://api.example');
      assert.equal(res.status, 200);
      assert.equal(calls.length, 1);
    }),
  );
});

// AC-5 — A redirect cannot carry a request from a public target to a private one
test('safeFetch rejects a redirect to a private target (redirect-bypass guard) [@spec:ssrf-guard:AC-5]', () => {
  // Public first hop, then a 302 pointing at the cloud metadata endpoint. The hop
  // stays on https deliberately: an http target would trip the downgrade check
  // above the address guard, and both throw BLOCKED_ADDRESS — so the test would
  // pass with the address guard switched off entirely.
  const { fetch: mock, calls } = scriptedFetch([
    redirect(302, 'https://169.254.169.254/latest/meta-data/'),
    new Response(null, { status: 200 }),
  ]);
  return withFetch(mock, async () => {
    await assert.rejects(
      () => safeFetch('https://93.184.216.34/start'),
      (err: unknown) => {
        assert.ok(err instanceof NodeError);
        assert.equal(err.code, 'BLOCKED_ADDRESS');
        return true;
      },
    );
    assert.equal(calls.length, 1, 'the private redirect target must never be fetched');
  });
});

// AC-6 — A redirect may not downgrade an https request to http
test('safeFetch rejects an https→http downgrade on redirect [@spec:ssrf-guard:AC-6]', () => {
  const { fetch: mock, calls } = scriptedFetch([
    redirect(302, 'http://93.184.216.35/next'),
    new Response(null, { status: 200 }),
  ]);
  return withFetch(mock, async () => {
    await assert.rejects(
      () => safeFetch('https://93.184.216.34/start'),
      (err: unknown) => err instanceof NodeError && err.code === 'BLOCKED_ADDRESS',
    );
    assert.equal(calls.length, 1, 'the downgraded target must never be fetched');
  });
});

// AC-6 — A redirect may not downgrade an https request to http
test('safeFetch allows an http→https upgrade on redirect [@spec:ssrf-guard:AC-6]', () => {
  const { fetch: mock, calls } = scriptedFetch([
    redirect(302, 'https://93.184.216.35/next'),
    new Response(null, { status: 200 }),
  ]);
  return withFetch(mock, async () => {
    const res = await safeFetch('http://93.184.216.34/start');
    assert.equal(res.status, 200);
    assert.equal(calls.length, 2);
  });
});

// AC-5 — A redirect cannot carry a request from a public target to a private one
// AC-2 — A chain that ends returns the answer at the end of it
test('safeFetch follows a public redirect and returns the final response [@spec:ssrf-guard:AC-5] [@spec:redirect-following:AC-2]', () => {
  const { fetch: mock, calls } = scriptedFetch([
    redirect(302, 'https://93.184.216.35/next'),
    new Response('ok', { status: 200 }),
  ]);
  return withFetch(mock, async () => {
    const res = await safeFetch('https://93.184.216.34/start');
    assert.equal(res.status, 200);
    assert.equal(calls.length, 2);
    assert.equal(calls[1]?.url, 'https://93.184.216.35/next');
  });
});

// AC-1 — A chain that does not end is stopped, and says so
test('safeFetch throws TOO_MANY_REDIRECTS past MAX_REDIRECTS hops [@spec:redirect-following:AC-1]', () => {
  const { fetch: mock, calls } = scriptedFetch([redirect(302, 'https://93.184.216.34/loop')]);
  return withFetch(mock, async () => {
    await assert.rejects(
      () => safeFetch('https://93.184.216.34/loop'),
      (err: unknown) => {
        assert.ok(err instanceof NodeError);
        assert.equal(err.code, 'TOO_MANY_REDIRECTS');
        return true;
      },
    );
    assert.equal(calls.length, MAX_REDIRECTS + 1);
  });
});

// AC-3 — A target that cannot be read as an address is refused, not guessed at
test('safeFetch rejects a redirect with an invalid Location header [@spec:redirect-following:AC-3]', () => {
  const { fetch: mock, calls } = scriptedFetch([
    redirect(302, 'http://'), // unparseable relative to the base
    new Response(null, { status: 200 }),
  ]);
  return withFetch(mock, async () => {
    await assert.rejects(
      () => safeFetch('https://93.184.216.34/start'),
      (err: unknown) => err instanceof NodeError && err.code === 'BLOCKED_ADDRESS',
    );
    assert.equal(calls.length, 1, 'an invalid redirect target must never be fetched');
  });
});

// AC-4 — The connection is let go on the way out, including the failing ways
test('safeFetch releases the 3xx response socket on the TOO_MANY_REDIRECTS path [@spec:redirect-following:AC-4]', () => {
  let cancelled = false;
  const bodied = () =>
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      { status: 302, headers: { location: 'https://93.184.216.34/loop' } },
    );
  const { fetch: mock } = scriptedFetch([bodied]);
  return withFetch(mock, async () => {
    await assert.rejects(
      () => safeFetch('https://93.184.216.34/loop'),
      (err: unknown) => err instanceof NodeError && err.code === 'TOO_MANY_REDIRECTS',
    );
    assert.equal(cancelled, true, 'the redirect body must be cancelled even on the error path');
  });
});

// AC-11 — A refusal that cannot change is not asked again
test('safeFetch does not retry a blocked redirect target [@spec:request-budget:AC-11]', () => {
  const { fetch: mock, calls } = scriptedFetch([redirect(302, 'http://127.0.0.1/')]);
  return withFetch(mock, async () => {
    await assert.rejects(
      () => safeFetch('https://93.184.216.34/start', { retry: { attempts: 3, delayMs: 0 } }),
      (err: unknown) => err instanceof NodeError && err.code === 'BLOCKED_ADDRESS',
    );
    assert.equal(calls.length, 1, 'a deterministic block must not be retried');
  });
});

// AC-5 — A redirect that changes the meaning of the request changes the request
test('safeFetch downgrades POST to GET and drops the body on a 303 redirect [@spec:redirect-following:AC-5]', () => {
  const { fetch: mock, calls } = scriptedFetch([
    redirect(303, 'https://93.184.216.34/result'),
    new Response(null, { status: 200 }),
  ]);
  return withFetch(mock, async () => {
    await safeFetch('https://93.184.216.34/submit', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(calls[0]?.method, 'POST');
    assert.equal(calls[0]?.hasBody, true);
    assert.equal(calls[1]?.method, 'GET');
    assert.equal(calls[1]?.hasBody, false);
  });
});

// AC-6 — A body goes nowhere but where the caller sent it
for (const status of [307, 308]) {
  test(`safeFetch refuses a cross-origin ${status} that would resend the body, and sends nothing there [@spec:redirect-following:AC-6]`, () => {
    const { fetch: mock, calls } = scriptedFetch([
      redirect(status, 'https://93.184.216.35/token'),
      new Response(null, { status: 200 }),
    ]);
    return withFetch(mock, async () => {
      await assert.rejects(
        () =>
          safeFetch('https://93.184.216.34/token', {
            method: 'POST',
            body: 'client_secret=S',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            retry: { attempts: 3, delayMs: 0 },
          }),
        (err: unknown) =>
          err instanceof NodeError &&
          err.code === 'BLOCKED_ADDRESS' &&
          err.message === `Blocked ${status} redirect to another origin: it would resend the request body to https://93.184.216.35`,
      );
      assert.equal(calls.length, 1, 'the other origin receives nothing, and the refusal is not retried');
    });
  });
}

// AC-6 — A body goes nowhere but where the caller sent it
for (const [status, method] of [[301, 'PUT'], [302, 'PATCH'], [301, 'DELETE']] as const) {
  test(`safeFetch refuses a cross-origin ${status} that keeps ${method} and its body [@spec:redirect-following:AC-6]`, () => {
    const { fetch: mock, calls } = scriptedFetch([
      redirect(status, 'https://93.184.216.35/items/1'),
      new Response(null, { status: 200 }),
    ]);
    return withFetch(mock, async () => {
      await assert.rejects(
        () => safeFetch('https://93.184.216.34/items/1', { method, body: '{"name":"x"}' }),
        (err: unknown) => err instanceof NodeError && err.code === 'BLOCKED_ADDRESS' && /would resend the request body/.test(err.message),
      );
      assert.equal(calls.length, 1);
    });
  });
}

// AC-6 — A body goes nowhere but where the caller sent it
test('safeFetch refuses a body-carrying cross-origin hop before it looks the other host up [@spec:redirect-following:AC-6]', () => {
  const { fetch: mock, calls } = scriptedFetch([
    redirect(307, 'https://collector.example/token'),
    new Response(null, { status: 200 }),
  ]);
  const looked: string[] = [];
  const orig = ssrfResolver.lookup;
  ssrfResolver.lookup = async (host: string) => {
    looked.push(host);
    return [{ address: '93.184.216.35', family: 4 }];
  };
  return withFetch(mock, async () => {
    await assert.rejects(
      () => safeFetch('https://93.184.216.34/token', { method: 'POST', body: 'client_secret=S' }),
      (err: unknown) => err instanceof NodeError && /would resend the request body to https:\/\/collector\.example/.test(err.message),
    );
    assert.deepEqual(looked.filter((h) => h === 'collector.example'), [], 'the other origin is never looked up');
    assert.equal(calls.length, 1);
  }).finally(() => {
    ssrfResolver.lookup = orig;
  });
});

// AC-6 — A body goes nowhere but where the caller sent it
for (const [label, body] of [
  ['an empty string', ''],
  ['an empty buffer', new Uint8Array(0)],
] as const) {
  test(`safeFetch follows a cross-origin 307 whose body is ${label}, since nothing would be sent [@spec:redirect-following:AC-6]`, () => {
    const { fetch: mock, calls } = scriptedFetch([
      redirect(307, 'https://93.184.216.35/next'),
      new Response(null, { status: 200 }),
    ]);
    return withFetch(mock, async () => {
      const res = await safeFetch('https://93.184.216.34/start', { method: 'POST', body });
      assert.equal(res.status, 200);
      assert.equal(calls[1]?.url, 'https://93.184.216.35/next');
    });
  });
}

// AC-6 — A body goes nowhere but where the caller sent it
test('safeFetch still resends the body on a same-origin 307 [@spec:redirect-following:AC-6]', () => {
  const { fetch: mock, calls } = scriptedFetch([
    redirect(307, 'https://93.184.216.34/v2/submit'),
    new Response(null, { status: 200 }),
  ]);
  return withFetch(mock, async () => {
    const res = await safeFetch('https://93.184.216.34/submit', { method: 'POST', body: 'a=1' });
    assert.equal(res.status, 200);
    assert.equal(calls[1]?.method, 'POST');
    assert.equal(calls[1]?.hasBody, true);
  });
});

// AC-6 — A body goes nowhere but where the caller sent it
test('safeFetch follows a cross-origin 307 of a request without a body [@spec:redirect-following:AC-6]', () => {
  const { fetch: mock, calls } = scriptedFetch([
    redirect(307, 'https://93.184.216.35/file'),
    new Response(null, { status: 200 }),
  ]);
  return withFetch(mock, async () => {
    const res = await safeFetch('https://93.184.216.34/file');
    assert.equal(res.status, 200);
    assert.equal(calls[1]?.url, 'https://93.184.216.35/file');
  });
});

// AC-7 — A secret the caller sent in a header does not cross an origin boundary on a redirect
test('safeFetch strips auth-bearing headers on a cross-origin redirect [@spec:ssrf-guard:AC-7]', () => {
  const { fetch: mock, calls } = scriptedFetch([
    redirect(302, 'https://93.184.216.35/next'),
    new Response(null, { status: 200 }),
  ]);
  return withFetch(mock, async () => {
    await safeFetch('https://93.184.216.34/start', {
      headers: {
        authorization: 'Bearer secret',
        cookie: 'session=abc',
        'proxy-authorization': 'Basic xyz',
      },
    });
    assert.equal(calls[0]?.headers.get('authorization'), 'Bearer secret');
    assert.equal(calls[0]?.headers.get('cookie'), 'session=abc');
    assert.equal(calls[0]?.headers.get('proxy-authorization'), 'Basic xyz');
    assert.equal(calls[1]?.headers.get('authorization'), null, 'auth must not cross the origin boundary');
    assert.equal(calls[1]?.headers.get('cookie'), null, 'cookie must not cross the origin boundary');
    assert.equal(
      calls[1]?.headers.get('proxy-authorization'),
      null,
      'proxy-authorization must not cross the origin boundary',
    );
  });
});

// AC-7 — A secret the caller sent in a header does not cross an origin boundary on a redirect
test('safeFetch preserves every header, keys included, on a same-origin redirect [@spec:ssrf-guard:AC-7]', () => {
  const { fetch: mock, calls } = scriptedFetch([
    redirect(302, 'https://93.184.216.34/next'),
    new Response(null, { status: 200 }),
  ]);
  return withFetch(mock, async () => {
    await safeFetch('https://93.184.216.34/start', {
      headers: { authorization: 'Bearer secret', cookie: 'session=abc', 'x-api-key': 'secret-key' },
    });
    assert.equal(calls[1]?.headers.get('authorization'), 'Bearer secret');
    assert.equal(calls[1]?.headers.get('cookie'), 'session=abc');
    assert.equal(calls[1]?.headers.get('x-api-key'), 'secret-key');
  });
});

// AC-7 — A secret the caller sent in a header does not cross an origin boundary on a redirect
// The headers a node puts its key in, by the names the packages actually use and one
// nobody has listed — the rule cannot depend on knowing the name.
test('safeFetch drops a key in a header of its own on a cross-origin redirect [@spec:ssrf-guard:AC-7]', () => {
  const { fetch: mock, calls } = scriptedFetch([
    redirect(303, 'https://93.184.216.35/steal'),
    new Response(null, { status: 200 }),
  ]);
  return withFetch(mock, async () => {
    await safeFetch('https://93.184.216.34/start', {
      // A 303 turns the POST into a bodiless GET, which may cross; the key headers may not.
      method: 'POST',
      body: '<soap:Envelope/>',
      headers: {
        'x-api-key': 'secret-key',
        'api-key': 'brevo-key',
        'x-api-token': 'pipedrive-token',
        'x-tenant-secret': 'typed-by-an-author',
      },
    });
    assert.equal(calls[0]?.headers.get('x-api-key'), 'secret-key');
    assert.equal(calls[1]?.method, 'GET');
    assert.equal(calls[1]?.hasBody, false);
    for (const name of ['x-api-key', 'api-key', 'x-api-token', 'x-tenant-secret']) {
      assert.equal(calls[1]?.headers.get(name), null, `${name} must not cross the origin boundary`);
    }
  });
});

// AC-7 — A secret the caller sent in a header does not cross an origin boundary on a redirect
// The other half of the allow-list: what carries no secret still describes the
// request on the next host, so a SOAP call keeps its action and its framing, a
// resent compressed body stays readable, and a guarded write keeps its guard.
test('safeFetch keeps the headers that carry no secret on a cross-origin redirect [@spec:ssrf-guard:AC-7]', () => {
  const kept = {
    accept: 'text/xml',
    'accept-encoding': 'gzip',
    'accept-language': 'de',
    'content-encoding': 'gzip',
    'content-language': 'de',
    'content-type': 'text/xml; charset=utf-8',
    'idempotency-key': 'order-4711',
    'if-match': 'W/"etag-1"',
    'if-modified-since': 'Mon, 12 Oct 2026 08:00:00 GMT',
    'if-none-match': '"etag-0"',
    'if-range': '"etag-1"',
    'if-unmodified-since': 'Mon, 12 Oct 2026 08:00:00 GMT',
    range: 'bytes=0-1023',
    soapaction: '"urn:GetCustomer"',
    'user-agent': 'revenexx-worker',
  };
  const { fetch: mock, calls } = scriptedFetch([
    redirect(307, 'https://93.184.216.35/next'),
    new Response(null, { status: 200 }),
  ]);
  return withFetch(mock, async () => {
    await safeFetch('https://93.184.216.34/start', {
      // No body: a cross-origin 307 with one is refused outright (AC-6 of redirect-following).
      headers: kept,
    });
    for (const [name, value] of Object.entries(kept)) {
      assert.equal(calls[1]?.headers.get(name), value, `${name} must survive the origin boundary`);
    }
  });
});

// AC-20 — A credential can ask which header names a redirect to another origin keeps
// The names a credential would be refused, in the case and spacing an author types
// them, against the key headers the packages actually send.
test('headerCrossesOrigin answers true for the kept names and false for key headers [@spec:ssrf-guard:AC-20]', () => {
  for (const name of ['User-Agent', ' accept ', 'SOAPAction', 'If-Match', 'RANGE', 'Content-Encoding', 'Idempotency-Key']) {
    assert.equal(headerCrossesOrigin(name), true, `${name} crosses`);
  }
  for (const name of ['X-API-Key', 'api-key', 'x-api-token', 'Authorization', 'Cookie', 'X-User-Agent']) {
    assert.equal(headerCrossesOrigin(name), false, `${name} does not cross`);
  }
});

// AC-20 — A credential can ask which header names a redirect to another origin keeps
// The answer and the hop are the same list: a name it calls crossing does reach the
// other origin, and one it does not call crossing does not.
test('headerCrossesOrigin agrees with what a cross-origin redirect keeps [@spec:ssrf-guard:AC-20] [@spec:ssrf-guard:AC-7]', () => {
  const names = ['user-agent', 'soapaction', 'if-none-match', 'x-api-key', 'x-custom'];
  const { fetch: mock, calls } = scriptedFetch([
    redirect(302, 'https://93.184.216.35/next'),
    new Response(null, { status: 200 }),
  ]);
  return withFetch(mock, async () => {
    await safeFetch('https://93.184.216.34/start', {
      headers: Object.fromEntries(names.map((n) => [n, 'v'])),
    });
    for (const name of names) {
      assert.equal(calls[1]?.headers.has(name), headerCrossesOrigin(name), name);
    }
  });
});

// AC-21 — A header value that cannot be sent is refused without being quoted
// The value is a key pasted from a wrapped e-mail, in each shape a node hands its
// headers over in. The runtime's own refusal quotes the whole value for LF, CR and
// NUL; for the rest it fails as a retried `fetch failed`. This refusal may name the
// header and nothing of what is in it — on the error and on the error output a node
// routes it to. The host resolves to a private address, so a refusal that came
// after the DNS lookup would surface as BLOCKED_ADDRESS instead.
test('safeFetch refuses a header value that cannot be sent, naming the header and not the value [@spec:ssrf-guard:AC-21] [@spec:request-budget:AC-11]', () => {
  const { fetch: mock, calls } = scriptedFetch([new Response(null, { status: 200 })]);
  return withLookup(['10.0.0.5'], () =>
    withFetch(mock, async () => {
      for (const ch of ['\n', '\r', '\u0000', '\u0001', '\u001f', '\u007f', '€']) {
        const value = `Bearer abc-SECRET${ch}123`;
        for (const headers of [{ authorization: value }, [['authorization', value]] as [string, string][]]) {
          let caught: unknown;
          await assert.rejects(
            () => safeFetch('https://api.example', { headers, retry: { attempts: 3, delayMs: 1 } }),
            (err: unknown) => { caught = err; return true; },
          );
          assert.ok(caught instanceof NodeError, `${JSON.stringify(ch)}: ${String(caught)}`);
          assert.equal(caught.code, 'INVALID_HEADER');
          assert.equal(caught.meta?.['status'], 0);
          const port = JSON.stringify(toErrorResult(caught).outputs);
          for (const text of [caught.message, port]) {
            assert.match(text, /authorization/);
            assert.doesNotMatch(text, /SECRET|123/, `the value leaked: ${JSON.stringify(text)}`);
          }
        }
      }
      assert.equal(calls.length, 0, 'no request may be made, on any attempt');
    }),
  );
});

// AC-21 — A header value that cannot be sent is refused without being quoted
// Two ways round the check a JavaScript caller can take: headers that are not an
// object at all, which the runtime refuses by quoting, and a header name carrying a
// line break, which must not split the message it appears in.
test('safeFetch refuses headers it cannot read without quoting them, and keeps a name on one line [@spec:ssrf-guard:AC-21]', () => {
  const { fetch: mock, calls } = scriptedFetch([new Response(null, { status: 200 })]);
  return withLookup(['10.0.0.5'], () =>
    withFetch(mock, async () => {
      await assert.rejects(
        () => safeFetch('https://api.example', { headers: 'abc-SECRET' as unknown as HeadersInit }),
        (err: unknown) => err instanceof NodeError && err.code === 'INVALID_HEADER' && !err.message.includes('SECRET'),
      );
      await assert.rejects(
        () => safeFetch('https://api.example', { headers: { 'x-a\ninjected': 'SECRET\n123' } }),
        (err: unknown) => err instanceof NodeError && err.code === 'INVALID_HEADER' && !/[\r\n]|SECRET/.test(err.message),
      );
      assert.equal(calls.length, 0);
    }),
  );
});

// AC-21 — A header value that cannot be sent is refused without being quoted
// The pair: what the runtime trims or accepts still goes through, so a key saved
// with a trailing newline keeps working.
test('safeFetch still sends a value with a line break only at its ends, or a tab inside [@spec:ssrf-guard:AC-21]', () => {
  const { fetch: mock, calls } = scriptedFetch([new Response(null, { status: 200 })]);
  return withLookup(['93.184.216.34'], () =>
    withFetch(mock, async () => {
      const res = await safeFetch('https://api.example', {
        headers: { authorization: 'Bearer abc\n', 'x-api-key': '\r\nkey\tpart ', 'x-c1': 'a\u0085b' },
      });
      assert.equal(res.status, 200);
      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.headers.get('authorization'), 'Bearer abc');
      assert.equal(calls[0]?.headers.get('x-api-key'), 'key\tpart');
      assert.equal(calls[0]?.headers.get('x-c1'), 'a\u0085b', 'the C1 range is sent, so it is not refused');
    }),
  );
});

// AC-21 — A header value that cannot be sent is refused without being quoted
// The shapes besides a record and an array: a Headers object accepts a value the
// dispatcher later refuses, so it is read too; an entry that is not a pair is
// refused before the runtime quotes it; and none of them is asked again.
test('safeFetch reads a Headers object and refuses an entry that is not a pair, without quoting either [@spec:ssrf-guard:AC-21]', () => {
  const { fetch: mock, calls } = scriptedFetch([new Response(null, { status: 200 })]);
  return withLookup(['10.0.0.5'], () =>
    withFetch(mock, async () => {
      for (const headers of [
        new Headers({ authorization: 'Bearer abc-SECRET\u0001123' }),
        ['Bearer abc-SECRET'] as unknown as HeadersInit,
        [{ authorization: 'Bearer abc-SECRET' }] as unknown as HeadersInit,
        [['authorization', 'Bearer abc-SECRET', 'extra']] as unknown as HeadersInit,
        { 'x-api-key ': 'abc-SECRET' },
        { [Symbol('x-api-key')]: 'abc-SECRET' } as unknown as HeadersInit,
        null as unknown as HeadersInit,
      ]) {
        await assert.rejects(
          () => safeFetch('https://api.example', { headers, retry: { attempts: 3, delayMs: 1 } }),
          (err: unknown) => err instanceof NodeError && err.code === 'INVALID_HEADER' && !/SECRET|123/.test(err.message),
        );
      }
      assert.equal(calls.length, 0);
    }),
  );
});

// AC-21 — A header value that cannot be sent is refused without being quoted
// Reading the headers must not use them up: an iterable that can be read once
// still reaches the request with every header in it.
test('safeFetch sends the headers of an iterable that can be read only once [@spec:ssrf-guard:AC-21]', () => {
  const { fetch: mock, calls } = scriptedFetch([new Response(null, { status: 200 })]);
  return withLookup(['93.184.216.34'], () =>
    withFetch(mock, async () => {
      function* once(): Generator<[string, string]> {
        yield ['authorization', 'Bearer abc'];
      }
      const map = new Map([['x-api-key', 'key']]);
      for (const headers of [once(), map.entries()]) {
        await safeFetch('https://api.example', { headers: headers as unknown as HeadersInit });
      }
      assert.equal(calls[0]?.headers.get('authorization'), 'Bearer abc');
      assert.equal(calls[1]?.headers.get('x-api-key'), 'key');
    }),
  );
});

// AC-21 — A header value that cannot be sent is refused without being quoted
// The check runs on every request with headers, so it may not cost more than the
// headers are long: a trim by regex took seconds on a long run of whitespace
// inside a value, with the event loop blocked and the timeout out of reach.
test('safeFetch checks a value with a long run of whitespace inside it in linear time [@spec:ssrf-guard:AC-21]', () => {
  const { fetch: mock, calls } = scriptedFetch([new Response(null, { status: 200 })]);
  return withLookup(['93.184.216.34'], () =>
    withFetch(mock, async () => {
      const started = Date.now();
      await safeFetch('https://api.example', { headers: { 'x-a': `a${'\t'.repeat(200_000)}x` } });
      assert.ok(Date.now() - started < 1_000, `took ${Date.now() - started}ms`);
      assert.equal(calls.length, 1);
    }),
  );
});

// AC-4 — Cancelling ends the call, before or during flight
// A run already cancelled reports the cancellation, even when a header could not
// have been sent either — the node would otherwise report a fault in its data.
test('safeFetch reports an earlier cancellation ahead of a header it would refuse [@spec:request-budget:AC-4]', async () => {
  const ac = new AbortController();
  const reason = new Error('cancelled');
  ac.abort(reason);
  await assert.rejects(
    () => safeFetch('https://api.example', { signal: ac.signal, headers: { authorization: 'a\nb' } }),
    (err: unknown) => err === reason,
  );
});

// AC-21 — A header value that cannot be sent is refused without being quoted
// The rule is a copy of what the runtime refuses, so it is held against the
// runtime itself, on every Node version CI runs: each Latin-1 character, and two
// beyond, inside a value and inside a name, sent for real to a loopback server.
// What the runtime sends, safeFetch must send; what it refuses, safeFetch must
// refuse as INVALID_HEADER.
test('the characters safeFetch refuses in a header are exactly the ones the runtime refuses [@spec:ssrf-guard:AC-21]', async () => {
  const server = createServer((_req, res) => res.end());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const codes = [...Array(256).keys(), 0x100, 0xffff];
  const runtimeSends = async (name: string, value: string): Promise<boolean> => {
    try {
      // biome-ignore lint/nursery/noJsRestrictedProperties: AC-21 holds the copied rule against the runtime's own fetch, on loopback; see the note above
      await (await globalThis.fetch(`http://127.0.0.1:${port}/`, { headers: [[name, value]] })).arrayBuffer();
      return true;
    } catch {
      return false;
    }
  };
  const { fetch: mock } = scriptedFetch([new Response(null, { status: 200 })]);
  const safeFetchSends = (name: string, value: string): Promise<boolean> =>
    withLookup(['93.184.216.34'], () =>
      withFetch(mock, async () => {
        await safeFetch('https://api.example', { headers: [[name, value]] });
      }),
    ).then(
      () => true,
      (err: unknown) => {
        assert.ok(err instanceof NodeError && err.code === 'INVALID_HEADER', String(err));
        return false;
      },
    );
  try {
    const disagree: string[] = [];
    for (const code of codes) {
      const ch = String.fromCharCode(code);
      for (const [where, name, value] of [['value', 'x-a', `a${ch}b`], ['name', `x${ch}y`, 'v']] as const) {
        if ((await runtimeSends(name, value)) !== (await safeFetchSends(name, value))) {
          disagree.push(`${where} U+${code.toString(16).padStart(4, '0')}`);
        }
      }
    }
    assert.deepEqual(disagree, [], `safeFetch and Node ${process.version} disagree`);
  } finally {
    server.close();
  }
});

// AC-22 — A request bound to its credential's origin is sent nowhere else
test('safeFetch refuses a bound request to another origin before it sends anything, naming origins only [@spec:ssrf-guard:AC-22]', () => {
  const { fetch: mock, calls } = scriptedFetch([new Response(null, { status: 200 })]);
  return withFetch(mock, async () => {
    await assert.rejects(
      () =>
        safeFetch('https://93.184.216.35/v1/items?token=T', {
          headers: { authorization: 'Bearer secret' },
          credential: { origin: 'https://93.184.216.34' },
          retry: { attempts: 3, delayMs: 0 },
        }),
      (err: unknown) =>
        err instanceof NodeError &&
        err.code === 'CREDENTIAL_ORIGIN' &&
        err.message === 'Refused a request to https://93.184.216.35: the credential it carries is bound to https://93.184.216.34',
    );
    assert.equal(calls.length, 0, 'nothing is sent, and the refusal is not retried');
  });
});

// AC-22 — A request bound to its credential's origin is sent nowhere else
test('safeFetch sends a bound request to its own origin, whatever its path [@spec:ssrf-guard:AC-22]', () => {
  const { fetch: mock, calls } = scriptedFetch([new Response('ok', { status: 200 })]);
  return withFetch(mock, async () => {
    const res = await safeFetch('https://93.184.216.34/v1/items?page=2', {
      headers: { authorization: 'Bearer secret' },
      credential: { origin: new URL('https://93.184.216.34/v1/') },
    });
    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.headers.get('authorization'), 'Bearer secret');
  });
});

// AC-22 — A request bound to its credential's origin is sent nowhere else
test('safeFetch refuses a binding that is not an http(s) address [@spec:ssrf-guard:AC-22]', () => {
  const { fetch: mock, calls } = scriptedFetch([new Response(null, { status: 200 })]);
  return withFetch(mock, async () => {
    for (const origin of ['not a url', 'file:///etc/passwd', 'wss://93.184.216.34', 'blob:https://93.184.216.34/x']) {
      await assert.rejects(
        () => safeFetch('https://93.184.216.34/', { credential: { origin } }),
        (err: unknown) => err instanceof NodeError && err.code === 'CREDENTIAL_ORIGIN' && !err.message.includes('passwd'),
      );
    }
    assert.equal(calls.length, 0);
  });
});

// AC-23 — A redirect cannot take a bound request off its origin
for (const status of [301, 302, 303, 307, 308]) {
  test(`safeFetch refuses a ${status} that would take a bound GET to another origin [@spec:ssrf-guard:AC-23]`, () => {
    const { fetch: mock, calls } = scriptedFetch([
      redirect(status, 'https://93.184.216.35/elsewhere?token=T'),
      new Response(null, { status: 200 }),
    ]);
    return withFetch(mock, async () => {
      await assert.rejects(
        () =>
          safeFetch('https://93.184.216.34/start', {
            headers: { 'x-api-token': 'secret' },
            credential: { origin: 'https://93.184.216.34' },
            retry: { attempts: 3, delayMs: 0 },
          }),
        (err: unknown) =>
          err instanceof NodeError &&
          err.code === 'CREDENTIAL_ORIGIN' &&
          err.message === `Refused a ${status} redirect to https://93.184.216.35: the credential it carries is bound to https://93.184.216.34`,
      );
      assert.equal(calls.length, 1, 'the other origin receives nothing, and the refusal is not retried');
    });
  });
}

// AC-23 — A redirect cannot take a bound request off its origin
test('safeFetch judges every hop against the binding, so a detour through its own origin does not help [@spec:ssrf-guard:AC-23]', () => {
  const { fetch: mock, calls } = scriptedFetch([
    redirect(302, 'https://93.184.216.34/hop'),
    redirect(302, 'https://93.184.216.35/collect'),
    new Response(null, { status: 200 }),
  ]);
  return withFetch(mock, async () => {
    await assert.rejects(
      () => safeFetch('https://93.184.216.34/start', { credential: { origin: 'https://93.184.216.34' } }),
      (err: unknown) => err instanceof NodeError && err.code === 'CREDENTIAL_ORIGIN',
    );
    assert.deepEqual(
      calls.map((c) => c.url),
      ['https://93.184.216.34/start', 'https://93.184.216.34/hop'],
    );
  });
});

// AC-23 — A redirect cannot take a bound request off its origin
test('safeFetch refuses a bound hop before it looks the other host up [@spec:ssrf-guard:AC-23]', () => {
  const { fetch: mock } = scriptedFetch([
    redirect(302, 'https://collector.example/next'),
    new Response(null, { status: 200 }),
  ]);
  const looked: string[] = [];
  const orig = ssrfResolver.lookup;
  ssrfResolver.lookup = async (host: string) => {
    looked.push(host);
    return [{ address: '93.184.216.35', family: 4 }];
  };
  return withFetch(mock, async () => {
    try {
      await assert.rejects(
        () => safeFetch('https://93.184.216.34/start', { credential: { origin: 'https://93.184.216.34' } }),
        (err: unknown) => err instanceof NodeError && err.code === 'CREDENTIAL_ORIGIN',
      );
      assert.deepEqual(looked, [], 'the other host is never looked up');
    } finally {
      ssrfResolver.lookup = orig;
    }
  });
});

// AC-24 — A bound request may follow a redirect off its origin without its secret
test('safeFetch follows a redirect off the bound origin under strip, keeping no header the caller set [@spec:ssrf-guard:AC-24]', () => {
  const { fetch: mock, calls } = scriptedFetch([
    redirect(302, 'https://93.184.216.35/cdn/file.pdf'),
    new Response('pdf', { status: 200 }),
  ]);
  return withFetch(mock, async () => {
    const res = await safeFetch('https://93.184.216.34/files/1', {
      headers: {
        authorization: 'Bearer secret',
        'x-api-key': 'k',
        'idempotency-key': 'key-under-a-harmless-name',
        soapaction: 'another',
        accept: 'application/pdf',
      },
      credential: { origin: 'https://93.184.216.34', crossOriginRedirect: 'strip' },
    });
    assert.equal(res.status, 200);
    assert.equal(calls[1]?.url, 'https://93.184.216.35/cdn/file.pdf');
    assert.deepEqual([...(calls[1]?.headers.keys() ?? [])], [], 'no header the caller set reaches the other origin');
    assert.equal(calls[0]?.headers.get('idempotency-key'), 'key-under-a-harmless-name');
  });
});

// AC-24 — A bound request may follow a redirect off its origin without its secret
test('safeFetch still refuses to resend a body off the bound origin under strip [@spec:ssrf-guard:AC-24]', () => {
  const { fetch: mock, calls } = scriptedFetch([
    redirect(307, 'https://93.184.216.35/token'),
    new Response(null, { status: 200 }),
  ]);
  return withFetch(mock, async () => {
    await assert.rejects(
      () =>
        safeFetch('https://93.184.216.34/token', {
          method: 'POST',
          body: 'client_secret=S',
          credential: { origin: 'https://93.184.216.34', crossOriginRedirect: 'strip' },
        }),
      (err: unknown) => err instanceof NodeError && /would resend the request body/.test(err.message),
    );
    assert.equal(calls.length, 1);
  });
});

// AC-25 — A URL with a user name or password in it is refused without being quoted
test('safeFetch refuses a URL with a user and password in it, sends nothing and quotes none of it [@spec:ssrf-guard:AC-25]', () => {
  const { fetch: mock, calls } = scriptedFetch([new Response(null, { status: 200 })]);
  return withFetch(mock, async () => {
    for (const url of ['https://user:S3cret@93.184.216.34/path?token=T', 'https://user@93.184.216.34/', new URL('https://:S3cret@93.184.216.34/')]) {
      await assert.rejects(
        () => safeFetch(url, { retry: { attempts: 3, delayMs: 0 } }),
        (err: unknown) =>
          err instanceof NodeError &&
          err.code === 'INVALID_URL' &&
          !/S3cret|token=T|93\.184|user[:@]/.test(err.message),
      );
    }
    assert.equal(calls.length, 0, 'nothing is sent, and the refusal is not retried');
  });
});

// AC-25 — A URL with a user name or password in it is refused without being quoted
test('safeFetch refuses a redirect to a URL with a password in it, without quoting it [@spec:ssrf-guard:AC-25]', () => {
  const { fetch: mock, calls } = scriptedFetch([
    redirect(302, 'https://u:S3cret@93.184.216.34/next?token=T'),
    new Response(null, { status: 200 }),
  ]);
  return withFetch(mock, async () => {
    await assert.rejects(
      () => safeFetch('https://93.184.216.34/start'),
      (err: unknown) =>
        err instanceof NodeError &&
        err.code === 'INVALID_URL' &&
        err.message === 'Refused a 302 redirect to a URL with a user name or password in it',
    );
    assert.equal(calls.length, 1);
  });
});

// AC-25 — A URL with a user name or password in it is refused without being quoted
test('safeFetch refuses an address it cannot read without quoting it, and does not retry [@spec:ssrf-guard:AC-25]', () => {
  const { fetch: mock, calls } = scriptedFetch([new Response(null, { status: 200 })]);
  return withFetch(mock, async () => {
    await assert.rejects(
      () => safeFetch('https://user:S3cret@93.184.216.34:99999/p?token=T', { retry: { attempts: 3, delayMs: 0 } }),
      (err: unknown) =>
        err instanceof NodeError &&
        err.code === 'INVALID_URL' &&
        !/S3cret|token=T|93\.184|user[:@]/.test(err.message) &&
        !JSON.stringify(err).includes('S3cret'),
    );
    assert.equal(calls.length, 0);
  });
});

// AC-22 with AC-25 — a bound request to another origin with a password in its address
test('safeFetch refuses a bound request with a password in its address as INVALID_URL, naming neither [@spec:ssrf-guard:AC-22]', () => {
  const { fetch: mock, calls } = scriptedFetch([new Response(null, { status: 200 })]);
  return withFetch(mock, async () => {
    await assert.rejects(
      () =>
        safeFetch('https://user:S3cret@93.184.216.35/v1?token=T', {
          credential: { origin: 'https://93.184.216.34' },
        }),
      (err: unknown) =>
        err instanceof NodeError &&
        err.code === 'INVALID_URL' &&
        !/S3cret|token=T|user[:@]/.test(err.message),
    );
    assert.equal(calls.length, 0);
  });
});
