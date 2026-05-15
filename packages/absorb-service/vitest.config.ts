import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: [{ find: /^@holoscript\/core$/, replacement: path.resolve(__dirname, '../core/src/index.ts') }],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
    hookTimeout: 60_000,
    testTimeout: 60_000,
    passWithNoTests: true,
  },
});
