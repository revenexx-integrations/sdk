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
  const detail = host === address ? address : `${address} (host: ${host})`;
  return new NodeError('BLOCKED_ADDRESS', `Blocked request to private or reserved address ${detail}`, { status: 0 });
}

/**
 * Assert that `url` is safe for a server-side fetch: an http(s) URL whose target
 * resolves only to public addresses. Rejects non-http(s) protocols, empty hosts
 * and `localhost`, checks literal-IP hosts directly, and otherwise resolves the
 * hostname (via the injectable `lookup`, defaulting to {@link ssrfResolver}) and
 * rejects if **any** resolved address is private/reserved. Throws
 * `NodeError('BLOCKED_ADDRESS', …, { status: 0 })` on rejection.
 *
 * Best-effort by design: Node re-resolves the hostname when it actually connects,
 * so a DNS-rebinding race (TOCTOU) remains. See the SDK README.
 */
export async function assertPublicUrl(url: string | URL, opts: { lookup?: LookupFn } = {}): Promise<void> {
  // Local-development opt-out: skip the whole check when explicitly enabled.
  if (guardRelaxedForLocalDev()) return;

  const u = url instanceof URL ? url : new URL(url);

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new NodeError('BLOCKED_ADDRESS', `Blocked non-HTTP(S) URL protocol: ${u.protocol}`, { status: 0 });
  }

  // URL.hostname wraps IPv6 literals in brackets; strip them for parsing.
  const rawHost = u.hostname;
  const host = rawHost.startsWith('[') && rawHost.endsWith(']') ? rawHost.slice(1, -1) : rawHost;
  if (!host) throw new NodeError('BLOCKED_ADDRESS', 'Blocked URL with empty host', { status: 0 });

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
  const addresses = await lookup(host);
  if (!addresses || addresses.length === 0) {
    throw new NodeError('BLOCKED_ADDRESS', `Could not resolve host: ${host}`, { status: 0 });
  }
  for (const a of addresses) {
    if (isBlockedAddress(a.address)) throw blockedError(host, a.address);
  }
}
