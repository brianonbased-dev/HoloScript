import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * vitest.bench.config.ts — coverage-instrumentation-sensitive tests.
 *
 * Why this exists (W4-T1-followup, board task `task_1776878960824_c8te`):
 *
 * 4 test files in `src/simulation/__tests__/` pass cleanly under the default
 * `vitest run` but exceed wall-clock timeouts when v8 coverage instrumentation
 * is enabled. They are real tests (not vitest `bench()` micro-benchmarks) but
 * their assertions involve non-trivial numerical work — solvers, hash sweeps,
 * NAFEMS LE1 verification — so coverage tracking on every callsite slows them
 * past the default 10s/test ceiling.
 *
 * The previous fix was to list them in the default config's BENCHES_SKIP
 * block (`vitest.config.ts` `test.exclude`), which made them invisible to
 * `pnpm test`. That's wrong on two axes:
 *   1. They never run under `pnpm test` — silent regressions can land.
 *   2. Their source files (NavierStokesSolver, simulation contract paths,
 *      paper-0c CAEL recorder) drop out of the coverage table even though
 *      the bench tests *do* exercise them under `vitest run`.
 *
 * Resolution: keep the default config running these files (un-quarantined),
 * and add a separate `test:bench` script that runs THIS config WITHOUT
 * coverage. CI / local devs running `pnpm test` see them pass; coverage runs
 * (`pnpm test:coverage`) skip them via the `exclude` here so coverage doesn't
 * time out.
 *
 * Usage:
 *   pnpm --filter @holoscript/engine test:bench           — run just the benches
 *   pnpm --filter @holoscript/engine test                 — runs benches inline
 *   pnpm --filter @holoscript/engine test:coverage        — excludes benches
 *
 * Do NOT add coverage instrumentation here — that defeats the entire purpose.
 * If a new test joins this set, verify under `pnpm test:coverage` first to
 * confirm it actually times out under coverage; otherwise it belongs in the
 * default config.
 */

const BENCH_TESTS: string[] = [
  'src/simulation/__tests__/fnv1a-vs-sha256.bench.test.ts',
  'src/simulation/__tests__/NAFEMS-LE1.test.ts',
  'src/simulation/__tests__/NavierStokesSolver.test.ts',
  'src/simulation/__tests__/paper-0c-cael-overhead.test.ts',
];

export default defineConfig({
  resolve: {
    alias: {
      '@holoscript/core/reconstruction': resolve(__dirname, '../core/src/reconstruction/index.ts'),
      '@holoscript/core/paper-0c-spike': resolve(__dirname, '../core/src/paper-0c-spike/index.ts'),
      '@holoscript/core': resolve(__dirname, '../core/src/index.ts'),
      '@holoscript/holomap': resolve(__dirname, '../holomap/src/index.ts'),
      '@holoscript/framework/agents': resolve(__dirname, '../framework/src/agents/index.ts'),
      '@holoscript/framework/behavior': resolve(__dirname, '../framework/src/behavior.ts'),
      '@holoscript/framework/economy': resolve(__dirname, '../framework/src/economy/index.ts'),
      '@holoscript/framework/learning': resolve(__dirname, '../framework/src/learning/index.ts'),
      '@holoscript/framework/negotiation': resolve(__dirname, '../framework/src/negotiation/index.ts'),
      '@holoscript/framework/training': resolve(__dirname, '../framework/src/training/index.ts'),
      '@holoscript/framework/ai': resolve(__dirname, '../framework/src/ai/index.ts'),
      '@holoscript/framework/skills': resolve(__dirname, '../framework/src/skills/index.ts'),
      '@holoscript/framework/swarm': resolve(__dirname, '../framework/src/swarm/index.ts'),
      '@holoscript/framework': resolve(__dirname, '../framework/src/index.ts'),
    },
  },
  test: {
    clearMocks: true,
    restoreMocks: true,
    // Run ONLY the bench-class tests. The default config still runs them too
    // (without coverage); this config narrows the set so `pnpm test:bench`
    // is fast when you're iterating on a solver / hash change.
    include: BENCH_TESTS,
    // Bench-class tests legitimately run longer than the default 10s ceiling.
    // NavierStokesSolver Couette-flow convergence and NAFEMS LE1 mesh
    // refinement both push past 30s on slower hardware. 60s gives headroom
    // without masking actual hangs.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // No coverage block here — running this config with --coverage is
    // explicitly unsupported (re-introduces the timeout class this file
    // was created to escape). Use `pnpm test:coverage` for coverage; it
    // excludes BENCH_TESTS via the default config.
  },
});
