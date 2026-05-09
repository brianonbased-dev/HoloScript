import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@holoscript/core': resolve(__dirname, 'src/index.ts'),
    },
  },
  test: {
    name: '@holoscript/platform',
    root: '.',
    include: ['src/**/*.test.ts', 'renderer/src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    environment: 'node',
  },
});
