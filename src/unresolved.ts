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
 *   return errorResult({ code: 'MISSING_FILTER', message: 'This record has no customer ID to filter by', status: 0 });
 * }
 * ```
 *
 * `path` is written as the setting is reached: `customer_id`, `filters.customer`,
 * `lines[2].sku`. A setting inside a named one counts as named: when `filters`
 * found nothing, so did `filters.customer`. `false` on an engine that does not report it, which is what
 * every node saw before it could ask.
 */
export function wasUnresolved(ctx: Pick<INodeContext, 'unresolvedSettings'>, path: string): boolean {
  const named = ctx.unresolvedSettings;
  if (!named) return false;
  if (named.has(path)) return true;
  // A setting inside one the engine names went with it: a `filters` that was one
  // placeholder and found nothing leaves `filters.customer` empty too.
  for (const outer of named) {
    if (path.startsWith(`${outer}.`) || path.startsWith(`${outer}[`)) return true;
  }
  return false;
}
