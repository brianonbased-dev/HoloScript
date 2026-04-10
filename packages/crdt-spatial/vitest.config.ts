import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@holoscript/crdt-spatial',
    root: '.',
    include: ['src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    environment: 'node',
    passWithNoTests: true,
  },
});
