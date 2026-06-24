import { NodeError } from './errors.js';
import type { IConfigField } from './types.js';

export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_TIMEOUT_MS = 120_000;

export const DEFAULT_RETRY_ATTEMPTS = 0;
export const MAX_RETRY_ATTEMPTS = 5;
export const DEFAULT_RETRY_DELAY_MS = 1_000;

export interface SafeFetchRetry {
  attempts: number;
  delayMs?: number;
}

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
  /** Pass `ctx.signal` so the workflow engine can cancel the request. */
  signal?: AbortSignal;
  retry?: SafeFetchRetry;
}

export async function safeFetch(
  url: string | URL,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: ctxSignal, retry, ...fetchOptions } = options;
  const effectiveMs =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? Math.min(timeoutMs, MAX_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS;
  const rawAttempts = retry?.attempts ?? DEFAULT_RETRY_ATTEMPTS;
  const safeAttempts = Number.isFinite(rawAttempts)
    ? Math.min(Math.max(0, rawAttempts), MAX_RETRY_ATTEMPTS)
    : DEFAULT_RETRY_ATTEMPTS;
  const maxAttempts = safeAttempts + 1;
  const retryDelayMs = retry?.delayMs ?? DEFAULT_RETRY_DELAY_MS;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (ctxSignal?.aborted) throw ctxSignal.reason;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), effectiveMs);
    const signal = ctxSignal ? AbortSignal.any([ctxSignal, ac.signal]) : ac.signal;

    try {
      return await fetch(url, { ...fetchOptions, signal });
    } catch (err) {
      if (ctxSignal?.aborted) throw ctxSignal.reason;
      if (ac.signal.aborted) {
        lastError = new NodeError('TIMEOUT', `Request timed out after ${effectiveMs}ms`);
      } else {
        lastError = err;
      }
      if (attempt < maxAttempts) {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, retryDelayMs);
          ctxSignal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
        });
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

export function timeoutConfigField(opts?: { default?: number; max?: number }): IConfigField {
  return {
    key: 'timeoutMs',
    label: 'Timeout (ms)',
    type: 'number',
    default: opts?.default ?? DEFAULT_TIMEOUT_MS,
    validation: { min: 100, max: opts?.max ?? MAX_TIMEOUT_MS },
  };
}

export function retryConfigFields(opts?: {
  defaultAttempts?: number;
  defaultDelayMs?: number;
}): IConfigField[] {
  return [
    {
      key: 'retryAttempts',
      label: 'Retry attempts',
      type: 'number',
      default: opts?.defaultAttempts ?? DEFAULT_RETRY_ATTEMPTS,
      validation: { min: 0, max: MAX_RETRY_ATTEMPTS },
    },
    {
      key: 'retryDelayMs',
      label: 'Retry delay (ms)',
      type: 'number',
      default: opts?.defaultDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      validation: { min: 100 },
    },
  ];
}
