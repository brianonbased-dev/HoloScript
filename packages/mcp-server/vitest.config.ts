import { defineConfig } from 'vitest/config';
import { readFileSync } from 'fs';
import path from 'path';

// Resolved from this file, not the working directory: the root vitest config runs this
// project from the repo root, where './package.json' is the monorepo's, not this package's.
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as {
  version: string;
};

export default defineConfig({
  // Mirror tsup.config.ts so tests see the same build-time constant production does
  // (/health, MCP server info, hololand_twin_earth_substrate_status.substrateVersion).
  define: {
    __SERVICE_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: [
      {
        find: '@holoscript/core/runtime',
        replacement: path.resolve(__dirname, '../core/src/runtime.ts'),
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
        find: /^@holoscript\/core\/compiler$/,
        replacement: path.resolve(__dirname, '../core/src/compiler/index.ts'),
      },
      {
        find: /^@holoscript\/engine\/hologram$/,
        replacement: path.resolve(__dirname, '../engine/src/hologram/index.ts'),
      },
      {
        find: /^@holoscript\/framework$/,
        replacement: path.resolve(__dirname, '../framework/src/index.ts'),
      },
      {
        find: '@holoscript/agent-protocol',
        replacement: path.resolve(__dirname, '../agent-protocol/src/index.ts'),
      },
      {
        find: /^@holoscript\/mesh$/,
        replacement: path.resolve(__dirname, '../mesh/src/index.ts'),
      },
      {
        find: '@hololand/platform-services',
        replacement: path.resolve(__dirname, '../hololand-platform/src/index.ts'),
      },
      {
        find: /^@holoscript\/secrets-broker$/,
        replacement: path.resolve(__dirname, '../secrets-broker/src/index.ts'),
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
      exclude: ['**/__tests__/**', '**/*.test.ts', '**/*.d.ts', 'dist/**', 'coverage/**'],
    },
  },
});
