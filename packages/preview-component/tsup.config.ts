import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  external: ['react', 'react-dom', 'three'],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
  // Inject CSS as separate file
  injectStyle: false,
});
