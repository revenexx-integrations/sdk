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
  fs.writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0', revenexx }));
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
