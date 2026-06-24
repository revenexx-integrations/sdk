import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeCredentialType } from './credentialType.js';

test('wraps a single slug in an array', () => {
  assert.deepEqual(normalizeCredentialType('revenexx:smtp'), ['revenexx:smtp']);
});

test('trims a single slug and drops it when blank', () => {
  assert.deepEqual(normalizeCredentialType('  revenexx:smtp '), ['revenexx:smtp']);
  assert.deepEqual(normalizeCredentialType('   '), []);
});

test('passes an array through, preserving order', () => {
  assert.deepEqual(normalizeCredentialType(['revenexx:pipedrive', 'revenexx:pipedrive-api-token']), [
    'revenexx:pipedrive',
    'revenexx:pipedrive-api-token',
  ]);
});

test('undefined, empty string, and empty array all yield []', () => {
  assert.deepEqual(normalizeCredentialType(undefined), []);
  assert.deepEqual(normalizeCredentialType(''), []);
  assert.deepEqual(normalizeCredentialType([]), []);
});

test('trims blank entries and deduplicates while preserving first-seen order', () => {
  assert.deepEqual(normalizeCredentialType(['  revenexx:a ', '', 'revenexx:a', 'revenexx:b']), [
    'revenexx:a',
    'revenexx:b',
  ]);
});
