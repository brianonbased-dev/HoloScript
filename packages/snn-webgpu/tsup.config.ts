import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  // Emit d.ts so engine consumers (engine/src/simulation/SNNCognitionEngine.ts)
  // get a real declaration file. Previously `dts: false` left consumers
  // with implicit-any imports (TS7016) that blocked studio strict tsc.
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
