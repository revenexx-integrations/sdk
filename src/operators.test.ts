import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OPERATORS, evaluate, isOperator } from './operators.js';

/**
 * The canonical answer table. Every row is one operator against one pair of
 * values, and together they are what a second implementation of this vocabulary
 * — the editor deciding whether to draw a setting, the platform deciding whether
 * to demand one — is checked against. A row changed here is a change to what an
 * operator means in the product, in every place that word appears.
 */
const ROWS: ReadonlyArray<{ left: unknown; op: string; right: unknown; expected: boolean }> = [
  // equality is lenient across the string/number line, because a select carries
  // `1` where a text box carries `'1'` and an author means one thing by both
  { left: 'hello-world', op: 'equals', right: 'hello-world', expected: true },
  { left: 'hello-world', op: 'equals', right: 'other', expected: false },
  { left: 1, op: 'equals', right: '1', expected: true },
  { left: 'hello-world', op: 'notEquals', right: 'other', expected: true },
  { left: 'hello-world', op: 'notEquals', right: 'hello-world', expected: false },

  { left: 'hello-world', op: 'contains', right: 'world', expected: true },
  { left: 'hello-world', op: 'contains', right: 'mars', expected: false },
  { left: 'hello-world', op: 'notContains', right: 'mars', expected: true },
  { left: 'hello-world', op: 'startsWith', right: 'hello', expected: true },
  { left: 'hello-world', op: 'startsWith', right: 'world', expected: false },
  { left: 'hello-world', op: 'endsWith', right: 'world', expected: true },

  { left: 5, op: 'greaterThan', right: 1, expected: true },
  { left: 1, op: 'greaterThan', right: 5, expected: false },
  { left: 5, op: 'greaterThanOrEqual', right: 5, expected: true },
  { left: 1, op: 'lessThan', right: 5, expected: true },
  { left: 5, op: 'lessThanOrEqual', right: 5, expected: true },

  // the four that read a value's presence rather than its content, and the
  // reason a condition may leave `value` out
  { left: 'anything', op: 'exists', right: undefined, expected: true },
  { left: undefined, op: 'exists', right: undefined, expected: false },
  { left: null, op: 'exists', right: undefined, expected: false },
  { left: '', op: 'exists', right: undefined, expected: true },
  { left: undefined, op: 'notExists', right: undefined, expected: true },

  { left: '', op: 'isEmpty', right: undefined, expected: true },
  { left: undefined, op: 'isEmpty', right: undefined, expected: true },
  { left: null, op: 'isEmpty', right: undefined, expected: true },
  { left: [], op: 'isEmpty', right: undefined, expected: true },
  { left: 'x', op: 'isEmpty', right: undefined, expected: false },
  { left: 'x', op: 'isNotEmpty', right: undefined, expected: true },
  { left: '', op: 'isNotEmpty', right: undefined, expected: false },

  // The rows that discriminate a *missing* value from a text one, which is the
  // state a half-filled form is in. Every text operator answers false against
  // one, `notContains` included — it is not the negation of `contains`, it is
  // "is text and lacks the fragment", and a missing value is not text.
  //
  // These are the rows a second implementation gets wrong: a language whose
  // sentinel for absence happens to BE a string passes the `typeof` guard here
  // and answers true. PO-410 shipped with exactly that bug in the platform,
  // invisible because no row here exercised it.
  { left: undefined, op: 'contains', right: 'draft', expected: false },
  { left: undefined, op: 'notContains', right: 'draft', expected: false },
  { left: undefined, op: 'startsWith', right: 'draft', expected: false },
  { left: undefined, op: 'endsWith', right: 'draft', expected: false },
  { left: null, op: 'notContains', right: 'draft', expected: false },

  // The empty needle: every text operator answers true for a real string and
  // false for anything that is not one.
  { left: 'hello-world', op: 'contains', right: '', expected: true },
  { left: undefined, op: 'contains', right: '', expected: false },
  { left: undefined, op: 'startsWith', right: '', expected: false },
  { left: undefined, op: 'endsWith', right: '', expected: false },
  { left: 5, op: 'contains', right: '5', expected: false },
  { left: 5, op: 'notContains', right: '5', expected: false },

  // Shapes, which a saved workflow really does carry: a list renders as its
  // entries joined, and an absent entry renders as nothing rather than as the
  // word; an object renders as neither.
  { left: [null], op: 'equals', right: '', expected: true },
  { left: ['a', 'b'], op: 'equals', right: 'a,b', expected: true },
  { left: { a: 1 }, op: 'equals', right: '1', expected: false },
  { left: { a: 1 }, op: 'equals', right: '[object Object]', expected: true },

  // Booleans and numbers, whose text form differs between languages
  { left: true, op: 'equals', right: 'true', expected: true },
  { left: false, op: 'equals', right: 'false', expected: true },
  { left: undefined, op: 'equals', right: 'undefined', expected: true },
  { left: null, op: 'equals', right: 'null', expected: true },
  { left: 1.0, op: 'equals', right: '1', expected: true },
  { left: 0.1 + 0.2, op: 'equals', right: '0.3', expected: false },
  { left: 0.1 + 0.2, op: 'equals', right: '0.30000000000000004', expected: true },

  // Ordering against text that is not a number: NaN, and every comparison
  // against NaN is false — both directions, so neither reads as zero
  { left: 'abc', op: 'greaterThan', right: 1, expected: false },
  { left: 'abc', op: 'lessThan', right: 1, expected: false },
  { left: '', op: 'greaterThanOrEqual', right: 0, expected: true },
  { left: true, op: 'greaterThan', right: 0, expected: true },
];

test('every operator answers as the table says [@spec:setting-conditions:AC-3]', () => {
  for (const row of ROWS) {
    assert.ok(isOperator(row.op), `${row.op} is not an operator`);
    const actual = evaluate(row.left, row.op as never, row.right);
    assert.equal(
      actual,
      row.expected,
      `${JSON.stringify(row.left)} ${row.op} ${JSON.stringify(row.right)} → expected ${row.expected}, got ${actual}`,
    );
  }
});

test('the table covers every operator in the vocabulary [@spec:setting-conditions:AC-3]', () => {
  const covered = new Set(ROWS.map(row => row.op));
  const uncovered = OPERATORS.filter(op => !covered.has(op));

  // An operator added to the list without a row would be a word an author can
  // choose whose meaning nothing states.
  assert.deepEqual(uncovered, [], `operators with no row in the answer table: ${uncovered.join(', ')}`);
});

test('a word that is not in the vocabulary is not an operator [@spec:setting-conditions:AC-3]', () => {
  assert.equal(isOperator('matches'), false);
  assert.equal(isOperator(''), false);
  assert.equal(isOperator(undefined), false);
});
