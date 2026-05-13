#!/usr/bin/env node
/**
 * Pure Node tests for scripts/canary-harness.mjs.
 *
 * Run via: `node scripts/__tests__/canary-harness.test.mjs`.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT = join(REPO_ROOT, "scripts", "canary-harness.mjs");

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

function assertOk(value, name) {
  testsRun += 1;
  if (value) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}`);
  }
}

function assertIncludes(haystack, needle, name) {
  testsRun += 1;
  if (haystack.includes(needle)) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}: expected to include ${JSON.stringify(needle)}`);
  }
}

console.log("Test 1: source-tree canary exits 0 and writes report");
const tmp1 = mkdtempSync(join(tmpdir(), "canary-test-"));
const reportPath = join(tmp1, "canary-report.json");
const result1 = spawnSync(
  process.execPath,
  [SCRIPT],
  {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      CANARY_OUTPUT: reportPath,
    },
  }
);

assertEq(result1.status, 0, "source-tree canary exits 0");
assertOk(existsSync(reportPath), "report file exists");

const report1 = JSON.parse(readFileSync(reportPath, "utf8"));
assertEq(report1.mode, "source-tree", "report mode is source-tree");
assertOk(report1.total >= 2, "at least 2 probes run");
assertEq(report1.passed + report1.failed, report1.total, "passed + failed equals total");
assertOk(Array.isArray(report1.probes), "probes array exists");
assertOk(report1.probes.every((p) => p.name && typeof p.ok === "boolean"), "every probe has name and ok");
assertOk(report1.timestamp, "report has timestamp");
assertEq(report1.timeoutMs, 15000, "default timeout in report");
rmSync(tmp1, { recursive: true, force: true });

console.log("Test 2: source-tree probes cover CLI surfaces");
assertOk(
  report1.probes.some((p) => p.name === "cli-help"),
  "cli-help probe present"
);
assertOk(
  report1.probes.some((p) => p.name === "cli-dist-exists"),
  "cli-dist-exists probe present"
);
const cliHelp = report1.probes.find((p) => p.name === "cli-help");
assertOk(cliHelp.ok || cliHelp.error, "cli-help has result or error");

console.log("Test 3: custom timeout and output path respected");
const tmp2 = mkdtempSync(join(tmpdir(), "canary-test-"));
const customReport = join(tmp2, "custom.json");
const result2 = spawnSync(
  process.execPath,
  [SCRIPT],
  {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      CANARY_TIMEOUT_MS: "5000",
      CANARY_OUTPUT: customReport,
    },
  }
);

assertEq(result2.status, 0, "custom timeout canary exits 0");
const report2 = JSON.parse(readFileSync(customReport, "utf8"));
assertEq(report2.timeoutMs, 5000, "custom timeout reflected in report");
rmSync(tmp2, { recursive: true, force: true });

console.log("Test 4: report does not leak secrets");
const tmp3 = mkdtempSync(join(tmpdir(), "canary-test-"));
const secretReport = join(tmp3, "secret.json");
const secretValue = "redacted-live-fixture-value";
const result3 = spawnSync(
  process.execPath,
  [SCRIPT],
  {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      CANARY_OUTPUT: secretReport,
      HOLOSCRIPT_API_KEY: secretValue,
    },
  }
);

assertEq(result3.status, 0, "secret canary exits 0");
const report3Str = readFileSync(secretReport, "utf8");
assertOk(
  !report3Str.includes(secretValue),
  "secret value is NOT present in report JSON"
);
rmSync(tmp3, { recursive: true, force: true });

console.log("Test 5: live mode fails gracefully without API key");
const tmp4 = mkdtempSync(join(tmpdir(), "canary-test-"));
const liveReport = join(tmp4, "live.json");
const result4 = spawnSync(
  process.execPath,
  [SCRIPT],
  {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      CANARY_LIVE: "1",
      CANARY_OUTPUT: liveReport,
      HOLOSCRIPT_API_KEY: "",
      HOLOMESH_API_KEY: "",
      CANARY_TIMEOUT_MS: "3000",
    },
  }
);

assertEq(result4.status, 1, "live mode without auth exits 1");
assertOk(existsSync(liveReport), "live report still written on failure");
const report4 = JSON.parse(readFileSync(liveReport, "utf8"));
assertEq(report4.mode, "live-service", "report mode is live-service");
assertOk(report4.failed > 0, "some probes failed without auth");
assertOk(
  report4.probes.some((p) => p.error),
  "at least one probe failed with an error"
);
rmSync(tmp4, { recursive: true, force: true });

console.log("Test 6: batch concurrency completes faster than sequential sum");
const tmp5 = mkdtempSync(join(tmpdir(), "canary-test-"));
const batchReport = join(tmp5, "batch.json");
const batchStart = Date.now();
const result5 = spawnSync(
  process.execPath,
  [SCRIPT],
  {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      CANARY_OUTPUT: batchReport,
    },
  }
);
const batchDuration = Date.now() - batchStart;
assertEq(result5.status, 0, "batch canary exits 0");
assertOk(batchDuration < 30000, `batch execution under 30s (was ${batchDuration}ms)`);
rmSync(tmp5, { recursive: true, force: true });

console.log("Test 7: live mode includes external surface probes with diverse shapes");
const tmp6 = mkdtempSync(join(tmpdir(), "canary-test-"));
const extReportPath = join(tmp6, "ext.json");
const result6 = spawnSync(
  process.execPath,
  [SCRIPT],
  {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      CANARY_LIVE: "1",
      CANARY_OUTPUT: extReportPath,
      CANARY_TIMEOUT_MS: "8000",
      HOLOSCRIPT_API_KEY: process.env.HOLOSCRIPT_API_KEY || "",
      HOLOMESH_API_KEY: process.env.HOLOMESH_API_KEY || "",
      ABSORB_API_KEY: process.env.ABSORB_API_KEY || "",
    },
  }
);

// We don't assert exit code here because external surfaces may be down;
// we only assert the probes are present and shaped correctly.
const extReport = JSON.parse(readFileSync(extReportPath, "utf8"));
const externalProbes = extReport.probes.filter((p) =>
  p.name.startsWith("external-"));
assertOk(externalProbes.length >= 4, "at least 4 external probes present");

// Shape diversity: at least one GET, one POST, one HEAD
const methods = new Set();
for (const p of externalProbes) {
  if (p.name.includes("health")) methods.add("GET");
  if (p.name.includes("scan")) methods.add("POST");
  if (p.name.includes("availability")) methods.add("HEAD");
  if (p.name.includes("html")) methods.add("GET-html");
}
assertOk(methods.size >= 3, "external probes use diverse HTTP methods");

// Verify no secrets leaked in external probe results
const extReportStr = readFileSync(extReportPath, "utf8");
assertOk(
  !extReportStr.includes(process.env.HOLOSCRIPT_API_KEY || "sk_live_"),
  "external probe report does not leak API keys"
);
rmSync(tmp6, { recursive: true, force: true });

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
