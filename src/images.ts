import * as fs from 'node:fs';
import { dirname, resolve } from 'node:path';
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
 * (the package root, `process.cwd()`). A missing file warns rather than throws
 * so a stale declaration never breaks the build.
 */
export function copyImages(sources: string[], outDir: string, rootDir: string): void {
  let copied = 0;
  for (const src of sources) {
    const from = resolve(rootDir, src);
    if (!fs.existsSync(from)) {
      console.warn(`  ⚠ image not found, skipping: ${src}`);
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
