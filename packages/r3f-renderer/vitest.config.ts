import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@holoscript/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    pool: 'forks',
    testTimeout: 15000,
    clearMocks: true,
    restoreMocks: true,
  },
});
