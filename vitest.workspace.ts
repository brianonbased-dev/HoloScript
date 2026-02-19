export default [
  // ── Packages with their own vitest.config.ts ──────────────────────────
  'packages/core/vitest.config.ts',
  'packages/cli/vitest.config.ts',
  'packages/formatter/vitest.config.ts',
  'packages/linter/vitest.config.ts',
  'packages/lsp/vitest.config.ts',
  'packages/vscode-extension/vitest.config.ts',
  'packages/adapter-postgres/vitest.config.ts',
  'packages/mcp-server/vitest.config.ts',
  'packages/partner-sdk/vitest.config.ts',
  'packages/security-sandbox/vitest.config.ts',
  'packages/ai-validator/vitest.config.ts',
  'packages/comparative-benchmarks/vitest.config.ts',
  'packages/llm-provider/vitest.config.ts',
  'packages/registry/vitest.config.ts',
  'packages/holoscript-cdn/vitest.config.ts',
  'packages/runtime/vitest.config.ts',

  // ── Packages with their own vitest.config.ts (continued) ─────────────
  'packages/playground/vitest.config.ts',

  // ── Packages without a vitest.config.ts (inline) ──────────────────────
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
      name: 'marketplace-api',
      root: './packages/marketplace-api',
      include: ['src/**/*.test.ts'],
      exclude: ['**/dist/**', '**/node_modules/**'],
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
];
