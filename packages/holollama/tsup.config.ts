import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  target: 'node20',
  external: ['@holoscript/core', '@holoscript/core/compiler', '@holoscript/core/parser'],
});
