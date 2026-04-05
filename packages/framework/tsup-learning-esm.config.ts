import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/learning/index.ts',
  },
  format: ['esm'],
  dts: false,
  clean: false,
  splitting: false,
  external: ['@holoscript/core'],
});
