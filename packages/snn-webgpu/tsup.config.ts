import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'es2020',
  outDir: 'dist',
  loader: {
    '.wgsl': 'text',
  },
  // Inline WGSL shader sources as strings
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      '.wgsl': 'text',
    };
  },
});
