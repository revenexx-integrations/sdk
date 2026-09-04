import { evaluate } from './operators.js';
import type { IShowIfCondition } from './types.js';

/**
 * Whether a setting applies, given what the author has filled in so far.
 *
 * A setting with no condition always applies — which is what makes `showIf`
 * additive: a node that says nothing gets the behaviour it has today, and an
 * editor that does not know the key draws every field as before.
 *
 * The value the condition reads is taken from the config as it stands mid-edit,
 * so it is routinely `undefined`: the moment a node is dropped on the canvas
 * nothing is filled in. That is why `equals` against a missing value is `false`
 * rather than an error — the setting does not apply *yet*.
 */
export function settingApplies(field: { showIf?: IShowIfCondition }, config: Record<string, unknown>): boolean {
  const condition = field.showIf;
  if (!condition) return true;

  return evaluate(config[condition.key], condition.op, condition.value);
}
