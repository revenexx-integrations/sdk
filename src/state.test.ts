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

// AC-1 — An unknown correlation is an answer, not a failure
test('a node can branch on an existing correlation [@spec:workflow-state:AC-1]', async () => {
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

// AC-2 — A claim that was refused is an answer, not a failure
test('a rejected claim is a value the node handles, not a thrown error [@spec:workflow-state:AC-2]', async () => {
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

// AC-3 — A watermark keeps whatever shape the source counts in
test('a cursor round-trips an arbitrary watermark shape [@spec:workflow-state:AC-3]', async () => {
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

// AC-4 — An entity that has not changed is known before anything is written
test('a digest short-circuits the expensive write [@spec:workflow-state:AC-4]', async () => {
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

// AC-5 — A node that remembers can be exercised without the engine
test('all four roles are reachable through a context built from plain objects [@spec:workflow-state:AC-5]', async () => {
  const calls: string[] = [];

  const state: INodeState = {
    mapping: {
      get: async () => {
        calls.push('mapping.get');

        return 'erp:A-8891';
      },
      put: async () => {
        calls.push('mapping.put');
      },
    },
    cursor: {
      get: async () => {
        calls.push('cursor.get');

        return undefined;
      },
      set: async () => {
        calls.push('cursor.set');
      },
    },
    claim: async () => {
      calls.push('claim');

      return true;
    },
    digest: {
      unchanged: async () => {
        calls.push('digest.unchanged');

        return false;
      },
      set: async () => {
        calls.push('digest.set');
      },
    },
  };

  const node: INode['execute'] = async (ctx) => {
    await ctx.state.mapping.get('article', 'pim:1');
    await ctx.state.mapping.put('article', 'pim:1', 'erp:A-8891');
    await ctx.state.cursor.get('crm.customers');
    await ctx.state.cursor.set('crm.customers', { updatedAfter: '2026-08-26T10:00:00Z' });
    await ctx.state.claim('orders', 'evt_1');
    await ctx.state.digest.unchanged('article.hash', 'article:1', 'sha-abc');
    await ctx.state.digest.set('article.hash', 'article:1', 'sha-abc');

    return { outputs: {} };
  };

  await node(stubContext(state), {});

  assert.deepEqual(calls, [
    'mapping.get',
    'mapping.put',
    'cursor.get',
    'cursor.set',
    'claim',
    'digest.unchanged',
    'digest.set',
  ]);
});
