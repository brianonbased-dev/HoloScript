import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@holoscript/core/reconstruction': resolve(__dirname, 'src/reconstruction/index.ts'),
      // Allow sibling packages that import @holoscript/core to resolve it locally
      '@holoscript/core': resolve(__dirname, 'src/index.ts'),
      // Cross-package aliases for integration tests
      // agent-sdk shim removed — imports now resolve to @holoscript/framework directly
      '@holoscript/agent-protocol': resolve(__dirname, '../agent-protocol/src/index.ts'),
      '@holoscript/uaal': resolve(__dirname, '../uaal/src/index.ts'),
      '@holoscript/holo-vm': resolve(__dirname, '../holo-vm/src/index.ts'),
      '@holoscript/vm-bridge': resolve(__dirname, '../vm-bridge/src/index.ts'),
      '@holoscript/framework/ai': resolve(__dirname, '../framework/src/ai/index.ts'),
      '@holoscript/framework/agents': resolve(__dirname, '../framework/src/agents/index.ts'),
      '@holoscript/framework/behavior': resolve(__dirname, '../framework/src/behavior.ts'),
      '@holoscript/framework/economy': resolve(__dirname, '../framework/src/economy/index.ts'),
      '@holoscript/framework/learning': resolve(__dirname, '../framework/src/learning/index.ts'),
      '@holoscript/framework/negotiation': resolve(
        __dirname,
        '../framework/src/negotiation/index.ts'
      ),
      '@holoscript/framework/skills': resolve(__dirname, '../framework/src/skills/index.ts'),
      '@holoscript/framework/swarm': resolve(__dirname, '../framework/src/swarm/index.ts'),
      '@holoscript/framework/training': resolve(__dirname, '../framework/src/training/index.ts'),
      '@holoscript/framework': resolve(__dirname, '../framework/src/index.ts'),
      '@holoscript/engine/materials': resolve(__dirname, '../engine/src/materials/index.ts'),
      '@holoscript/engine': resolve(__dirname, '../engine/src'),
      '@holoscript/platform': resolve(__dirname, '../platform/src/index.ts'),
    },
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
