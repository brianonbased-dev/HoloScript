import { defineConfig } from 'vitest/config';

// Local vitest config so this package doesn't inherit the root
// vitest.config.ts's `projects` list, whose relative paths
// (`packages/core/vitest.config.ts` etc.) resolve against this
// package's CWD and produce invalid `packages/marketplace-agentkit/
// packages/core/vitest.config.ts` paths → Startup Error.
//
// Fixed 2026-04-23 — `pnpm test` was failing at this package with
// "Projects definition references a non-existing file or a directory".
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    passWithNoTests: true,
  },
});
