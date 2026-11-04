import type { INodeContext } from './types.js';

/**
 * Whether the setting at `path` held a placeholder that found nothing in this
 * record — so it arrives without a value, as one nobody configured would.
 *
 * The answer a list node needs before it drops an empty filter: an author who
 * set no filter means "everything", an author whose filter this record emptied
 * does not. Route the second to the error port; never list without it.
 *
 * ```ts
 * if (wasUnresolved(ctx, 'customer_id')) {
 *   return errorResult('error', new NodeError('No customer ID in this record', 'MISSING_FILTER'));
 * }
 * ```
 *
 * `path` is written as the setting is reached: `customer_id`, `filters.customer`,
 * `lines[2].sku`. `false` on an engine that does not report it, which is what
 * every node saw before it could ask.
 */
export function wasUnresolved(ctx: Pick<INodeContext, 'unresolvedSettings'>, path: string): boolean {
  return ctx.unresolvedSettings?.has(path) ?? false;
}
