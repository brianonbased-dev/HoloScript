import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'examples/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    passWithNoTests: true,
  },
});
