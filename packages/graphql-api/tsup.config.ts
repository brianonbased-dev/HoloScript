import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/server.ts'],
  format: ['esm', 'cjs'],
  dts: false, // Skip DTS generation for POC - will enable after fixing compiler imports
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['@holoscript/core'],
});
