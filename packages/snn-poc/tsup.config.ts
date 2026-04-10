import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'es2020',
  outDir: 'dist',
  loader: {
    '.wgsl': 'text',
  },
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      '.wgsl': 'text',
    };
  },
});
