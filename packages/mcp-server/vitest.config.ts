import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Only alias packages whose source is esbuild-compatible.
      // Engine and Framework must resolve via pnpm workspace → dist files
      // because their source uses TypeScript features esbuild can't transform.
      '@holoscript/core': path.resolve(__dirname, '../core/src/index.ts'),
      '@holoscript/agent-protocol': path.resolve(__dirname, '../agent-protocol/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'examples/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    passWithNoTests: true,
  },
});
