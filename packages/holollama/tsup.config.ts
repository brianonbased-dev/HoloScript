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
  // Sourcemaps embed the full original source (which trips the public-consumption leak scanner and
  // widens the published surface). Omit them like @holoscript/memory; debug from src, not the tarball.
  sourcemap: false,
  shims: true,
  splitting: false,
  target: 'node20',
  external: ['@holoscript/core', '@holoscript/core/compiler', '@holoscript/core/parser'],
});
