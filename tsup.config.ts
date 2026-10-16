import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  // Declarations come from TypeScript 7's own compiler (tsconfig.build.json):
  // tsup's declaration build needs the compiler API TypeScript 7 no longer ships.
  dts: false,
  clean: true,
  // No sourcemaps in the published artifact: this is a thin contract/types
  // library, src/ isn't shipped, and the .d.ts already drives type navigation.
  // Shipping maps without sources would be pure install weight.
  sourcemap: false,
});
