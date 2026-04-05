import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    behavior: 'src/behavior.ts',
    'agents/index': 'src/agents/index.ts',
    'economy/index': 'src/economy/index.ts',
    'swarm/index': 'src/swarm/index.ts',
    'ai/index': 'src/ai/index.ts',
    'training/index': 'src/training/index.ts',
    'learning/index': 'src/learning/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
  external: ['@holoscript/core'],
});
