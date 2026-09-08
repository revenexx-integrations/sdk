import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NodeError } from './errors.js';
import { errorPort, errorResult, httpErrorResult, toErrorOutput, toErrorResult } from './nodeErrors.js';
import { extractManifest } from './extract.js';
import type { INode } from './types.js';

test('a NodeError keeps its code, and takes a status only where it carries one [@spec:error-handling:AC-1]', () => {
  assert.deepEqual(toErrorOutput(new NodeError('HTTP_ERROR', 'nope', { status: 503 })), {
    code: 'HTTP_ERROR',
    message: 'nope',
    status: 503,
  });

  // No `status` in meta, and a `status` that is not a number, both read as "none".
  assert.equal(toErrorOutput(new NodeError('MISSING_PATH_PARAM', 'no id')).status, 0);
  assert.equal(toErrorOutput(new NodeError('X', 'y', { status: '503' })).status, 0);

  // And a number that is not a status: NaN and Infinity are `typeof 'number'`,
  // and NaN would reach the author as an empty field rather than a wrong one.
  assert.equal(toErrorOutput(new NodeError('X', 'y', { status: Number.NaN })).status, 0);
  assert.equal(toErrorOutput(new NodeError('X', 'y', { status: Number.POSITIVE_INFINITY })).status, 0);
});

test('an abort becomes TIMEOUT and anything else REQUEST_FAILED [@spec:error-handling:AC-1]', () => {
  // A last resort for an abort nobody recognised. It is NOT how a cancellation is
  // meant to arrive: safeFetch raises its own budget as NodeError('TIMEOUT') — which
  // takes the branch above, not this one — and re-throws the engine's abort reason
  // untouched, and a routing node checks `ctx.signal.aborted` before it ever calls in
  // here. See request-budget AC-4/AC-5, and this spec's gap on the same subject.
  const abort = new Error('The operation was aborted');
  abort.name = 'AbortError';
  assert.deepEqual(toErrorOutput(abort), { code: 'TIMEOUT', message: 'Request timed out', status: 0 });

  // safeFetch's own budget arrives as a NodeError and keeps its code and status,
  // rather than falling through to the line above.
  assert.deepEqual(toErrorOutput(new NodeError('TIMEOUT', 'Request timed out after 5000ms')), {
    code: 'TIMEOUT',
    message: 'Request timed out after 5000ms',
    status: 0,
  });

  assert.deepEqual(toErrorOutput(new Error('socket hang up')), {
    code: 'REQUEST_FAILED',
    message: 'socket hang up',
    status: 0,
  });

  // A node's catch block receives whatever was thrown, which need not be an Error.
  assert.deepEqual(toErrorOutput('just a string'), {
    code: 'REQUEST_FAILED',
    message: 'just a string',
    status: 0,
  });
});

test('a routed failure names the output it took [@spec:error-handling:AC-2]', () => {
  const res = errorResult({ code: 'TIMEOUT', message: 'too slow', status: 0 });
  assert.equal(res.branch, 'error');
  assert.deepEqual(res.outputs['error'], { code: 'TIMEOUT', message: 'too slow', status: 0 });

  // A node whose failure output is named something else keeps branch and payload together.
  const named = errorResult({ code: 'X', message: 'y', status: 0 }, 'failed');
  assert.equal(named.branch, 'failed');
  assert.deepEqual(Object.keys(named.outputs), ['failed']);
});

test('the catch-block shortcuts normalise and route in one step [@spec:error-handling:AC-2]', () => {
  const routed = toErrorResult(new NodeError('REFUSED', 'blocked', { status: 0 }));
  assert.equal(routed.branch, 'error');
  assert.deepEqual(routed.outputs['error'], { code: 'REFUSED', message: 'blocked', status: 0 });

  // The HTTP shortcut adds the body a NodeError carried, and `null` where it carried none.
  const withBody = httpErrorResult(new NodeError('HTTP_ERROR', 'bad', { status: 400, body: { e: 1 } }));
  assert.deepEqual(withBody.outputs['error'], {
    code: 'HTTP_ERROR',
    message: 'bad',
    status: 400,
    body: { e: 1 },
  });
  assert.equal((httpErrorResult(new Error('gone')).outputs['error'] as { body: unknown }).body, null);

  // And both keep branch and payload together on a node that named its failure
  // output something else — a branch no port declares reaches nothing.
  const renamed = toErrorResult(new Error('gone'), 'failed');
  assert.equal(renamed.branch, 'failed');
  assert.deepEqual(Object.keys(renamed.outputs), ['failed']);

  const renamedHttp = httpErrorResult(new NodeError('HTTP_ERROR', 'bad', { status: 400 }), 'failed');
  assert.equal(renamedHttp.branch, 'failed');
  assert.deepEqual(Object.keys(renamedHttp.outputs), ['failed']);
});

test('the declared error output carries the three fields, and body only when asked [@spec:error-handling:AC-3]', () => {
  const port = errorPort();
  assert.equal(port.name, 'error');
  assert.equal(port.kind, 'error');
  assert.deepEqual(Object.keys(port.fields ?? {}), ['code', 'message', 'status']);
  assert.deepEqual(Object.keys(errorPort({ body: true }).fields ?? {}), [
    'code',
    'message',
    'status',
    'body',
  ]);
});

test('the port tells an author what will not reach it [@spec:error-handling:AC-3]', () => {
  const node: INode = {
    description: {
      slug: 'revenexx:test',
      version: '1.0.0',
      category: 'action',
      name: 'Test',
      inputs: { in: { dataType: 'any' } },
      outputs: [{ name: 'out', kind: 'default', dataType: 'object' }, errorPort()],
      config: [],
    },
    async execute() {
      return { outputs: {} };
    },
  };

  const manifest = extractManifest(node);
  const port = manifest.outputs.find((o) => o.name === 'error');
  assert.ok(port, 'the error output survives into the manifest');

  // The rule the port exists under reaches the author here or nowhere: a fault in
  // the node's own configuration ends the run instead of arriving on this path.
  const en = (port.description as Record<string, string>)['en'] ?? '';
  const de = (port.description as Record<string, string>)['de'] ?? '';
  assert.match(en, /cannot run as configured fails the run/);
  assert.match(de, /nicht laufen kann, lässt den Run scheitern/);
});
