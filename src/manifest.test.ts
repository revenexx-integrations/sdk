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

// AC-1 — A package hands over its nodes, stamped with the version of the format
// AC-2 — Credentials and templates appear only when the package has them
test('buildManifest omits credentials when none are provided [@spec:package-manifest:AC-1] [@spec:package-manifest:AC-2]', () => {
  const manifest = buildManifest([fakeNode]);

  assert.equal(manifest.manifestVersion, MANIFEST_VERSION);
  assert.equal(manifest.nodes.length, 1);
  assert.equal(manifest.credentials, undefined);
  assert.equal(manifest.templates, undefined);
});

// AC-2 — Credentials and templates appear only when the package has them
test('buildManifest includes credential descriptions when provided [@spec:package-manifest:AC-2]', () => {
  const manifest = buildManifest([fakeNode], [fakeCredential]);

  assert.equal(manifest.credentials?.length, 1);
  assert.equal(manifest.credentials?.[0]?.slug, 'revenexx:smtp');
  assert.equal(manifest.credentials?.[0]?.authKind, 'static');
});

// AC-3 — A shipped template is carried whole
test('buildManifest includes templates verbatim when provided [@spec:package-manifest:AC-3]', () => {
  const manifest = buildManifest([fakeNode], [], [fakeTemplate]);

  assert.equal(manifest.templates?.length, 1);
  assert.equal(manifest.templates?.[0]?.slug, 'revenexx:slack-to-crm');
  assert.equal(manifest.templates?.[0]?.blobVersion, 'v0-draft');
  assert.deepEqual(manifest.templates?.[0]?.definition, fakeTemplate.definition);
  assert.equal(manifest.templates?.[0]?.triggers?.[0]?.type, 'event');
  assert.equal(manifest.templates?.[0]?.triggers?.[0]?.config?.subject, 'slack.chat.message.created');
});

// AC-5 — The manifest never carries a block about the package itself
test('buildManifest never emits a package block [@spec:package-manifest:AC-5]', () => {
  assert.equal('package' in buildManifest([fakeNode]), false);
  assert.equal('package' in buildManifest([fakeNode], [fakeCredential], [fakeTemplate]), false);
});

// AC-6 — Only the registry-relevant fields are taken from a package's metadata
test('parsePackageMeta keeps the registry-relevant fields [@spec:package-manifest:AC-6]', () => {
  const meta = parsePackageMeta({
    name: '@revenexx/integrations-nodes-core',
    version: '0.2.0',
    revenexx: { displayName: 'Core' },
    private: true,
    scripts: {},
  });

  assert.deepEqual(meta, {
    name: '@revenexx/integrations-nodes-core',
    version: '0.2.0',
    displayName: 'Core',
  });
});

// AC-7 — The display label is read from the package's own namespaced group
test('parsePackageMeta ignores a top-level displayName (label lives under revenexx) [@spec:package-manifest:AC-7]', () => {
  assert.equal(parsePackageMeta({ name: 'x', version: '1.0.0', displayName: 'Core' }).displayName, undefined);
});

// AC-7 — The display label is read from the package's own namespaced group
test('parsePackageMeta leaves displayName undefined when the revenexx group is absent or non-string [@spec:package-manifest:AC-7]', () => {
  assert.equal(parsePackageMeta({ name: 'x', version: '1.0.0' }).displayName, undefined);
  assert.equal(parsePackageMeta({ name: 'x', version: '1.0.0', revenexx: {} }).displayName, undefined);
  assert.equal(parsePackageMeta({ name: 'x', version: '1.0.0', revenexx: 'nope' }).displayName, undefined);
  assert.equal(parsePackageMeta({ name: 'x', version: '1.0.0', revenexx: { displayName: 42 } }).displayName, undefined);
});

// AC-8 — A label that is blank counts as no label, and a padded one is trimmed
test('parsePackageMeta normalises blank/whitespace displayName to undefined [@spec:package-manifest:AC-8]', () => {
  assert.equal(parsePackageMeta({ name: 'x', version: '1.0.0', revenexx: { displayName: '' } }).displayName, undefined);
  assert.equal(parsePackageMeta({ name: 'x', version: '1.0.0', revenexx: { displayName: '   ' } }).displayName, undefined);
});

// AC-8 — A label that is blank counts as no label, and a padded one is trimmed
test('parsePackageMeta trims a surrounding-whitespace displayName [@spec:package-manifest:AC-8]', () => {
  assert.equal(parsePackageMeta({ name: 'x', version: '1.0.0', revenexx: { displayName: '  Core  ' } }).displayName, 'Core');
});

// AC-9 — Name and version are trimmed, and blank ones stay blank
test('parsePackageMeta trims name/version and blanks whitespace-only ones [@spec:package-manifest:AC-9]', () => {
  assert.deepEqual(
    parsePackageMeta({ name: '  @revenexx/x  ', version: ' 1.0.0 ' }),
    { name: '@revenexx/x', version: '1.0.0', displayName: undefined },
  );
  assert.deepEqual(
    parsePackageMeta({ name: '   ', version: '   ' }),
    { name: '', version: '', displayName: undefined },
  );
});

// AC-10 — Metadata that is not readable yields a safe shape, not a failure
test('parsePackageMeta coerces malformed input to a safe shape [@spec:package-manifest:AC-10]', () => {
  assert.deepEqual(parsePackageMeta(null), { name: '', version: '', displayName: undefined });
  assert.deepEqual(parsePackageMeta('nope'), { name: '', version: '', displayName: undefined });
});

// AC-4 — Declared images are carried through untouched
test('buildManifest carries image declarations through untouched [@spec:package-manifest:AC-4]', () => {
  const manifest = buildManifest([fakeNode], [fakeCredential], [fakeTemplate]);

  assert.deepEqual(manifest.nodes[0]?.images, fakeNode.description.images);
  assert.deepEqual(manifest.credentials?.[0]?.images, fakeCredential.description.images);
  assert.deepEqual(manifest.templates?.[0]?.images, fakeTemplate.images);
});
