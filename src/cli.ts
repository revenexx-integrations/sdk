#!/usr/bin/env node
/**
 * `rvnxx-nodes` — shared tooling for Revenexx node packages.
 *
 * Subcommands:
 *   rvnxx-nodes manifest   Read the package's built `NODES` export and write
 *                          `dist/manifest.json`. Run after `tsup`.
 *
 * Everything operates on the current working directory (`process.cwd()`),
 * so the same binary works from any node package that depends on the SDK.
 *
 * Node packages are NOT published from the repos themselves — registration
 * happens through the Revenexx Console/Cockpit (and, for local development,
 * via `integrations/scripts/update-dev.sh`, which uploads the packed tarball
 * to the admin API). Hence there is no `publish` subcommand here.
 */

import * as fs from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildManifest } from './manifest.js';
import type { ICredential, INode } from './types.js';

const projectRoot = process.cwd();

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

// --------------------------------------------------------------- manifest

async function runManifest(): Promise<void> {
  const distEntry = resolve(projectRoot, 'dist', 'index.js');
  if (!fs.existsSync(distEntry)) {
    fail('dist/index.js is missing. Run the build (tsup) before `rvnxx-nodes manifest`.');
  }

  const mod = (await import(pathToFileURL(distEntry).href)) as {
    NODES?: unknown;
    CREDENTIALS?: unknown;
  };
  if (!Array.isArray(mod.NODES)) {
    fail('dist/index.js does not export a `NODES` array. Export `NODES: INode[]` from your package entry.');
  }
  if (mod.CREDENTIALS !== undefined && !Array.isArray(mod.CREDENTIALS)) {
    fail('dist/index.js exports `CREDENTIALS` but it is not an array. Export `CREDENTIALS: ICredential[]`.');
  }

  const credentials = (mod.CREDENTIALS as ICredential[] | undefined) ?? [];
  const manifest = buildManifest(mod.NODES as INode[], credentials);

  const outDir = resolve(projectRoot, 'dist');
  const outFile = resolve(outDir, 'manifest.json');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2), 'utf-8');

  const credentialCount = manifest.credentials?.length ?? 0;
  console.log(`✓ dist/manifest.json — ${manifest.nodes.length} node(s), ${credentialCount} credential(s)`);
  for (const m of manifest.nodes) {
    console.log(`  node       ${m.slug}@${m.version}`);
  }
  for (const c of manifest.credentials ?? []) {
    console.log(`  credential ${c.slug}@${c.version} (${c.authKind})`);
  }
}

// ------------------------------------------------------------------- main

async function main(): Promise<void> {
  const command = process.argv[2];
  switch (command) {
    case 'manifest':
      await runManifest();
      break;
    case 'publish':
      console.error(
        'The `publish` command has been removed. Node packages are no longer ' +
          'published from the repos themselves — registration happens through the ' +
          'Revenexx Console/Cockpit. For local development, use ' +
          '`integrations/scripts/register-nodes-core.sh`, which packs and uploads ' +
          'the tarball to the admin API.',
      );
      process.exit(1);
    default:
      console.error('Usage: rvnxx-nodes <manifest>');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
