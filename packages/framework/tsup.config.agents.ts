import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'agents/index': 'src/agents/index.ts',
    'economy/index': 'src/economy/index.ts',
    'swarm/index': 'src/swarm/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: false,
  clean: false,
  splitting: false,
  external: ['@holoscript/core'],
});
