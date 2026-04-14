import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@holoscript/core': resolve(__dirname, '../core/src/index.ts'),
      '@holoscript/framework/agents': resolve(__dirname, '../framework/src/agents/index.ts'),
      '@holoscript/framework/behavior': resolve(__dirname, '../framework/src/behavior.ts'),
      '@holoscript/framework/economy': resolve(__dirname, '../framework/src/economy/index.ts'),
      '@holoscript/framework/learning': resolve(__dirname, '../framework/src/learning/index.ts'),
      '@holoscript/framework/training': resolve(__dirname, '../framework/src/training/index.ts'),
      '@holoscript/framework/skills': resolve(__dirname, '../framework/src/skills/index.ts'),
      '@holoscript/framework/swarm': resolve(__dirname, '../framework/src/swarm/index.ts'),
      '@holoscript/framework': resolve(__dirname, '../framework/src/index.ts'),
    },
  },
  test: {
    clearMocks: true,
    restoreMocks: true,
  },
});
