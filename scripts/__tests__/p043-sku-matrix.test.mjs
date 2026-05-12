#!/usr/bin/env node
/**
 * Pure Node tests for scripts/p043-sku-matrix.mjs.
 *
 * Run via: `node scripts/__tests__/p043-sku-matrix.test.mjs`.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { buildMatrix, SAMPLE_SECONDS, SCENES, SKUS, summarizeResults } from "../p043-sku-matrix.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT = join(REPO_ROOT, "scripts", "p043-sku-matrix.mjs");

let testsRun = 0;
let testsFailed = 0;

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEq(actual, expected, name) {
  testsRun += 1;
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertOk(value, name) {
  testsRun += 1;
  if (value) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}`);
  }
}

console.log("Test 1: matrix shape");
const emptyOutputRoot = mkdtempSync(join(tmpdir(), "p043-empty-results-")).replace(/\\/g, "/");
const matrix = buildMatrix({
  generatedAt: "2026-05-12T00:00:00.000Z",
  gitHead: "test",
  outputRoot: emptyOutputRoot,
});

assertEq(matrix.schema_version, "p043-sku-matrix-v1", "schema version");
assertEq(matrix.sampleSeconds, SAMPLE_SECONDS, "sample duration is exported");
assertEq(matrix.scenes.length, 3, "three scenes");
assertEq(matrix.skus.length, 5, "five hardware SKUs");
assertEq(matrix.targetCellCount, 45, "5 SKUs x 3 scenes x 3 N values");
assertEq(matrix.cells.length, matrix.targetCellCount, "cell count matches target count");

console.log("Test 2: required N values by SKU");
const quest = SKUS.find((sku) => sku.id === "quest3-adreno740");
const rtx4090 = SKUS.find((sku) => sku.id === "rtx4090");
assertDeepEq(quest.nValues, [2, 3, 4], "Quest 3 N=2,3,4");
assertDeepEq(rtx4090.nValues, [2, 4, 8], "RTX 4090 N=2,4,8");

console.log("Test 3: every cell has capture command and artifact path");
for (const cell of matrix.cells) {
  assertOk(cell.captureCommand.includes(`--run-cell ${cell.id}`), `${cell.id} capture command`);
  assertOk(cell.artifactPath.endsWith(`/${cell.skuId}/${cell.sceneId}/n${cell.views}.json`), `${cell.id} artifact path`);
  assertEq(cell.sampleSeconds, 60, `${cell.id} sample seconds`);
}

console.log("Test 4: result summary starts pending");
const summary = summarizeResults(matrix);
assertEq(summary.targetCellCount, 45, "summary target count");
assertEq(summary.capturedCellCount, 0, "no captured cells in clean tree");
assertEq(summary.pendingCellCount, 45, "all cells pending without artifacts");
assertEq(summary.invalidCellCount, 0, "no invalid artifacts without artifacts");
rmSync(emptyOutputRoot, { recursive: true, force: true });

console.log("Test 5: CLI writes a plan file");
const tmp = mkdtempSync(join(tmpdir(), "p043-sku-matrix-"));
const planPath = join(tmp, "plan.json");
const result = spawnSync("node", [SCRIPT, "--write-plan", planPath], {
  cwd: REPO_ROOT,
  encoding: "utf8",
});

assertEq(result.status, 0, "write-plan exits 0");
assertOk(existsSync(planPath), "plan file exists");
const plan = JSON.parse(readFileSync(planPath, "utf8"));
assertEq(plan.targetCellCount, 45, "written plan target count");
rmSync(tmp, { recursive: true, force: true });

console.log("Test 6: CLI tolerates pnpm argument separator");
const separatorResult = spawnSync("node", [SCRIPT, "--", "--list-cells", "--sku", "quest3-adreno740"], {
  cwd: REPO_ROOT,
  encoding: "utf8",
});
assertEq(separatorResult.status, 0, "separator CLI exits 0");
assertOk(separatorResult.stdout.includes("quest3-adreno740__indoor-500k__n2"), "separator CLI lists Quest cell");

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
