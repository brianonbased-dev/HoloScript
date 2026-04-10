import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@holoscript/studio-plugin-sdk': resolve(__dirname, 'src/index.ts'),
    },
  },
  test: {
    name: 'studio-plugin-sdk',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 15000,
    clearMocks: true,
    environmentMatchGlobs: [['src/sandbox/**/*.test.ts', 'jsdom']],
  },
});
