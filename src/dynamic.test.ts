import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractManifest } from './extract.js';
import type { INode, INodeAuthorContext } from './types.js';

function ctx(config: Record<string, unknown> = {}): INodeAuthorContext {
  return {
    signal: new AbortController().signal,
    logger: { info() {}, warn() {}, error() {} },
    config,
    secrets: { get: () => Promise.reject(new Error('unused in this test')) },
    credentials: { get: () => Promise.reject(new Error('unused in this test')) },
  };
}

// A generic API node: seed `app`/`api` selects + a dynamic-schema marker, plus
// a resolveOutputs port and the three author-time resolvers (PO-143).
const apiNode: INode = {
  description: {
    slug: 'revenexx:api',
    version: '1.0.0',
    category: 'action',
    name: 'Revenexx API',
    inputs: { in: { dataType: 'any' } },
    outputs: [
      { name: 'success', kind: 'default', dataType: 'object' },
      { kind: 'branch', dataType: 'any', resolveOutputs: true },
    ],
    config: [
      { key: 'app', label: 'App', type: 'select', dynamic: true },
      { key: 'api', label: 'API', type: 'select', dynamic: true, dependsOn: ['app'] },
      { key: 'params', label: 'Parameters', type: 'dynamic-schema', dependsOn: ['app', 'api'] },
    ],
  },
  async execute() {
    return { outputs: {} };
  },
  async loadOptions(_ctx, fieldKey) {
    return [{ value: fieldKey, label: `Option for ${fieldKey}` }];
  },
  async resolveConfigSchema() {
    return [{ key: 'customerId', label: 'Customer', type: 'string', dynamic: true }];
  },
  async resolveOutputs() {
    return [{ name: 'created', kind: 'default', dataType: 'object' }];
  },
};

test('extractManifest carries the dynamic markers into the description', () => {
  const manifest = extractManifest(apiNode);

  assert.equal(manifest.config?.[0].dynamic, true);
  assert.deepEqual(manifest.config?.[1].dependsOn, ['app']);
  assert.equal(manifest.config?.[2].type, 'dynamic-schema');
  assert.equal(manifest.outputs[1].resolveOutputs, true);
});

test('author-time resolvers are callable and return the grammar shapes', async () => {
  assert.deepEqual(await apiNode.loadOptions?.(ctx(), 'api'), [
    { value: 'api', label: 'Option for api' },
  ]);

  const fields = await apiNode.resolveConfigSchema?.(ctx({ app: 'crm', api: 'listCustomers' }));
  assert.equal(fields?.[0].key, 'customerId');

  const outputs = await apiNode.resolveOutputs?.(ctx());
  assert.equal(outputs?.[0].name, 'created');
});

test('a plain static node need not implement the author-time resolvers', () => {
  const staticNode: INode = {
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

  assert.equal(staticNode.loadOptions, undefined);
  assert.equal(staticNode.resolveConfigSchema, undefined);
  assert.equal(staticNode.resolveOutputs, undefined);
});
