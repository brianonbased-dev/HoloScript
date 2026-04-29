import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@holoscript\/core$/, replacement: resolve(__dirname, '../core/src/index.ts') },
      { find: /^@holoscript\/core-types$/, replacement: resolve(__dirname, '../core-types/src/index.ts') },
      { find: /^@holoscript\/core-types\/ans$/, replacement: resolve(__dirname, '../core-types/src/ans.ts') },
    ],
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
