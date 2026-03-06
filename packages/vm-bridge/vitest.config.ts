import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: { globals: true, environment: 'node', include: ['src/**/*.test.ts'] },
  resolve: {
    alias: {
      '@holoscript/holo-vm': path.resolve(__dirname, '../holo-vm/src/index.ts'),
      '@holoscript/uaal': path.resolve(__dirname, '../uaal/src/index.ts'),
    },
  },
});
