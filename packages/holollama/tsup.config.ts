import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/brain.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  dts: {
    compilerOptions: {
      module: 'ESNext',
      moduleResolution: 'bundler',
    },
  },
  clean: true,
  sourcemap: true,
  shims: true,
  splitting: false,
  target: 'node20',
  external: ['@holoscript/core', '@holoscript/core/compiler', '@holoscript/core/parser'],
});
