import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Package-local vitest config — scopes `pnpm --filter @holoscript/xr-embodiment
 * test` to THIS package's own tests in a node environment. Without it, a bare
 * `vitest run` here walks up to the monorepo workspace and runs the entire repo
 * suite (2700+ files), which is both slow and wrong for a leaf package. The
 * embodiment math (locomotion, colour) is pure three.js — no DOM needed.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
