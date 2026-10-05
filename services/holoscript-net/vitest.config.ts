import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      // Tests compile scenes with this checkout's compiler source, not whichever
      // dist happened to be built last (Studio's and r3f-renderer's vitest
      // configs alias @holoscript/core the same way).
      {
        find: /^@holoscript\/core$/,
        replacement: fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      },
    ],
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    passWithNoTests: true,
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
