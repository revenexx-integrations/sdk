/**
 * Transport-agnostic retry/backoff primitive (PO-139).
 *
 * Wraps *any* async operation — raw `fetch`, an SDK client (axios), a future
 * transport — with exponential backoff + full jitter, honouring a
 * server-dictated delay (HTTP `Retry-After`) when the caller supplies one.
 *
 * The retry decision lives with the connector: it throws a {@link RetryableError}
 * only when an attempt failed *and* is worth retrying. Everything else is
 * rethrown as-is, and terminal API errors that connectors model as *values*
 * (e.g. a `{ kind: 'http-error' }` union) simply flow back as the return value.
 *
 * This is deliberately NOT a circuit breaker, rate limiter, or HTTP client, and
 * it does not replace Temporal activity-level retries — it is the fine-grained,
 * idempotency-aware, `Retry-After`-honouring layer inside a single activity.
 */

/** Thrown by the wrapped fn to signal "this attempt failed but is retryable". */
export class RetryableError extends Error {
  /** Server-dictated delay before the next attempt, e.g. parsed from `Retry-After`. */
  readonly retryAfterMs?: number;
  /** The underlying error/value that triggered the retry. */
  readonly cause?: unknown;

  constructor(message: string, opts?: { retryAfterMs?: number; cause?: unknown }) {
    super(message);
    this.name = 'RetryableError';
    this.retryAfterMs = opts?.retryAfterMs;
    this.cause = opts?.cause;
  }
}

export interface RetryPolicy {
  /** Total tries including the first. */
  maxAttempts: number;
  /** Base delay for the exponential backoff. */
  baseDelayMs: number;
  /** Upper bound for any single computed delay. */
  maxDelayMs: number;
  /** Exponential growth factor. */
  factor: number;
  /** Apply full jitter to the computed backoff. */
  jitter: boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  factor: 2,
  jitter: true,
};

export interface RetryHooks {
  /** Pass `ctx.signal` so cancelling a workflow cancels the wait (and stops retrying) immediately. */
  signal: AbortSignal;
  logger?: { warn(msg: string, meta?: Record<string, unknown>): void };
  onRetry?(info: { attempt: number; delayMs: number; error: unknown }): void;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

/**
 * Pure backoff math, exported for testing/reuse. Returns the delay before the
 * retry that follows the given (1-based) failed `attempt`: an exponential term
 * `baseDelayMs * factor^(attempt-1)` capped at `maxDelayMs`, with full jitter
 * (`random() * cap`) when `policy.jitter` is set.
 */
export function backoffDelay(attempt: number, policy: RetryPolicy): number {
  const exponent = Math.max(0, attempt - 1);
  const raw = policy.baseDelayMs * Math.pow(policy.factor, exponent);
  const cap = Math.min(policy.maxDelayMs, raw);
  return policy.jitter ? Math.random() * cap : cap;
}

/**
 * Abort-aware sleep. Resolves after `ms`, or rejects with the signal's reason
 * (a DOMException `AbortError` by default) as soon as `signal` aborts — so a
 * caller's retry loop stops cleanly instead of finishing the wait.
 */
export function sleepWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Runs `fn`; if it throws a {@link RetryableError} and attempts remain, waits
 * (`RetryableError.retryAfterMs` when present, else the computed
 * {@link backoffDelay}) respecting `signal`, then retries. Any other throw is
 * rethrown immediately; on the final attempt the RetryableError itself is
 * thrown (preserving its `retryAfterMs`/`cause`), not its `.cause`.
 *
 * Distinct from `safeFetch`'s built-in fixed-delay `retry` option, which is
 * unchanged: that is a simple in-fetch retry; this is the richer, transport-
 * agnostic, `Retry-After`-aware primitive connectors wrap around any operation.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  policy: Partial<RetryPolicy>,
  hooks: RetryHooks,
): Promise<T> {
  const effective: RetryPolicy = { ...DEFAULT_RETRY_POLICY, ...policy };
  const maxAttempts = Math.max(1, effective.maxAttempts);
  const { signal, logger, onRetry } = hooks;

  for (let attempt = 1; ; attempt++) {
    // Never start an attempt after cancellation.
    if (signal.aborted) throw abortReason(signal);

    try {
      return await fn(attempt);
    } catch (err) {
      if (!(err instanceof RetryableError) || attempt >= maxAttempts) throw err;

      const delayMs = err.retryAfterMs ?? backoffDelay(attempt, effective);
      onRetry?.({ attempt, delayMs, error: err });
      logger?.warn('Retrying after retryable error', {
        attempt,
        maxAttempts,
        delayMs,
        error: err.message,
      });
      await sleepWithSignal(delayMs, signal);
    }
  }
}
