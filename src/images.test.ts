import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { collectImageSources, copyImages } from './images.js';

test('collectImageSources returns the unique src across nodes, credentials, templates', () => {
  const sources = collectImageSources({
    nodes: [{ images: [{ src: 'images/a.png', alt: 'a', category: 'screenshot' }] }],
    credentials: [{ images: [{ src: 'images/b.svg', alt: 'b', category: 'logo' }] }],
    templates: [
      { images: [{ src: 'images/a.png', alt: 'a again', category: 'banner' }] }, // duplicate src
    ],
  });

  assert.deepEqual([...sources].sort(), ['images/a.png', 'images/b.svg']);
});

test('collectImageSources is empty when nothing declares images', () => {
  assert.deepEqual(collectImageSources({ nodes: [{}], credentials: [{}], templates: [{}] }), []);
});

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(join(tmpdir(), 'rvnxx-images-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('copyImages copies declared files into dist preserving the sub-path', () => {
  fs.mkdirSync(resolve(root, 'images'), { recursive: true });
  fs.writeFileSync(resolve(root, 'images', 'screenshot.png'), 'PNGDATA');
  const outDir = resolve(root, 'dist');

  copyImages(['images/screenshot.png'], outDir, root);

  const copied = resolve(outDir, 'images', 'screenshot.png');
  assert.ok(fs.existsSync(copied), 'image should be copied under dist/images/');
  assert.equal(fs.readFileSync(copied, 'utf-8'), 'PNGDATA');
});

test('copyImages warns and does not throw when a declared file is missing', () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (msg: string) => {
    warnings.push(msg);
  };
  const outDir = resolve(root, 'dist');

  try {
    assert.doesNotThrow(() => copyImages(['images/missing.png'], outDir, root));
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(fs.existsSync(resolve(outDir, 'images', 'missing.png')), false);
  assert.ok(warnings.some((w) => w.includes('images/missing.png')));
});
