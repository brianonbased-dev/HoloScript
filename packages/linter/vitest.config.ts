import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: [{ find: /^@holoscript\/core$/, replacement: path.resolve(__dirname, '../core/src/index.ts') }],
  },
});
