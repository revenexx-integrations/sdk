import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildManifest, MANIFEST_VERSION } from './manifest.js';
import type { ICredential, INode } from './types.js';

const fakeNode: INode = {
  description: {
    slug: 'revenexx:noop',
    version: '1.0.0',
    category: 'action',
    name: 'Noop',
    inputs: {},
    outputs: [{ name: 'out', kind: 'default', dataType: 'any' }],
  },
  async execute() {
    return { outputs: {} };
  },
};

const fakeCredential: ICredential = {
  description: {
    slug: 'revenexx:smtp',
    version: '1.0.0',
    name: 'SMTP',
    authKind: 'static',
    fields: [{ key: 'host', label: 'Host', type: 'string', required: true }],
  },
  async test() {
    return { ok: true };
  },
  async resolve() {
    return { credentials: {} };
  },
};

test('buildManifest omits credentials when none are provided', () => {
  const manifest = buildManifest([fakeNode]);

  assert.equal(manifest.manifestVersion, MANIFEST_VERSION);
  assert.equal(manifest.nodes.length, 1);
  assert.equal(manifest.credentials, undefined);
});

test('buildManifest includes credential descriptions when provided', () => {
  const manifest = buildManifest([fakeNode], [fakeCredential]);

  assert.equal(manifest.credentials?.length, 1);
  assert.equal(manifest.credentials?.[0]?.slug, 'revenexx:smtp');
  assert.equal(manifest.credentials?.[0]?.authKind, 'static');
});
