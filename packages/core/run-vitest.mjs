/**
 * Core test runner with memory hygiene.
 *
 * Shards into 4 by default (each ~500 test files) to keep V8 heap reasonable.
 * On coverage or explicit targets: single run + --maxWorkers=50%.
 * NODE_OPTIONS + execArgv always pass 16 GB (local hardware) or respect CI override.
 *
 * === Bounded, repeatable test commands (closes the OOM quarantine item) ===
 * Local full (hardware, 32 GB+):          node --max-old-space-size=16384 run-vitest.mjs
 * Local coverage (full, no CI quarantine): pnpm --filter @holoscript/core test:coverage
 * CI-like (quarantine active):             CI=true pnpm --filter @holoscript/core test:coverage
 * Single heavy suite (for owners):         pnpm --filter @holoscript/core exec vitest run <file>
 * Is the workspace built? (no tests run):  node run-vitest.mjs --preflight-only   (see REQUIRED_BUILDS)
 *
 * === Flaky-file quarantine (determinism fix) ===
 * 10 files pass in isolation but flake under shard memory/timing pressure.
 * These are run in a dedicated sequential pass (maxWorkers=1) BEFORE the
 * 4-way sharded pass, and excluded from the sharded pass via the
 * HOLOSCRIPT_EXCLUDE_FLAKY=1 env flag read by vitest.config.ts.
 * The canonical list is in test-baseline.json flakyFiles.
 *
 * Known memory-heavy suites (the ones previously quarantined on coverage):
 *   - StressTests.comprehensive.test.ts          (owner: core/perf team)
 *   - RuntimeOptimization.test.ts                (owner: runtime)
 *   - trait-commutativity.test.ts                (owner: traits)
 *   - mockadapter-static-properties.test.ts      (owner: traits)
 *   - SynthEngine.test.ts + EmbeddingTrait.test.ts (owner: audio/synth)
 *   - HoloMapPerformanceBenchmark.test.ts        (owner: holomap)
 *   - paper-4-sandbox-bench.test.ts              (owner: paper-4)
 *   - hsplus-files.test.ts (always excluded — parser stress, run manually)
 *
 * If any of the above still OOM on a 8 GB CI runner, the owner must either:
 *   - split the suite, or
 *   - mark it "local-hardware-only" in docs, or
 *   - add a dedicated high-mem CI job.
 *
 * See also: docs/strategy/ROADMAP.md §5 Promoted Seed Backlog (Core test memory closure)
 */
import { spawnSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const vitest = resolve(__dir, 'node_modules', 'vitest', 'vitest.mjs');
// Any extra args forwarded by the caller (e.g. --coverage)
const extraArgs = process.argv.slice(2).filter((arg) => arg !== '--');

// Repo root the build preflight checks. HOLOSCRIPT_PREFLIGHT_ROOT is a test seam:
// src/__tests__/run-vitest-preflight.test.ts points it at a fake tree.
const REPO_ROOT = process.env.HOLOSCRIPT_PREFLIGHT_ROOT || resolve(__dir, '..', '..');

// Workspace packages whose BUILT output core's tests load (board task_1786984409320_7d3l).
// vitest.config.ts does not alias them to source, or they load through createRequire in
// src/barrel/lazy-peer.ts, which bypasses the alias. On a fresh install none is built: the
// full suite then reported ~588 failures that were not real, and the baseline gate wrote
// a RED receipt that blocked every push touching packages/core. Each entry is
// [name, dir from the repo root, files that must exist]; keep the files in sync with that
// package.json "exports" ("." import target or "main", plus any subpath core imports).
// A stale entry fails closed: full-suite runs stop with the message below, never silently.
const REQUIRED_BUILDS = [
  // Declared deps of core; `pnpm --filter "@holoscript/core..." run build` builds these.
  [
    '@holoscript/core-types',
    'packages/core-types',
    ['dist/index.js', 'dist/ans.js', 'dist/utility.js'],
  ],
  ['@holoscript/llm-provider', 'packages/llm-provider', ['dist/index.js']],
  ['@holoscript/meaning', 'packages/meaning', ['dist/index.js']],
  ['@holoscript/assimp-plugin', 'packages/plugins/assimp-plugin', ['dist/index.mjs']],
  // NOT deps of core, so that build skips them. mesh is an optional peer; engine and
  // framework load through lazy-peer.ts (engine's own build also imports framework).
  ['@holoscript/mesh', 'packages/mesh', ['dist/index.js']],
  ['@holoscript/engine', 'packages/engine', ['dist/index.js']],
  ['@holoscript/framework', 'packages/framework', ['dist/index.js']],
  // Reached through other packages' source: marketplace-api (auth) in
  // marketplace-runtime.test.ts, comparative benchmarks (openusd) in
  // mockadapter-static-properties.test.ts.
  ['@holoscript/auth', 'packages/auth', ['dist/index.js']],
  ['@holoscript/openusd-plugin', 'packages/plugins/openusd-plugin', ['dist/index.js']],
];

/** Names of the REQUIRED_BUILDS packages with any listed file missing under REPO_ROOT. */
function unbuiltWorkspacePackages() {
  return REQUIRED_BUILDS.filter(([, dir, files]) =>
    files.some((file) => !fs.existsSync(resolve(REPO_ROOT, dir, file)))
  ).map(([name]) => name);
}

// The files that flake under 4-way shard memory/timing pressure.
// Must stay in sync with test-baseline.json flakyFiles.
const FLAKY_FILES = [
  'src/__tests__/HotReloadIntegrated.test.ts',
  'src/__tests__/RuntimeOptimization.test.ts',
  'src/__tests__/aivalidator-instantiation.test.ts',
  'src/__tests__/camera-inventory-terrain-lighting-exports.test.ts',
  'src/__tests__/trait-commutativity.test.ts',
  'src/__tests__/trait-docs-count-structure.test.ts',
  'src/cli/__tests__/holoscript-runner.run.test.ts',
  'src/compiler/__tests__/CharacterWebGPUCompiler.test.ts',
  'src/compiler/__tests__/VRRPerformanceBenchmark.spec.ts',
  'src/compiler/dispatch/__tests__/DispatchPolicy.test.ts',
  'src/reconstruction/__tests__/HoloMapPerformanceBenchmark.test.ts',
  'src/traits/__tests__/ChoreographyTrait.prod.test.ts',
];

function ensureCoverageTmp() {
  if (!extraArgs.includes('--coverage')) return;
  fs.mkdirSync(resolve(__dir, 'coverage', '.tmp'), { recursive: true });
}

function runVitest(args, extraEnv = {}) {
  ensureCoverageTmp();
  return spawnSync(process.execPath, ['--max-old-space-size=16384', vitest, 'run', ...args], {
    stdio: 'inherit',
    env: { ...sharedEnv, ...extraEnv },
  });
}

function hasExplicitShard(args) {
  return args.includes('--shard');
}

function hasPositionalTestTargets(args) {
  return args.some((arg) => typeof arg === 'string' && arg.length > 0 && !arg.startsWith('-'));
}

const sharedEnv = {
  ...process.env,
  // Inherited by every child process spawned by vitest (forks, threads, etc.)
  NODE_OPTIONS: '--max-old-space-size=16384',
};

const stabilityArgs = ['--maxWorkers=50%'];

// === Build preflight (board task_1786984409320_7d3l) ===
// A full-suite run on a workspace missing any REQUIRED_BUILDS output stops here (exit 2)
// before any vitest process starts, naming exactly what to build. Runs that name test
// files skip it: a missing package then shows up as that file's own import error.
// `--preflight-only` runs just this check (exit 0 when built) and never starts vitest.
const preflightOnly = extraArgs.includes('--preflight-only');
if (preflightOnly || !hasPositionalTestTargets(extraArgs)) {
  const missing = unbuiltWorkspacePackages();
  if (missing.length > 0) {
    // The trailing "..." makes pnpm build each package's own dependencies too.
    const filters = missing.map((name) => `--filter "${name}..."`).join(' ');
    const verb = missing.length === 1 ? 'has' : 'have';
    console.error(
      `[run-vitest] workspace not built: ${missing.join(', ')} ${verb} no built output, and core's tests need it.`
    );
    console.error(
      '[run-vitest] Not running the suite: without that output it reports hundreds of failures that are not real.'
    );
    console.error(
      `[run-vitest] Build first, then re-run: corepack pnpm --workspace-concurrency=1 ${filters} run build`
    );
    process.exit(2);
  }
  if (preflightOnly) {
    console.error(
      `[run-vitest] workspace built: all ${REQUIRED_BUILDS.length} packages core's tests load from built output are present.`
    );
    process.exit(0);
  }
}

let overallExitCode = 0;

// If caller already set sharding, or passed explicit test file globs/paths,
// do a single run to avoid Vitest shard-count errors on small test sets.
// W.150: Windows race in @vitest/coverage-v8@4.1.0 .tmp-* dirs - disable
// sharding for coverage runs; pre-create .tmp so the v8 provider doesn't race.
const isCoverage = extraArgs.includes('--coverage');
if (hasExplicitShard(extraArgs) || hasPositionalTestTargets(extraArgs) || isCoverage) {
  const proc = runVitest([...stabilityArgs, ...extraArgs]);
  overallExitCode = proc.status ?? 1;
} else {
  // === Pass 1: sequential flaky-file pass ===
  // Run timing/memory-sensitive files with maxWorkers=1 so they get
  // dedicated heap and no sibling-shard interference. Positional file args
  // restrict vitest to just those files; no exclusion env flag needed here.
  console.error(
    `[run-vitest] pass 1/2 — sequential flaky pass (${FLAKY_FILES.length} files, maxWorkers=1)`
  );
  const seqProc = runVitest(['--maxWorkers=1', ...FLAKY_FILES]);
  const seqCode = seqProc.status ?? 1;
  if (seqCode !== 0) overallExitCode = seqCode;

  // === Pass 2: 4-way sharded pass (flaky files excluded) ===
  // HOLOSCRIPT_EXCLUDE_FLAKY=1 tells vitest.config.ts to add FLAKY_FILES to
  // the exclude list so no shard accidentally picks them up again.
  console.error('[run-vitest] pass 2/2 — sharded pass (4 shards, flaky files excluded)');
  for (const shard of ['1/4', '2/4', '3/4', '4/4']) {
    const proc = runVitest(['--shard', shard, ...stabilityArgs, ...extraArgs], {
      HOLOSCRIPT_EXCLUDE_FLAKY: '1',
    });
    const code = proc.status ?? 1;
    if (code !== 0) overallExitCode = code;
  }
}

process.exit(overallExitCode);
