import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertBranchNamed, isMultiPort, outputProblems } from './branches.js';
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
  assert.throws(() => assertBranchNamed(two, { outputs: {}, branch: 'nope' }), /none of its outputs/);
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

test('ports whose number is known only later count as several [@spec:branch-selection:AC-3]', () => {
  assert.equal(isMultiPort([{ kind: 'default', dataType: 'any', sourceFromConfig: 'cases' }]), true);
  assert.equal(isMultiPort([{ kind: 'default', dataType: 'any', resolveOutputs: true }]), true);
  assert.equal(isMultiPort([{ name: 'yes', kind: 'branch', dataType: 'any' }]), true);
  const dyn = node([{ kind: 'default', dataType: 'any', sourceFromConfig: 'cases' }]);
  assert.throws(() => assertBranchNamed(dyn, { outputs: {} }), /must name the branch/);
  assert.doesNotThrow(() => assertBranchNamed(dyn, { outputs: {}, branch: 'anything' }));
});

test('the build refuses several fixed ports that cannot be told apart [@spec:branch-selection:AC-4]', () => {
  const unnamed = node([out, { kind: 'default', dataType: 'any' }]);
  assert.equal(outputProblems(unnamed.description).length, 1);
  assert.throws(() => buildManifest([unnamed]), /has no name/);
  const twice = node([out, out]);
  assert.match(outputProblems(twice.description)[0] ?? '', /declared twice/);
  // a single unnamed port and generated ports are fine
  assert.deepEqual(outputProblems(node([{ kind: 'default', dataType: 'any' }]).description), []);
  assert.deepEqual(outputProblems(node([{ kind: 'default', dataType: 'any', resolveOutputs: true }]).description), []);
  assert.doesNotThrow(() => buildManifest([node([out, errorPort()])]));
});
