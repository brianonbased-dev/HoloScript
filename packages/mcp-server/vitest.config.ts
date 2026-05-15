import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@holoscript/core/runtime',
        replacement: path.resolve(__dirname, '../core/src/HoloScriptRuntime.ts'),
      },
      {
        find: '@holoscript/core/reconstruction',
        replacement: path.resolve(__dirname, '../core/src/reconstruction/index.ts'),
      },
      {
        find: '@holoscript/holomap',
        replacement: path.resolve(__dirname, '../holomap/src/index.ts'),
      },
      {
        find: /^@holoscript\/core$/,
        replacement: path.resolve(__dirname, '../core/src/index.ts'),
      },
      {
        find: '@holoscript/agent-protocol',
        replacement: path.resolve(__dirname, '../agent-protocol/src/index.ts'),
      },
    ],
  },
  test: {
    include: ['src/**/*.test.ts', 'examples/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    passWithNoTests: true,
    testTimeout: 60_000,
    // HoloMesh route suites share in-memory registry/state singletons.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.d.ts',
        'dist/**',
        'coverage/**',
      ],
    },
  },
});
