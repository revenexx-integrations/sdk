import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  // The CLI is a bin, never imported as a library — only emit declarations
  // for the library entry, not dead `dist/cli.d.ts`.
  dts: { entry: ['src/index.ts'] },
  clean: true,
  sourcemap: true,
});
