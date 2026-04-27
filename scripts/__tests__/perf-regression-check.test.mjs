#!/usr/bin/env node
/**
 * Smoke + correctness tests for scripts/perf-regression-check.mjs.
 *
 * Drives the script via `child_process.spawnSync` against a tmp dir
 * with synthetic baseline + results files. Asserts:
 *   - exit 0 on no-baseline (warning path)
 *   - exit 0 on within-threshold deltas (incl. improvements)
 *   - exit 1 on >threshold regression
 *   - exit 0 with warning on baseline-but-no-current-results-for-date
 *   - --update-baseline writes a fresh baseline.json
 *
 * Pure Node, no test framework (the harness package's vitest loads slow
 * for a CI script test). Run via: `node scripts/__tests__/perf-regression-check.test.mjs`.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT = join(REPO_ROOT, "scripts", "perf-regression-check.mjs");

let testsRun = 0;
let testsFailed = 0;

function fakeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "perf-regr-test-"));
  mkdirSync(join(dir, "benchmarks", "results"), { recursive: true });
  mkdirSync(join(dir, "scripts"), { recursive: true });
  return dir;
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function runScript(args, cwd) {
  const result = spawnSync("node", [SCRIPT, ...args], {
    cwd,
    env: {
      ...process.env,
      GIT_DIR: "/dev/null", // suppress gitHead noise
      HOLO_PERF_REGRESSION_REPO_ROOT: cwd, // redirect baseline+results paths
    },
    encoding: "utf-8",
  });
  return { exit: result.status, stdout: result.stdout, stderr: result.stderr };
}

function makeResultsFile(repo, date, scenario, results) {
  const path = join(repo, "benchmarks", "results", date, `${scenario}.json`);
  writeJson(path, { scenario, results, summary: {} });
  return path;
}

function makeBaseline(repo, scenarios, axes = null) {
  const baseline = {
    version: "v1",
    frozen_at: new Date().toISOString(),
    frozen_by_commit: "test",
    axes: axes ?? {
      compileTimeMs: { regression_threshold_pct: 5, comparator: "lower-is-better" },
      outputSizeBytes: { regression_threshold_pct: 30, comparator: "lower-is-better" },
    },
    scenarios,
  };
  writeJson(join(repo, "benchmarks", "baseline.json"), baseline);
}

function ymd() {
  return new Date().toISOString().slice(0, 10);
}

function assertEq(actual, expected, name) {
  testsRun++;
  if (actual === expected) {
    console.log(`  ✓ ${name}`);
  } else {
    testsFailed++;
    console.error(`  ✗ ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertContains(haystack, needle, name) {
  testsRun++;
  if (typeof haystack === "string" && haystack.includes(needle)) {
    console.log(`  ✓ ${name}`);
  } else {
    testsFailed++;
    console.error(`  ✗ ${name}: stdout did not contain ${JSON.stringify(needle)}`);
    console.error(`     stdout: ${haystack?.slice(0, 200)}`);
  }
}

console.log("Test 1: no baseline file → exit 0 with warning");
{
  const repo = fakeRepo();
  // Add a results file so the script doesn't early-exit on "no results for date"
  makeResultsFile(repo, ymd(), "test-scen", [
    { platform: "unity", compileTimeMs: 100, outputSizeBytes: 1000, success: true },
  ]);
  const r = runScript([], repo);
  assertEq(r.exit, 0, "exit 0 when baseline missing");
  assertContains(r.stdout, "WARNING", "warns about missing baseline");
  rmSync(repo, { recursive: true, force: true });
}

console.log("Test 2: within-threshold change → exit 0");
{
  const repo = fakeRepo();
  makeBaseline(repo, {
    "test-scen": { platforms: { unity: { compileTimeMs: 100, outputSizeBytes: 1000 } } },
  });
  // 4% slower — under 5% threshold
  makeResultsFile(repo, ymd(), "test-scen", [
    { platform: "unity", compileTimeMs: 104, outputSizeBytes: 1000, success: true },
  ]);
  const r = runScript([], repo);
  assertEq(r.exit, 0, "exit 0 within threshold");
  assertContains(r.stdout, "PASS", "prints PASS");
  rmSync(repo, { recursive: true, force: true });
}

console.log("Test 3: >threshold regression on compileTimeMs → exit 1");
{
  const repo = fakeRepo();
  makeBaseline(repo, {
    "test-scen": { platforms: { unity: { compileTimeMs: 100, outputSizeBytes: 1000 } } },
  });
  // 10% slower — over 5% threshold
  makeResultsFile(repo, ymd(), "test-scen", [
    { platform: "unity", compileTimeMs: 110, outputSizeBytes: 1000, success: true },
  ]);
  const r = runScript([], repo);
  assertEq(r.exit, 1, "exit 1 on regression");
  assertContains(r.stdout, "REGRESSION", "prints REGRESSION");
  assertContains(r.stdout, "compileTimeMs", "names the regressed axis");
  rmSync(repo, { recursive: true, force: true });
}

console.log("Test 4: improvement reported but does not fail");
{
  const repo = fakeRepo();
  makeBaseline(repo, {
    "test-scen": { platforms: { unity: { compileTimeMs: 100, outputSizeBytes: 1000 } } },
  });
  // 30% faster
  makeResultsFile(repo, ymd(), "test-scen", [
    { platform: "unity", compileTimeMs: 70, outputSizeBytes: 1000, success: true },
  ]);
  const r = runScript([], repo);
  assertEq(r.exit, 0, "exit 0 on improvement");
  assertContains(r.stdout, "improvement", "prints improvement section");
  rmSync(repo, { recursive: true, force: true });
}

console.log("Test 5: --threshold 10 lifts gate above 8% regression");
{
  const repo = fakeRepo();
  makeBaseline(repo, {
    "test-scen": { platforms: { unity: { compileTimeMs: 100, outputSizeBytes: 1000 } } },
  });
  // 8% slower — over default 5%, under override 10%
  makeResultsFile(repo, ymd(), "test-scen", [
    { platform: "unity", compileTimeMs: 108, outputSizeBytes: 1000, success: true },
  ]);
  const r = runScript(["--threshold", "10"], repo);
  assertEq(r.exit, 0, "exit 0 when override raises gate");
  rmSync(repo, { recursive: true, force: true });
}

console.log("Test 6: no results for the date → exit 0 with notice");
{
  const repo = fakeRepo();
  makeBaseline(repo, {
    "test-scen": { platforms: { unity: { compileTimeMs: 100, outputSizeBytes: 1000 } } },
  });
  // No results file produced
  const r = runScript([], repo);
  assertEq(r.exit, 0, "exit 0 with no results to check");
  assertContains(r.stdout, "no results", "prints no-results notice");
  rmSync(repo, { recursive: true, force: true });
}

console.log("Test 7: --update-baseline writes baseline.json from current results");
{
  const repo = fakeRepo();
  makeResultsFile(repo, ymd(), "scen-A", [
    { platform: "unity", compileTimeMs: 50, outputSizeBytes: 500, success: true },
  ]);
  const r = runScript(["--update-baseline"], repo);
  assertEq(r.exit, 0, "exit 0 on --update-baseline");
  const written = JSON.parse(readFileSync(join(repo, "benchmarks", "baseline.json"), "utf-8"));
  assertEq(written.version, "v1", "baseline has version v1");
  assertEq(written.scenarios["scen-A"]?.platforms?.unity?.compileTimeMs, 50, "baseline carries compile time");
  assertEq(written.scenarios["scen-A"]?.platforms?.unity?.outputSizeBytes, 500, "baseline carries size");
  rmSync(repo, { recursive: true, force: true });
}

console.log("Test 8: new scenario in current results is reported but does not fail");
{
  const repo = fakeRepo();
  makeBaseline(repo, {
    "old-scen": { platforms: { unity: { compileTimeMs: 100, outputSizeBytes: 1000 } } },
  });
  // Current run has a NEW scenario the baseline does not know about — should not fail.
  makeResultsFile(repo, ymd(), "old-scen", [
    { platform: "unity", compileTimeMs: 100, outputSizeBytes: 1000, success: true },
  ]);
  makeResultsFile(repo, ymd(), "new-scen", [
    { platform: "unity", compileTimeMs: 200, outputSizeBytes: 2000, success: true },
  ]);
  const r = runScript([], repo);
  assertEq(r.exit, 0, "exit 0 on new scenario");
  assertContains(r.stdout, "new scenario", "reports new scenarios");
  rmSync(repo, { recursive: true, force: true });
}

  console.log("Test 9: latencyMs within 10% threshold → exit 0");
  {
    const repo = fakeRepo();
    makeBaseline(repo, {
      "06-tool-latency": {
        platforms: {
          holo_query_codebase: { latencyMs: 300, outputSizeBytes: 2048 },
        },
      },
    }, {
      latencyMs: { regression_threshold_pct: 10, comparator: "lower-is-better" },
      outputSizeBytes: { regression_threshold_pct: 30, comparator: "lower-is-better" },
    });
    // 8% slower — under 10% latencyMs threshold
    makeResultsFile(repo, ymd(), "06-tool-latency", [
      { platform: "holo_query_codebase", latencyMs: 324, outputSizeBytes: 2048, success: true },
    ]);
    const r = runScript([], repo);
    assertEq(r.exit, 0, "exit 0 when latencyMs within 10% threshold");
    rmSync(repo, { recursive: true, force: true });
  }

  console.log("Test 10: latencyMs >10% regression → exit 1");
  {
    const repo = fakeRepo();
    makeBaseline(repo, {
      "06-tool-latency": {
        platforms: {
          holo_query_codebase: { latencyMs: 300, outputSizeBytes: 2048 },
        },
      },
    }, {
      latencyMs: { regression_threshold_pct: 10, comparator: "lower-is-better" },
      outputSizeBytes: { regression_threshold_pct: 30, comparator: "lower-is-better" },
    });
    // 20% slower — over 10% latencyMs threshold
    makeResultsFile(repo, ymd(), "06-tool-latency", [
      { platform: "holo_query_codebase", latencyMs: 360, outputSizeBytes: 2048, success: true },
    ]);
    const r = runScript([], repo);
    assertEq(r.exit, 1, "exit 1 on latencyMs >10% regression");
    assertContains(r.stdout, "REGRESSION", "prints REGRESSION for latencyMs");
    assertContains(r.stdout, "latencyMs", "names the latencyMs axis");
    rmSync(repo, { recursive: true, force: true });
  }

  console.log("");
  console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
  process.exit(testsFailed === 0 ? 0 : 1);
