import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/core/vitest.config.ts',
      'packages/cli/vitest.config.ts',
      'packages/formatter/vitest.config.ts',
      'packages/linter/vitest.config.ts',
      'packages/lsp/vitest.config.ts',
      'packages/vscode-extension/vitest.config.ts',
      'packages/adapter-postgres/vitest.config.ts',
      {
        test: {
          name: 'partner-sdk',
          root: './packages/partner-sdk',
          include: ['src/**/*.test.ts'],
          exclude: ['**/dist/**', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'marketplace-api',
          root: './packages/marketplace-api',
          include: ['src/**/*.test.ts'],
          exclude: ['**/dist/**', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'graphql-api',
          root: './packages/graphql-api',
          include: ['src/**/*.test.ts'],
          exclude: ['**/dist/**', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'mcp-server',
          root: './packages/mcp-server',
          include: ['src/**/*.test.ts'],
          exclude: ['**/dist/**', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'marketplace-web',
          root: './packages/marketplace-web',
          include: ['src/**/*.test.ts'],
          exclude: ['**/dist/**', '**/node_modules/**'],
        },
      },
    ],
  },
});
