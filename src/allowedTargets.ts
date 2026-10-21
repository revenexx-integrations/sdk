import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

/**
 * The per-run allow-list of the SSRF guard (PO-828): the exact `ip:port` pairs a
 * run may reach although the address is private — its own tenant's VPN routes,
 * served by the relay at `10.31.0.0/16`.
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

/** `"<ip>:<port>"` or `"[v6]:<port>"` as its canonical key, or `undefined` when malformed. */
function parseTarget(entry: unknown): string | undefined {
  if (typeof entry !== 'string') return undefined;
  const v4 = V4_ENTRY.exec(entry);
  const m = v4 ?? V6_ENTRY.exec(entry);
  if (!m) return undefined;
  const host = m[1] as string;
  const port = Number(m[2]);
  if (v4 && !ipaddr.IPv4.isValidFourPartDecimal(host)) return undefined;
  if (!validPort(port)) return undefined;
  const address = canonicalAddress(host);
  return address === undefined ? undefined : `${address}:${port}`;
}

/**
 * Read the list off `holder` — `globalThis` in production, a fresh object in the
 * tests that need a shape the one-shot global cannot be given twice. Anything but a
 * frozen array of well-formed entries on a non-writable, non-configurable data
 * property is malformed and reads as the empty list: fail closed, never partly.
 */
export function readAllowedTargets(holder: object): readonly string[] {
  const descriptor = Object.getOwnPropertyDescriptor(holder, ALLOWED_TARGETS_SYMBOL);
  if (descriptor === undefined || !('value' in descriptor)) return EMPTY;
  if (descriptor.writable || descriptor.configurable) return EMPTY;
  const value: unknown = descriptor.value;
  if (!Array.isArray(value) || !Object.isFrozen(value)) return EMPTY;
  for (const entry of value) if (parseTarget(entry) === undefined) return EMPTY;
  return value as readonly string[];
}

/** The parsed form of a list, kept per list so a call does not re-parse it. */
const keysByList = new WeakMap<readonly string[], ReadonlySet<string>>();

function keysOf(list: readonly string[]): ReadonlySet<string> {
  let keys = keysByList.get(list);
  if (keys === undefined) {
    keys = new Set(list.map((entry) => parseTarget(entry) as string));
    keysByList.set(list, keys);
  }
  return keys;
}

/** {@link isAllowedTarget} against the list on `holder`. */
export function isAllowedTargetOn(holder: object, ip: string, port: number): boolean {
  const list = readAllowedTargets(holder);
  if (list.length === 0 || !validPort(port)) return false;
  const address = canonicalAddress(ip);
  return address !== undefined && keysOf(list).has(`${address}:${port}`);
}

/** {@link installAllowedTargets} onto `holder`. */
export function installAllowedTargetsOn(holder: object, targets: readonly string[]): void {
  if (Object.getOwnPropertyDescriptor(holder, ALLOWED_TARGETS_SYMBOL) !== undefined) {
    throw new Error('The SSRF allow-list is already installed, and is installed once per process');
  }
  if (!Array.isArray(targets)) throw new TypeError('The SSRF allow-list must be an array of "<ip>:<port>" strings');
  for (const entry of targets) {
    if (parseTarget(entry) === undefined) {
      throw new TypeError(`Not an allowed target: ${JSON.stringify(entry)} (expected "<ip>:<port>" or "[v6]:<port>")`);
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
 * not `"<ip>:<port>"` (IPv4 dotted) or `"[v6]:<port>"`.
 *
 * Install it even when the list is empty. A process that never installs one leaves
 * the property free for the first code that runs to define it — node code included.
 *
 * Promised behaviour: specs/ssrf-guard.md (AC-26 to AC-30).
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
