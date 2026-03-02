import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      all: true,
      include: [
        'packages/core/src/**/*.ts',
        'packages/lsp/src/**/*.ts',
        'packages/vscode-extension/src/**/*.ts',
        'packages/graphql-api/src/**/*.ts',
        'packages/mcp-server/src/**/*.ts',
        'packages/marketplace-web/src/**/*.ts',
        'packages/marketplace-api/src/**/*.ts',
        'packages/llm-provider/src/**/*.ts',
        'packages/studio/src/**/*.ts',
        'packages/cli/src/**/*.ts',
        'packages/formatter/src/**/*.ts',
        'packages/linter/src/**/*.ts',
        'packages/partner-sdk/src/**/*.ts',
        'packages/adapter-postgres/src/**/*.ts',
        'packages/collab-server/src/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.prod.test.ts',
        '**/*.d.ts',
        '**/*.js',
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/__snapshots__/**',
        '**/__mocks__/**',
        '**/examples/**',
      ],
      reporter: ['text-summary', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      thresholds: {
        // Baseline — ratchet upward after initial measurement
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
      },
    },
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

