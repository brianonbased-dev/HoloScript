#!/usr/bin/env node
/**
 * Smoke test for scripts/holoshell-format-gauntlet.mjs.
 *
 * The test exercises the dashboard layer in dry-run mode, avoiding browser
 * launch and signed board mutations while still proving every artifact edge.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holoshell-format-gauntlet.mjs');
const OUT_DIR = join(REPO_ROOT, '.scratch', 'holoshell-format-gauntlet-test');

let testsRun = 0;
let testsFailed = 0;

try {
  rmSync(OUT_DIR, { recursive: true, force: true });
  const result = spawnSync(
    process.execPath,
    [
      SCRIPT,
      'experiments/format-realism-gauntlet/manifest.json',
      '--out',
      OUT_DIR,
      '--dry-run',
      '--skip-screenshot',
      '--skip-headless',
      '--no-open',
      '--skip-file-tasks',
      '--skip-duplicate-search',
      '--json',
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }
  );

  assertEq(result.status, 0, 'dashboard dry-run exits 0');
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
  }

  const summary = JSON.parse(result.stdout);
  assertEq(summary.schema, 'holoshell-format-gauntlet-dashboard-v1', 'schema');
  assertEq(summary.scenario, 'humanoid-rock-throw', 'scenario');
  assertEq(summary.duplicateSearch.status, 'skipped', 'duplicate search skipped');
  assertEq(summary.filing.status, 'skipped', 'task filing skipped');
  assertEq(summary.taskCounts.generated, 10, 'generated task count');
  assertEq(summary.taskCounts.deduped, 10, 'deduped task count');
  assertOk(summary.previousScorecard, 'previous scorecard detected');
  assertEq(summary.dryRun, true, 'dryRun flag set');
  assertEq(summary.evidenceQuality, 'non-quality', 'evidenceQuality is non-quality for dry-run');
  assertOk(
    summary.deltas.every((row) => row.evidenceQuality === 'non-quality'),
    'all delta rows marked non-quality in dry-run'
  );

  const artifactPaths = [
    summary.artifacts.scorecard,
    summary.artifacts.contactSheet,
    summary.artifacts.dashboardReport,
    summary.artifacts.boardTasks,
    summary.artifacts.dedupedBoardTasks,
  ].map((path) => resolve(REPO_ROOT, path));

  for (const path of artifactPaths) {
    assertOk(existsSync(path), `${path} exists`);
  }

  const contactSheet = readFileSync(resolve(REPO_ROOT, summary.artifacts.contactSheet), 'utf8');
  assertOk(contactSheet.includes('Format Gauntlet Contact Sheet'), 'contact sheet has title');
  assertOk(contactSheet.includes('00_scene_loaded'), 'contact sheet lists segments');

  const dashboardReport = readFileSync(resolve(REPO_ROOT, summary.artifacts.dashboardReport), 'utf8');
  assertOk(dashboardReport.includes('non-quality'), 'dashboard report mentions non-quality evidence');
  assertOk(dashboardReport.includes('dry-run'), 'dashboard report mentions dry-run mode');
  assertOk(dashboardReport.includes('Evidence'), 'dashboard report has Evidence column in delta table');

  const taskBundle = JSON.parse(
    readFileSync(resolve(REPO_ROOT, summary.artifacts.dedupedBoardTasks), 'utf8')
  );
  assertEq(taskBundle.schema, 'holoshell-format-gauntlet-board-tasks-v1', 'task schema');
  assertEq(taskBundle.tasks.length, 10, 'task bundle length');
  assertOk(
    taskBundle.tasks.every((task) => task.tags.includes('format-stress')),
    'tasks carry format-stress tag'
  );
} finally {
  rmSync(OUT_DIR, { recursive: true, force: true });
}

if (testsFailed > 0) {
  console.error(`FAIL ${testsFailed}/${testsRun} assertions failed`);
  process.exit(1);
}

console.log(`PASS ${testsRun} assertions`);

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) {
    console.log(`  ok - ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  not ok - ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertOk(value, name) {
  testsRun += 1;
  if (value) {
    console.log(`  ok - ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  not ok - ${name}`);
  }
}

