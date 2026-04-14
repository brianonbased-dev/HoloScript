import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'ai/index': 'src/ai/index.ts',
    'training/index': 'src/training/index.ts',
    'learning/index': 'src/learning/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: false,
  clean: false,
  splitting: false,
  external: ['@holoscript/core'],
});
