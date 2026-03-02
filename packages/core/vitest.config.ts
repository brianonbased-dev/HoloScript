import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Allow sibling packages that import @holoscript/core to resolve it locally
      '@holoscript/core': resolve(__dirname, 'src/index.ts'),
    },
  },
  test: {
    // Exclude problematic test file that causes OOM during collection
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/hsplus-files.test.ts', // Causes vitest OOM - run separately with node --max-old-space-size
    ],
    // Increase timeout for slower tests
    testTimeout: 30000,
    // Clear mocks between tests
    clearMocks: true,
    // Coverage configuration
    coverage: {
      provider: 'v8',
      all: true,
      reporter: ['text', 'text-summary', 'lcov', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'src/**/*.ts',
      ],
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
