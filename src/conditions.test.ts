import assert from 'node:assert/strict';
import { test } from 'node:test';
import { settingApplies } from './conditions.js';
import { extractManifest } from './extract.js';
import type { IConfigField, INode } from './types.js';

// A node with one setting that decides, and two that only apply under it: the
// shape the library has over and over — a `source` select, a field that is read
// only under one of its choices, and a field that applies until another is filled.
const dateNode: INode = {
  description: {
    slug: 'revenexx:date-time',
    version: '1.0.0',
    category: 'transform',
    name: 'Date Time',
    inputs: { in: { dataType: 'any' } },
    outputs: [{ name: 'out', kind: 'default', dataType: 'object' }],
    config: [
      {
        key: 'source',
        label: 'Source',
        type: 'select',
        options: [
          { value: 'now', label: 'Now' },
          { value: 'field', label: 'From field' },
        ],
      },
      {
        key: 'path',
        label: 'Path to the date',
        type: 'string',
        showIf: { key: 'source', op: 'equals', value: 'field' },
      },
      {
        key: 'fallback',
        label: 'Fallback',
        type: 'string',
        showIf: { key: 'path', op: 'isEmpty' },
      },
    ],
  },
  async execute() {
    return { outputs: {} };
  },
};

const field = (key: string): IConfigField => {
  const found = dateNode.description.config?.find(f => f.key === key);
  assert.ok(found, `no config field ${key}`);
  return found;
};

// AC-1 — A condition a node writes on a setting survives into the manifest
test('extractManifest carries a settings condition through as declared [@spec:setting-conditions:AC-1]', () => {
  const manifest = extractManifest(dateNode);

  assert.deepEqual(manifest.config?.[1].showIf, { key: 'source', op: 'equals', value: 'field' });
  assert.deepEqual(manifest.config?.[2].showIf, { key: 'path', op: 'isEmpty' });
});

test('a setting with no condition carries none [@spec:setting-conditions:AC-1]', () => {
  assert.equal(extractManifest(dateNode).config?.[0].showIf, undefined);
});

// AC-2 — Whether a setting applies is answered from the condition and the values
test('a setting with no condition always applies [@spec:setting-conditions:AC-2]', () => {
  assert.equal(settingApplies(field('source'), {}), true);
  assert.equal(settingApplies(field('source'), { source: 'now' }), true);
});

test('a setting applies when its condition holds [@spec:setting-conditions:AC-2]', () => {
  assert.equal(settingApplies(field('path'), { source: 'field' }), true);
});

test('a setting does not apply when its condition fails [@spec:setting-conditions:AC-2]', () => {
  assert.equal(settingApplies(field('path'), { source: 'now' }), false);
});

test('a condition against a setting nobody has filled in reads it as absent [@spec:setting-conditions:AC-2]', () => {
  // `source` unset: `equals 'field'` must not hold, and `isEmpty` on the
  // still-empty `path` must — the state a node is in the moment it is dropped
  // on the canvas, where every value is missing rather than wrong.
  assert.equal(settingApplies(field('path'), {}), false);
  assert.equal(settingApplies(field('fallback'), {}), true);
});

test('a condition against a misspelled key reads it as absent [@spec:setting-conditions:AC-2]', () => {
  const typo: IConfigField = {
    key: 'x',
    label: 'X',
    type: 'string',
    showIf: { key: 'sorce', op: 'equals', value: 'field' },
  };

  // Nothing here can tell a typo from a key that is simply unset, so it reads
  // as absent and `equals` does not hold. Catching the typo itself is the
  // platform's job, where the whole manifest is in view.
  assert.equal(settingApplies(typo, { source: 'field' }), false);
});
