import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@holoscript\/core\/runtime$/,
        replacement: path.resolve(__dirname, '../core/src/runtime.ts'),
      },
      { find: /^@holoscript\/core$/, replacement: path.resolve(__dirname, '../core/src/index.ts') },
    ],
  },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    testTimeout: 10000,
  },
});
