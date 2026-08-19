#!/usr/bin/env node
/* global console, process */

// Model Village lane census.
//
// WHY THIS EXISTS. The 2026-07-27 gate-truth audit
// (research/2026-07-27_model-village-gate-truth-audit.md) found that 0 of 14
// Phase 1 gate rows were genuinely closed and that 24 of 24 closure claims were
// overstated. A 2026-08-16 reconcile of its blocker list found the same disease
// one level up: the lane's PROOFS are not run by anything.
//
// Measured 2026-08-16 at HEAD 9ada62a, by execution:
//   * 46 of 80 model-village test files are unreachable from any npm script.
//   * All 33 character gates H1..H4I are among them - every visual gate shipped
//     between 2026-07-28 and 2026-08-01, each with a PASS report in docs/reports/.
//   * `node --test scripts/__tests__/hololand-model-village-character-*.test.mjs`
//     -> tests 134 / pass 82 / FAIL 52.
//   * The repo's own `pnpm test` cannot see any of them: it is a workspace
//     runner (package.json "test"), and scripts/ has no package.json. That is how
//     bf424c5 and 9ada62a (2026-08-11) could each report a green full suite while
//     52 H-series tests were red.
//   * The emergency-stop guard - a real, executing, world-mutation-denying safety
//     guard landed in 804c511 - had its only negative control among the orphans.
//     Neutralizing the guard turned exactly ONE check red, and that check was
//     wired to nothing.
//
// WHAT THIS CHECK DOES. It refuses to let that recur. Every model-village gate
// check and proving test on disk must either be reachable from an npm script or
// be named in KNOWN_UNWIRED with a stated reason. Three rules keep the allowlist
// from becoming the new hiding place - the same anti-padding shape the rehearsal
// variance allowlist already uses in scripts/model-village-run-conductor.mjs:
//
//   NEW_ORPHAN              a surface that is neither wired nor declared
//   DEAD_ALLOWLIST_ENTRY    a declared file that no longer exists
//   RETIRED_ALLOWLIST_ENTRY a declared file that IS now wired
//
// So the list cannot be padded with entries that match nothing, cannot silently
// outlive the file it excuses, and cannot keep taking credit for a debt that was
// actually paid. A new unwired proof is a RED, not a shrug.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not assert that the wired checks
// PASS, and it does not wire the 45 declared surfaces. Wiring them today would
// land a red lane, because they are red - that is a repair, tracked separately,
// and doing it here would bury a 52-failure repair inside a census. This check
// makes the debt loud and countable. It does not pay it.

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDir, '..');

// Reason codes. Each declared entry cites one; the text is what a reader gets
// instead of silence.
export const UNWIRED_REASONS = {
  H_SERIES_RED_AT_HEAD:
    'Character gate H1..H4I, red for a REAL upstream reason and therefore not wired. '
    + 'H-series at HEAD: 149 tests / 129 pass / 20 FAIL (measured 2026-08-17). '
    + 'The dead-root defect this reason used to describe is FIXED. Fifteen of these '
    + 'checks hardcoded a per-gate HoloRepo worktree under C:/holorepo-worktrees/ or '
    + 'C:/Users/josep/Documents/GitHub/.holorepo-worktrees/ -- neither exists -- and that '
    + 'ONE defect wore three faces: "Cannot find module esbuild" (esbuild IS installed), '
    + '"AgentAvatarGarment.ts is missing" (the file IS present), and "spawnSync git ENOENT" '
    + '(git IS on PATH). Each invited a different wrong repair. They now resolve through '
    + 'scripts/lib/model-village-holoscript-root.mjs, which fails loud instead of returning '
    + 'a path that is not there. '
    + 'The unsatisfiable HEAD-equality assertion is also GONE. Eighteen gates required '
    + 'HoloScript HEAD to EQUAL a pinned commit and named eighteen DIFFERENT commits, so no '
    + 'checkout state could ever make more than one green. They now use the canon-containment '
    + 'validator (scripts/lib/model-village-upstream-commit-pin.mjs), proven load-bearing in '
    + 'all 18 by injecting a commit that resolves but is not in canon: 18 of 18 caught. '
    + 'What is left is genuine upstream drift, and it has ONE dominant cause. Seventeen gates '
    + 'report hash drift on named files, most often AgentAvatarMesh.ts -- the file the H4J '
    + 'change rewrote on 2026-08-04 (486 lines). These witnesses predate it and have not been '
    + 're-witnessed since. H4G is the exception: it reports a missing @holoscript/core build '
    + 'artifact, which is the unpinnable-build gap, not a pin. Wiring before repair would land '
    + 'a red lane. Repair -- re-witnessing each gate against current upstream -- is the work.',
  H_SERIES_PASSES_WITHOUT_ITS_SUBJECT:
    'Character gate whose test is green with no HoloScript tree present at all. '
    + 'Executed negative control 2026-08-16: HOLOSCRIPT_ROOT=C:/definitely/not/a/real/'
    + 'holoscript/root, node --test on the H4I test file -> tests 6 / pass 6 / fail 0, '
    + 'EXIT 0. The gate claims to prove source survives the compiler bridge, draw spec, '
    + 'native WGSL shader and final RTX pixels; it passes with none of those present, '
    + 'because its fixtures hand-build both the records and the payload and then assert '
    + 'the validator accepts them. Wiring it would add a check that cannot go red.',
  H_SERIES_GREEN_BUT_NEEDS_BROWSER_GPU:
    'Character gate that is GREEN as of 2026-08-17 but launches a real browser and '
    + 'requires a GPU adapter, so it is declared rather than wired into a headless lane. '
    + 'These were H_SERIES_RED_AT_HEAD until the seven-patch integration; keeping that '
    + 'reason would have left the census asserting something false about a passing gate. '
    + 'Measured on this host (RTX 3060 Laptop, ANGLE D3D11): H3F..H3K all pass, and H3F '
    + 'proves its own browser layer reaches hardware -- it reads back '
    + '"ANGLE (NVIDIA ... Direct3D11)" and refuses anything else. This is an environment '
    + 'boundary, not a defect claim.',
  PRE_H_VISUAL_NEEDS_BROWSER_GPU:
    'Pre-H visual witness that launches a real browser and requires a GPU adapter. '
    + 'Not runnable in a headless CPU lane, so it is declared rather than wired. '
    + 'This is an environment boundary, not a defect claim - these were not measured '
    + 'red, they were not measured at all.',
};

// Every model-village surface on disk that is NOT reachable from an npm script.
// Adding a file here is a declaration, not an excuse: see the three rules above.
export const KNOWN_UNWIRED = buildKnownUnwired();

function buildKnownUnwired() {
  const entries = [];
  // h3l, h3m and h3n left this list on 2026-08-17: the seven-patch integration made them
  // green AND they need no browser, so they are wired instead of declared. The census's
  // RETIRED_ALLOWLIST_ENTRY rule is what forces that removal -- a declared file that is now
  // wired is an error, so a repaired gate cannot quietly keep its excuse.
  const hSeries = [
    'h1', 'h2', 'h3a', 'h3f', 'h3g', 'h3h', 'h3i', 'h3j', 'h3k',
    'h3o', 'h3p', 'h3q', 'h3r', 'h3s', 'h3t', 'h3u', 'h3v', 'h3w', 'h3x',
    'h3y', 'h3z', 'h4a',
  ];
  // Green as of the seven-patch integration, but browser/GPU-bound. Splitting these out of
  // H_SERIES_RED_AT_HEAD stops the census stating a falsehood about a passing gate.
  const hSeriesGreenGpuBound = new Set(['h3f', 'h3g', 'h3h', 'h3i', 'h3j', 'h3k']);
  const hRealism = ['h4b', 'h4c', 'h4d', 'h4e', 'h4f', 'h4g', 'h4h', 'h4i'];
  const preH = [
    'atmosphere-convergence', 'cinematic-observer-show', 'geometry-convergence',
    'live-weather-fluid-physics', 'material-convergence',
    'observer-cinematic-sequence', 'performance-convergence',
    'physical-convergence', 'receipt-loom-courtyard', 'resident-convergence',
    'resident-motion-four-village-fold', 'spatial-soundscape',
  ];

  for (const gate of hSeries) {
    const reason = gate === 'h4a'
      ? 'H_SERIES_PASSES_WITHOUT_ITS_SUBJECT'
      : hSeriesGreenGpuBound.has(gate)
        ? 'H_SERIES_GREEN_BUT_NEEDS_BROWSER_GPU'
        : 'H_SERIES_RED_AT_HEAD';
    entries.push({ file: `scripts/check-hololand-model-village-character-appearance-${gate}.mjs`, reason });
    entries.push({ file: `scripts/__tests__/hololand-model-village-character-appearance-${gate}.test.mjs`, reason });
  }
  for (const gate of hRealism) {
    entries.push({
      file: `scripts/check-hololand-model-village-character-realism-${gate}.mjs`,
      reason: 'H_SERIES_RED_AT_HEAD',
    });
    entries.push({
      file: `scripts/__tests__/hololand-model-village-character-realism-${gate}.test.mjs`,
      reason: gate === 'h4i' || gate === 'h4h'
        ? 'H_SERIES_PASSES_WITHOUT_ITS_SUBJECT'
        : 'H_SERIES_RED_AT_HEAD',
    });
  }
  for (const witness of preH) {
    entries.push({
      file: `scripts/check-hololand-model-village-${witness}.mjs`,
      reason: 'PRE_H_VISUAL_NEEDS_BROWSER_GPU',
    });
    entries.push({
      file: `scripts/__tests__/hololand-model-village-${witness}.test.mjs`,
      reason: 'PRE_H_VISUAL_NEEDS_BROWSER_GPU',
    });
  }
  return entries;
}

/**
 * Every model-village gate check and proving test on disk.
 *
 * Deliberately excludes scripts/model-village-*.mjs that are not `check-`
 * prefixed: those are library modules other scripts import (run-conductor,
 * custody-store, crash-worker, ...). They are consumed, not invoked, so
 * "unreferenced by an npm script" is the correct state for them and counting
 * them would pad the census with false debt.
 */
export function collectLaneSurfaces(repoRoot = defaultRepoRoot) {
  const scriptsDir = path.join(repoRoot, 'scripts');
  const testsDir = path.join(scriptsDir, '__tests__');
  const checks = existsSync(scriptsDir)
    ? readdirSync(scriptsDir)
      .filter((f) => /^check-.*model-village.*\.mjs$/.test(f))
      .map((f) => `scripts/${f}`)
    : [];
  const tests = existsSync(testsDir)
    ? readdirSync(testsDir)
      .filter((f) => /model-village.*\.test\.mjs$/.test(f))
      .map((f) => `scripts/__tests__/${f}`)
    : [];
  return [...checks, ...tests].sort();
}

/**
 * A surface is WIRED when its basename appears in some package.json script
 * body. Basename rather than full path because the repo's own scripts mix
 * `node scripts/x.mjs` and `node --test scripts/__tests__/x.test.mjs` forms,
 * and a basename cannot collide: every filename here is unique across both
 * directories.
 */
export function computeWiring(repoRoot = defaultRepoRoot) {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const bodies = Object.values(pkg.scripts ?? {}).join('\n');
  const surfaces = collectLaneSurfaces(repoRoot);
  const wired = [];
  const unwired = [];
  for (const surface of surfaces) {
    if (bodies.includes(path.basename(surface))) wired.push(surface);
    else unwired.push(surface);
  }
  return { surfaces, wired, unwired };
}

export function runLaneCensus({ repoRoot = defaultRepoRoot, allowlist = KNOWN_UNWIRED } = {}) {
  const { surfaces, wired, unwired } = computeWiring(repoRoot);
  const declared = new Map(allowlist.map((entry) => [entry.file, entry]));
  const unwiredSet = new Set(unwired);
  const failures = [];

  for (const surface of unwired) {
    if (!declared.has(surface)) {
      failures.push({
        kind: 'NEW_ORPHAN',
        file: surface,
        detail: 'exists on disk, is reachable from no npm script, and is not declared in '
          + 'KNOWN_UNWIRED. A proof nothing runs is not evidence. Wire it into an npm '
          + 'script, or declare it here with a reason that says why it cannot be wired.',
      });
    }
  }

  for (const entry of allowlist) {
    if (!existsSync(path.join(repoRoot, entry.file))) {
      failures.push({
        kind: 'DEAD_ALLOWLIST_ENTRY',
        file: entry.file,
        detail: 'declared unwired but no longer exists on disk. Remove the entry; a list '
          + 'that outlives its files stops describing the repo and starts excusing it.',
      });
      continue;
    }
    if (!unwiredSet.has(entry.file)) {
      failures.push({
        kind: 'RETIRED_ALLOWLIST_ENTRY',
        file: entry.file,
        detail: 'declared unwired but IS now reachable from an npm script. Remove the '
          + 'entry so the census stops reporting a debt that was already paid.',
      });
      continue;
    }
    if (!entry.reason || !UNWIRED_REASONS[entry.reason]) {
      failures.push({
        kind: 'MISSING_REASON',
        file: entry.file,
        detail: `reason "${entry.reason}" is not one of ${Object.keys(UNWIRED_REASONS).join(', ')}.`,
      });
    }
  }

  const byReason = {};
  for (const entry of allowlist) {
    byReason[entry.reason] = (byReason[entry.reason] ?? 0) + 1;
  }

  return {
    ok: failures.length === 0,
    failures,
    observed: {
      surfacesOnDisk: surfaces.length,
      wired: wired.length,
      unwired: unwired.length,
      declaredUnwired: allowlist.length,
      declaredByReason: byReason,
    },
    wired,
    unwired,
  };
}

function main() {
  const result = runLaneCensus();
  const receiptDir = path.join(defaultRepoRoot, '.tmp', 'hololand', 'model-village');
  mkdirSync(receiptDir, { recursive: true });
  const receiptPath = path.join(receiptDir, 'lane-census-receipt.json');
  writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`);

  const { observed } = result;
  console.log(`[hololand-model-village-lane-census] ${result.ok ? 'ok' : 'FAILED'}`);
  console.log(`receipt: ${receiptPath}`);
  console.log(`gate checks and proving tests on disk: ${observed.surfacesOnDisk}`);
  console.log(`  reachable from an npm script: ${observed.wired}`);
  console.log(`  declared unwired (see KNOWN_UNWIRED): ${observed.unwired}`);
  for (const [reason, count] of Object.entries(observed.declaredByReason)) {
    console.log(`    ${count} x ${reason}`);
  }
  if (!result.ok) {
    console.error('');
    for (const failure of result.failures) {
      console.error(`  ${failure.kind}  ${failure.file}`);
      console.error(`    ${failure.detail}`);
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
