import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  shims: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  minify: false,
  external: [
    '@holoscript/snn-webgpu',
  ],
});
