import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'skills/index': 'src/skills/index.ts',
    'negotiation/index': 'src/negotiation/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: false,
  clean: false,
  splitting: false,
  external: ['@holoscript/core'],
});
