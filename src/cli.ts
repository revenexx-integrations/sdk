#!/usr/bin/env node
/**
 * `rvnxx-nodes` — shared tooling for Revenexx node packages.
 *
 * Subcommands:
 *   rvnxx-nodes manifest   Read the package's built `NODES` export and write
 *                          `dist/manifest.json`. Run after `tsup`.
 *   rvnxx-nodes publish    Pack the package with `npm pack` and upload the
 *                          tarball to the integrations registry.
 *
 * Everything operates on the current working directory (`process.cwd()`),
 * so the same binary works from any node package that depends on the SDK.
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { existsSync, mkdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildManifest } from './manifest.js';
import type { INode } from './types.js';

const projectRoot = process.cwd();

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

/**
 * `fs.openAsBlob` (Node 19+) streams the tarball off disk instead of buffering
 * it in memory. It is accessed via the `fs` namespace and feature-detected
 * rather than statically imported — a named import of an export that doesn't
 * exist on older Node throws at module load and would break *every* command,
 * not just `publish`. Fall back to a `Blob` built from `readFileSync` (the
 * 50 MB upload cap keeps this bounded) where it is unavailable.
 */
async function tarballBlob(path: string): Promise<Blob> {
  if (typeof fs.openAsBlob === 'function') {
    return fs.openAsBlob(path, { type: 'application/gzip' });
  }
  return new Blob([readFileSync(path)], { type: 'application/gzip' });
}

// --------------------------------------------------------------- manifest

async function runManifest(): Promise<void> {
  const distEntry = resolve(projectRoot, 'dist', 'index.js');
  if (!existsSync(distEntry)) {
    fail('dist/index.js is missing. Run the build (tsup) before `rvnxx-nodes manifest`.');
  }

  const mod = (await import(pathToFileURL(distEntry).href)) as { NODES?: unknown };
  if (!Array.isArray(mod.NODES)) {
    fail('dist/index.js does not export a `NODES` array. Export `NODES: INode[]` from your package entry.');
  }

  const manifest = buildManifest(mod.NODES as INode[]);

  const outDir = resolve(projectRoot, 'dist');
  const outFile = resolve(outDir, 'manifest.json');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify(manifest, null, 2), 'utf-8');

  console.log(`✓ dist/manifest.json — ${manifest.nodes.length} node(s)`);
  for (const m of manifest.nodes) {
    console.log(`  ${m.slug}@${m.version}`);
  }
}

// ---------------------------------------------------------------- publish

function loadDotEnv(): void {
  const envPath = resolve(projectRoot, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    process.env[key] ??= value;
  }
}

async function runPublish(): Promise<void> {
  // .env in the project root, parsed before reading config.
  loadDotEnv();

  const baseUrl = process.env['INTEGRATIONS_URL']?.replace(/\/$/, '');
  const token = process.env['INTEGRATIONS_TOKEN'];
  const insecure = process.env['INTEGRATIONS_INSECURE'] === 'true';

  if (insecure) {
    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
  }
  if (!baseUrl) fail('INTEGRATIONS_URL is not set');
  if (!token) fail('INTEGRATIONS_TOKEN is not set');

  // `dist/manifest.json` is produced by `rvnxx-nodes manifest` (part of the
  // package's `build` script) and is the registry's required artifact.
  // Without it the upload still works locally but the server rejects the
  // tarball with an opaque 422 — fail fast here with a clear remedy instead.
  const manifestPath = resolve(projectRoot, 'dist', 'manifest.json');
  if (!existsSync(manifestPath)) {
    fail('dist/manifest.json is missing. Run `npm run build` before `npm run publish`.');
  }

  const pkg = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf-8')) as {
    name: string;
    version: string;
  };

  console.log(`Packing ${pkg.name}@${pkg.version}…`);

  // Pack into a throwaway directory so the resulting .tgz never pollutes the
  // repo root. The directory is wiped on process exit regardless of branch.
  const packDir = mkdtempSync(join(tmpdir(), 'rvnxx-pack-'));
  process.on('exit', () => {
    rmSync(packDir, { recursive: true, force: true });
  });

  // `npm pack --json` writes the tarball into --pack-destination and prints a
  // JSON array describing the result. Capturing it is more robust than
  // guessing the filename (scoped names get rewritten, e.g.
  // `@revenexx/foo` -> `revenexx-foo-x.y.z.tgz`).
  const pack = spawnSync('npm', ['pack', '--json', '--pack-destination', packDir], {
    cwd: projectRoot,
    encoding: 'utf-8',
  });

  if (pack.error || pack.status !== 0) {
    if (pack.error) console.error(`Failed to spawn npm: ${pack.error.message}`);
    const stderr = pack.stderr?.toString().trim();
    const stdout = pack.stdout?.toString().trim();
    if (stderr) console.error(stderr);
    else if (stdout) console.error(stdout);
    if (pack.status === null && !pack.error) console.error('npm pack exited without a status code');
    process.exit(1);
  }

  let packResults: Array<{ filename: string }>;
  try {
    packResults = JSON.parse(pack.stdout) as Array<{ filename: string }>;
  } catch (e) {
    console.error(`Failed to parse npm pack --json output: ${(e as Error).message}`);
    console.error('stdout:', pack.stdout);
    console.error('stderr:', pack.stderr);
    process.exit(1);
  }

  const tarballName = packResults[0]?.filename;
  if (!tarballName) fail('npm pack produced no output');

  const tarballPath = resolve(packDir, tarballName);
  console.log(`  produced ${tarballName}`);

  const fileBlob = await tarballBlob(tarballPath);
  const form = new FormData();
  form.set('tarball', fileBlob, tarballName);

  console.log(`Uploading to ${baseUrl}/api/v1/node-packages…`);

  const response = await fetch(`${baseUrl}/api/v1/node-packages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      // No Content-Type: fetch sets the correct multipart boundary itself.
    },
    body: form,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    console.error(`Error: ${response.status} ${response.statusText}`);
    console.error(isJson ? JSON.stringify(body, null, 2) : body);
    process.exit(1);
  }

  const result = body as { name?: string; version?: string; node_count?: number };
  console.log(`✓ Registered ${result.name}@${result.version} (${result.node_count ?? '?'} node(s))`);
}

// ------------------------------------------------------------------- main

async function main(): Promise<void> {
  const command = process.argv[2];
  switch (command) {
    case 'manifest':
      await runManifest();
      break;
    case 'publish':
      await runPublish();
      break;
    default:
      console.error('Usage: rvnxx-nodes <manifest|publish>');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
