import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLocalized } from './localized.js';

// AC-1 — A label written as one string arrives as that string, trimmed
test('returns a plain string trimmed [@spec:localized-text:AC-1]', () => {
  assert.equal(normalizeLocalized('  Hello  '), 'Hello');
});

// AC-2 — A label written per language yields the one asked for
test('prefers the fallback language from a localized map [@spec:localized-text:AC-2]', () => {
  assert.equal(normalizeLocalized({ en: 'Hello', de: 'Hallo' }), 'Hello');
  assert.equal(normalizeLocalized({ en: 'Hello', de: 'Hallo' }, 'de'), 'Hallo');
});

// AC-3 — A language that was not written falls back to one that was
test('falls back to the first non-empty value when the preferred lang is missing [@spec:localized-text:AC-3]', () => {
  assert.equal(normalizeLocalized({ de: 'Hallo', fr: 'Bonjour' }), 'Hallo');
});

// AC-4 — A language present but blank is passed over
test('skips blank values [@spec:localized-text:AC-4]', () => {
  assert.equal(normalizeLocalized({ en: '   ', de: 'Hallo' }), 'Hallo');
});

// AC-5 — Nothing to show reduces to nothing, not to a blank
test('returns undefined for missing, empty, or blank-only input [@spec:localized-text:AC-5]', () => {
  assert.equal(normalizeLocalized(undefined), undefined);
  assert.equal(normalizeLocalized(null), undefined);
  assert.equal(normalizeLocalized(''), undefined);
  assert.equal(normalizeLocalized('   '), undefined);
  assert.equal(normalizeLocalized({}), undefined);
  assert.equal(normalizeLocalized({ en: '' }), undefined);
});
