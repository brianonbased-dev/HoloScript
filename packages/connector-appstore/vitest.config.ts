import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@holoscript/connector-appstore',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    server: {
      deps: {
        inline: ['jsonwebtoken', 'form-data'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '__tests__/', '*.config.ts'],
    },
  },
});
