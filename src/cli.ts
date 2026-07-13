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
import { collectImageSources, copyImages } from './images.js';
import { buildManifest, parsePackageMeta } from './manifest.js';
import type { ICredential, INode, ITemplateDescription } from './types.js';

const projectRoot = process.cwd();

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

/**
 * Read and parse the package's `package.json`. Returns `{}` when it is missing
 * or unparseable — its structural validity is enforced by the integrations
 * server on upload, so tooling stays lenient and lets {@link parsePackageMeta}
 * coerce the result.
 */
function readPackageJson(root: string): unknown {
  const pkgPath = resolve(root, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } catch {
    return {};
  }
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
    TEMPLATES?: unknown;
  };
  if (!Array.isArray(mod.NODES)) {
    fail('dist/index.js does not export a `NODES` array. Export `NODES: INode[]` from your package entry.');
  }
  if (mod.CREDENTIALS !== undefined && !Array.isArray(mod.CREDENTIALS)) {
    fail('dist/index.js exports `CREDENTIALS` but it is not an array. Export `CREDENTIALS: ICredential[]`.');
  }
  if (mod.TEMPLATES !== undefined && !Array.isArray(mod.TEMPLATES)) {
    fail('dist/index.js exports `TEMPLATES` but it is not an array. Export `TEMPLATES: ITemplateDescription[]`.');
  }

  const credentials = (mod.CREDENTIALS as ICredential[] | undefined) ?? [];
  const templates = (mod.TEMPLATES as ITemplateDescription[] | undefined) ?? [];

  // The bundle label (`revenexx.displayName`) is read straight from
  // package.json by the integrations server on upload — the CLI reads it only
  // to warn when it is missing and to annotate the log line below.
  const meta = parsePackageMeta(readPackageJson(projectRoot));
  const hasPackage = meta.name !== '' && meta.version !== '';
  // Warn about a missing label only when there IS a package to label — a
  // missing/unparseable package.json is a separate (bigger) problem.
  if (hasPackage && !meta.displayName) {
    console.warn(
      '⚠ package.json has no "revenexx.displayName" — the node palette will fall back to the raw package name.',
    );
  }

  const manifest = buildManifest(mod.NODES as INode[], credentials, templates);

  const outDir = resolve(projectRoot, 'dist');
  const outFile = resolve(outDir, 'manifest.json');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2), 'utf-8');

  const credentialCount = manifest.credentials?.length ?? 0;
  const templateCount = manifest.templates?.length ?? 0;
  const bundlePrefix = hasPackage
    ? `package ${meta.displayName ? `"${meta.displayName}" ` : ''}(${meta.name}), `
    : '';
  console.log(
    `✓ dist/manifest.json — ${bundlePrefix}` +
      `${manifest.nodes.length} node(s), ${credentialCount} credential(s), ${templateCount} template(s)`,
  );
  for (const m of manifest.nodes) {
    console.log(`  node       ${m.slug}@${m.version}`);
  }
  for (const c of manifest.credentials ?? []) {
    console.log(`  credential ${c.slug}@${c.version} (${c.authKind})`);
  }
  for (const t of manifest.templates ?? []) {
    console.log(`  template   ${t.slug}@${t.version} (${t.level})`);
  }

  copyImages(collectImageSources(manifest), outDir, projectRoot);
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
