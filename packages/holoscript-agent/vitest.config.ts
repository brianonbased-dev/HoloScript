import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@holoscript/holoscript-agent',
    root: '.',
    include: ['src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    environment: 'node',
  },
});
