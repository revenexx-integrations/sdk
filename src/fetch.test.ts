import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_RETRY_ATTEMPTS,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_TIMEOUT_MS,
  MAX_RETRY_ATTEMPTS,
  MAX_TIMEOUT_MS,
  retryConfigFields,
  safeFetch,
  timeoutConfigField,
} from './fetch.js';
import { NodeError } from './errors.js';

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
    const res = await safeFetch('https://example.com', { timeoutMs: 500 });
    assert.equal(res.status, 200);
  }));

test('throws NodeError TIMEOUT when fetch takes longer than timeoutMs', () =>
  withFetch(delayedFetch(200), async () => {
    await assert.rejects(
      () => safeFetch('https://example.com', { timeoutMs: 30 }),
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
      await safeFetch('https://example.com', { timeoutMs: MAX_TIMEOUT_MS + 99_999 });
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
        () => safeFetch('https://example.com', { timeoutMs: MAX_TIMEOUT_MS + 99_999 }),
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
      await safeFetch('https://example.com', { timeoutMs: NaN });
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
      await safeFetch('https://example.com', { timeoutMs: -1 });
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
        () => safeFetch('https://example.com', { signal: userAc.signal }),
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
    () => safeFetch('https://example.com', { signal: ac.signal }),
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
      () => safeFetch('https://example.com', { timeoutMs: 5_000, signal: ac.signal }),
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
      () => safeFetch('https://example.com', { retry: { attempts: 2, delayMs: 0 } }),
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
    const res = await safeFetch('https://example.com', { retry: { attempts: 1, delayMs: 0 } });
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
        safeFetch('https://example.com', {
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
        safeFetch('https://example.com', {
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
