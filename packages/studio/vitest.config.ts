import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.scenario.ts', 'src/**/*.scenario.tsx'],
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
      // Coverage thresholds - start conservative, increase over time
      thresholds: {
        lines: 40,
        functions: 40,
        branches: 35,
        statements: 40,
      },
      // Report uncovered files
      all: true,
      // Clean coverage directory before each run
      clean: true,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Route idb → in-memory mock that works in Node without IndexedDB
      idb: path.resolve(__dirname, 'src/__mocks__/idb.ts'),
      // Route @aztec/bb.js → stub (WASM bindings fail in Node/jsdom test env)
      '@aztec/bb.js': path.resolve(__dirname, 'src/__mocks__/aztec-bb.ts'),
    },
  },
});
