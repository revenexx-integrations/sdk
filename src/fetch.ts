import { NodeError } from './errors.js';
import type { IConfigField } from './types.js';

export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_TIMEOUT_MS = 120_000;

export const DEFAULT_RETRY_ATTEMPTS = 0;
export const MAX_RETRY_ATTEMPTS = 5;
export const DEFAULT_RETRY_DELAY_MS = 1_000;

/**
 * Default cap for response bodies read via {@link readArrayBuffer} /
 * {@link readText} / {@link readJsonOrText}. Guards the (shared) worker process
 * against a single oversized response exhausting its memory.
 */
export const DEFAULT_MAX_RESPONSE_BYTES = 25 * 1024 * 1024; // 25 MiB

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

function tooLargeError(status: number, bytes: number, maxBytes: number): NodeError {
  return new NodeError(
    'RESPONSE_TOO_LARGE',
    `Response body of ${bytes} bytes exceeds the ${maxBytes}-byte limit`,
    { status },
  );
}

/**
 * Read a response body into an ArrayBuffer while enforcing a hard byte cap.
 *
 * The `Content-Length` header is used as a fast-reject (bail before downloading
 * anything), but the limit is *also* enforced while streaming, since the header
 * can be absent or lie. On overrun the stream is cancelled and a
 * `NodeError('RESPONSE_TOO_LARGE', …, { status })` is thrown.
 */
export async function readArrayBuffer(
  res: Response,
  maxBytes: number = DEFAULT_MAX_RESPONSE_BYTES,
): Promise<ArrayBuffer> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw tooLargeError(res.status, declared, maxBytes);
  }

  const body = res.body;
  if (!body) {
    // No readable stream (e.g. a bodyless response) — fall back to the buffered
    // read, still enforcing the cap after the fact.
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) throw tooLargeError(res.status, buf.byteLength, maxBytes);
    return buf;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw tooLargeError(res.status, total, maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

/** Read a response body as UTF-8 text, capped at `maxBytes` (see {@link readArrayBuffer}). */
export async function readText(
  res: Response,
  maxBytes: number = DEFAULT_MAX_RESPONSE_BYTES,
): Promise<string> {
  const buf = await readArrayBuffer(res, maxBytes);
  return new TextDecoder().decode(buf);
}

/**
 * Read a response body as JSON when the `Content-Type` is `application/json`,
 * otherwise as text — the content-type sniff previously duplicated across the
 * HTTP/Upload/DeepL node sinks. Capped at `maxBytes` (see {@link readArrayBuffer}).
 */
export async function readJsonOrText(
  res: Response,
  maxBytes: number = DEFAULT_MAX_RESPONSE_BYTES,
): Promise<unknown> {
  const contentType = res.headers.get('content-type') ?? '';
  const text = await readText(res, maxBytes);
  return contentType.includes('application/json') ? JSON.parse(text) : text;
}

export function maxBytesConfigField(opts?: { default?: number; max?: number }): IConfigField {
  return {
    key: 'maxBytes',
    label: { en: 'Max response size (bytes)', de: 'Max. Antwortgröße (Bytes)' },
    type: 'number',
    default: opts?.default ?? DEFAULT_MAX_RESPONSE_BYTES,
    validation: { min: 1, ...(opts?.max ? { max: opts.max } : {}) },
  };
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
