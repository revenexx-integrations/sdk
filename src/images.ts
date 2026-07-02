import * as fs from 'node:fs';
import { dirname, isAbsolute, normalize, resolve, sep } from 'node:path';
import type { IImage } from './types.js';

/** Something that may carry an `images` array (a node/credential/template manifest). */
interface WithImages {
  images?: IImage[];
}

/**
 * Collect the unique `src` of every image declared across all nodes,
 * credential types, and templates in a manifest.
 */
export function collectImageSources(manifest: {
  nodes?: WithImages[];
  credentials?: WithImages[];
  templates?: WithImages[];
}): string[] {
  const sources = new Set<string>();
  for (const group of [manifest.nodes, manifest.credentials, manifest.templates]) {
    for (const item of group ?? []) {
      for (const image of item.images ?? []) {
        if (typeof image.src === 'string' && image.src.length > 0) {
          sources.add(image.src);
        }
      }
    }
  }
  return [...sources];
}

/**
 * Copy declared image files into `dist/`, preserving their sub-path
 * (`images/x.png` → `dist/images/x.png`) so `npm pack` picks them up via the
 * package's `files: ["dist"]`. Sources are resolved relative to `rootDir`
 * (the package root, `process.cwd()`).
 *
 * Every problematic declaration warns and is skipped rather than throwing, so a
 * stale manifest never breaks the build: this covers a missing file, a `src`
 * that is a directory rather than a file, and — defensively — an unsafe `src`
 * that is absolute or escapes the package root via `..` traversal (which would
 * otherwise read/write outside `dist/`).
 */
export function copyImages(sources: string[], outDir: string, rootDir: string): void {
  let copied = 0;
  for (const src of sources) {
    if (!isSafeRelativePath(src)) {
      console.warn(`  ⚠ unsafe image path (absolute or escaping the package root), skipping: ${src}`);
      continue;
    }
    const from = resolve(rootDir, src);
    if (!fs.existsSync(from)) {
      console.warn(`  ⚠ image not found, skipping: ${src}`);
      continue;
    }
    if (!fs.statSync(from).isFile()) {
      console.warn(`  ⚠ image path is not a file, skipping: ${src}`);
      continue;
    }
    const to = resolve(outDir, src);
    fs.mkdirSync(dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copied++;
  }
  if (sources.length > 0) {
    console.log(`  copied ${copied}/${sources.length} image(s) into dist/`);
  }
}

/**
 * A `src` is safe to copy only when it is a relative path that stays within the
 * package root — i.e. not absolute and not escaping via `..`. Internal `..`
 * segments that normalise back inside the root (e.g. `a/../b`) are fine.
 */
function isSafeRelativePath(src: string): boolean {
  if (isAbsolute(src)) {
    return false;
  }
  const normalized = normalize(src);

  return normalized !== '..' && !normalized.startsWith('..'+sep);
}
