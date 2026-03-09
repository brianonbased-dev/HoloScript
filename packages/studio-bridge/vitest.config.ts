import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@holoscript/studio-bridge',
    include: ['src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    environment: 'node',
  },
});
