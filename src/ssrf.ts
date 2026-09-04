import { subscribe } from 'node:diagnostics_channel';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { NodeError } from './errors.js';

/**
 * A resolved DNS address, mirroring the shape of Node's `dns.LookupAddress`.
 * `family` is `4` or `6`; only `address` is consulted by the guard.
 */
export interface LookupAddress {
  address: string;
  family: number;
}

/**
 * Resolves a hostname to every address it maps to. Modelled on
 * `dns.lookup(host, { all: true })`. Injectable so tests can drive the guard
 * deterministically without real DNS — see {@link ssrfResolver}.
 */
export type LookupFn = (hostname: string) => Promise<LookupAddress[]>;

/**
 * The DNS resolver the SSRF guard uses when a caller does not pass an explicit
 * `lookup`. It is a mutable holder (rather than a bare function) purely so tests
 * can swap `ssrfResolver.lookup` via a spy and restore it afterwards — the guard
 * itself always runs. **Do not repoint this in production.**
 */
export const ssrfResolver: { lookup: LookupFn } = {
  lookup: async (hostname: string): Promise<LookupAddress[]> => {
    const { lookup } = await import('node:dns/promises');
    const results = await lookup(hostname, { all: true });
    return results.map((r) => ({ address: r.address, family: r.family }));
  },
};

/** Narrow a parsed address to its IPv6 shape, which alone carries an embedded v4. */
function isIPv6(addr: ipaddr.IPv4 | ipaddr.IPv6): addr is ipaddr.IPv6 {
  return addr.kind() === 'ipv6';
}

/**
 * The one range name the address classification hands back that a request may be
 * steered to. The ruling is kept as the complement of this rather than as a list of
 * refused ranges, so a range the classification learns about later is refused
 * without anybody here having to notice that it exists.
 */
const PUBLIC_RANGE = 'unicast';

/**
 * Return `true` when `ip` (a literal IPv4/IPv6 address) points at a private,
 * loopback, link-local, carrier-grade NAT, multicast, broadcast, transitional or
 * otherwise reserved target that a server-side fetch must never be steered to.
 *
 * The verdict is an allow-list of one: the address is refused unless the
 * classification calls it public unicast. IPv4-mapped and the deprecated
 * IPv4-compatible IPv6 forms are unwrapped and their embedded address judged
 * instead, so a public host stays reachable when it is written that way. An address
 * we cannot parse is treated as blocked (fail-closed).
 *
 * Promised behaviour: specs/ssrf-guard.md (AC-9, AC-11, AC-19).
 */
export function isBlockedAddress(ip: string): boolean {
  let addr: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    addr = ipaddr.parse(ip);
  } catch {
    return true; // fail-closed: an unparseable address is never "public"
  }

  // `::ffff:a.b.c.d` and the deprecated `::a.b.c.d` carry the v4 address that decides
  // the verdict; the wrapper is a range of its own and never unicast, so the embedded
  // address has to be unwrapped and judged in its place.
  if (isIPv6(addr) && addr.isIPv4MappedAddress()) {
    return addr.toIPv4Address().range() !== PUBLIC_RANGE;
  }

  return addr.range() !== PUBLIC_RANGE;
}

/**
 * Local-development escape hatch, controlled by the `RVNXX_SSRF_ALLOW_PRIVATE`
 * environment variable. Off by default; only the local stack
 * (`integrations/docker-compose.dev.yml`) sets it, letting a developer point a
 * node at `localhost` or an internal service while testing. Production never
 * sets it, so the guard stays fully active there. Read fresh on every call so
 * tests can toggle it; the notice is logged at most once per process.
 */
let bypassNoticeLogged = false;
function guardRelaxedForLocalDev(): boolean {
  const raw = process.env['RVNXX_SSRF_ALLOW_PRIVATE'];
  const relaxed = raw != null && ['1', 'true', 'yes'].includes(raw.trim().toLowerCase());
  if (relaxed && !bypassNoticeLogged) {
    bypassNoticeLogged = true;
    console.warn(
      '[ssrf] RVNXX_SSRF_ALLOW_PRIVATE is set: allowing private/loopback fetch targets. Intended for local development only.',
    );
  }
  return relaxed;
}

function blockedError(host: string, address: string): NodeError {
  if (host === address) {
    // Literal-IP host: the caller already supplied this address, so echoing it
    // back to them leaks nothing.
    return new NodeError('BLOCKED_ADDRESS', `Blocked request to private or reserved address ${address}`, {
      status: 0,
    });
  }
  // A hostname that *resolved* to a private/reserved IP. Returning the resolved IP
  // to the (untrusted) caller would hand them an internal DNS→IP mapping — a
  // recon primitive — so keep the address in the server log only and surface just
  // the host (which the caller already knows) in the error.
  console.warn(`[ssrf] blocked request to ${host}: resolves to private/reserved address ${address}`);
  return new NodeError('BLOCKED_ADDRESS', `Blocked request to ${host}: resolves to a private or reserved address`, {
    status: 0,
  });
}

/**
 * The connect-time half of the guard.
 *
 * `assertPublicUrl` judges the addresses a hostname resolves to; the connection
 * is opened afterwards and resolves the name **again**, on its own. Between the
 * two answers an attacker's DNS can change its mind — the DNS-rebinding race —
 * and in this product the workflow author supplies both the URL and the DNS
 * behind it, so that precondition is met by default. Nothing about the check can
 * close it: the address it approved is simply not the address the socket uses.
 *
 * So the address the socket actually reached is judged too. undici publishes
 * every connection it opens on the `undici:client:connected` diagnostics
 * channel, synchronously, **before** the request is written to the socket; a
 * subscriber that destroys the socket there refuses the target without a single
 * request byte leaving the process. What remains is the TCP (and for `https:`
 * the TLS) handshake, which has already happened by then — see the gap recorded
 * in `specs/ssrf-guard.md`.
 *
 * Two properties keep this from being a process-wide policy, which it must not
 * be: the worker legitimately talks to internal services of its own, and this is
 * a library inside somebody else's process.
 *
 *   - **Only hosts a `safeFetch` call is currently reaching are judged.** A
 *     connection to a host nobody registered is left alone.
 *   - **The local-development relaxation applies here too**, or the dev stack's
 *     own `localhost` targets would pass the check and then lose their socket.
 */
const guardedHosts = new Map<string, number>();
let connectGuardInstalled = false;

/** Lowercase a hostname and strip the brackets `URL.hostname` puts around IPv6 literals. */
function normalizeHost(hostname: string): string {
  const host = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  return host.toLowerCase();
}

/** The shape this guard reads off an `undici:client:connected` message. */
interface ConnectedMessage {
  connectParams?: { hostname?: string };
  socket?: { remoteAddress?: string | undefined; destroy: (err?: Error) => void };
}

function connectBlockedError(host: string, address: string | undefined): NodeError {
  if (host === address) {
    // Literal-IP host: the caller typed this address, so echoing it leaks nothing.
    return new NodeError('BLOCKED_ADDRESS', `Blocked connection to private or reserved address ${address}`, {
      status: 0,
    });
  }
  // As in `blockedError`: the address a hostname resolved to is an internal
  // name→address mapping and stays in the server log (see AC-8).
  console.warn(`[ssrf] dropped connection to ${host}: connected to private/reserved address ${address ?? 'unknown'}`);
  return new NodeError(
    'BLOCKED_ADDRESS',
    `Blocked request to ${host}: the connection landed on a private or reserved address`,
    { status: 0 },
  );
}

function judgeConnection(message: unknown): void {
  const { connectParams, socket } = (message ?? {}) as ConnectedMessage;
  const hostname = connectParams?.hostname;
  if (hostname == null || socket == null) return;
  const host = normalizeHost(hostname);
  if (!guardedHosts.has(host)) return; // not a connection this package asked for
  if (guardRelaxedForLocalDev()) return;
  const peer = socket.remoteAddress;
  // An address we cannot read is treated like one we cannot parse: fail closed.
  if (peer != null && !isBlockedAddress(peer)) return;
  socket.destroy(connectBlockedError(host, peer));
}

/**
 * Put `url`'s host under the connect-time guard and return the release for it.
 * Ref-counted, so concurrent calls to one host do not release each other, and
 * keyed by host alone rather than by host and port: a second connection to the
 * same host while one is in flight is the same host either way.
 *
 * Deliberately **not** re-exported from `index.ts`. The guard is engaged by
 * `safeFetch`, which is the one sanctioned way out to the network (PO-185); an
 * exported handle would be a second one, and one that is easy to hold wrongly —
 * the judgement it enables lasts exactly as long as the registration does.
 */
export function guardConnectionsTo(url: URL): () => void {
  if (!connectGuardInstalled) {
    connectGuardInstalled = true;
    subscribe('undici:client:connected', judgeConnection);
  }
  const host = normalizeHost(url.hostname);
  guardedHosts.set(host, (guardedHosts.get(host) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (guardedHosts.get(host) ?? 1) - 1;
    if (count > 0) guardedHosts.set(host, count);
    else guardedHosts.delete(host);
  };
}

/**
 * The refusal this guard raised on a socket, as it comes back out of `fetch`.
 * undici reports a destroyed connection as `TypeError('fetch failed')` carrying
 * the destroy reason as its `cause`, so the caller sees a generic network
 * failure — which `safeFetch` would then *retry*. Unwrap it, so a blocked target
 * surfaces as the deterministic `BLOCKED_ADDRESS` it is.
 */
export function connectionRefusal(err: unknown): NodeError | undefined {
  const cause = (err as { cause?: unknown } | null | undefined)?.cause;
  if (cause instanceof NodeError && cause.code === 'BLOCKED_ADDRESS') return cause;
  return undefined;
}

/**
 * Run `lookup(host)` but stop waiting as soon as `signal` aborts, rejecting with
 * the signal's abort reason. libuv's `getaddrinfo` (which `dns.lookup` uses) is
 * not cancellable, so a hung or hostile DNS response cannot be interrupted at the
 * syscall level — the losing `lookup()` promise stays pending in the background
 * until the resolver eventually settles. This bounds only how long the *guard*
 * waits, which is what lets the caller enforce a timeout / honour `ctx.signal`.
 */
async function resolveHost(lookup: LookupFn, host: string, signal?: AbortSignal): Promise<LookupAddress[]> {
  if (!signal) return lookup(host);
  if (signal.aborted) throw signal.reason;
  return new Promise<LookupAddress[]>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    lookup(host).then(
      (addresses) => {
        signal.removeEventListener('abort', onAbort);
        resolve(addresses);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

/**
 * Assert that `url` is safe for a server-side fetch: an http(s) URL whose target
 * resolves only to public addresses. Rejects non-http(s) protocols, empty hosts
 * and `localhost`, checks literal-IP hosts directly, and otherwise resolves the
 * hostname (via the injectable `lookup`, defaulting to {@link ssrfResolver}) and
 * rejects if **any** resolved address is private/reserved. Throws
 * `NodeError('BLOCKED_ADDRESS', …, { status: 0 })` on rejection.
 *
 * This is the pre-flight half of the guard: the connection that follows resolves
 * the name again on its own, so `safeFetch` also judges the address the socket
 * actually reached (PO-184). A caller that opens its own request after
 * `assertPublicUrl` gets the check and not that second half.
 *
 * Pass `signal` (the per-request timeout/cancellation budget) so a hung or
 * hostile DNS resolve cannot block the guard past that budget — see
 * {@link resolveHost}.
 */
export async function assertPublicUrl(
  url: string | URL,
  opts: { lookup?: LookupFn; signal?: AbortSignal } = {},
): Promise<void> {
  const u = url instanceof URL ? url : new URL(url);

  // The protocol allowlist is a correctness invariant independent of the
  // private-range relaxation, so it is enforced even under the dev opt-out.
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new NodeError('BLOCKED_ADDRESS', `Blocked non-HTTP(S) URL protocol: ${u.protocol}`, { status: 0 });
  }

  // URL.hostname wraps IPv6 literals in brackets; strip them for parsing.
  const rawHost = u.hostname;
  const host = rawHost.startsWith('[') && rawHost.endsWith(']') ? rawHost.slice(1, -1) : rawHost;
  if (!host) throw new NodeError('BLOCKED_ADDRESS', 'Blocked URL with empty host', { status: 0 });

  // Local-development opt-out: relax only the private-range / loopback checks
  // (the protocol allowlist and empty-host check above still apply).
  if (guardRelaxedForLocalDev()) return;

  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost')) {
    throw new NodeError('BLOCKED_ADDRESS', `Blocked loopback host: ${host}`, { status: 0 });
  }

  // Literal IP: check directly, no DNS. (net.isIP returns 0 for non-IP hosts.)
  if (isIP(host) !== 0) {
    if (isBlockedAddress(host)) throw blockedError(host, host);
    return;
  }

  const lookup = opts.lookup ?? ssrfResolver.lookup;
  const addresses = await resolveHost(lookup, host, opts.signal);
  if (!addresses || addresses.length === 0) {
    throw new NodeError('BLOCKED_ADDRESS', `Could not resolve host: ${host}`, { status: 0 });
  }
  for (const a of addresses) {
    if (isBlockedAddress(a.address)) throw blockedError(host, a.address);
  }
}
