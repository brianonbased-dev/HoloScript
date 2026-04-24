import { defineConfig } from 'vitest/config';

// Local vitest config so this package scopes `vitest run` to its own tests
// rather than inheriting the root projects list and running the full
// monorepo matrix. See commit 31cfd53ad (marketplace-agentkit) + 31e887acf
// (root absolute-paths fix) for the bug class this addresses.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
  },
});
