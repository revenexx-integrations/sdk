import { subscribe } from 'node:diagnostics_channel';
import { isIP } from 'node:net';
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

/** Parse a canonical dotted-quad IPv4 literal into its four octets, or `null`. */
function parseIpv4(input: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(input);
  if (!m) return null;
  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (octets.some((n) => n > 255)) return null;
  return octets as [number, number, number, number];
}

/**
 * Expand an IPv6 literal (incl. `::` compression and an embedded IPv4 tail like
 * `::ffff:127.0.0.1`) into its eight 16-bit hextets, or `null` if unparseable.
 */
function expandIpv6(input: string): number[] | null {
  // Drop any zone id (`fe80::1%eth0`).
  let s = input;
  const zone = s.indexOf('%');
  if (zone !== -1) s = s.slice(0, zone);

  // Rewrite an embedded IPv4 tail (`::ffff:1.2.3.4`, `::1.2.3.4`,
  // `2001:db8::1.2.3.4`, …) as two hex groups, so the `::`-compression and
  // group-split logic below handles every embedded form uniformly. Keeping the
  // separating colon in place (`slice(0, idx + 1)`) preserves a preceding `::`.
  if (s.includes('.')) {
    const idx = s.lastIndexOf(':');
    if (idx === -1) return null;
    const v4 = parseIpv4(s.slice(idx + 1));
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    s = `${s.slice(0, idx + 1)}${hi}:${lo}`;
  }

  const halves = s.split('::');
  if (halves.length > 2) return null;

  const parseGroups = (part: string): number[] =>
    part === '' ? [] : part.split(':').map((h) => (/^[0-9a-fA-F]{1,4}$/.test(h) ? parseInt(h, 16) : Number.NaN));

  const head = parseGroups(halves[0] ?? '');
  const back = halves.length === 2 ? parseGroups(halves[1] ?? '') : null;

  const declared = [...head, ...(back ?? [])];
  if (declared.some((h) => !Number.isInteger(h) || h < 0 || h > 0xffff)) return null;

  let hextets: number[];
  if (back === null) {
    hextets = head;
  } else {
    const zeros = 8 - (head.length + back.length);
    if (zeros < 1) return null; // `::` must stand in for at least one zero group
    hextets = [...head, ...new Array<number>(zeros).fill(0), ...back];
  }
  return hextets.length === 8 ? hextets : null;
}

function isBlockedIpv4(o: [number, number, number, number]): boolean {
  const [a, b] = o;
  return (
    a === 0 || // 0.0.0.0/8 "this network" (incl. 0.0.0.0)
    a === 127 || // 127.0.0.0/8 loopback
    a === 10 || // 10.0.0.0/8 private
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 private
    (a === 192 && b === 168) || // 192.168.0.0/16 private
    (a === 169 && b === 254) // 169.254.0.0/16 link-local (incl. metadata 169.254.169.254)
  );
}

/**
 * Return `true` when `ip` (a literal IPv4/IPv6 address) points at a private,
 * loopback, link-local or otherwise non-public target that a server-side fetch
 * must never be steered to. IPv4-mapped/-compatible IPv6 addresses are unwrapped
 * and re-checked against the IPv4 rules. An address we cannot parse is treated as
 * blocked (fail-closed).
 */
export function isBlockedAddress(ip: string): boolean {
  const v4 = parseIpv4(ip);
  if (v4) return isBlockedIpv4(v4);

  const h = expandIpv6(ip);
  if (!h) return true; // fail-closed: an unparseable address is never "public"

  // ::  (unspecified) and ::1 (loopback)
  if (h.every((x) => x === 0)) return true;
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true;

  // IPv4-mapped (::ffff:a.b.c.d) and deprecated IPv4-compatible (::a.b.c.d):
  // unwrap the embedded v4 and apply the v4 rules.
  const embedsV4 =
    h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0 && (h[5] === 0xffff || h[5] === 0);
  if (embedsV4) {
    return isBlockedIpv4([h[6]! >> 8, h[6]! & 0xff, h[7]! >> 8, h[7]! & 0xff]);
  }

  // fc00::/7 unique-local, fe80::/10 link-local
  if ((h[0]! & 0xfe00) === 0xfc00) return true;
  if ((h[0]! & 0xffc0) === 0xfe80) return true;

  return false;
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
 *   - **Only targets a `safeFetch` call is currently reaching are judged.** A
 *     connection to a host:port nobody registered is left alone. This is scoping,
 *     not attribution: nothing in the message says which caller opened the socket,
 *     so a connection *somebody else* opens to the very target a call is reaching
 *     is judged as ours — recorded as a gap in `specs/ssrf-guard.md`.
 *   - **The local-development relaxation applies here too**, or the dev stack's
 *     own `localhost` targets would pass the check and then lose their socket.
 */
const guardedTargets = new Map<string, number>();
let connectGuardInstalled = false;

/** Lowercase a hostname and strip the brackets `URL.hostname` puts around IPv6 literals. */
function normalizeHost(hostname: string): string {
  const host = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  return host.toLowerCase();
}

/**
 * The key a registration and a connection meet under: host **and** port, because
 * a target is a host and a port and nothing narrower is available to scope by. An
 * absent port means the scheme's default on both sides — `URL.port` is `''` for a
 * default port and undici passes that same `''` through as `connectParams.port`,
 * so the two agree today; normalising both anyway keeps them agreeing if a future
 * undici fills the default in.
 */
function targetKey(hostname: string, port: string, protocol: string): string {
  const host = normalizeHost(hostname);
  const effective = port === '' ? (protocol === 'https:' ? '443' : '80') : port;
  return `${host}:${effective}`;
}

/** The shape this guard reads off an `undici:client:connected` message. */
interface ConnectedMessage {
  connectParams?: { hostname?: string; port?: string; protocol?: string };
  socket?: { remoteAddress?: string | undefined; destroy: (err?: Error) => void };
}

/**
 * A `connected` message this guard cannot read is a message it cannot attribute:
 * without the target there is no way to tell a connection a `safeFetch` call is
 * making from one the host process made, and refusing both is the process-wide
 * policy this must not become. So the socket is let through — the one place here
 * that fails open, and the reason it says so out loud. If undici ever renames
 * these fields the connect-time half goes quiet, and this line is what tells the
 * operator that it did. `specs/ssrf-guard.md` AC-17 is the other half of that
 * canary: it reproduces the race end to end, and CI runs it on every Node major
 * `engines` claims.
 */
let unreadableMessageLogged = false;
function reportUnreadableMessage(): void {
  if (unreadableMessageLogged) return;
  unreadableMessageLogged = true;
  console.warn(
    '[ssrf] undici:client:connected published a message this guard cannot read: the connect-time half of the SSRF guard is not judging connections. The pre-flight check still applies.',
  );
}

function connectBlockedError(host: string, address: string | undefined): NodeError {
  if (address == null) {
    // Fail-closed on an unreadable peer, which is not the same finding as a private
    // one and must not be reported as though it were. Reachable when the host
    // process installs its own dispatcher: a connection over a Unix socket has no
    // `remoteAddress` at all. See the gap in `specs/ssrf-guard.md`.
    console.warn(`[ssrf] dropped connection to ${host}: the address it landed on could not be read`);
    return new NodeError(
      'BLOCKED_ADDRESS',
      `Blocked request to ${host}: the address the connection landed on could not be read`,
      { status: 0 },
    );
  }
  if (host === address) {
    // Literal-IP host: the caller typed this address, so echoing it leaks nothing.
    return new NodeError('BLOCKED_ADDRESS', `Blocked connection to private or reserved address ${address}`, {
      status: 0,
    });
  }
  // As in `blockedError`: the address a hostname resolved to is an internal
  // name→address mapping and stays in the server log (see AC-8).
  console.warn(`[ssrf] dropped connection to ${host}: connected to private/reserved address ${address}`);
  return new NodeError(
    'BLOCKED_ADDRESS',
    `Blocked request to ${host}: the connection landed on a private or reserved address`,
    { status: 0 },
  );
}

function judgeConnection(message: unknown): void {
  const { connectParams, socket } = (message ?? {}) as ConnectedMessage;
  const hostname = connectParams?.hostname;
  const port = connectParams?.port;
  const protocol = connectParams?.protocol;
  // Every field is read before anything is judged: a message missing one of them
  // is a message whose target we do not know — see `reportUnreadableMessage`.
  if (hostname == null || port == null || protocol == null || typeof socket?.destroy !== 'function') {
    reportUnreadableMessage();
    return;
  }
  if (!guardedTargets.has(targetKey(hostname, port, protocol))) return; // not a target we are reaching
  if (guardRelaxedForLocalDev()) return;
  const peer = socket.remoteAddress;
  // An address we cannot read is treated like one we cannot parse: fail closed.
  if (peer != null && !isBlockedAddress(peer)) return;
  socket.destroy(connectBlockedError(normalizeHost(hostname), peer));
}

/**
 * Put `url`'s host **and port** under the connect-time guard and return the
 * release for it. Ref-counted, so concurrent calls to one target do not release
 * each other. Host and port together are as narrow as the scope can be made: the
 * `connected` message carries the target and not the caller, so this says which
 * connections are *candidates* for judgement, never which one is ours.
 *
 * The window is the call, not the connection. A connect that completes after the
 * release — the fetch it belonged to having already timed out or aborted — finds
 * its target unregistered and is not judged; see the gap in
 * `specs/ssrf-guard.md`.
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
  const key = targetKey(url.hostname, url.port, url.protocol);
  guardedTargets.set(key, (guardedTargets.get(key) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (guardedTargets.get(key) ?? 1) - 1;
    if (count > 0) guardedTargets.set(key, count);
    else guardedTargets.delete(key);
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
