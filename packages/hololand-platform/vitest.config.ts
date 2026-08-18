import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@hololand/platform-services',
    root: '.',
    include: ['src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    environment: 'node',
  },
});
