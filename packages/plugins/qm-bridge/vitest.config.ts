import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@holoscript/engine': resolve(__dirname, '../../engine/src'),
      '@holoscript/core': resolve(__dirname, '../../core/src'),
    },
  },
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
  },
});