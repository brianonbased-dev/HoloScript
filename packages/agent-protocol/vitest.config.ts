import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@holoscript\/framework$/,
        replacement: path.resolve(__dirname, '../framework/src/index.ts'),
      },
      {
        find: /^@holoscript\/core$/,
        replacement: path.resolve(__dirname, '../core/src/index.ts'),
      },
    ],
  },
  test: { globals: true, environment: 'node', include: ['src/**/*.test.ts'] },
});
