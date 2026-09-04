import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { collectImageSources, copyImages } from './images.js';

// AC-1 — Every declared picture is collected once, wherever it was declared
test('collectImageSources returns the unique src across nodes, credentials, templates [@spec:node-images:AC-1]', () => {
  const sources = collectImageSources({
    nodes: [{ images: [{ src: 'images/a.png', alt: 'a', category: 'screenshot' }] }],
    credentials: [{ images: [{ src: 'images/b.svg', alt: 'b', category: 'logo' }] }],
    templates: [
      { images: [{ src: 'images/a.png', alt: 'a again', category: 'banner' }] }, // duplicate src
    ],
  });

  assert.deepEqual([...sources].sort(), ['images/a.png', 'images/b.svg']);
});

// AC-2 — A package declaring nothing collects nothing
test('collectImageSources is empty when nothing declares images [@spec:node-images:AC-2]', () => {
  assert.deepEqual(collectImageSources({ nodes: [{}], credentials: [{}], templates: [{}] }), []);
});

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(join(tmpdir(), 'rvnxx-images-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

// AC-3 — A declared file is copied into the build under the path it was declared as
test('copyImages copies declared files into dist preserving the sub-path [@spec:node-images:AC-3]', () => {
  fs.mkdirSync(resolve(root, 'images'), { recursive: true });
  fs.writeFileSync(resolve(root, 'images', 'screenshot.png'), 'PNGDATA');
  const outDir = resolve(root, 'dist');

  copyImages(['images/screenshot.png'], outDir, root);

  const copied = resolve(outDir, 'images', 'screenshot.png');
  assert.ok(fs.existsSync(copied), 'image should be copied under dist/images/');
  assert.equal(fs.readFileSync(copied, 'utf-8'), 'PNGDATA');
});

/**
 * Run `copyImages` with `console.warn` captured. Uses a rest parameter so the
 * stub stays assignable to Node's `console.warn(...data: unknown[])` signature.
 */
function copyImagesCapturingWarnings(sources: string[], outDir: string, rootDir: string): string[] {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };

  try {
    copyImages(sources, outDir, rootDir);
  } finally {
    console.warn = originalWarn;
  }

  return warnings;
}

// AC-4 — A declared file that is not there is reported, and the build goes on
test('copyImages warns and does not throw when a declared file is missing [@spec:node-images:AC-4]', () => {
  const outDir = resolve(root, 'dist');

  let warnings: string[] = [];
  assert.doesNotThrow(() => {
    warnings = copyImagesCapturingWarnings(['images/missing.png'], outDir, root);
  });

  assert.equal(fs.existsSync(resolve(outDir, 'images', 'missing.png')), false);
  assert.ok(warnings.some((w) => w.includes('images/missing.png')));
});

// AC-5 — A path that would reach outside the package is refused
test('copyImages warns and skips an absolute src instead of escaping dist/ [@spec:node-images:AC-5]', () => {
  const outDir = resolve(root, 'dist');

  const warnings = copyImagesCapturingWarnings(['/etc/passwd'], outDir, root);

  assert.equal(fs.existsSync(resolve(outDir, 'etc', 'passwd')), false);
  assert.ok(warnings.some((w) => w.includes('unsafe') && w.includes('/etc/passwd')));
});

// AC-5 — A path that would reach outside the package is refused
test('copyImages warns and skips a src that escapes the package root via .. [@spec:node-images:AC-5]', () => {
  const outDir = resolve(root, 'dist');

  const warnings = copyImagesCapturingWarnings(['../../secret.png'], outDir, root);

  assert.ok(warnings.some((w) => w.includes('unsafe') && w.includes('../../secret.png')));
});

// AC-6 — A declaration pointing at something that is not a file is refused
test('copyImages warns and skips when src points at a directory [@spec:node-images:AC-6]', () => {
  fs.mkdirSync(resolve(root, 'images'), { recursive: true });
  const outDir = resolve(root, 'dist');

  let warnings: string[] = [];
  assert.doesNotThrow(() => {
    warnings = copyImagesCapturingWarnings(['images'], outDir, root);
  });

  assert.ok(warnings.some((w) => w.includes('not a file') && w.includes('images')));
});
