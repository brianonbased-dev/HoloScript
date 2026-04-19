import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@holoscript/core': resolve(__dirname, '../core/src/index.ts'),
      '@holoscript/core/reconstruction': resolve(__dirname, '../core/src/reconstruction/index.ts'),
    },
  },
  test: {
    clearMocks: true,
    restoreMocks: true,
  },
});
