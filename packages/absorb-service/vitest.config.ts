import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@holoscript\/core\/runtime$/,
        replacement: path.resolve(__dirname, '../core/src/runtime.ts'),
      },
      {
        find: /^@holoscript\/core\/parser$/,
        replacement: path.resolve(__dirname, '../core/src/parser/index.ts'),
      },
      {
        find: /^@holoscript\/core\/compiler$/,
        replacement: path.resolve(__dirname, '../core/src/compiler/index.ts'),
      },
      { find: /^@holoscript\/core$/, replacement: path.resolve(__dirname, '../core/src/index.ts') },
      {
        find: /^@holoscript\/platform$/,
        replacement: path.resolve(__dirname, 'src/ingest/__test_stubs__/holoscript-platform.ts'),
      },
      // @holoscript/uaal has no built dist in this worktree (same situation as
      // @holoscript/core above) — alias straight to source so UAALResolutionRewards
      // tests can import gradeByResolver/UAAL_RESOLVED_FAMILIES without a build step.
      { find: /^@holoscript\/uaal$/, replacement: path.resolve(__dirname, '../uaal/src/index.ts') },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
    hookTimeout: 60_000,
    testTimeout: 60_000,
    passWithNoTests: true,
    // Sovereign embedding (P.009): override any stale shell env that has
    // EMBEDDING_PROVIDER=openai — tests always run against the native provider.
    env: {
      EMBEDDING_PROVIDER: 'holoembed',
    },
  },
});
