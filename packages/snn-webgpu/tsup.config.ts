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
  // webgpu is a native Node addon (Dawn) — must NOT be bundled inline.
  // Inline bundling replaces import.meta.url with {} which breaks the
  // native .node binary path resolution (dawnNodePath). External ensures
  // the package resolves its own __dirname at runtime.
  external: ['webgpu'],
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
