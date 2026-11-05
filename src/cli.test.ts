import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

// The CLI runs on import and exits, so it is driven as the built binary is: a
// child process whose working directory is a node package.
const cli = fileURLToPath(new URL('./cli.ts', import.meta.url));
const tsx = import.meta.resolve('tsx');

let pkg: string;

beforeEach(() => {
  pkg = fs.mkdtempSync(join(tmpdir(), 'rvnxx-cli-'));
  fs.mkdirSync(join(pkg, 'dist'));
  fs.writeFileSync(join(pkg, 'dist', 'index.js'), 'export const NODES = [];\n');
});

afterEach(() => {
  fs.rmSync(pkg, { recursive: true, force: true });
});

function manifest(revenexx: Record<string, unknown>) {
  fs.writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0', type: 'module', revenexx }));
  return spawnSync(process.execPath, ['--import', tsx, cli, 'manifest'], { cwd: pkg, encoding: 'utf-8' });
}

// AC-13 — A package's folder icon is read from the same group, and one the registry would refuse stops the build
test('rvnxx-nodes manifest stops on a malformed revenexx.icon before writing anything [@spec:package-manifest:AC-13]', () => {
  const run = manifest({ displayName: 'X', icon: 'mdi:bell' });

  assert.equal(run.status, 1);
  assert.ok(run.stderr.includes('"revenexx.icon"'), run.stderr);
  assert.ok(run.stderr.includes('got "mdi:bell"'), run.stderr);
  assert.equal(fs.existsSync(join(pkg, 'dist', 'manifest.json')), false);
});

// AC-13 — A package's folder icon is read from the same group, and one the registry would refuse stops the build
test('rvnxx-nodes manifest builds with a well-formed revenexx.icon [@spec:package-manifest:AC-13]', () => {
  const run = manifest({ displayName: 'X', icon: ' lucide:bell ' });

  assert.equal(run.status, 0, run.stderr);
  assert.equal(fs.existsSync(join(pkg, 'dist', 'manifest.json')), true);
});

// AC-13 — A package's folder icon is read from the same group, and one the registry would refuse stops the build
test('rvnxx-nodes manifest builds, with a warning, when revenexx.icon is not text [@spec:package-manifest:AC-13]', () => {
  const run = manifest({ displayName: 'X', icon: ['lucide:bell'] });

  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stderr.includes('"revenexx.icon" is not text'), run.stderr);
  assert.equal(manifest({ displayName: 'X', icon: null }).stderr.includes('is not text'), false);
});

// AC-13 — A package's folder icon is read from the same group, and one the registry would refuse stops the build
test('rvnxx-nodes manifest stops on a malformed revenexx.icon even when the bundle fails to load [@spec:package-manifest:AC-13]', () => {
  fs.writeFileSync(join(pkg, 'dist', 'index.js'), "throw new Error('bundle broke');\n");
  const run = manifest({ displayName: 'X', icon: 'mdi:bell' });

  assert.equal(run.status, 1);
  assert.ok(run.stderr.includes('got "mdi:bell"'), run.stderr);
});

// AC-15 — A name the registry would refuse stops the build, naming the node, the field and the rule
test('rvnxx-nodes manifest stops on a port name the registry would refuse, before writing anything [@spec:package-manifest:AC-15]', () => {
  fs.writeFileSync(
    join(pkg, 'dist', 'index.js'),
    `export const NODES = [{ description: ${JSON.stringify({
      slug: 'openplz:lookup',
      version: '1.0.0',
      category: 'action',
      name: 'Lookup',
      inputs: {},
      outputs: [
        { name: 'found', kind: 'branch', dataType: 'any' },
        { name: 'notFound', kind: 'branch', dataType: 'any' },
      ],
    })}, async execute() { return { outputs: {}, branch: 'found' }; } }];\n`,
  );
  const run = manifest({ displayName: 'X' });

  assert.equal(run.status, 1);
  assert.ok(run.stderr.includes('openplz:lookup'), run.stderr);
  assert.ok(run.stderr.includes('outputs[1].name "notFound"'), run.stderr);
  assert.ok(run.stderr.includes('^[a-z][a-z0-9-]{0,62}$'), run.stderr);
  assert.equal(fs.existsSync(join(pkg, 'dist', 'manifest.json')), false);
});

// AC-4 — Several outputs that cannot be told apart stop the build
function nodeWith(slug: string, outputs: unknown[]) {
  return `{ description: ${JSON.stringify({ slug, version: '1.0.0', category: 'action', name: 'N', inputs: {}, outputs })}, async execute() { return { outputs: {} }; } }`;
}

// AC-4 — Several outputs that cannot be told apart stop the build
test('rvnxx-nodes manifest stops on outputs a branch cannot tell apart, naming each, before writing anything [@spec:branch-selection:AC-4]', () => {
  fs.writeFileSync(
    join(pkg, 'dist', 'index.js'),
    `export const NODES = [${nodeWith('acme:unnamed', [
      { name: 'out', kind: 'default', dataType: 'any' },
      { kind: 'default', dataType: 'any' },
    ])}, ${nodeWith('acme:twice', [
      { name: 'out', kind: 'default', dataType: 'any' },
      { name: 'out', kind: 'default', dataType: 'any' },
    ])}];\n`,
  );
  const run = manifest({ displayName: 'X' });

  assert.equal(run.status, 1);
  assert.ok(run.stderr.includes('acme:unnamed: output 2 has no name'), run.stderr);
  assert.ok(run.stderr.includes('acme:twice: output name "out" is declared twice'), run.stderr);
  assert.equal(fs.existsSync(join(pkg, 'dist', 'manifest.json')), false);
});

// AC-4 — Several outputs that cannot be told apart stop the build
test('rvnxx-nodes manifest builds a node whose outputs can be told apart [@spec:branch-selection:AC-4]', () => {
  fs.writeFileSync(
    join(pkg, 'dist', 'index.js'),
    `export const NODES = [${nodeWith('acme:apart', [
      { name: 'out', kind: 'default', dataType: 'any' },
      { name: 'error', kind: 'error', dataType: 'any' },
    ])}];\n`,
  );
  const run = manifest({ displayName: 'X' });

  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr.includes('acme:apart'), false, run.stderr);
  assert.equal(fs.existsSync(join(pkg, 'dist', 'manifest.json')), true);
});
