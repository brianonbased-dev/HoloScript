import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters/bitnet': 'src/adapters/bitnet.ts',
    'adapters/openai': 'src/adapters/openai.ts',
    'adapters/anthropic': 'src/adapters/anthropic.ts',
    'adapters/gemini': 'src/adapters/gemini.ts',
  },
  format: ['esm', 'cjs'],
  dts: false,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: ['@holoscript/core', 'openai', '@anthropic-ai/sdk'],
});
