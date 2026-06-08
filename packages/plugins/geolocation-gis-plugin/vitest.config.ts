import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  // Resolve workspace peers to SOURCE so tests run against current core/engine
  // (matches the sibling plugin configs, e.g. energy-grid). Without this the
  // `@holoscript/core/runtime` import resolves to stale built dist.
  resolve: {
    alias: {
      '@holoscript/engine': resolve(__dirname, '../../engine/src'),
      '@holoscript/core': resolve(__dirname, '../../core/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
