import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@holoscript/core': resolve(__dirname, '../core/src/index.ts'),
      '@holoscript/core-types': resolve(__dirname, '../core-types/src/index.ts'),
    },
  },
  test: {
    name: '@holoscript/semantic-2d',
    include: ['src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    environment: 'node',
    clearMocks: true,
    restoreMocks: true,
  },
});
