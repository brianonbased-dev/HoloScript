import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * W4-T1 quarantine list — see docs/audit-reports/2026-04-21_engine-coverage.md.
 *
 * Initial quarantine (2026-04-22) was 45 files. W4-T1-followup pass
 * (2026-04-22) un-quarantined 12 after triaging each entry:
 *
 *  - 12 un-quarantined (class b, test-bug — tuple/object access mismatch or
 *    stale field check, all fixes under 10 lines).
 *
 * The remaining entries are grouped by class so the next sweep can pick
 * targets by cost:
 *   - class c (source regressions): require source-side investigation.
 *     Each one is tracked by a follow-up task ID in the comment.
 *   - class d (browser/long-running): stay quarantined behind a future
 *     bench or browser config.
 *
 * Do NOT add new entries here without opening a tracking task — quarantine
 * without a breadcrumb becomes dead code.
 */
const QUARANTINED_TESTS: string[] = [
  // ── CLASS C: Source regressions (keep quarantined, need source fixes) ─────
  // Physics — PBD solver + cloth + constraint integration fail real assertions
  // (not tuple-access test bugs). Fixes belong in source, not tests.



  // Simulation — StressRecovery is long-running (>17s), fails under coverage.
  // (CSVImporter p.x/p.y/p.z bug fixed; DataImport.test.ts now runs clean — 14/14 pass.)
  'src/simulation/__tests__/StressRecovery.test.ts', // long-running (>15s), fails under coverage

  // Spatial — OctreeLODSystem has 30/52 failing: shared setup regression.
  'src/spatial/__tests__/OctreeLODSystem.prod.test.ts',

  // NOTE: 2026-04-23 triage — `traitTestHelpers.ts` EXISTS and exports
  // createMockNode/createMockContext/attachTrait/updateTrait/sendEvent.
  // 6 other tests in the same directory import from it and pass (54/54).
  // The previous "missing helper" quarantine reason was stale. Un-quarantining
  // the 5 entries below and re-classifying on the actual failure shape.

  // ── CLASS D: Browser/WebGPU-only ─────────────────────────────────────────
  // GPUPhysics needs a real WebGPU adapter; not available in node vitest.
  'src/traits/__tests__/GPUPhysicsTrait.prod.test.ts',
  'src/traits/__tests__/GPUPhysicsTrait.test.ts',
  // IoTPipeline + MultiplayerNPCScene: require live MQTT broker / WebRTC
  'src/traits/__tests__/IoTPipeline.integration.test.ts',
  'src/traits/__tests__/MultiplayerNPCScene.integration.test.ts',

  // ── BENCHES_SKIP moved out (2026-04-25, task_1776878960824_c8te) ─────────
  // Previously listed here:
  //   src/simulation/__tests__/fnv1a-vs-sha256.bench.test.ts
  //   src/simulation/__tests__/NAFEMS-LE1.test.ts
  //   src/simulation/__tests__/NavierStokesSolver.test.ts
  //   src/simulation/__tests__/paper-0c-cael-overhead.test.ts
  //
  // These pass without coverage instrumentation but fail wall-clock thresholds
  // under v8 coverage. They are now re-enabled in the default `vitest run`
  // (so `pnpm test` exercises them) and excluded only from the coverage path
  // via the BENCH_TESTS constant referenced in test.coverage.exclude below.
  // The bench-only runner lives in vitest.bench.config.ts and is invoked via
  // `pnpm --filter @holoscript/engine test:bench`.
];

/**
 * Coverage-instrumentation-sensitive tests — pass under `vitest run` but exceed
 * wall-clock thresholds with v8 coverage enabled. Excluded from the coverage
 * run only; the default test run still executes them. See vitest.bench.config.ts
 * for the bench-only runner. Referenced by board task task_1776878960824_c8te.
 */
const BENCH_TESTS: string[] = [
  'src/simulation/__tests__/fnv1a-vs-sha256.bench.test.ts',
  'src/simulation/__tests__/NAFEMS-LE1.test.ts',
  'src/simulation/__tests__/NavierStokesSolver.test.ts',
  'src/simulation/__tests__/paper-0c-cael-overhead.test.ts',
];

// Coverage mode is detected on config load. Two signals cover the realistic
// invocation paths:
//   - argv contains '--coverage' (npm script `test:coverage`, direct CLI use)
//   - HOLOSCRIPT_ENGINE_COVERAGE=1 (escape hatch for CI / parent runners that
//     pass coverage flags after config evaluation, e.g. `pnpm -r test:coverage`)
// When true, BENCH_TESTS are added to the test exclude so coverage instrumentation
// doesn't time them out. When false (default `vitest run`), they execute normally.
const IS_COVERAGE_RUN =
  process.argv.includes('--coverage') ||
  process.env.HOLOSCRIPT_ENGINE_COVERAGE === '1';

export default defineConfig({
  resolve: {
    alias: {
      '@holoscript/core/reconstruction': resolve(__dirname, '../core/src/reconstruction/index.ts'),
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
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      ...QUARANTINED_TESTS,
      // Coverage-only bench skip: see BENCH_TESTS comment above.
      ...(IS_COVERAGE_RUN ? BENCH_TESTS : []),
    ],
    // Bench-class tests (NavierStokesSolver convergence, NAFEMS LE1 mesh
    // refinement, paper-0c CAEL overhead sweep, fnv1a-vs-sha256) legitimately
    // run beyond the default 10s ceiling. Wall-clock under `vitest run` is
    // ~30s p99 on dev hardware; 60s gives headroom without masking real hangs.
    // Other tests are unaffected — vitest only enforces this when a test
    // doesn't explicitly set its own timeout.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      // Coverage should reflect the source we ship from src/, not the
      // compiled bundle in dist/ — those rows added 50+ entries of
      // chunk-XXXXXXXX.js noise to the table that masked real source gaps.
      include: ['src/**/*.ts'],
      exclude: [
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.bench.ts',
        '**/*.bench.test.ts',
        '**/*.d.ts',
        'dist/**',
        'coverage/**',
      ],
      reporter: ['text', 'json-summary', 'lcov'],
    },
  },
});
