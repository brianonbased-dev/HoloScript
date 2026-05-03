import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@holoscript/core/reconstruction', replacement: resolve(__dirname, '../core/src/reconstruction/index.ts') },
      { find: /^@holoscript\/core$/, replacement: resolve(__dirname, '../core/src/index.ts') },
      { find: '@holoscript/holomap', replacement: resolve(__dirname, '../holomap/src/index.ts') },
    ],
  },
  test: {
    name: 'security-sandbox',
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
