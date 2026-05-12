#!/usr/bin/env node
/**
 * Pure Node tests for scripts/p043-sku-matrix.mjs.
 *
 * Run with: node scripts/__tests__/p043-sku-matrix.test.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMatrix,
  REQUIRED_RUNS,
  SAMPLE_SECONDS,
  SKUS,
  summarizeResults,
  validateArtifact,
  WARMUP_SECONDS,
} from "../p043-sku-matrix.mjs";

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

function writeValidArtifact(path, adapterInfo = { vendor: "NVIDIA", device: "RTX 4090" }) {
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        status: "completed",
        captureMode: "browser-webgpu",
        adapterInfo,
        browserVersion: "Chrome 125",
        osVersion: "Windows",
        frameTimeMs: { samples: [8.1, 8.2, 8.4], p50: 8.2, p95: 8.4, p99: 8.4 },
        perUserFrameTimeMs: { p95: 4.2 },
        sharedSortMs: { p95: 2.1 },
        visibilityMaskMs: { p95: 0.7 },
        droppedFrameCount: 0,
        thermalState: "nominal",
        requiredRuns: REQUIRED_RUNS,
        runs: [{ run: 1 }, { run: 2 }, { run: 3 }],
      },
      null,
      2,
    )}\n`,
  );
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
assertEq(matrix.warmupSeconds, WARMUP_SECONDS, "warmup duration is exported");
assertEq(matrix.requiredRuns, REQUIRED_RUNS, "required repeated runs are exported");
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
  assertEq(cell.requiredRuns, 3, `${cell.id} required runs`);
}

console.log("Test 4: result summary starts pending");
const summary = summarizeResults(matrix);
assertEq(summary.targetCellCount, 45, "summary target count");
assertEq(summary.capturedCellCount, 0, "no captured cells in clean tree");
assertEq(summary.pendingCellCount, 45, "all cells pending without artifacts");
assertEq(summary.invalidCellCount, 0, "no invalid artifacts without artifacts");
rmSync(emptyOutputRoot, { recursive: true, force: true });

console.log("Test 5: artifact validation checks adapter tokens");
const artifactDir = mkdtempSync(join(tmpdir(), "p043-artifact-"));
const artifactPath = join(artifactDir, "cell.json");
const artifactMatrix = buildMatrix({ outputRoot: artifactDir.replace(/\\/g, "/") });
const artifactCell = artifactMatrix.cells.find((cell) => cell.id === "rtx4090__indoor-500k__n2");
writeValidArtifact(artifactPath);
assertEq(validateArtifact({ ...artifactCell, artifactPath }, artifactPath, artifactMatrix).status, "captured", "valid artifact captured");
writeValidArtifact(artifactPath, { vendor: "Intel", device: "Arc" });
const invalid = validateArtifact({ ...artifactCell, artifactPath }, artifactPath, artifactMatrix);
assertEq(invalid.status, "invalid", "wrong adapter invalid");
assertDeepEq(invalid.missingAdapterTokens, ["nvidia", "4090"], "wrong adapter token list");
rmSync(artifactDir, { recursive: true, force: true });

console.log("Test 6: CLI writes a plan file");
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

console.log("Test 7: CLI tolerates pnpm argument separator");
const separatorResult = spawnSync("node", [SCRIPT, "--", "--list-cells", "--sku", "quest3-adreno740"], {
  cwd: REPO_ROOT,
  encoding: "utf8",
});
assertEq(separatorResult.status, 0, "separator CLI exits 0");
assertOk(separatorResult.stdout.includes("quest3-adreno740__indoor-500k__n2"), "separator CLI lists Quest cell");

console.log("Test 8: run-cell forwards P043_REQUIRED_RUNS to capture command");
const envTmp = mkdtempSync(join(tmpdir(), "p043-run-cell-env-"));
const envOut = join(envTmp, "cell-env.json").replace(/\\/g, "/");
const envProbe = join(envTmp, "write-env.mjs").replace(/\\/g, "/");
writeFileSync(
  envProbe,
  `import { writeFileSync } from "node:fs";\n` +
    `const requiredRuns = Number(process.env.P043_REQUIRED_RUNS);\n` +
    `writeFileSync(process.env.P043_OUTPUT_PATH, JSON.stringify({\n` +
    `  status: "completed",\n` +
    `  captureMode: "browser-webgpu",\n` +
    `  adapterInfo: { vendor: "Qualcomm", device: "Adreno 740" },\n` +
    `  browserVersion: "Quest Browser",\n` +
    `  osVersion: "Quest OS",\n` +
    `  frameTimeMs: { samples: [8.1, 8.2, 8.3], p50: 8.2, p95: 8.3, p99: 8.3 },\n` +
    `  perUserFrameTimeMs: { p95: 4.2 },\n` +
    `  sharedSortMs: { p95: 2.1 },\n` +
    `  visibilityMaskMs: { p95: 0.7 },\n` +
    `  droppedFrameCount: 0,\n` +
    `  thermalState: "nominal",\n` +
    `  requiredRuns,\n` +
    `  runs: Array.from({ length: requiredRuns }, (_, index) => ({ run: index + 1 })),\n` +
    `  cell: process.env.P043_CELL_ID,\n` +
    `  sku: process.env.P043_SKU_ID,\n` +
    `  views: process.env.P043_VIEW_COUNT,\n` +
    `  sampleSeconds: process.env.P043_SAMPLE_SECONDS,\n` +
    `  warmupSeconds: process.env.P043_WARMUP_SECONDS,\n` +
    `  envRequiredRuns: process.env.P043_REQUIRED_RUNS\n` +
    `}, null, 2));\n`,
  "utf8"
);
const runCellResult = spawnSync(
  "node",
  [
    SCRIPT,
    "--run-cell",
    "quest3-adreno740__indoor-500k__n2",
    "--out",
    envOut,
  ],
  {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, P043_BENCH_COMMAND: `node ${envProbe}` },
  }
);
assertEq(runCellResult.status, 0, "run-cell command exits 0 when capture command succeeds");
const forwarded = JSON.parse(readFileSync(envOut, "utf8"));
assertEq(forwarded.cell, "quest3-adreno740__indoor-500k__n2", "run-cell forwards cell id");
assertEq(forwarded.requiredRuns, 3, "run-cell writes numeric required run count");
assertEq(forwarded.envRequiredRuns, "3", "run-cell forwards required run count");
rmSync(envTmp, { recursive: true, force: true });

console.log("Test 9: result summary rejects wrong-SKU adapter artifacts");
const wrongAdapterRoot = mkdtempSync(join(tmpdir(), "p043-wrong-adapter-")).replace(/\\/g, "/");
const wrongMatrix = buildMatrix({
  generatedAt: "2026-05-12T00:00:00.000Z",
  gitHead: "test",
  outputRoot: wrongAdapterRoot,
});
const wrongCell = wrongMatrix.cells.find((cell) => cell.id === "quest3-adreno740__indoor-500k__n2");
const wrongPath = resolve(REPO_ROOT, wrongCell.artifactPath);
mkdirSync(dirname(wrongPath), { recursive: true });
writeFileSync(
  wrongPath,
  JSON.stringify(
    {
      status: "completed",
      captureMode: "browser-webgpu",
      adapterInfo: { vendor: "nvidia", device: "rtx 4090", description: "NVIDIA RTX 4090" },
      browserVersion: "test-browser",
      osVersion: "test-os",
      frameTimeMs: { samples: [1], p50: 1, p95: 1, p99: 1 },
      perUserFrameTimeMs: { p95: 0.5 },
      sharedSortMs: { p95: 0.4 },
      visibilityMaskMs: { p95: 0.1 },
      droppedFrameCount: 0,
      thermalState: "unknown",
      requiredRuns: 3,
      runs: [{ run: 1 }],
    },
    null,
    2
  ),
  "utf8"
);
const wrongSummary = summarizeResults(wrongMatrix);
assertEq(wrongSummary.capturedCellCount, 0, "wrong adapter artifact is not captured");
assertEq(wrongSummary.invalidCellCount, 1, "wrong adapter artifact is invalid");
assertOk(
  wrongSummary.invalid[0].missing.some((entry) => entry.includes("adapterInfo tokens")),
  "invalid reason names adapter tokens"
);
rmSync(wrongAdapterRoot, { recursive: true, force: true });

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
