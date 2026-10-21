export class NodeError extends Error {
  readonly code: string;
  readonly meta?: Record<string, unknown>;

  constructor(code: string, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.name = 'NodeError';
    this.code = code;
    this.meta = meta;
  }
}

/**
 * The two codes a step fails with when the VPN route it was configured with
 * cannot be used (PO-825). Both are failures of the world around the run, not of
 * the data a record carried, and neither is retried by the platform.
 *
 * - `VPN_UNAVAILABLE` — the connection exists but is not `active`;
 *   message `VPN connection <name> is <status>`.
 * - `VPN_ROUTE_MISSING` — the connection or the route no longer exists;
 *   message `VPN route <connection>/<route> no longer exists`.
 */
export const VPN_UNAVAILABLE = 'VPN_UNAVAILABLE';
export const VPN_ROUTE_MISSING = 'VPN_ROUTE_MISSING';

/** Every VPN failure code, for a reader that has to recognise one. */
export const VPN_ERROR_CODES: readonly string[] = Object.freeze([VPN_UNAVAILABLE, VPN_ROUTE_MISSING]);
