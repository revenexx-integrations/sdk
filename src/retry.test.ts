import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_RETRY_POLICY,
  RetryableError,
  backoffDelay,
  sleepWithSignal,
  withRetry,
} from './retry.js';

const neverAborted = () => new AbortController().signal;

// ---------------------------------------------------------------- backoffDelay

test('backoffDelay grows exponentially and caps at maxDelayMs (no jitter)', () => {
  const policy = { maxAttempts: 10, baseDelayMs: 500, maxDelayMs: 30_000, factor: 2, jitter: false };
  assert.equal(backoffDelay(1, policy), 500); // 500 * 2^0
  assert.equal(backoffDelay(2, policy), 1_000); // 500 * 2^1
  assert.equal(backoffDelay(3, policy), 2_000); // 500 * 2^2
  assert.equal(backoffDelay(10, policy), 30_000); // capped
});

test('backoffDelay with jitter stays within [0, cap]', () => {
  const policy = { maxAttempts: 10, baseDelayMs: 500, maxDelayMs: 30_000, factor: 2, jitter: true };
  for (let i = 0; i < 100; i++) {
    const d = backoffDelay(3, policy); // cap = 2_000
    assert.ok(d >= 0 && d <= 2_000, `delay ${d} out of range`);
  }
});

// ------------------------------------------------------------- sleepWithSignal

test('sleepWithSignal resolves after the delay', async () => {
  const start = Date.now();
  await sleepWithSignal(20, neverAborted());
  assert.ok(Date.now() - start >= 15);
});

test('sleepWithSignal rejects immediately when already aborted', async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(() => sleepWithSignal(1_000, ac.signal), (err: unknown) => {
    assert.ok(err instanceof DOMException);
    assert.equal(err.name, 'AbortError');
    return true;
  });
});

test('sleepWithSignal rejects when aborted mid-wait', async () => {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 20);
  const start = Date.now();
  await assert.rejects(() => sleepWithSignal(5_000, ac.signal), (err: unknown) => {
    assert.ok(err instanceof DOMException && err.name === 'AbortError');
    return true;
  });
  assert.ok(Date.now() - start < 1_000, 'must not wait the full delay');
});

// -------------------------------------------------------------------- withRetry

const fast = { baseDelayMs: 1, maxDelayMs: 5 };

test('returns the value on first-try success (fn called once)', async () => {
  let calls = 0;
  const result = await withRetry(async () => { calls++; return 'ok'; }, fast, { signal: neverAborted() });
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
});

test('retries on RetryableError then succeeds', async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      if (calls < 3) throw new RetryableError('transient');
      return calls;
    },
    { ...fast, maxAttempts: 5 },
    { signal: neverAborted() },
  );
  assert.equal(result, 3);
  assert.equal(calls, 3);
});

test('throws the RetryableError after exhausting maxAttempts', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(
        async () => { calls++; throw new RetryableError('always transient'); },
        { ...fast, maxAttempts: 3 },
        { signal: neverAborted() },
      ),
    (err: unknown) => err instanceof RetryableError && err.message === 'always transient',
  );
  assert.equal(calls, 3);
});

test('rethrows a non-retryable error immediately without retrying', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(
        async () => { calls++; throw new Error('fatal'); },
        { ...fast, maxAttempts: 5 },
        { signal: neverAborted() },
      ),
    (err: unknown) => err instanceof Error && err.message === 'fatal',
  );
  assert.equal(calls, 1);
});

test('Retry-After (retryAfterMs) overrides the computed backoff', async () => {
  const delays: number[] = [];
  let calls = 0;
  await withRetry(
    async () => {
      calls++;
      if (calls === 1) throw new RetryableError('rate limited', { retryAfterMs: 7 });
      return 'done';
    },
    { baseDelayMs: 9_999, maxDelayMs: 99_999, maxAttempts: 3 },
    { signal: neverAborted(), onRetry: (info) => delays.push(info.delayMs) },
  );
  assert.deepEqual(delays, [7], 'must use retryAfterMs, not the (huge) computed backoff');
});

test('does not start a new attempt after the signal is aborted during the wait', async () => {
  const ac = new AbortController();
  let calls = 0;
  const p = withRetry(
    async () => { calls++; throw new RetryableError('transient', { retryAfterMs: 1_000 }); },
    { maxAttempts: 5 },
    { signal: ac.signal },
  );
  setTimeout(() => ac.abort(), 20);
  await assert.rejects(p, (err: unknown) => err instanceof DOMException && err.name === 'AbortError');
  assert.equal(calls, 1, 'aborted during the first wait — no second attempt');
});

test('does not run fn at all when the signal is already aborted', async () => {
  const ac = new AbortController();
  ac.abort();
  let calls = 0;
  await assert.rejects(
    () => withRetry(async () => { calls++; return 'x'; }, fast, { signal: ac.signal }),
    (err: unknown) => err instanceof DOMException && err.name === 'AbortError',
  );
  assert.equal(calls, 0);
});

test('passes the 1-based attempt number to fn', async () => {
  const seen: number[] = [];
  await withRetry(
    async (attempt) => {
      seen.push(attempt);
      if (attempt < 3) throw new RetryableError('again');
      return attempt;
    },
    { ...fast, maxAttempts: 5 },
    { signal: neverAborted() },
  );
  assert.deepEqual(seen, [1, 2, 3]);
});

test('DEFAULT_RETRY_POLICY exposes the documented lean defaults', () => {
  assert.equal(DEFAULT_RETRY_POLICY.maxAttempts, 3);
  assert.equal(DEFAULT_RETRY_POLICY.baseDelayMs, 500);
  assert.equal(DEFAULT_RETRY_POLICY.maxDelayMs, 30_000);
  assert.equal(DEFAULT_RETRY_POLICY.factor, 2);
  assert.equal(DEFAULT_RETRY_POLICY.jitter, true);
});
