import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@holoscript/connector-upstash',
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '*.config.ts'],
    },
  },
});
