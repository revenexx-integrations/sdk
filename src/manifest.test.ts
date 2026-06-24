import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildManifest, MANIFEST_VERSION } from './manifest.js';
import type { ICredential, INode, ITemplateDescription } from './types.js';

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

const fakeTemplate: ITemplateDescription = {
  slug: 'revenexx:slack-to-crm',
  version: '1.0.0',
  category: 'sales',
  level: 'beginner',
  name: 'Slack to CRM',
  blobVersion: 'v0-draft',
  definition: { nodeManifestVersion: 'v0-draft', name: 'Slack to CRM', nodes: [], edges: [] },
  triggers: [
    {
      handle: '11111111-1111-4111-8111-111111111111',
      type: 'event',
      name: 'On Slack message',
      config: { subject: 'slack.chat.message.created' },
      active: true,
    },
  ],
};

test('buildManifest omits credentials when none are provided', () => {
  const manifest = buildManifest([fakeNode]);

  assert.equal(manifest.manifestVersion, MANIFEST_VERSION);
  assert.equal(manifest.nodes.length, 1);
  assert.equal(manifest.credentials, undefined);
  assert.equal(manifest.templates, undefined);
});

test('buildManifest includes credential descriptions when provided', () => {
  const manifest = buildManifest([fakeNode], [fakeCredential]);

  assert.equal(manifest.credentials?.length, 1);
  assert.equal(manifest.credentials?.[0]?.slug, 'revenexx:smtp');
  assert.equal(manifest.credentials?.[0]?.authKind, 'static');
});

test('buildManifest includes templates verbatim when provided', () => {
  const manifest = buildManifest([fakeNode], [], [fakeTemplate]);

  assert.equal(manifest.templates?.length, 1);
  assert.equal(manifest.templates?.[0]?.slug, 'revenexx:slack-to-crm');
  assert.equal(manifest.templates?.[0]?.blobVersion, 'v0-draft');
  assert.deepEqual(manifest.templates?.[0]?.definition, fakeTemplate.definition);
  assert.equal(manifest.templates?.[0]?.triggers?.[0]?.type, 'event');
  assert.equal(manifest.templates?.[0]?.triggers?.[0]?.config?.subject, 'slack.chat.message.created');
});
