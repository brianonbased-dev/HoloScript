import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: [
      // Sub-path exports must be listed before the bare package alias
      {
        find: /^@holoscript\/core\/compiler\/(.+)$/,
        replacement: path.resolve(__dirname, '../core/src/compiler/$1.ts'),
      },
      {
        find: /^@holoscript\/core\/parser\/(.+)$/,
        replacement: path.resolve(__dirname, '../core/src/parser/$1.ts'),
      },
      {
        find: /^@holoscript\/core$/,
        replacement: path.resolve(__dirname, '../core/src/index.ts'),
      },
    ],
  },
  test: {
    include: ['src/**/*.test.ts'],
    globals: true,
    testTimeout: 30000,
  },
});
