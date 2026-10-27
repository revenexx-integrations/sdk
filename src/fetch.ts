import { NodeError } from './errors.js';
import { assertPublicUrl, connectionRefusal, guardConnectionsTo, guardedDispatcher } from './ssrf.js';
import type { IConfigField } from './types.js';

export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_TIMEOUT_MS = 120_000;

/** Maximum number of redirect hops `safeFetch` follows before giving up. */
export const MAX_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * The only request headers that survive a redirect to another origin. Every
 * other header the caller set is dropped on that hop, because a node sends keys
 * in headers of its own choosing (`X-API-Key`, `api-key`, `x-api-token`, or a
 * name a workflow author typed) and no deny-list can know them all. An allow-list
 * fails the safe way: a missing entry costs a header, never a key.
 * `soapaction` is here because SOAP 1.1 cannot be dispatched without it;
 * `content-encoding` because a 307/308 resends the body as it was, and the next
 * host cannot read a compressed body without being told so; and the conditional,
 * range and idempotency headers because dropping them changes what the request
 * does — a write guarded by `If-Match` would land unguarded, a retried POST
 * without its `Idempotency-Key` could land twice. None carries a secret.
 * Read from outside through {@link headerCrossesOrigin}.
 */
const CROSS_ORIGIN_SAFE_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'content-encoding',
  'content-language',
  'content-type',
  'idempotency-key',
  'if-match',
  'if-modified-since',
  'if-none-match',
  'if-range',
  'if-unmodified-since',
  'range',
  'soapaction',
  'user-agent',
]);

/**
 * Whether a request header with this name goes on to the next hop when
 * {@link safeFetch} follows a redirect to another origin — `true` for `Accept`,
 * `Accept-Encoding`, `Accept-Language`, `Content-Encoding`, `Content-Language`,
 * `Content-Type`, `Idempotency-Key`, `If-Match`, `If-Modified-Since`,
 * `If-None-Match`, `If-Range`, `If-Unmodified-Since`, `Range`, `SOAPAction` and
 * `User-Agent`, in any case, and `false` for every other name. The keep-list is by
 * name, so it can only keep a secret out of the headers it drops: a credential
 * whose header name the author chooses must refuse a name this answers `true`
 * for, or its key would cross with the harmless headers.
 */
export function headerCrossesOrigin(name: string): boolean {
  return CROSS_ORIGIN_SAFE_HEADERS.has(name.trim().toLowerCase());
}

/**
 * What the runtime refuses in a header value once surrounding whitespace is
 * trimmed: the C0 control characters except the tab, DEL, and anything above
 * Latin-1. The C1 range (U+0080–U+009F) is sent. Read off the runtime, not a
 * spec — `Headers` refuses only NUL, LF and CR, and the dispatcher underneath
 * the rest of C0 and DEL — and held against it on every Node version CI runs by
 * the AC-21 test that sends each character for real.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is what this pattern is for
const UNSENDABLE_IN_HEADER_VALUE = /[\0-\x08\x0a-\x1f\x7f\u0100-\uffff]/;

/** A header name the runtime accepts: an RFC 9110 token. */
const HEADER_NAME_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** The HTTP whitespace the runtime trims from both ends of a value before judging it. */
function isHttpWhitespace(code: number): boolean {
  return code === 0x09 || code === 0x0a || code === 0x0d || code === 0x20;
}

/**
 * The value with HTTP whitespace trimmed from both ends, by walking indices —
 * not a regex: `/^\s+|\s+$/g` is quadratic on a long run of whitespace inside
 * a value, and 200,000 tabs blocked the event loop for seconds, out of reach of
 * both the timeout and the abort signal.
 */
function trimHttpWhitespace(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && isHttpWhitespace(value.charCodeAt(start))) start++;
  while (end > start && isHttpWhitespace(value.charCodeAt(end - 1))) end--;
  return value.slice(start, end);
}

function invalidHeader(detail: string): NodeError {
  return new NodeError('INVALID_HEADER', detail, { status: 0 });
}

/**
 * Translate the caller's headers into the name/value pairs `fetch` will send,
 * refusing what it would refuse, before it gets to (PO-752). `fetch` rejects a
 * value with a line feed, carriage return or null character left in it, and its
 * message quotes the whole value — usually a key a user pasted from a wrapped
 * e-mail. A node routes that message to its error output, which nothing
 * redacts, so the key would stand in the run history. The other characters the
 * runtime refuses fail without the value, but as a generic `fetch failed` that
 * is retried; refusing them here too makes every value that cannot be sent one
 * `INVALID_HEADER`. A value the runtime sends today (a trailing newline, a tab
 * inside) still goes through.
 *
 * Every shape `fetch` takes is read — a record, a list of pairs, any iterable
 * of pairs, a `Headers` object (which accepts characters the dispatcher later
 * refuses) — and an entry that is not a pair is refused without being quoted,
 * since the runtime's own refusal of `['Bearer …']` quotes the string. The
 * pairs are what the caller passes on: an iterable can be read only once, and
 * reading it here would otherwise send the request without its headers.
 */
function sendableHeaders(headers: unknown): Array<[string, string]> {
  if (typeof headers !== 'object' || headers === null) {
    // `fetch` refuses a string by quoting it.
    throw invalidHeader('Headers must be an object or a list of pairs');
  }
  // `fetch` refuses a symbol key; Object.entries would drop it, and the request
  // would go out without that header.
  if (!(Symbol.iterator in headers) && Object.getOwnPropertySymbols(headers).length > 0) {
    throw invalidHeader('A header name must be a string, not a symbol');
  }
  const entries: unknown[] =
    Symbol.iterator in headers ? Array.from(headers as Iterable<unknown>) : Object.entries(headers);
  return entries.map((entry, i) => {
    const pair =
      typeof entry === 'object' && entry !== null && Symbol.iterator in entry
        ? Array.from(entry as Iterable<unknown>)
        : [];
    if (pair.length !== 2) throw invalidHeader(`Header entry ${i} is not a name/value pair`);
    const name = String(pair[0]);
    const value = String(pair[1]);
    if (!HEADER_NAME_TOKEN.test(name)) {
      // The runtime's refusal quotes the name; it is not a secret, but it is
      // retried like a transient failure. JSON.stringify keeps it on one line.
      throw invalidHeader(`Header name ${JSON.stringify(name)} cannot be sent`);
    }
    if (UNSENDABLE_IN_HEADER_VALUE.test(trimHttpWhitespace(value))) {
      throw invalidHeader(`Header ${JSON.stringify(name)} has a character in its value that cannot be sent`);
    }
    return [name, value];
  });
}

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

/**
 * Binds a request to the one origin its credential belongs to (PO-688).
 *
 * Setting it declares the whole request secret-bearing — headers, query, path
 * and body alike — so nothing has to name which part carries the secret: a
 * request to any other origin is refused with `CREDENTIAL_ORIGIN`, on the first
 * hop and on every redirect, before that origin is looked up or sent anything.
 */
export interface SafeFetchCredential {
  /** The only origin this request may reach, e.g. `https://api.pipedrive.com`. */
  origin: string | URL;
  /**
   * What a redirect off that origin does. `'refuse'` (the default) fails the
   * call. `'strip'` follows it the way an unbound request would — every header
   * not known to be harmless dropped, a body refused — for a download that is
   * redirected to a CDN or a signed storage link. A secret in the query or the
   * path is not protected on such a hop.
   */
  crossOriginRedirect?: 'refuse' | 'strip';
}

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
  /** Pass `ctx.signal` so the workflow engine can cancel the request. */
  signal?: AbortSignal;
  retry?: SafeFetchRetry;
  /** Bind the request to the origin of the credential it carries. */
  credential?: SafeFetchCredential;
}

/** The bound origin of a credential binding, or a `CREDENTIAL_ORIGIN` refusal when it is not an address. */
function boundOrigin(credential: SafeFetchCredential): string {
  let parsed: URL | undefined;
  try {
    parsed = new URL(credential.origin);
  } catch {
    parsed = undefined;
  }
  // Judged by protocol, not by `origin === 'null'`: `blob:https://x/…` has the
  // origin `https://x`, and `wss:` has one of its own, yet neither is an address
  // this binding may name.
  if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    throw new NodeError('CREDENTIAL_ORIGIN', 'The origin a credential is bound to is not an http(s) address', { status: 0 });
  }
  return parsed.origin;
}

/** A request, or a hop of it, that would carry a bound credential to another origin. Names origins only. */
function credentialOriginRefusal(target: string, bound: string, hop?: number): NodeError {
  const what = hop === undefined ? 'a request' : `a ${hop} redirect`;
  return new NodeError(
    'CREDENTIAL_ORIGIN',
    `Refused ${what} to ${target}: the credential it carries is bound to ${bound}`,
    { status: 0 },
  );
}

/**
 * The budget of one attempt, in two parts (IN-36). Up to the headers it is one
 * timer from the first lookup across every redirect hop, so a chain spends one
 * budget rather than one per hop. Over the body it is an inactivity limit: the
 * answer fails only once it has gone silent for the whole budget, so a long
 * download that keeps arriving is not cut off at {@link MAX_TIMEOUT_MS}.
 *
 * Either way the timer ends the attempt by aborting the signal its requests were
 * sent with. The runtime errors a response body with that signal's reason, so a
 * stalled answer ends as this `TIMEOUT` and its connection is let go.
 */
interface AttemptDeadline {
  /** The signal every lookup and hop of the attempt runs under, the caller's cancellation included. */
  signal: AbortSignal;
  /** Whether the budget, rather than the caller, ended the attempt. */
  expired(): boolean;
  /** The `TIMEOUT` the budget ended the attempt with. */
  reason(): unknown;
  /** Stop the timer. */
  clear(): void;
  /** Give one wait on the answer the whole budget again. */
  awaitChunk(): void;
}

function attemptDeadline(ctxSignal: AbortSignal | undefined, effectiveMs: number): AttemptDeadline {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (message: string) => {
    clearTimeout(timer);
    timer = setTimeout(() => ac.abort(new NodeError('TIMEOUT', message)), effectiveMs);
  };
  arm(`Request timed out after ${effectiveMs}ms`);
  return {
    signal: ctxSignal ? AbortSignal.any([ctxSignal, ac.signal]) : ac.signal,
    expired: () => ac.signal.aborted,
    reason: () => ac.signal.reason,
    clear: () => clearTimeout(timer),
    awaitChunk: () => arm(`The answer sent nothing for ${effectiveMs}ms`),
  };
}

/**
 * What an attempt that failed under `deadline` reports: the caller's
 * cancellation first, so it outranks a budget that ran out on the same tick,
 * then the budget's `TIMEOUT`, else the failure itself.
 */
function attemptFailure(err: unknown, ctxSignal: AbortSignal | undefined, deadline: AttemptDeadline): unknown {
  if (ctxSignal?.aborted) return ctxSignal.reason;
  if (deadline.expired()) return deadline.reason();
  return err;
}

/**
 * The answer with its body read under the inactivity limit: every read gets the
 * whole budget, and the timer is stopped the moment the read returns, the body
 * ends or a reader cancels it, so no timer outlives its answer. A read that fails
 * reports what {@link attemptFailure} says, so a cancellation still outranks the
 * budget while the body is read.
 *
 * The runtime's body is locked only on the first read: an answer nobody reads is
 * left to the runtime, which lets its connection go once the answer is collected
 * and would not if the body were locked. That happens only once the wrapper is
 * collected too, because the wrapper holds the runtime's response. An answer `new Response` cannot rebuild —
 * a status outside 200–599, a body on a null-body status, a reason phrase beyond
 * Latin-1 — goes back as it came, without the limit, rather than failing where it
 * used to succeed.
 */
function answerUnderDeadline(
  res: Response,
  ctxSignal: AbortSignal | undefined,
  deadline: AttemptDeadline,
): Response {
  if (!res.body) return res;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  // `res` itself, not only its body, is held for as long as the wrapper is: the
  // runtime cancels the body of a response once that response is collected, and
  // the wrapper would read the cancelled body as an empty, complete answer.
  const body = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        reader ??= (res.body as ReadableStream<Uint8Array>).getReader();
        deadline.awaitChunk();
        try {
          const { done, value } = await reader.read();
          if (done) controller.close();
          else controller.enqueue(value);
        } catch (err) {
          controller.error(attemptFailure(err, ctxSignal, deadline));
        } finally {
          deadline.clear();
        }
      },
      cancel(reason) {
        deadline.clear();
        return reader ? reader.cancel(reason) : res.body?.cancel(reason);
      },
    },
    // Read nothing ahead of the caller: the limit times the caller's waits, not
    // a buffer filling while nobody reads.
    { highWaterMark: 0 },
  );
  let answer: Response;
  try {
    answer = new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  } catch {
    return res;
  }
  return withUrl(answer, res.url);
}

/**
 * A constructed response has no address, and neither has its clone; both still
 * read the one the answer came from.
 */
function withUrl(answer: Response, url: string): Response {
  const clone = answer.clone.bind(answer);
  Object.defineProperty(answer, 'url', { value: url });
  Object.defineProperty(answer, 'clone', { value: () => withUrl(clone(), url) });
  return answer;
}

/**
 * A single network request, run under its attempt's budget and wired to the
 * workflow's cancellation signal. Surfaces the budget running out as
 * `NodeError('TIMEOUT')` and re-throws the caller's abort reason on external
 * cancellation.
 */
async function timedFetch(
  url: string | URL,
  fetchOptions: RequestInit,
  ctxSignal: AbortSignal | undefined,
  deadline: AttemptDeadline,
): Promise<Response> {
  try {
    // The guarded dispatcher goes last, so a `dispatcher` a caller slipped into the
    // options cannot route the request around the check it makes (IN-28).
    return await fetch(url, { ...fetchOptions, signal: deadline.signal, dispatcher: guardedDispatcher() } as RequestInit);
  } catch (err) {
    // A socket the connect-time guard dropped comes back as a generic
    // `TypeError('fetch failed')` — unwrap it first, before the abort/timeout
    // mapping, so a blocked target can never surface as a retryable TIMEOUT.
    const blocked = connectionRefusal(err);
    if (blocked) throw blocked;
    throw attemptFailure(err, ctxSignal, deadline);
  }
}

/**
 * Run the SSRF pre-flight resolve for one hop under its attempt's budget.
 * `assertPublicUrl` may resolve DNS, and `dns.lookup` honours neither a timeout
 * nor a signal; without this a hung/hostile resolver would block `safeFetch` past
 * `timeoutMs` and ignore `ctxSignal`. A resolve timeout surfaces as `TIMEOUT`
 * (transient — safeFetch may retry it).
 */
async function guardUrl(
  url: string | URL,
  ctxSignal: AbortSignal | undefined,
  deadline: AttemptDeadline,
  effectiveMs: number,
): Promise<void> {
  try {
    await assertPublicUrl(url, { signal: deadline.signal });
  } catch (err) {
    if (ctxSignal?.aborted) throw ctxSignal.reason;
    if (deadline.expired()) throw new NodeError('TIMEOUT', `DNS resolution timed out after ${effectiveMs}ms`);
    throw err;
  }
}

/**
 * Whether a request body would put anything on the wire. An empty string,
 * buffer, blob or parameter list sends nothing, so a redirect may carry it
 * anywhere; every other shape (a stream, form data) is treated as content,
 * because it cannot be measured without consuming it.
 */
function hasContent(body: RequestInit['body']): boolean {
  if (body == null) return false;
  if (typeof body === 'string') return body.length > 0;
  if (body instanceof ArrayBuffer) return body.byteLength > 0;
  if (ArrayBuffer.isView(body)) return body.byteLength > 0;
  if (body instanceof Blob) return body.size > 0;
  if (body instanceof URLSearchParams) return body.toString().length > 0;
  return true;
}

/**
 * A URL with a user name or password in it is refused before anything is sent
 * (PO-763). The runtime's `fetch` would refuse it too, but its message quotes the
 * whole URL — password and query string included — and a node puts that message
 * on its error port. This one names the problem, never the address.
 */
function refuseUserinfo(url: URL, status = 0): void {
  if (url.username !== '' || url.password !== '') {
    throw new NodeError(
      'INVALID_URL',
      status === 0
        ? 'Refused a URL with a user name or password in it: pass them in a credential, not in the address'
        : `Refused a ${status} redirect to a URL with a user name or password in it`,
      { status: 0 },
    );
  }
}

/**
 * Perform one request while enforcing the SSRF guard. The initial URL and every
 * redirect target are checked with {@link assertPublicUrl}; redirects are
 * followed manually (`redirect: 'manual'`) so a 3xx `Location` pointing at a
 * private/loopback address is re-checked and rejected rather than transparently
 * followed by the runtime. A cross-origin hop keeps only the headers in
 * the headers {@link headerCrossesOrigin} answers `true` for, an `https`→`http` downgrade is refused, a
 * redirect that would resend a body to another origin (307/308, and 301/302
 * on anything but POST) is refused before its target is looked up, and the
 * request is downgraded to `GET` per the usual 301/302/303 rules.
 *
 * The whole attempt runs under one {@link attemptDeadline}: one budget up to the
 * headers, then an inactivity limit over the body of the answer it returns.
 */
async function guardedFetch(
  url: string | URL,
  fetchOptions: RequestInit,
  ctxSignal: AbortSignal | undefined,
  effectiveMs: number,
  binding?: { origin: string; crossOriginRedirect: 'refuse' | 'strip' },
): Promise<Response> {
  const deadline = attemptDeadline(ctxSignal, effectiveMs);
  try {
    const res = await followHops(url, fetchOptions, ctxSignal, deadline, effectiveMs, binding);
    deadline.clear();
    return answerUnderDeadline(res, ctxSignal, deadline);
  } catch (err) {
    deadline.clear();
    throw err;
  }
}

async function followHops(
  url: string | URL,
  fetchOptions: RequestInit,
  ctxSignal: AbortSignal | undefined,
  deadline: AttemptDeadline,
  effectiveMs: number,
  binding?: { origin: string; crossOriginRedirect: 'refuse' | 'strip' },
): Promise<Response> {
  // The initial request is issued with the caller's URL and init untouched
  // (only `redirect: 'manual'` is added, and headers arrive as the pairs
  // `sendableHeaders` read), so the common no-redirect path stays what the
  // caller passed. New URL/Headers objects are built only
  // when a redirect is actually followed.
  let currentUrl: string | URL = url;
  let currentInit: RequestInit = { ...fetchOptions, redirect: 'manual' };

  await guardUrl(currentUrl, ctxSignal, deadline, effectiveMs);

  for (let hop = 0; ; hop++) {
    // The check above approved an address; this puts the address the socket
    // actually reaches under the same judgement for as long as this hop is being
    // opened, which is what closes the rebinding race between the two.
    const release = guardConnectionsTo(
      currentUrl instanceof URL ? currentUrl : new URL(currentUrl),
    );
    let res: Response;
    try {
      res = await timedFetch(currentUrl, currentInit, ctxSignal, deadline);
    } finally {
      release();
    }

    const location = res.headers.get('location');
    if (!REDIRECT_STATUSES.has(res.status) || !location) return res;

    // We act on this redirect (follow or reject) and never read its 3xx body, so
    // release the socket now — before any of the throw paths below — so a blocked
    // target, redirect-budget overrun, invalid Location or downgrade all leave the
    // connection released rather than occupied.
    const redirectStatus = res.status;
    await res.body?.cancel().catch(() => {});

    if (hop >= MAX_REDIRECTS) {
      throw new NodeError('TOO_MANY_REDIRECTS', `Exceeded ${MAX_REDIRECTS} redirects`, { status: redirectStatus });
    }

    const base = currentUrl instanceof URL ? currentUrl : new URL(currentUrl);
    let nextUrl: URL;
    try {
      nextUrl = new URL(location, base);
    } catch {
      throw new NodeError('BLOCKED_ADDRESS', 'Blocked redirect with an invalid Location header', { status: 0 });
    }
    refuseUserinfo(nextUrl, redirectStatus);
    // A request bound to its credential's origin never leaves it (PO-688). The
    // binding is compared, not the previous hop, so A → A′ → B is caught at the
    // second hop as surely as A → B at the first; and it is checked before the
    // target is looked up, so the other origin's DNS does not see it either.
    if (binding && binding.crossOriginRedirect === 'refuse' && nextUrl.origin !== binding.origin) {
      throw credentialOriginRefusal(nextUrl.origin, binding.origin, redirectStatus);
    }
    // Refuse an https→http downgrade on redirect: a request that started over TLS
    // must not be bounced down to plaintext, which would expose it (and any
    // still-attached same-origin credentials) on the wire.
    if (base.protocol === 'https:' && nextUrl.protocol !== 'https:') {
      throw new NodeError('BLOCKED_ADDRESS', 'Blocked https→http downgrade on redirect', { status: 0 });
    }

    const headers = new Headers(currentInit.headers);
    let method = (currentInit.method ?? 'GET').toUpperCase();
    // NOTE: 307/308 — and 301/302 on anything but POST — keep the method and
    // resend `body` as-is: on the same origin only; to another origin the hop
    // is refused below (PO-684). A
    // one-shot (ReadableStream) body is already consumed by the first hop and
    // will fail here — pass a Buffer/string body if the target may 307/308.
    // This mirrors native fetch's limitation.
    let body = currentInit.body;

    // 303 always downgrades to GET; 301/302 downgrade a POST. On downgrade the
    // request body and its framing headers must be dropped.
    if (redirectStatus === 303 || ((redirectStatus === 301 || redirectStatus === 302) && method === 'POST')) {
      method = 'GET';
      body = undefined;
      headers.delete('content-type');
      headers.delete('content-length');
    }
    // A body the redirect would resend goes nowhere but where the caller sent
    // it: it may be customer data, or an OAuth client secret. That is every
    // redirect that keeps the method — 307 and 308, and 301/302 on PUT, PATCH,
    // DELETE. Dropping the body and going on would turn a write into a read the
    // caller believes was a write, so the hop is refused instead (PO-684). It
    // is checked before the target is looked up, so the other origin's DNS does
    // not see it either, and it is deterministic, so it is not retried.
    if (hasContent(body) && nextUrl.origin !== base.origin) {
      throw new NodeError(
        'BLOCKED_ADDRESS',
        `Blocked ${redirectStatus} redirect to another origin: it would resend the request body to ${nextUrl.origin}`,
        { status: 0 },
      );
    }
    await guardUrl(nextUrl, ctxSignal, deadline, effectiveMs);
    // Never leak credentials across an origin boundary on redirect. Browsers and
    // undici strip only `Authorization`, `Cookie` and `Proxy-Authorization`, which
    // is enough where the caller cannot choose a header for its key; a node can,
    // so everything not known to be harmless is dropped instead (PO-664).
    if (binding && nextUrl.origin !== binding.origin) {
      // A bound request declared every part of itself secret, so a hop off its
      // origin under 'strip' keeps no header the caller set: a key can sit under
      // any name, `Idempotency-Key` and `SOAPAction` included (AC-24).
      for (const name of [...headers.keys()]) headers.delete(name);
    } else if (nextUrl.origin !== base.origin) {
      for (const name of [...headers.keys()]) {
        if (!headerCrossesOrigin(name)) headers.delete(name);
      }
    }

    currentUrl = nextUrl;
    currentInit = { ...currentInit, method, body, headers, redirect: 'manual' };
  }
}

export async function safeFetch(
  url: string | URL,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: ctxSignal, retry, credential, ...fetchOptions } = options;
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

  // Once, ahead of the retry loop and the DNS lookup: a value that cannot be sent
  // now cannot be sent on the next attempt either, so INVALID_HEADER never
  // reaches the loop's list of refusals that are not asked again.
  // A run already cancelled reports its cancellation, not a fault in its data.
  if (ctxSignal?.aborted) throw ctxSignal.reason;
  if (fetchOptions.headers !== undefined) fetchOptions.headers = sendableHeaders(fetchOptions.headers);
  // An address the URL parser cannot read is refused here too: the runtime's own
  // TypeError carries the whole string in `input`, password and query included,
  // and as a plain error it would be retried (PO-763).
  let parsed: URL;
  try {
    parsed = url instanceof URL ? url : new URL(url);
  } catch {
    throw new NodeError('INVALID_URL', 'Refused an address that cannot be read as a URL', { status: 0 });
  }
  refuseUserinfo(parsed);
  // The same for a request bound to its credential's origin: the first hop is
  // judged here, once, before any lookup or attempt (PO-688).
  let binding: { origin: string; crossOriginRedirect: 'refuse' | 'strip' } | undefined;
  if (credential) {
    binding = { origin: boundOrigin(credential), crossOriginRedirect: credential.crossOriginRedirect ?? 'refuse' };
    if (parsed.origin !== binding.origin) throw credentialOriginRefusal(parsed.origin, binding.origin);
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (ctxSignal?.aborted) throw ctxSignal.reason;

    try {
      return await guardedFetch(url, fetchOptions, ctxSignal, effectiveMs, binding);
    } catch (err) {
      if (ctxSignal?.aborted) throw ctxSignal.reason;
      // A blocked address or redirect loop is deterministic — retrying can only
      // waste time and re-hit the same wall, so surface it immediately.
      if (
        err instanceof NodeError &&
        (err.code === 'BLOCKED_ADDRESS' ||
          err.code === 'TOO_MANY_REDIRECTS' ||
          err.code === 'CREDENTIAL_ORIGIN' ||
          err.code === 'INVALID_URL')
      ) {
        throw err;
      }
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise<void>((resolve) => {
          const onAbort = () => { clearTimeout(t); resolve(); };
          // Remove the abort listener when the delay elapses normally, so many
          // safeFetch calls sharing one long-lived ctx.signal don't accumulate
          // listeners (which would leak and trip the max-listeners warning).
          const t = setTimeout(() => { ctxSignal?.removeEventListener('abort', onAbort); resolve(); }, retryDelayMs);
          ctxSignal?.addEventListener('abort', onAbort, { once: true });
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
 * `NodeError('RESPONSE_TOO_LARGE', …, { status })` is thrown. Both refusal paths
 * cancel the body first, so neither leaves the connection held.
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
    // We refuse on the declaration and never read this body, so release the
    // socket before throwing — the same reason guardedFetch cancels a 3xx body
    // ahead of its throw paths. Without this the fast-reject is the one exit
    // from a read that leaves the connection held, which matters most for the
    // callers that take an answer on every run in the shared worker.
    // Best-effort: a cancel that rejects must not mask RESPONSE_TOO_LARGE.
    await res.body?.cancel().catch(() => {});
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

/**
 * The setting a node offers its workflow author for the response size cap,
 * ready to spread into `description.config`.
 *
 * **What the node still has to do** (PO-497): declaring the setting does not
 * wire it up. Read the configured value in `execute` and pass it on — the
 * helpers here only produce the declaration, and a node that spreads this and
 * never reads `config.maxBytes` offers a setting that does nothing.
 *
 * Everything an author reads is supplied in both languages the node packages
 * write, so spreading this unchanged already satisfies the rule they hold.
 * Nothing is left to the caller on that side: a node that wants different
 * words replaces the field rather than completing it.
 */
export function maxBytesConfigField(opts?: { default?: number; max?: number }): IConfigField {
  return {
    key: 'maxBytes',
    label: { en: 'Max response size (bytes)', de: 'Maximale Antwortgröße (Bytes)' },
    description: {
      en: 'An answer larger than this is refused instead of read, counted per answer rather than per run. This package enforces a ceiling of its own above it, so a larger value buys nothing.',
      de: 'Eine größere Antwort wird abgelehnt statt gelesen; gezählt wird je Antwort, nicht je Lauf. Darüber liegt zusätzlich die feste Obergrenze dieses Pakets, ein höherer Wert bringt also nichts.',
    },
    type: 'number',
    default: opts?.default ?? DEFAULT_MAX_RESPONSE_BYTES,
    validation: { min: 1, max: Math.min(opts?.max ?? MAX_RESPONSE_BYTES, MAX_RESPONSE_BYTES) },
  };
}

/**
 * The setting a node offers its workflow author for the request budget, ready
 * to spread into `description.config`.
 *
 * **What the node still has to do** (PO-497): pass the configured value to
 * `safeFetch` as `timeoutMs`. See {@link maxBytesConfigField} for the same note
 * and for why the label and description are not the caller's to complete.
 */
export function timeoutConfigField(opts?: { default?: number; max?: number }): IConfigField {
  return {
    key: 'timeoutMs',
    label: { en: 'Timeout (ms)', de: 'Zeitlimit (ms)' },
    description: {
      en: 'How long one attempt may wait for an answer to start, redirects included, and how long the answer may then go silent before it fails as a timeout. An answer that keeps arriving is not cut off. Each retry gets the time again.',
      de: 'Wie lange ein einzelner Versuch auf den Beginn einer Antwort warten darf, Weiterleitungen eingeschlossen, und wie lange die Antwort danach stocken darf, bevor sie als Zeitüberschreitung fehlschlägt. Eine Antwort, die weiter eintrifft, wird nicht abgebrochen. Jede Wiederholung bekommt die Zeit erneut.',
    },
    type: 'number',
    default: opts?.default ?? DEFAULT_TIMEOUT_MS,
    validation: { min: 100, max: opts?.max ?? MAX_TIMEOUT_MS },
  };
}

/**
 * The two settings a node offers its workflow author for the retry budget,
 * ready to spread into `description.config`.
 *
 * **What the node still has to do** (PO-497): pass both configured values to
 * `safeFetch` as `retry.attempts` and `retry.delayMs`. See
 * {@link maxBytesConfigField} for the same note and for why the labels and
 * descriptions are not the caller's to complete.
 */
export function retryConfigFields(opts?: {
  defaultAttempts?: number;
  defaultDelayMs?: number;
}): IConfigField[] {
  return [
    {
      key: 'retryAttempts',
      label: { en: 'Retry attempts', de: 'Wiederholungsversuche' },
      description: {
        en: 'How often a failed attempt is repeated. 0 sends the request once and reports the first failure.',
        de: 'Wie oft ein fehlgeschlagener Versuch wiederholt wird. 0 sendet die Anfrage einmal und meldet den ersten Fehler.',
      },
      type: 'number',
      default: opts?.defaultAttempts ?? DEFAULT_RETRY_ATTEMPTS,
      validation: { min: 0, max: MAX_RETRY_ATTEMPTS },
    },
    {
      key: 'retryDelayMs',
      label: { en: 'Retry delay (ms)', de: 'Wartezeit vor Wiederholung (ms)' },
      description: {
        en: 'How long to wait before the next attempt.',
        de: 'Wie lange vor dem nächsten Versuch gewartet wird.',
      },
      type: 'number',
      default: opts?.defaultDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      validation: { min: 100 },
    },
  ];
}
