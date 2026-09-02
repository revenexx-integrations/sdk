import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { INode, INodeContext, INodeState } from './types.js';

/**
 * The state surface is an interface, so the real assertion is that `tsc`
 * accepts a node written against it — these tests exist to pin the *shape*:
 * a node that reads a mapping, claims a key and advances a cursor must compile
 * and run against a plain stub, with no runtime dependency on the engine.
 */

function stubState(overrides: Partial<INodeState> = {}): INodeState {
  return {
    mapping: {
      get: async () => null,
      put: async () => {},
    },
    cursor: {
      get: async () => undefined,
      set: async () => {},
    },
    claim: async () => true,
    digest: {
      unchanged: async () => false,
      set: async () => {},
    },
    ...overrides,
  };
}

function stubContext(state: INodeState): INodeContext {
  return {
    signal: new AbortController().signal,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    secrets: { get: async () => '' },
    credentials: { get: async () => ({}) },
    state,
  };
}

test('a node can branch on an existing correlation', async () => {
  const node: INode['execute'] = async (ctx, inputs) => {
    const known = await ctx.state.mapping.get('article', `pim:${String(inputs['id'])}`);

    return { outputs: { known }, branch: known === null ? 'create' : 'update' };
  };

  const created = await node(stubContext(stubState()), { id: 1 });
  assert.equal(created.branch, 'create');

  const updated = await node(
    stubContext(stubState({ mapping: { get: async () => 'erp:A-8891', put: async () => {} } })),
    { id: 1 },
  );
  assert.equal(updated.branch, 'update');
  assert.deepEqual(updated.outputs, { known: 'erp:A-8891' });
});

test('a rejected claim is a value the node handles, not a thrown error', async () => {
  const node: INode['execute'] = async (ctx) => {
    if (!(await ctx.state.claim('orders', 'evt_1', { ttlSeconds: 60 }))) {
      return { outputs: {}, branch: 'duplicate' };
    }

    return { outputs: { processed: true } };
  };

  const first = await node(stubContext(stubState()), {});
  assert.deepEqual(first.outputs, { processed: true });

  const duplicate = await node(stubContext(stubState({ claim: async () => false })), {});
  assert.equal(duplicate.branch, 'duplicate');
});

test('a cursor round-trips an arbitrary watermark shape', async () => {
  let written: unknown;

  const state = stubState({
    cursor: {
      get: async () => ({ updatedAfter: '2026-08-01T00:00:00Z' }),
      set: async (_namespace, value) => {
        written = value;
      },
    },
  });

  const node: INode['execute'] = async (ctx) => {
    const since = (await ctx.state.cursor.get('crm.customers')) as { updatedAfter?: string } | undefined;
    await ctx.state.cursor.set('crm.customers', { updatedAfter: '2026-08-26T10:00:00Z' });

    return { outputs: { since: since?.updatedAfter } };
  };

  const result = await node(stubContext(state), {});

  assert.deepEqual(result.outputs, { since: '2026-08-01T00:00:00Z' });
  assert.deepEqual(written, { updatedAfter: '2026-08-26T10:00:00Z' });
});

test('a digest short-circuits the expensive write', async () => {
  let wrote = false;

  const node: INode['execute'] = async (ctx) => {
    if (await ctx.state.digest.unchanged('article.hash', 'article:1', 'sha-abc')) {
      return { outputs: { skipped: true } };
    }
    wrote = true;
    await ctx.state.digest.set('article.hash', 'article:1', 'sha-abc');

    return { outputs: { skipped: false } };
  };

  const unchanged = await node(
    stubContext(stubState({ digest: { unchanged: async () => true, set: async () => {} } })),
    {},
  );

  assert.deepEqual(unchanged.outputs, { skipped: true });
  assert.equal(wrote, false);
});
