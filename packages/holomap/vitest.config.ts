import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@holoscript/core/reconstruction', replacement: resolve(__dirname, '../core/src/reconstruction/index.ts') },
      { find: /^@holoscript\/core$/, replacement: resolve(__dirname, '../core/src/index.ts') },
    ],
  },
  test: {
    clearMocks: true,
    restoreMocks: true,
  },
});
