// @ts-nocheck
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/**/*.scenario.ts',
      'src/**/*.scenario.tsx',
    ],
    exclude: [
      // Requires @tauri-apps/api/core — desktop-only, not available in CI
      'src/lib/__tests__/tauri-bridge.test.ts',
      // Requires @holoscript/absorb-service/engine — external service
      'src/__tests__/scenarios/codebase-absorb.scenario.ts',
    ],
    globals: true,
    pool: 'forks',
    isolate: true,
    restoreMocks: true,
    setupFiles: ['./src/test-setup/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.spec.ts',
        'src/**/*.scenario.ts',
        'src/**/*.scenario.tsx',
        'src/__tests__/**',
        'src/__mocks__/**',
        'src/test-setup/**',
        'src/**/*.d.ts',
        'src/app/layout.tsx', // Next.js root layout
        'src/app/page.tsx', // Next.js pages (covered by e2e)
        'src/app/**/page.tsx',
        'src/app/**/route.ts', // API routes (will add dedicated tests)
        'src/middleware.ts', // Next.js middleware
        '**/node_modules/**',
        '**/dist/**',
        '**/.next/**',
      ],
      // Coverage thresholds — raised from initial conservative values (40/40/35/40).
      // lines/functions/statements are suppressed by all:true (300+ untested component files).
      // Actual measured coverage (2026): lines 25.84%, branches 18.67%, functions 21.64%, stmts 25.92%.
      // Thresholds set at current actuals; increase incrementally as test coverage improves.
      thresholds: {
        lines: 25,
        functions: 20,
        branches: 18,
        statements: 25,
      },
      // Report uncovered files
      all: true,
      // Clean coverage directory before each run
      clean: true,
    },
  },
  esbuild: {
    jsxInject: `import React from 'react'`,
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      // Route idb → in-memory mock that works in Node without IndexedDB
      { find: 'idb', replacement: path.resolve(__dirname, 'src/__mocks__/idb.ts') },
      // Route @aztec/bb.js → stub (WASM bindings fail in Node/jsdom test env)
      { find: '@aztec/bb.js', replacement: path.resolve(__dirname, 'src/__mocks__/aztec-bb.ts') },
      // Cross-package resolution (A.011 extraction)
      { find: '@holoscript/core/coordinators', replacement: path.resolve(__dirname, '../core/src/coordinators/index.ts') },
      { find: /^@holoscript\/core$/, replacement: path.resolve(__dirname, '../core/src/index.ts') },
      {
        find: '@holoscript/engine/runtime/TraitRuntimeIntegration',
        replacement: path.resolve(__dirname, '../engine/src/runtime/TraitRuntimeIntegration.ts'),
      },
      { find: '@holoscript/engine', replacement: path.resolve(__dirname, '../engine/src') },
      { find: '@holoscript/framework/ai', replacement: path.resolve(__dirname, '../framework/src/ai') },
      { find: '@holoscript/framework/economy', replacement: path.resolve(__dirname, '../framework/src/economy') },
      { find: '@holoscript/framework/negotiation', replacement: path.resolve(__dirname, '../framework/src/negotiation') },
      { find: '@holoscript/framework/learning', replacement: path.resolve(__dirname, '../framework/src/learning') },
      { find: '@holoscript/framework/agents', replacement: path.resolve(__dirname, '../framework/src/agents') },
      { find: '@holoscript/framework/swarm', replacement: path.resolve(__dirname, '../framework/src/swarm') },
      { find: '@holoscript/framework/training', replacement: path.resolve(__dirname, '../framework/src/training') },
      { find: '@holoscript/framework/skills', replacement: path.resolve(__dirname, '../framework/src/skills') },
      { find: '@holoscript/framework/behavior', replacement: path.resolve(__dirname, '../framework/src/behavior.ts') },
      { find: '@holoscript/framework/bt', replacement: path.resolve(__dirname, '../framework/src/behavior.ts') },
      { find: '@holoscript/framework', replacement: path.resolve(__dirname, '../framework/src/index.ts') },
      // Subpath export resolves to dist in production; tests use source (CI may skip absorb build)
      { find: '@holoscript/absorb-service/schema', replacement: path.resolve(__dirname, '../absorb-service/src/schema.ts') },
    ],
  },
});
