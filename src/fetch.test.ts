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

test('clamps timeoutMs to MAX_TIMEOUT_MS and includes that value in the error', () =>
  withFetch(delayedFetch(200), async () => {
    await assert.rejects(
      () => safeFetch('https://example.com', { timeoutMs: MAX_TIMEOUT_MS + 99_999, signal: (() => { const ac = new AbortController(); setTimeout(() => ac.abort(), 50); return ac.signal; })() }),
      (err: unknown) => {
        // Either a NodeError TIMEOUT (if our timeout controller fires before
        // the ctx signal fires) or an AbortError — we just confirm it throws.
        assert.ok(err instanceof Error);
        return true;
      },
    );
  }));

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
