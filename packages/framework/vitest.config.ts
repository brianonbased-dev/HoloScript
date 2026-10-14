import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@holoscript\/core\/parser$/, replacement: resolve(__dirname, '../core/src/parser/index.ts') },
      { find: /^@holoscript\/core$/, replacement: resolve(__dirname, '../core/src/index.ts') },
    ],
  },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
  },
});
