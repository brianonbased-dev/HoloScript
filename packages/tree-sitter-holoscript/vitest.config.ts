import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'tree-sitter-holoscript',
    include: ['src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**', '**/build/**'],
    environment: 'node',
    testTimeout: 15000,
    clearMocks: true,
    restoreMocks: true,
  },
});
