import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clampResponseBytes,
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_RETRY_ATTEMPTS,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_TIMEOUT_MS,
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
  const orig = globalThis.fetch;
  globalThis.fetch = mock;
  return fn().finally(() => {
    globalThis.fetch = orig;
  });
}

// ------------------------------------------------------------------ safeFetch

test('returns the response when fetch succeeds within the timeout', () =>
  withFetch(delayedFetch(0), async () => {
    const res = await safeFetch('https://93.184.216.34', { timeoutMs: 500 });
    assert.equal(res.status, 200);
  }));

test('throws NodeError TIMEOUT when fetch takes longer than timeoutMs', () =>
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

test('TIMEOUT error message contains the clamped MAX_TIMEOUT_MS value', () => {
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

test('ctxSignal reason wins over TIMEOUT when both abort simultaneously', () => {
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

test('propagates AbortError when ctx.signal is already aborted', async () => {
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

test('propagates AbortError when ctx.signal is aborted mid-flight', () =>
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

// ------------------------------------------------------------------ retry

test('retries on network error and throws after exhausting attempts', async () => {
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

test('succeeds on the second attempt', async () => {
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

test('stops retrying immediately when ctx.signal is aborted between attempts', async () => {
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

test('abort during retry delay interrupts the sleep immediately', async () => {
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

test('timeoutConfigField returns a number field with correct key and defaults', () => {
  const field = timeoutConfigField();
  assert.equal(field.key, 'timeoutMs');
  assert.equal(field.type, 'number');
  assert.equal(field.default, DEFAULT_TIMEOUT_MS);
  assert.equal(field.validation?.min, 100);
  assert.equal(field.validation?.max, MAX_TIMEOUT_MS);
});

test('timeoutConfigField accepts custom default and max', () => {
  const field = timeoutConfigField({ default: 5_000, max: 60_000 });
  assert.equal(field.default, 5_000);
  assert.equal(field.validation?.max, 60_000);
});

test('retryConfigFields returns two fields with correct keys and defaults', () => {
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

test('retryConfigFields accepts custom defaults', () => {
  const [attemptsField, delayField] = retryConfigFields({ defaultAttempts: 3, defaultDelayMs: 2_000 });
  assert.equal(attemptsField?.default, 3);
  assert.equal(delayField?.default, 2_000);
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

test('readArrayBuffer returns the full body when under the cap', async () => {
  const res = streamResponse([bytes(4), bytes(4)]);
  const buf = await readArrayBuffer(res, 100);
  assert.equal(buf.byteLength, 8);
});

test('readArrayBuffer enforces the cap while streaming (no Content-Length)', async () => {
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

test('readArrayBuffer fast-rejects on an oversized Content-Length without touching the body', async () => {
  // A Response-shaped fake whose `body` getter throws if accessed — proving the
  // Content-Length fast-reject bails out before any body read. (A real undici
  // Response eagerly drains a stream body on construction, so a read-side-effect
  // flag can't observe this.)
  let bodyAccessed = false;
  const fake = {
    status: 200,
    headers: new Headers({ 'content-length': '1000000' }),
    get body(): ReadableStream<Uint8Array> {
      bodyAccessed = true;
      throw new Error('body must not be accessed on fast-reject');
    },
  } as unknown as Response;
  await assert.rejects(
    () => readArrayBuffer(fake, 100),
    (err: unknown) => err instanceof NodeError && err.code === 'RESPONSE_TOO_LARGE',
  );
  assert.equal(bodyAccessed, false, 'body must not be accessed when Content-Length already exceeds the cap');
});

test('readArrayBuffer surfaces RESPONSE_TOO_LARGE even when the stream cancel rejects', async () => {
  // Underlying cancel() throws → reader.cancel() rejects. The overrun must still
  // surface as RESPONSE_TOO_LARGE, not the cancellation error.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes(20));
      controller.close();
    },
    cancel() {
      throw new Error('cancel failed');
    },
  });
  const fake = { status: 200, headers: new Headers(), body: stream } as unknown as Response;
  await assert.rejects(
    () => readArrayBuffer(fake, 10),
    (err: unknown) => err instanceof NodeError && err.code === 'RESPONSE_TOO_LARGE',
  );
});

test('readArrayBuffer accepts a body exactly at the cap', async () => {
  const res = streamResponse([bytes(10)]);
  const buf = await readArrayBuffer(res, 10);
  assert.equal(buf.byteLength, 10);
});

test('readText decodes the body as UTF-8', async () => {
  const res = new Response('héllo', { headers: { 'content-type': 'text/plain' } });
  assert.equal(await readText(res, 100), 'héllo');
});

test('readJsonOrText parses JSON when Content-Type is application/json', async () => {
  const res = new Response(JSON.stringify({ a: 1 }), {
    headers: { 'content-type': 'application/json' },
  });
  assert.deepEqual(await readJsonOrText(res, 100), { a: 1 });
});

test('readJsonOrText returns raw text for non-JSON content types', async () => {
  const res = new Response('plain body', { headers: { 'content-type': 'text/plain' } });
  assert.equal(await readJsonOrText(res, 100), 'plain body');
});

test('readJsonOrText matches Content-Type case-insensitively and ignores parameters', async () => {
  const res = new Response(JSON.stringify({ a: 1 }), {
    headers: { 'content-type': 'Application/JSON; charset=utf-8' },
  });
  assert.deepEqual(await readJsonOrText(res, 100), { a: 1 });
});

test('readJsonOrText recognises +json structured-syntax suffixes', async () => {
  const res = new Response(JSON.stringify({ a: 1 }), {
    headers: { 'content-type': 'application/vnd.api+json' },
  });
  assert.deepEqual(await readJsonOrText(res, 100), { a: 1 });
});

test('readJsonOrText does not mis-detect application/jsonp as JSON', async () => {
  const res = new Response('callback({"a":1})', {
    headers: { 'content-type': 'application/jsonp' },
  });
  assert.equal(await readJsonOrText(res, 100), 'callback({"a":1})');
});

test('readJsonOrText throws RESPONSE_PARSE_ERROR on malformed JSON', async () => {
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

test('readJsonOrText enforces the cap on JSON bodies too', async () => {
  const big = JSON.stringify({ v: 'x'.repeat(50) });
  const res = new Response(big, { headers: { 'content-type': 'application/json' } });
  await assert.rejects(
    () => readJsonOrText(res, 10),
    (err: unknown) => err instanceof NodeError && err.code === 'RESPONSE_TOO_LARGE',
  );
});

test('read* helpers default to DEFAULT_MAX_RESPONSE_BYTES', async () => {
  const res = new Response('small');
  const buf = await readArrayBuffer(res);
  assert.equal(buf.byteLength, 5);
  assert.ok(DEFAULT_MAX_RESPONSE_BYTES > 1_000_000);
});

test('maxBytesConfigField returns a number field defaulting to the SDK cap', () => {
  const field = maxBytesConfigField();
  assert.equal(field.key, 'maxBytes');
  assert.equal(field.type, 'number');
  assert.equal(field.default, DEFAULT_MAX_RESPONSE_BYTES);
  assert.equal(field.validation?.min, 1);
  // No explicit max → hard ceiling, so a workflow author can't defeat the guard.
  assert.equal(field.validation?.max, MAX_RESPONSE_BYTES);
});

test('maxBytesConfigField accepts custom default and max', () => {
  const field = maxBytesConfigField({ default: 1024, max: 4096 });
  assert.equal(field.default, 1024);
  assert.equal(field.validation?.max, 4096);
});

test('maxBytesConfigField clamps a custom max above the hard ceiling', () => {
  const field = maxBytesConfigField({ max: MAX_RESPONSE_BYTES * 4 });
  assert.equal(field.validation?.max, MAX_RESPONSE_BYTES);
});

// ------------------------------------------------ size cap: hard ceiling

test('clampResponseBytes bounds a request into [1, MAX_RESPONSE_BYTES]', () => {
  assert.equal(clampResponseBytes(1024), 1024);
  assert.equal(clampResponseBytes(MAX_RESPONSE_BYTES), MAX_RESPONSE_BYTES);
  assert.equal(clampResponseBytes(MAX_RESPONSE_BYTES + 1), MAX_RESPONSE_BYTES);
  assert.equal(clampResponseBytes(Number.POSITIVE_INFINITY), MAX_RESPONSE_BYTES);
  assert.equal(clampResponseBytes(0), MAX_RESPONSE_BYTES);
  assert.equal(clampResponseBytes(-5), MAX_RESPONSE_BYTES);
  assert.ok(MAX_RESPONSE_BYTES > DEFAULT_MAX_RESPONSE_BYTES);
});

test('readArrayBuffer clamps maxBytes to the hard ceiling (Content-Length fast-reject)', async () => {
  // A caller passing a maxBytes above the ceiling must not lift the guard: a
  // Content-Length just over MAX_RESPONSE_BYTES is still rejected.
  const fake = {
    status: 200,
    headers: new Headers({ 'content-length': String(MAX_RESPONSE_BYTES + 1) }),
    get body(): ReadableStream<Uint8Array> {
      throw new Error('body must not be accessed on fast-reject');
    },
  } as unknown as Response;
  await assert.rejects(
    () => readArrayBuffer(fake, MAX_RESPONSE_BYTES * 10),
    (err: unknown) => err instanceof NodeError && err.code === 'RESPONSE_TOO_LARGE',
  );
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

test('safeFetch blocks a host that resolves to a private address before any fetch', () => {
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

test('safeFetch allows a host that resolves to a public address', () => {
  const { fetch: mock, calls } = scriptedFetch([new Response(null, { status: 200 })]);
  return withLookup(['93.184.216.34'], () =>
    withFetch(mock, async () => {
      const res = await safeFetch('https://api.example');
      assert.equal(res.status, 200);
      assert.equal(calls.length, 1);
    }),
  );
});

test('safeFetch rejects a redirect to a private target (redirect-bypass guard)', () => {
  // Public first hop, then a 302 pointing at the cloud metadata endpoint.
  const { fetch: mock, calls } = scriptedFetch([
    redirect(302, 'http://169.254.169.254/latest/meta-data/'),
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

test('safeFetch follows a public redirect and returns the final response', () => {
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

test('safeFetch throws TOO_MANY_REDIRECTS past MAX_REDIRECTS hops', () => {
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

test('safeFetch does not retry a blocked redirect target', () => {
  const { fetch: mock, calls } = scriptedFetch([redirect(302, 'http://127.0.0.1/')]);
  return withFetch(mock, async () => {
    await assert.rejects(
      () => safeFetch('https://93.184.216.34/start', { retry: { attempts: 3, delayMs: 0 } }),
      (err: unknown) => err instanceof NodeError && err.code === 'BLOCKED_ADDRESS',
    );
    assert.equal(calls.length, 1, 'a deterministic block must not be retried');
  });
});

test('safeFetch downgrades POST to GET and drops the body on a 303 redirect', () => {
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

test('safeFetch strips auth-bearing headers on a cross-origin redirect', () => {
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

test('safeFetch preserves auth-bearing headers on a same-origin redirect', () => {
  const { fetch: mock, calls } = scriptedFetch([
    redirect(302, 'https://93.184.216.34/next'),
    new Response(null, { status: 200 }),
  ]);
  return withFetch(mock, async () => {
    await safeFetch('https://93.184.216.34/start', {
      headers: { authorization: 'Bearer secret', cookie: 'session=abc' },
    });
    assert.equal(calls[1]?.headers.get('authorization'), 'Bearer secret');
    assert.equal(calls[1]?.headers.get('cookie'), 'session=abc');
  });
});
