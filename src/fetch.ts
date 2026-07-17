import { NodeError } from './errors.js';
import { assertPublicUrl, type LookupFn } from './ssrf.js';
import type { IConfigField } from './types.js';

export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_TIMEOUT_MS = 120_000;

/** Maximum number of redirect hops `safeFetch` follows before giving up. */
export const MAX_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export const DEFAULT_RETRY_ATTEMPTS = 0;
export const MAX_RETRY_ATTEMPTS = 5;
export const DEFAULT_RETRY_DELAY_MS = 1_000;

/**
 * Default cap for response bodies read via {@link readArrayBuffer} /
 * {@link readText} / {@link readJsonOrText}. Guards the (shared) worker process
 * against a single oversized response exhausting its memory.
 */
export const DEFAULT_MAX_RESPONSE_BYTES = 25 * 1024 * 1024; // 25 MiB

/**
 * Hard upper ceiling for any per-node `maxBytes`. Even a permissive node author
 * (who calls {@link maxBytesConfigField} without an explicit `max`, or passes a
 * large `maxBytes` to the `read*` helpers) can never lift the cap above this, so
 * the shared worker's memory stays bounded. Analogous to {@link MAX_TIMEOUT_MS}.
 */
export const MAX_RESPONSE_BYTES = 100 * 1024 * 1024; // 100 MiB

/** Clamp a requested `maxBytes` into `[1, MAX_RESPONSE_BYTES]`. */
export function clampResponseBytes(maxBytes: number): number {
  if (!Number.isFinite(maxBytes) || maxBytes < 1) return MAX_RESPONSE_BYTES;
  return Math.min(maxBytes, MAX_RESPONSE_BYTES);
}

export interface SafeFetchRetry {
  attempts: number;
  delayMs?: number;
}

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
  /** Pass `ctx.signal` so the workflow engine can cancel the request. */
  signal?: AbortSignal;
  retry?: SafeFetchRetry;
  /**
   * Internal test seam: override the DNS resolver the SSRF guard uses for this
   * call. Production callers leave this unset (real DNS). See {@link assertPublicUrl}.
   */
  lookup?: LookupFn;
}

/**
 * A single network request bounded by the per-attempt timeout and wired to the
 * workflow's cancellation signal. Surfaces its own timeout as
 * `NodeError('TIMEOUT')` and re-throws the caller's abort reason on external
 * cancellation.
 */
async function timedFetch(
  url: string | URL,
  fetchOptions: RequestInit,
  ctxSignal: AbortSignal | undefined,
  effectiveMs: number,
): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), effectiveMs);
  const signal = ctxSignal ? AbortSignal.any([ctxSignal, ac.signal]) : ac.signal;
  try {
    return await fetch(url, { ...fetchOptions, signal });
  } catch (err) {
    if (ctxSignal?.aborted) throw ctxSignal.reason;
    if (ac.signal.aborted) throw new NodeError('TIMEOUT', `Request timed out after ${effectiveMs}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Perform one request while enforcing the SSRF guard. The initial URL and every
 * redirect target are checked with {@link assertPublicUrl}; redirects are
 * followed manually (`redirect: 'manual'`) so a 3xx `Location` pointing at a
 * private/loopback address is re-checked and rejected rather than transparently
 * followed by the runtime. `Authorization` is dropped on a cross-origin hop and
 * the request is downgraded to `GET` per the usual 301/302/303 rules.
 */
async function guardedFetch(
  url: string | URL,
  fetchOptions: RequestInit,
  ctxSignal: AbortSignal | undefined,
  effectiveMs: number,
  lookup: LookupFn | undefined,
): Promise<Response> {
  // The initial request is issued with the caller's URL and init untouched
  // (only `redirect: 'manual'` is added), so the common no-redirect path stays
  // byte-for-byte what the caller passed. New URL/Headers objects are built only
  // when a redirect is actually followed.
  let currentUrl: string | URL = url;
  let currentInit: RequestInit = { ...fetchOptions, redirect: 'manual' };

  await assertPublicUrl(currentUrl, { lookup });

  for (let hop = 0; ; hop++) {
    const res = await timedFetch(currentUrl, currentInit, ctxSignal, effectiveMs);

    const location = res.headers.get('location');
    if (!REDIRECT_STATUSES.has(res.status) || !location) return res;

    if (hop >= MAX_REDIRECTS) {
      throw new NodeError('TOO_MANY_REDIRECTS', `Exceeded ${MAX_REDIRECTS} redirects`, { status: res.status });
    }

    const base = currentUrl instanceof URL ? currentUrl : new URL(currentUrl);
    const nextUrl = new URL(location, base);
    await assertPublicUrl(nextUrl, { lookup });

    const headers = new Headers(currentInit.headers ?? undefined);
    let method = (currentInit.method ?? 'GET').toUpperCase();
    let body = currentInit.body;

    // 303 always downgrades to GET; 301/302 downgrade a POST. On downgrade the
    // request body and its framing headers must be dropped.
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
      method = 'GET';
      body = undefined;
      headers.delete('content-type');
      headers.delete('content-length');
    }
    // Never leak credentials across an origin boundary on redirect.
    if (nextUrl.origin !== base.origin) headers.delete('authorization');

    // Release the redirect response's socket before issuing the next hop.
    await res.body?.cancel().catch(() => {});
    currentUrl = nextUrl;
    currentInit = { ...currentInit, method, body, headers, redirect: 'manual' };
  }
}

export async function safeFetch(
  url: string | URL,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: ctxSignal, retry, lookup, ...fetchOptions } = options;
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

    try {
      return await guardedFetch(url, fetchOptions, ctxSignal, effectiveMs, lookup);
    } catch (err) {
      if (ctxSignal?.aborted) throw ctxSignal.reason;
      // A blocked address or redirect loop is deterministic — retrying can only
      // waste time and re-hit the same wall, so surface it immediately.
      if (err instanceof NodeError && (err.code === 'BLOCKED_ADDRESS' || err.code === 'TOO_MANY_REDIRECTS')) {
        throw err;
      }
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, retryDelayMs);
          ctxSignal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
        });
      }
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
  // Clamp to the hard ceiling so a permissive caller can't lift the guard above
  // MAX_RESPONSE_BYTES (mirrors safeFetch's Math.min(timeoutMs, MAX_TIMEOUT_MS)).
  const cap = clampResponseBytes(maxBytes);
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > cap) {
    throw tooLargeError(res.status, declared, cap);
  }

  const body = res.body;
  if (!body) {
    // No readable stream (e.g. a bodyless response) — fall back to the buffered
    // read, still enforcing the cap after the fact.
    const buf = await res.arrayBuffer();
    if (buf.byteLength > cap) throw tooLargeError(res.status, buf.byteLength, cap);
    return buf;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // The cap is checked after each chunk is buffered, so worst-case peak
      // memory is ≈ cap + one undici chunk (undici bounds its chunk size).
      total += value.byteLength;
      if (total > cap) {
        // Best-effort cancel; swallow any rejection (e.g. an already-errored
        // stream) so the overrun always surfaces as RESPONSE_TOO_LARGE rather
        // than a stream-cancel error.
        await reader.cancel().catch(() => {});
        throw tooLargeError(res.status, total, cap);
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
 * Return `true` when a `Content-Type` header denotes JSON. The media type is
 * matched case-insensitively and only after stripping any `;`-parameters
 * (`charset`, `boundary`, …), so `Application/JSON; charset=utf-8` counts while
 * a lookalike like `application/jsonp` does not. Structured-syntax `+json`
 * suffixes (RFC 6839, e.g. `application/vnd.api+json`) are recognised too.
 */
function isJsonContentType(contentType: string): boolean {
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return mediaType === 'application/json' || mediaType.endsWith('+json');
}

/**
 * Read a response body as JSON when the `Content-Type` denotes JSON (see
 * {@link isJsonContentType}), otherwise as text — the content-type sniff
 * previously duplicated across the HTTP/Upload/DeepL node sinks. Capped at
 * `maxBytes` (see {@link readArrayBuffer}).
 *
 * A malformed JSON body surfaces as `NodeError('RESPONSE_PARSE_ERROR', …, { status })`
 * rather than a raw `SyntaxError`, keeping to the SDK error contract.
 */
export async function readJsonOrText(
  res: Response,
  maxBytes: number = DEFAULT_MAX_RESPONSE_BYTES,
): Promise<unknown> {
  const contentType = res.headers.get('content-type') ?? '';
  const text = await readText(res, maxBytes);
  if (!isJsonContentType(contentType)) return text;
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new NodeError(
      'RESPONSE_PARSE_ERROR',
      `Invalid JSON response: ${(e as Error).message}`,
      { status: res.status },
    );
  }
}

export function maxBytesConfigField(opts?: { default?: number; max?: number }): IConfigField {
  return {
    key: 'maxBytes',
    label: 'Max response size (bytes)',
    type: 'number',
    default: opts?.default ?? DEFAULT_MAX_RESPONSE_BYTES,
    validation: { min: 1, max: Math.min(opts?.max ?? MAX_RESPONSE_BYTES, MAX_RESPONSE_BYTES) },
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
