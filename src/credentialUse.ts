/**
 * What a service answered to a request, handed to whoever runs the node (IN-146),
 * so a credential's badge can say whether the credential works now and not only
 * whether a test once passed.
 *
 * **The global symbol is the contract, not this module.** Every node bundle carries
 * its own copy of this package, so a module-level setter would reach only one copy.
 * The host that runs the node defines one function on `globalThis` before any bundle
 * is imported, and {@link safeFetch} in every copy calls that same function:
 *
 * ```ts
 * Object.defineProperty(globalThis, Symbol.for('revenexx.credentials.useReporter'), {
 *   value: (use) => { … },
 *   writable: false, configurable: false, enumerable: false,
 * });
 * ```
 *
 * This package does not know which credential a request carries: `ctx.credentials.get`
 * is the host's, and so is the knowledge of which value came from which credential.
 * So every answer is reported, and the host decides whether the request carried one
 * of the credentials it handed out. Without a reporter — in a test, in the devkit —
 * nothing happens.
 *
 * @see safeFetch
 */
export const CREDENTIAL_USE_REPORTER_SYMBOL = Symbol.for('revenexx.credentials.useReporter');

/**
 * One request that got an answer: where it went, what it carried, and the status it
 * was answered with. The last hop only — the one whose answer the caller receives —
 * with the headers that hop actually sent, so a header a redirect dropped is not
 * reported as carried. The body of the answer is the caller's and is never read.
 */
export interface CredentialUse {
  /** The address of the hop that was answered, query included. */
  url: string;
  /** The request headers that hop sent, as name/value pairs. */
  headers: Array<[string, string]>;
  /** The status of the answer. */
  status: number;
}

/** A function the host installs under {@link CREDENTIAL_USE_REPORTER_SYMBOL}. */
export type CredentialUseReporter = (use: CredentialUse) => void;

function headerPairs(headers: RequestInit['headers']): Array<[string, string]> {
  if (headers === undefined || headers === null) return [];
  return [...new Headers(headers as HeadersInit).entries()];
}

/**
 * Hand one answered request to the host's reporter, if there is one. Never throws
 * and never waits: the report is the host's business, and a reporter that fails or
 * is slow must not change what the caller's request does.
 */
export function reportCredentialUse(url: string | URL, headers: RequestInit['headers'], status: number): void {
  const reporter = (globalThis as Record<symbol, unknown>)[CREDENTIAL_USE_REPORTER_SYMBOL];
  if (typeof reporter !== 'function') return;
  try {
    (reporter as CredentialUseReporter)({ url: String(url), headers: headerPairs(headers), status });
  } catch {
    // The host's fault, never the request's.
  }
}
