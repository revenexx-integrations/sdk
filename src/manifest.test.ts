import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildManifest, MANIFEST_VERSION, parsePackageMeta } from './manifest.js';
import type { ICredential, INode, ITemplateDescription } from './types.js';

const fakeNode: INode = {
  description: {
    slug: 'revenexx:noop',
    version: '1.0.0',
    category: 'action',
    name: 'Noop',
    images: [
      { src: 'images/noop.png', alt: { en: 'Noop node' }, category: 'screenshot' },
    ],
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
    images: [{ src: 'images/smtp-logo.svg', alt: 'SMTP logo', category: 'logo' }],
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
  images: [
    { src: 'images/slack-banner.png', alt: 'Slack banner', title: 'Slack → CRM', category: 'banner' },
  ],
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

test('buildManifest omits the package block when no meta is provided', () => {
  const manifest = buildManifest([fakeNode]);
  assert.equal(manifest.package, undefined);
});

test('buildManifest carries the package meta when provided', () => {
  const manifest = buildManifest([fakeNode], [], [], {
    name: '@revenexx/integrations-nodes-core',
    version: '0.2.0',
    displayName: 'Core',
  });

  assert.deepEqual(manifest.package, {
    name: '@revenexx/integrations-nodes-core',
    version: '0.2.0',
    displayName: 'Core',
  });
});

test('parsePackageMeta keeps the registry-relevant fields', () => {
  const meta = parsePackageMeta({
    name: '@revenexx/integrations-nodes-core',
    version: '0.2.0',
    displayName: 'Core',
    private: true,
    scripts: {},
  });

  assert.deepEqual(meta, {
    name: '@revenexx/integrations-nodes-core',
    version: '0.2.0',
    displayName: 'Core',
  });
});

test('parsePackageMeta leaves displayName undefined when absent or non-string', () => {
  assert.equal(parsePackageMeta({ name: 'x', version: '1.0.0' }).displayName, undefined);
  assert.equal(parsePackageMeta({ name: 'x', version: '1.0.0', displayName: 42 }).displayName, undefined);
});

test('parsePackageMeta normalises blank/whitespace displayName to undefined', () => {
  assert.equal(parsePackageMeta({ name: 'x', version: '1.0.0', displayName: '' }).displayName, undefined);
  assert.equal(parsePackageMeta({ name: 'x', version: '1.0.0', displayName: '   ' }).displayName, undefined);
});

test('parsePackageMeta trims a surrounding-whitespace displayName', () => {
  assert.equal(parsePackageMeta({ name: 'x', version: '1.0.0', displayName: '  Core  ' }).displayName, 'Core');
});

test('parsePackageMeta coerces malformed input to a safe shape', () => {
  assert.deepEqual(parsePackageMeta(null), { name: '', version: '', displayName: undefined });
  assert.deepEqual(parsePackageMeta('nope'), { name: '', version: '', displayName: undefined });
});

test('buildManifest carries image declarations through untouched', () => {
  const manifest = buildManifest([fakeNode], [fakeCredential], [fakeTemplate]);

  assert.deepEqual(manifest.nodes[0]?.images, fakeNode.description.images);
  assert.deepEqual(manifest.credentials?.[0]?.images, fakeCredential.description.images);
  assert.deepEqual(manifest.templates?.[0]?.images, fakeTemplate.images);
});
