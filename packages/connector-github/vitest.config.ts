import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    server: {
      deps: {
        inline: ['@octokit/rest', '@octokit/core', '@octokit/plugin-rest-endpoint-methods', '@octokit/plugin-paginate-rest'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '__tests__/', '*.config.ts'],
    },
  },
});
