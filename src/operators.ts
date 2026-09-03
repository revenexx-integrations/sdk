/**
 * The comparison vocabulary, in one place because it is read in three:
 * a node that compares two values (a condition, a filter), a settings condition
 * saying when a field applies (`IConfigField.showIf`), and the editor drawing
 * that field. An author who has met these words in one of the three must not
 * have to learn a second set for the others.
 *
 * The names are the vocabulary; what each one *means* is {@link evaluate}, and
 * the answer table in `operators.test.ts` is what a second implementation of it
 * — the editor, the platform's workflow validator — is checked against.
 */
export const OPERATORS = [
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'greaterThan',
  'greaterThanOrEqual',
  'lessThan',
  'lessThanOrEqual',
  'exists',
  'notExists',
  'isEmpty',
  'isNotEmpty',
] as const;

export type Operator = (typeof OPERATORS)[number];

/** The four that read whether a value is there rather than what it is. */
export const VALUELESS_OPERATORS: readonly Operator[] = ['exists', 'notExists', 'isEmpty', 'isNotEmpty'];

export function isOperator(value: unknown): value is Operator {
  return typeof value === 'string' && (OPERATORS as readonly string[]).includes(value);
}

/** Whether an operator reads a second value at all, or only the first. */
export function takesValue(op: Operator): boolean {
  return !VALUELESS_OPERATORS.includes(op);
}

/**
 * What an operator means.
 *
 * Equality is deliberately lenient across the string/number line: a `select`
 * carries `1` where a text box carries `'1'`, and an author means one thing by
 * both. A second implementation has to reproduce that — and has to be careful
 * with booleans, whose default stringification differs between languages.
 */
export function evaluate(left: unknown, op: Operator, right: unknown): boolean {
  switch (op) {
    case 'exists':
      return left !== undefined && left !== null;
    case 'notExists':
      return left === undefined || left === null;
    case 'isEmpty':
      return left === '' || left === null || left === undefined || (Array.isArray(left) && left.length === 0);
    case 'isNotEmpty':
      return !evaluate(left, 'isEmpty', right);
    case 'equals':
      return String(left) === String(right);
    case 'notEquals':
      return String(left) !== String(right);
    case 'contains':
      return typeof left === 'string' && left.includes(String(right));
    case 'notContains':
      return typeof left === 'string' && !left.includes(String(right));
    case 'startsWith':
      return typeof left === 'string' && left.startsWith(String(right));
    case 'endsWith':
      return typeof left === 'string' && left.endsWith(String(right));
    case 'greaterThan':
      return Number(left) > Number(right);
    case 'greaterThanOrEqual':
      return Number(left) >= Number(right);
    case 'lessThan':
      return Number(left) < Number(right);
    case 'lessThanOrEqual':
      return Number(left) <= Number(right);
    default: {
      const _exhaustive: never = op;
      void _exhaustive;
      return false;
    }
  }
}
