import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLocalized } from './localized.js';

test('returns a plain string trimmed', () => {
  assert.equal(normalizeLocalized('  Hello  '), 'Hello');
});

test('prefers the fallback language from a localized map', () => {
  assert.equal(normalizeLocalized({ en: 'Hello', de: 'Hallo' }), 'Hello');
  assert.equal(normalizeLocalized({ en: 'Hello', de: 'Hallo' }, 'de'), 'Hallo');
});

test('falls back to the first non-empty value when the preferred lang is missing', () => {
  assert.equal(normalizeLocalized({ de: 'Hallo', fr: 'Bonjour' }), 'Hallo');
});

test('skips blank values', () => {
  assert.equal(normalizeLocalized({ en: '   ', de: 'Hallo' }), 'Hallo');
});

test('returns undefined for missing, empty, or blank-only input', () => {
  assert.equal(normalizeLocalized(undefined), undefined);
  assert.equal(normalizeLocalized(null), undefined);
  assert.equal(normalizeLocalized(''), undefined);
  assert.equal(normalizeLocalized('   '), undefined);
  assert.equal(normalizeLocalized({}), undefined);
  assert.equal(normalizeLocalized({ en: '' }), undefined);
});
