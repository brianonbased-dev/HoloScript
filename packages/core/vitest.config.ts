import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@holoscript/core/reconstruction', replacement: resolve(__dirname, 'src/reconstruction/index.ts') },
      // Allow sibling packages that import @holoscript/core to resolve it locally
      // Use exact-match regex to prevent prefix-matching subpath imports (e.g. @holoscript/core/trait-docs)
      { find: /^@holoscript\/core$/, replacement: resolve(__dirname, 'src/index.ts') },
      // Cross-package aliases for integration tests
      // agent-sdk shim removed — imports now resolve to @holoscript/framework directly
      { find: '@holoscript/agent-protocol', replacement: resolve(__dirname, '../agent-protocol/src/index.ts') },
      { find: '@holoscript/uaal', replacement: resolve(__dirname, '../uaal/src/index.ts') },
      { find: '@holoscript/holo-vm', replacement: resolve(__dirname, '../holo-vm/src/index.ts') },
      { find: '@holoscript/vm-bridge', replacement: resolve(__dirname, '../vm-bridge/src/index.ts') },
      { find: '@holoscript/framework/ai', replacement: resolve(__dirname, '../framework/src/ai/index.ts') },
      { find: '@holoscript/framework/agents', replacement: resolve(__dirname, '../framework/src/agents/index.ts') },
      { find: '@holoscript/framework/behavior', replacement: resolve(__dirname, '../framework/src/behavior.ts') },
      { find: '@holoscript/framework/economy', replacement: resolve(__dirname, '../framework/src/economy/index.ts') },
      { find: '@holoscript/framework/learning', replacement: resolve(__dirname, '../framework/src/learning/index.ts') },
      { find: '@holoscript/framework/negotiation', replacement: resolve(__dirname, '../framework/src/negotiation/index.ts') },
      { find: '@holoscript/framework/skills', replacement: resolve(__dirname, '../framework/src/skills/index.ts') },
      { find: '@holoscript/framework/swarm', replacement: resolve(__dirname, '../framework/src/swarm/index.ts') },
      { find: '@holoscript/framework/training', replacement: resolve(__dirname, '../framework/src/training/index.ts') },
      { find: '@holoscript/framework', replacement: resolve(__dirname, '../framework/src/index.ts') },
      { find: '@holoscript/engine/materials', replacement: resolve(__dirname, '../engine/src/materials/index.ts') },
      { find: '@holoscript/engine', replacement: resolve(__dirname, '../engine/src') },
      { find: '@holoscript/platform', replacement: resolve(__dirname, '../platform/src/index.ts') },
    ],
  },
  test: {
    // Exclude problematic test file that causes OOM during collection
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/hsplus-files.test.ts', // Causes vitest OOM - replaced with hsplus-files-optimized.test.ts
    ],
    // Give fork processes enough memory for the large test suite (44K+ tests).
    // poolOptions was removed in Vitest 4; execArgv is now a top-level option.
    // This flows through project.config.execArgv → ForksPoolWorker → child_process.fork().
    pool: 'forks',
    isolate: true,
    execArgv: ['--max-old-space-size=16384'],
    // Increase timeout for slower tests
    testTimeout: 30000,
    // Clear mocks between tests (reset call counts)
    clearMocks: true,
    // Restore all spyOn/mock implementations between tests
    restoreMocks: true,
    // Restore vi.stubGlobal() globals between tests (prevents `performance`, `Date` etc. leaking)
    unstubAllGlobals: true,
    // Coverage configuration
    coverage: {
      provider: 'v8',
      all: true,
      reporter: ['text', 'text-summary', 'lcov', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.prod.test.ts',
        'src/**/*.spec.ts',
        'src/**/index.ts',
        'src/**/*.d.ts',
        'src/**/__tests__/**',
        'src/**/__mocks__/**',
        'src/**/__snapshots__/**',
      ],
      thresholds: {
        statements: 20,
        branches: 15,
        functions: 20,
        lines: 20,
      },
    },
  },
});
