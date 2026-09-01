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

// AC-4 — The wait between attempts grows, and stops growing at its ceiling
test('backoffDelay grows exponentially and caps at maxDelayMs (no jitter) [@spec:retrying-an-operation:AC-4]', () => {
  const policy = { maxAttempts: 10, baseDelayMs: 500, maxDelayMs: 30_000, factor: 2, jitter: false };
  assert.equal(backoffDelay(1, policy), 500); // 500 * 2^0
  assert.equal(backoffDelay(2, policy), 1_000); // 500 * 2^1
  assert.equal(backoffDelay(3, policy), 2_000); // 500 * 2^2
  assert.equal(backoffDelay(10, policy), 30_000); // capped
});

// AC-5 — Jitter varies a wait without letting it exceed its ceiling
test('backoffDelay with jitter stays within [0, cap] [@spec:retrying-an-operation:AC-5]', () => {
  const policy = { maxAttempts: 10, baseDelayMs: 500, maxDelayMs: 30_000, factor: 2, jitter: true };
  for (let i = 0; i < 100; i++) {
    const d = backoffDelay(3, policy); // cap = 2_000
    assert.ok(d >= 0 && d <= 2_000, `delay ${d} out of range`);
  }
});

// ------------------------------------------------------------- sleepWithSignal

// AC-9 — A wait ends the moment it is cancelled, not when it elapses
test('sleepWithSignal resolves after the delay [@spec:retrying-an-operation:AC-9]', async () => {
  const start = Date.now();
  await sleepWithSignal(20, neverAborted());
  assert.ok(Date.now() - start >= 15);
});

// AC-9 — A wait ends the moment it is cancelled, not when it elapses
test('sleepWithSignal rejects immediately when already aborted [@spec:retrying-an-operation:AC-9]', async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(() => sleepWithSignal(1_000, ac.signal), (err: unknown) => {
    assert.ok(err instanceof DOMException);
    assert.equal(err.name, 'AbortError');
    return true;
  });
});

// AC-9 — A wait ends the moment it is cancelled, not when it elapses
test('sleepWithSignal rejects when aborted mid-wait [@spec:retrying-an-operation:AC-9]', async () => {
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

// AC-1 — An operation that succeeds is run once
test('returns the value on first-try success (fn called once) [@spec:retrying-an-operation:AC-1]', async () => {
  let calls = 0;
  const result = await withRetry(async () => { calls++; return 'ok'; }, fast, { signal: neverAborted() });
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
});

// AC-2 — Only a failure that declares itself retryable is asked again
test('retries on RetryableError then succeeds [@spec:retrying-an-operation:AC-2]', async () => {
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

// AC-3 — The failure that survives every attempt is raised as it was
test('throws the RetryableError after exhausting maxAttempts [@spec:retrying-an-operation:AC-3]', async () => {
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

// AC-3 — The failure that survives every attempt is raised as it was
test('on exhaustion the thrown RetryableError preserves retryAfterMs and cause [@spec:retrying-an-operation:AC-3]', async () => {
  const underlying = new Error('429 Too Many Requests');
  await assert.rejects(
    () =>
      withRetry(
        async () => {
          throw new RetryableError('rate limited', { retryAfterMs: 3, cause: underlying });
        },
        { ...fast, maxAttempts: 2 },
        { signal: neverAborted() },
      ),
    (err: unknown) =>
      err instanceof RetryableError &&
      err.message === 'rate limited' &&
      err.retryAfterMs === 3 &&
      err.cause === underlying,
  );
});

// AC-11 — Every retry is reported, with what was tried and how long the wait is
test('logger.warn is called per retry with attempt/maxAttempts/delayMs [@spec:retrying-an-operation:AC-11]', async () => {
  const warnings: Array<{ msg: string; meta?: Record<string, unknown> }> = [];
  let calls = 0;
  await withRetry(
    async () => {
      calls++;
      if (calls < 3) throw new RetryableError('transient');
      return 'done';
    },
    { ...fast, maxAttempts: 3 },
    {
      signal: neverAborted(),
      logger: { warn: (msg, meta) => warnings.push({ msg, meta }) },
    },
  );
  assert.equal(warnings.length, 2, 'one warn per retry (two retries before success)');
  assert.deepEqual(
    warnings.map((w) => w.meta?.attempt),
    [1, 2],
  );
  for (const w of warnings) {
    assert.equal(w.meta?.maxAttempts, 3);
    assert.equal(typeof w.meta?.delayMs, 'number');
    assert.equal(w.meta?.error, 'transient');
  }
});

// AC-2 — Only a failure that declares itself retryable is asked again
test('rethrows a non-retryable error immediately without retrying [@spec:retrying-an-operation:AC-2]', async () => {
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

// AC-6 — A host that says how long to wait is obeyed, unless the figure is unusable
test('Retry-After (retryAfterMs) overrides the computed backoff [@spec:retrying-an-operation:AC-6]', async () => {
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

// AC-6 — A host that says how long to wait is obeyed, unless the figure is unusable
test('an invalid retryAfterMs falls back to the computed backoff [@spec:retrying-an-operation:AC-6]', async () => {
  const policy = { baseDelayMs: 10, factor: 2, jitter: false, maxDelayMs: 1_000, maxAttempts: 3 };
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    const delays: number[] = [];
    let calls = 0;
    await withRetry(
      async () => {
        calls++;
        if (calls === 1) throw new RetryableError('rate limited', { retryAfterMs: bad });
        return 'done';
      },
      policy,
      { signal: neverAborted(), onRetry: (info) => delays.push(info.delayMs) },
    );
    // backoffDelay(1) = baseDelayMs * factor^0 = 10, not a setTimeout-coerced ~0.
    assert.deepEqual(delays, [10], `retryAfterMs=${bad} must fall back to computed backoff`);
  }
});

// AC-8 — Cancelling during a wait starts no further attempt
test('does not start a new attempt after the signal is aborted during the wait [@spec:retrying-an-operation:AC-8]', async () => {
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

// AC-7 — An operation already cancelled is never run
test('does not run fn at all when the signal is already aborted [@spec:retrying-an-operation:AC-7]', async () => {
  const ac = new AbortController();
  ac.abort();
  let calls = 0;
  await assert.rejects(
    () => withRetry(async () => { calls++; return 'x'; }, fast, { signal: ac.signal }),
    (err: unknown) => err instanceof DOMException && err.name === 'AbortError',
  );
  assert.equal(calls, 0);
});

// AC-10 — Each attempt is told which attempt it is
test('passes the 1-based attempt number to fn [@spec:retrying-an-operation:AC-10]', async () => {
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

// AC-12 — A caller that names no policy gets a lean one
test('DEFAULT_RETRY_POLICY exposes the documented lean defaults [@spec:retrying-an-operation:AC-12]', () => {
  assert.equal(DEFAULT_RETRY_POLICY.maxAttempts, 3);
  assert.equal(DEFAULT_RETRY_POLICY.baseDelayMs, 500);
  assert.equal(DEFAULT_RETRY_POLICY.maxDelayMs, 30_000);
  assert.equal(DEFAULT_RETRY_POLICY.factor, 2);
  assert.equal(DEFAULT_RETRY_POLICY.jitter, true);
});
