import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeCredentialType } from './credentialType.js';

// AC-1 — A single name becomes a list of one
test('wraps a single slug in an array [@spec:credential-type:AC-1]', () => {
  assert.deepEqual(normalizeCredentialType('revenexx:smtp'), ['revenexx:smtp']);
});

// AC-3 — Nothing declared becomes an empty list, not an absence
test('trims a single slug and drops it when blank [@spec:credential-type:AC-3]', () => {
  assert.deepEqual(normalizeCredentialType('  revenexx:smtp '), ['revenexx:smtp']);
  assert.deepEqual(normalizeCredentialType('   '), []);
});

// AC-2 — A list is kept as written, in order
test('passes an array through, preserving order [@spec:credential-type:AC-2]', () => {
  assert.deepEqual(normalizeCredentialType(['revenexx:pipedrive', 'revenexx:pipedrive-api-token']), [
    'revenexx:pipedrive',
    'revenexx:pipedrive-api-token',
  ]);
});

// AC-3 — Nothing declared becomes an empty list, not an absence
test('undefined, empty string, and empty array all yield [] [@spec:credential-type:AC-3]', () => {
  assert.deepEqual(normalizeCredentialType(undefined), []);
  assert.deepEqual(normalizeCredentialType(''), []);
  assert.deepEqual(normalizeCredentialType([]), []);
});

// AC-4 — Names are tidied, and a kind named twice is listed once
test('trims blank entries and deduplicates while preserving first-seen order [@spec:credential-type:AC-4]', () => {
  assert.deepEqual(normalizeCredentialType(['  revenexx:a ', '', 'revenexx:a', 'revenexx:b']), [
    'revenexx:a',
    'revenexx:b',
  ]);
});
