import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertBranchNamed, isMultiPort, outputProblems, outputWarnings } from './branches.js';
import { buildManifest } from './manifest.js';
import { errorPort } from './nodeErrors.js';
import type { INode, INodeDescription, IOutputPort } from './types.js';

const out: IOutputPort = { name: 'out', kind: 'default', dataType: 'object' };

function node(outputs: IOutputPort[]): INode {
  const description: INodeDescription = {
    slug: 'test:node',
    version: '1.0.0',
    category: 'action',
    name: 'Node',
    inputs: {},
    outputs,
  };
  return {
    description,
    async execute() {
      return { outputs: {} };
    },
  };
}

test('a node with two ports and a result without branch is flagged [@spec:branch-selection:AC-1]', () => {
  const two = node([out, { name: 'other', kind: 'default', dataType: 'object' }]);
  assert.throws(() => assertBranchNamed(two, { outputs: { out: {} } }), /must name the branch/);
  assert.doesNotThrow(() => assertBranchNamed(two, { outputs: { out: {} }, branch: 'out' }));
  assert.throws(() => assertBranchNamed(two, { outputs: {}, branch: 'nope' }), /can produce/);
});

test('a node with one port may leave the branch out [@spec:branch-selection:AC-2]', () => {
  assert.doesNotThrow(() => assertBranchNamed(node([out]), { outputs: { out: {} } }));
  assert.doesNotThrow(() => assertBranchNamed(node([]), { outputs: {} }));
  assert.equal(isMultiPort([out]), false);
});

test('an error port counts as a port [@spec:branch-selection:AC-3]', () => {
  const n = node([out, errorPort()]);
  assert.equal(isMultiPort(n.description.outputs), true);
  assert.throws(() => assertBranchNamed(n, { outputs: { out: {} } }), /must name the branch/);
});

test('what counts as several, and what does not [@spec:branch-selection:AC-3]', () => {
  assert.equal(isMultiPort([{ kind: 'default', dataType: 'any', resolveOutputs: true }]), true);
  assert.equal(isMultiPort([{ kind: 'default', dataType: 'any', sourceFromConfig: 'target' }]), false);
  assert.equal(isMultiPort([{ kind: 'branch', dataType: 'any' }]), false);
  assert.doesNotThrow(() => assertBranchNamed(node([{ kind: 'branch', dataType: 'any' }]), { outputs: {} }));
});

test('a branch is held to the names the node can produce [@spec:branch-selection:AC-1]', () => {
  const n = node([
    { name: 'success', kind: 'default', dataType: 'any' },
    errorPort(),
    { kind: 'branch', dataType: 'any', sourceFromConfig: 'cases', fallback: { name: 'else' } },
  ]);
  assert.doesNotThrow(() => assertBranchNamed(n, { outputs: {}, branch: 'success' }));
  assert.doesNotThrow(() => assertBranchNamed(n, { outputs: {}, branch: 'else' }, { cases: 'x' }));
  assert.doesNotThrow(() => assertBranchNamed(n, { outputs: {}, branch: 'x' }, { cases: 'x' }));
  assert.throws(() => assertBranchNamed(n, { outputs: {}, branch: 'sucess' }, { cases: 'x' }), /can produce/);
  const resolved = node([{ name: 'success', kind: 'default', dataType: 'any' }, { kind: 'default', dataType: 'any', resolveOutputs: true }]);
  assert.doesNotThrow(() => assertBranchNamed(resolved, { outputs: {}, branch: 'anything' }));
});

test('the build warns about outputs that cannot be told apart and does not throw [@spec:branch-selection:AC-4]', () => {
  const unnamed = node([out, { kind: 'default', dataType: 'any' }]);
  assert.equal(outputProblems(unnamed.description).length, 1);
  assert.equal(outputWarnings([unnamed]).length, 1);
  assert.doesNotThrow(() => buildManifest([unnamed]));
  assert.match(outputProblems(node([out, out]).description)[0] ?? '', /declared twice/);
  const clash = node([
    { name: 'other', kind: 'default', dataType: 'any' },
    { kind: 'branch', dataType: 'any', sourceFromConfig: 'cases', fallback: { name: 'other' } },
  ]);
  assert.match(outputProblems(clash.description)[0] ?? '', /fallback name "other"/);
  assert.deepEqual(outputProblems(node([{ kind: 'branch', dataType: 'any' }]).description), []);
  assert.deepEqual(outputProblems(node([out, errorPort()]).description), []);
});
