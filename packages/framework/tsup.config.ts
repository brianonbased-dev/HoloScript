import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    behavior: 'src/behavior.ts',
    'agents/index': 'src/agents/index.ts',
    'ai/index': 'src/ai/index.ts',
    'economy/index': 'src/economy/index.ts',
    'learning/index': 'src/learning/index.ts',
    'negotiation/index': 'src/negotiation/index.ts',
    'skills/index': 'src/skills/index.ts',
    'swarm/index': 'src/swarm/index.ts',
    'training/index': 'src/training/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: false,
  clean: false,
  splitting: false,
  external: ['@holoscript/core'],
});
