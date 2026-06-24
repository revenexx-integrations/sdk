import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  // The CLI is a bin, never imported as a library — only emit declarations
  // for the library entry, not dead `dist/cli.d.ts`.
  dts: { entry: ['src/index.ts'] },
  clean: true,
  // No sourcemaps in the published artifact: this is a thin contract/types
  // library, src/ isn't shipped, and the .d.ts already drives type navigation.
  // Shipping maps without sources would be pure install weight.
  sourcemap: false,
});
