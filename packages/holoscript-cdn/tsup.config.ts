import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  outDir: 'dist',
  outExtension({ format }) {
    return { js: format === 'esm' ? '.cdn.mjs' : '.cdn.js' };
  },
});
