import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false, // core has dts:false — types flow through TypeScript project references
  clean: true,
  sourcemap: true,
  external: ['@holoscript/core'],
});
