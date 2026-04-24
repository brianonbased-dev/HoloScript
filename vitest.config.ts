import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@holoscript/framework': resolve(__dirname, './packages/framework/src'),
      '@holoscript/engine': resolve(__dirname, './packages/engine/src')
    }
  },
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
        'packages/auth/src/**/*.ts',
        'packages/llm-provider/src/**/*.ts',
        'packages/studio/src/**/*.ts',
        'packages/cli/src/**/*.ts',
        'packages/formatter/src/**/*.ts',
        'packages/linter/src/**/*.ts',
        'packages/partner-sdk/src/**/*.ts',
        'packages/adapter-postgres/src/**/*.ts',
        'packages/collab-server/src/**/*.ts',
        'packages/registry/src/**/*.ts',
        'packages/runtime/src/**/*.ts',
        'packages/fs/src/**/*.ts',
        'packages/security-sandbox/src/**/*.ts',
        'packages/ai-validator/src/**/*.ts',
        'packages/holoscript-cdn/src/**/*.ts',
        'packages/std/src/**/*.ts',
        'packages/animation-presets/src/**/*.ts',
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
      // ── Packages with their own vitest.config.ts ──────────────────────
      // 2026-04-23: absolute paths via resolve(__dirname, ...) — relative
      // paths resolve against CWD, which breaks when `vitest run` is
      // invoked from inside a sub-package that lacks its own config.
      // See packages/marketplace-agentkit/vitest.config.ts (commit
      // 31cfd53ad) for the bug this prevents.
      resolve(__dirname, 'packages/core/vitest.config.ts'),
      resolve(__dirname, 'packages/cli/vitest.config.ts'),
      resolve(__dirname, 'packages/formatter/vitest.config.ts'),
      resolve(__dirname, 'packages/linter/vitest.config.ts'),
      resolve(__dirname, 'packages/lsp/vitest.config.ts'),
      resolve(__dirname, 'packages/vscode-extension/vitest.config.ts'),
      resolve(__dirname, 'packages/adapter-postgres/vitest.config.ts'),
      resolve(__dirname, 'packages/mcp-server/vitest.config.ts'),
      resolve(__dirname, 'packages/partner-sdk/vitest.config.ts'),
      resolve(__dirname, 'packages/security-sandbox/vitest.config.ts'),
      resolve(__dirname, 'packages/ai-validator/vitest.config.ts'),
      resolve(__dirname, 'packages/comparative-benchmarks/vitest.config.ts'),
      resolve(__dirname, 'packages/llm-provider/vitest.config.ts'),
      resolve(__dirname, 'packages/registry/vitest.config.ts'),
      resolve(__dirname, 'packages/holoscript-cdn/vitest.config.ts'),
      resolve(__dirname, 'packages/runtime/vitest.config.ts'),
      resolve(__dirname, 'packages/fs/vitest.config.ts'),
      resolve(__dirname, 'packages/playground/vitest.config.ts'),
      resolve(__dirname, 'packages/collab-server/vitest.config.ts'),
      resolve(__dirname, 'packages/studio/vitest.config.ts'),
      resolve(__dirname, 'packages/studio-plugin-sdk/vitest.config.ts'),
      resolve(__dirname, 'packages/react-agent-sdk/vitest.config.ts'),
      resolve(__dirname, 'packages/preview-component/vitest.config.ts'),
      resolve(__dirname, 'packages/marketplace-web/vitest.config.ts'),
      resolve(__dirname, 'packages/marketplace-api/vitest.config.ts'),
      resolve(__dirname, 'packages/auth/vitest.config.ts'),
      resolve(__dirname, 'packages/animation-presets/vitest.config.ts'),
      resolve(__dirname, 'packages/connector-upstash/vitest.config.ts'),
      resolve(__dirname, 'packages/compiler-wasm/vitest.config.ts'),
      resolve(__dirname, 'packages/visualizer-client/vitest.config.ts'),
      resolve(__dirname, 'packages/tree-sitter-holoscript/vitest.config.ts'),
      resolve(__dirname, 'packages/video-tutorials/vitest.config.ts'),

      // ── Packages without a vitest.config.ts (inline) ─────────────────
      // 'packages/test/vitest.config.ts', // removed: package deleted
      {
        test: {
          name: '@holoscript/benchmark',
          root: './packages/benchmark',
          include: ['src/**/*.test.ts'],
          exclude: ['**/dist/**', '**/node_modules/**'],
          environment: 'node',
        },
      },
      {
        test: {
          name: '@holoscript/sdk',
          root: './packages/holoscript',
          include: ['src/**/*.test.ts'],
          exclude: ['**/dist/**', '**/node_modules/**'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'std',
          root: './packages/std',
          include: ['src/**/*.test.ts'],
          exclude: ['**/dist/**', '**/node_modules/**'],
          environment: 'node',
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
          name: '@holoscript/core-types',
          root: './packages/core-types',
          include: ['src/**/*.test.ts'],
          exclude: ['**/dist/**', '**/node_modules/**'],
          environment: 'node',
        },
      },
      {
        test: {
          name: '@holoscript/visual',
          root: './packages/visual',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['**/dist/**', '**/node_modules/**'],
          environment: 'node',
        },
      },
      {
        test: {
          name: '@holoscript/hololand-platform',
          root: './packages/hololand-platform',
          include: ['src/**/*.test.ts'],
          exclude: ['**/dist/**', '**/node_modules/**'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'docs-ops',
          root: resolve(__dirname),
          include: ['docs/ops/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**'],
          environment: 'node',
        },
      },
    ],
  },
});
