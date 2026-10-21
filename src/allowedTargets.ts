import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

/**
 * The per-run allow-list of the SSRF guard (PO-828): the exact `ip:port` pairs a
 * run may reach although the address is private — its own tenant's VPN routes,
 * served by the relay at a private overlay address (an RFC 1918 or IPv6
 * unique-local one — no other address may be listed).
 *
 * **The global symbol is the contract, not this module.** Every node bundle carries
 * its own copy of this package, so a module-level setter would reach only the copy
 * that happened to be imported by the host. The trusted host instead defines one
 * property on `globalThis`, before any node bundle is imported, and every copy reads
 * that same property:
 *
 * ```ts
 * Object.defineProperty(globalThis, Symbol.for('revenexx.ssrf.allowedTargets'), {
 *   value: Object.freeze([...targets]),
 *   writable: false, configurable: false, enumerable: false,
 * });
 * ```
 *
 * The host may do that itself (the runtimes do, without depending on this package)
 * or call {@link installAllowedTargets}, which does exactly that.
 *
 * A property that is not shaped that way is read as no list at all. Non-writable and
 * non-configurable is what makes the list impossible to widen after the host set it;
 * a property that lacks either was not set by a host following the contract, and a
 * guard that honoured it would let whoever set it decide what is private.
 */
export const ALLOWED_TARGETS_SYMBOL = Symbol.for('revenexx.ssrf.allowedTargets');

const EMPTY: readonly string[] = Object.freeze([]);

const V4_ENTRY = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/;
const V6_ENTRY = /^\[([0-9A-Fa-f:.]+)\]:(\d{1,5})$/;

/**
 * One address in the one written form both sides compare in: IPv4 dotted, IPv6
 * compressed and lower-case, and an IPv4-mapped IPv6 address as the IPv4 address it
 * carries — which is how a dual-stack socket may report a peer it reached over v4.
 * `undefined` for anything that is not a well-formed literal.
 */
function canonicalAddress(ip: string): string | undefined {
  const bare = ip.startsWith('[') && ip.endsWith(']') ? ip.slice(1, -1) : ip;
  if (isIP(bare) === 0) return undefined;
  try {
    return ipaddr.process(bare).toString();
  } catch {
    return undefined;
  }
}

function validPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65_535;
}

/**
 * The ranges a VPN target may sit in: an RFC 1918 IPv4 address or an IPv6
 * unique-local one. The relay is reached at a private overlay address, and the
 * overlay's range is the deployment's to choose, so the rule is the class of
 * address and not one network. What it keeps out is everything a wrong list must
 * never open — loopback, link-local with the metadata service in it, unspecified,
 * multicast, broadcast, carrier-grade NAT, reserved and public space.
 */
const TARGET_RANGES = new Set(['private', 'uniqueLocal']);

/**
 * Test-only: `RVNXX_SSRF_TARGETS_ALLOW_LOOPBACK` also accepts `127.0.0.0/8` and `::1`
 * entries, because a test can only listen on loopback. Read on every call. No
 * production process sets it, and the worker's sandbox passes a node only `PATH`
 * and `RVNXX_SSRF_ALLOW_PRIVATE`, so node code cannot see or set it for its host.
 */
function loopbackTargetsAllowed(): boolean {
  const raw = process.env['RVNXX_SSRF_TARGETS_ALLOW_LOOPBACK'];
  return raw != null && ['1', 'true', 'yes'].includes(raw.trim().toLowerCase());
}

/**
 * `"<ip>:<port>"` or `"[v6]:<port>"` as its canonical key, or `undefined` when it is
 * malformed or names an address outside {@link TARGET_RANGES}.
 */
function parseTarget(entry: unknown, allowLoopback: boolean): string | undefined {
  if (typeof entry !== 'string') return undefined;
  const v4 = V4_ENTRY.exec(entry);
  const m = v4 ?? V6_ENTRY.exec(entry);
  if (!m) return undefined;
  const host = m[1] as string;
  const port = Number(m[2]);
  if (v4 && !ipaddr.IPv4.isValidFourPartDecimal(host)) return undefined;
  if (!validPort(port)) return undefined;
  const address = canonicalAddress(host);
  if (address === undefined) return undefined;
  const range = ipaddr.parse(address).range();
  if (!TARGET_RANGES.has(range) && !(allowLoopback && range === 'loopback')) return undefined;
  return `${address}:${port}`;
}

/** Test seam: how many times a list has been validated. Not re-exported from the package. */
export const allowListStats = { validations: 0 };

/**
 * The validated keys of a list, or `null` when the list is malformed — kept per
 * frozen array, so a list is validated once and not on every address a call judges.
 * The loopback switch is part of the key, since it changes the verdict.
 */
const keysByList = new WeakMap<readonly unknown[], Map<boolean, ReadonlySet<string> | null>>();

function keysOf(list: readonly unknown[]): ReadonlySet<string> | null {
  const allowLoopback = loopbackTargetsAllowed();
  let byMode = keysByList.get(list);
  if (byMode === undefined) {
    byMode = new Map();
    keysByList.set(list, byMode);
  }
  const cached = byMode.get(allowLoopback);
  if (cached !== undefined) return cached;
  allowListStats.validations++;
  const keys = new Set<string>();
  let result: ReadonlySet<string> | null = keys;
  for (const entry of list) {
    const key = parseTarget(entry, allowLoopback);
    if (key === undefined) {
      result = null;
      break;
    }
    keys.add(key);
  }
  byMode.set(allowLoopback, result);
  return result;
}

/** The frozen array on `holder` and its keys, or `null` when there is none or it is malformed. */
function installedList(holder: object): { list: readonly string[]; keys: ReadonlySet<string> } | null {
  const descriptor = Object.getOwnPropertyDescriptor(holder, ALLOWED_TARGETS_SYMBOL);
  if (descriptor === undefined || !('value' in descriptor)) return null;
  if (descriptor.writable || descriptor.configurable) return null;
  const value: unknown = descriptor.value;
  if (!Array.isArray(value) || !Object.isFrozen(value)) return null;
  const keys = keysOf(value);
  return keys === null ? null : { list: value as readonly string[], keys };
}

/**
 * Read the list off `holder` — `globalThis` in production, a fresh object in the
 * tests that need a shape the one-shot global cannot be given twice. Anything but a
 * frozen array of valid entries on a non-writable, non-configurable data property
 * reads as the empty list: fail closed, never partly.
 */
export function readAllowedTargets(holder: object): readonly string[] {
  return installedList(holder)?.list ?? EMPTY;
}

/** {@link isAllowedTarget} against the list on `holder`. */
export function isAllowedTargetOn(holder: object, ip: string, port: number): boolean {
  const installed = installedList(holder);
  if (installed === null || !validPort(port)) return false;
  const address = canonicalAddress(ip);
  return address !== undefined && installed.keys.has(`${address}:${port}`);
}

/** {@link installAllowedTargets} onto `holder`. */
export function installAllowedTargetsOn(holder: object, targets: readonly string[]): void {
  if (Object.getOwnPropertyDescriptor(holder, ALLOWED_TARGETS_SYMBOL) !== undefined) {
    throw new Error('The SSRF allow-list is already installed, and is installed once per process');
  }
  if (!Array.isArray(targets)) throw new TypeError('The SSRF allow-list must be an array of "<ip>:<port>" strings');
  for (const entry of targets) {
    if (parseTarget(entry, loopbackTargetsAllowed()) === undefined) {
      throw new TypeError(
        `Not an allowed target: ${JSON.stringify(entry)} (expected "<ip>:<port>" or "[v6]:<port>" at an RFC 1918 or unique-local address)`,
      );
    }
  }
  Object.defineProperty(holder, ALLOWED_TARGETS_SYMBOL, {
    value: Object.freeze([...targets]),
    writable: false,
    configurable: false,
    enumerable: false,
  });
}

/**
 * Install the per-run allow-list on `globalThis`. For the trusted host, before any
 * node bundle is imported; one-shot — a second call throws, as does an entry that is
 * not `"<ip>:<port>"` (IPv4 dotted) or `"[v6]:<port>"`, or whose address is not an
 * RFC 1918 or IPv6 unique-local one.
 *
 * Install it even when the list is empty. A process that never installs one leaves
 * the property free for the first code that runs to define it — node code included.
 *
 * Promised behaviour: specs/ssrf-guard.md (AC-26 to AC-31).
 */
export function installAllowedTargets(targets: readonly string[]): void {
  installAllowedTargetsOn(globalThis, targets);
}

/**
 * The per-run allow-list as the host installed it, or an empty list when none is
 * installed or the property is malformed (see {@link ALLOWED_TARGETS_SYMBOL}).
 */
export function allowedTargets(): readonly string[] {
  return readAllowedTargets(globalThis);
}

/**
 * Whether the run may reach `ip` on `port` although the address is private: `true`
 * only when exactly that pair is on the allow-list. The port is part of the target —
 * `10.31.0.7:8080` on the list does not allow `10.31.0.7:22`. For a caller that opens
 * its own socket; `safeFetch` and `assertPublicUrl` already consult it.
 */
export function isAllowedTarget(ip: string, port: number): boolean {
  return isAllowedTargetOn(globalThis, ip, port);
}
