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

// AC-3 — An answer that declares an oversized length is refused untouched
test('readArrayBuffer fast-rejects on an oversized Content-Length without touching the body [@spec:response-reading:AC-3]', async () => {
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

// AC-4 — An oversized answer is reported as oversized even if discarding it fails
test('readArrayBuffer surfaces RESPONSE_TOO_LARGE even when the stream cancel rejects [@spec:response-reading:AC-4]', async () => {
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

// AC-2 — A target that resolves only to public addresses is allowed through
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
test('safeFetch follows a public redirect and returns the final response [@spec:ssrf-guard:AC-5]', () => {
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

test('safeFetch rejects a redirect with an invalid Location header', () => {
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

test('safeFetch releases the 3xx response socket on the TOO_MANY_REDIRECTS path', () => {
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

// AC-7 — Authentication-bearing headers do not cross an origin boundary on a redirect
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

// AC-7 — Authentication-bearing headers do not cross an origin boundary on a redirect
test('safeFetch preserves auth-bearing headers on a same-origin redirect [@spec:ssrf-guard:AC-7]', () => {
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
