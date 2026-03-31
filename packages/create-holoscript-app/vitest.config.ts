import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'create-holoscript-app',
    include: ['src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    environment: 'node',
    passWithNoTests: true,
  },
});
