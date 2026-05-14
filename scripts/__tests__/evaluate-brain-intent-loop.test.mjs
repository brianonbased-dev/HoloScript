#!/usr/bin/env node
/**
 * Pure Node tests for scripts/evaluate-brain-intent-loop.mjs.
 *
 * Run via: `node scripts/__tests__/evaluate-brain-intent-loop.test.mjs`.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT = join(REPO_ROOT, "scripts", "evaluate-brain-intent-loop.mjs");
const HOLOSHELL_CASE = join(REPO_ROOT, "research", "brain-intent-eval", "cases", "holoshell-room-marathon.case.json");
const TRAIT_CASE = join(REPO_ROOT, "research", "brain-intent-eval", "cases", "trait-inference-gate-refusal.case.json");
const FLEET_CASE = join(REPO_ROOT, "research", "brain-intent-eval", "cases", "fleet-trust-auditor-gate.case.json");
const PROMPT_ONLY_CONTROL = join(REPO_ROOT, "research", "brain-intent-eval", "cases", "holoshell-prompt-only-baseline.control.case.json");
const MUTATION_CONTROL = join(REPO_ROOT, "research", "brain-intent-eval", "cases", "holoshell-mutation-before-approval.control.case.json");
const TRAIT_BRAIN = join(REPO_ROOT, "compositions", "trait-inference-brain.hsplus");
const FLEET_BRAIN = join(REPO_ROOT, "compositions", "fleet-trust-auditor-brain.hsplus");

let testsRun = 0;
let testsFailed = 0;

function runScript(args) {
  return spawnSync("node", [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

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

console.log("Test 1: self-test passes");
{
  const result = runScript(["--self-test"]);
  assertEq(result.status, 0, "self-test exits 0");
  assertOk(result.stdout.includes("self-test: pass"), "self-test prints pass");
}

console.log("Test 2: HoloShell case writes a passing receipt");
{
  const dir = mkdtempSync(join(tmpdir(), "brain-intent-holoshell-"));
  const out = join(dir, "holoshell.eval.json");
  const result = runScript(["--case", HOLOSHELL_CASE, "--output", out, "--runtime-gate", "--strict"]);
  assertEq(result.status, 0, "HoloShell case exits 0 in strict mode");
  assertOk(existsSync(out), "HoloShell receipt exists");
  const receipt = readJson(out);
  assertEq(receipt.summary.status, "pass", "HoloShell receipt status");
  assertEq(receipt.summary.passed, 11, "HoloShell receipt hard pass count");
  assertEq(receipt.enforcementBoundary.runtimeBlocking, true, "HoloShell runtime gate is blocking");
  assertEq(receipt.gate.allowed, true, "HoloShell runtime gate allows passing receipt");
  rmSync(dir, { recursive: true, force: true });
}

console.log("Test 3: trait brain case extracts brain fields");
{
  const dir = mkdtempSync(join(tmpdir(), "brain-intent-trait-"));
  const out = join(dir, "trait.eval.json");
  const result = runScript(["--case", TRAIT_CASE, "--brain", TRAIT_BRAIN, "--output", out, "--strict"]);
  assertEq(result.status, 0, "trait case exits 0 in strict mode");
  const receipt = readJson(out);
  assertEq(receipt.summary.status, "pass", "trait receipt status");
  assertEq(receipt.brain.name, "trait-inference-brain", "brain name extracted");
  assertOk(receipt.brain.extractedFieldCount > 0, "brain contract fields extracted");
  rmSync(dir, { recursive: true, force: true });
}

console.log("Test 4: mismatched brain fails receipt but not default CLI");
{
  const dir = mkdtempSync(join(tmpdir(), "brain-intent-mismatch-default-"));
  const out = join(dir, "mismatch.eval.json");
  const result = runScript(["--case", HOLOSHELL_CASE, "--brain", TRAIT_BRAIN, "--output", out]);
  assertEq(result.status, 0, "mismatch default exits 0");
  const receipt = readJson(out);
  assertEq(receipt.summary.status, "fail", "mismatch receipt status");
  assertOk(receipt.checks.some((item) => item.id === "brain-name-match" && !item.pass), "mismatch catches brain-name-match");
  rmSync(dir, { recursive: true, force: true });
}

console.log("Test 5: mismatched brain fails strict CLI");
{
  const dir = mkdtempSync(join(tmpdir(), "brain-intent-mismatch-strict-"));
  const out = join(dir, "mismatch-strict.eval.json");
  const result = runScript(["--case", HOLOSHELL_CASE, "--brain", TRAIT_BRAIN, "--output", out, "--strict"]);
  assertEq(result.status, 1, "mismatch strict exits 1");
  assertOk(existsSync(out), "strict mismatch still writes receipt");
  rmSync(dir, { recursive: true, force: true });
}

console.log("Test 6: mutation-before-approval control fails runtime gate");
{
  const dir = mkdtempSync(join(tmpdir(), "brain-intent-mutation-control-"));
  const out = join(dir, "mutation-control.eval.json");
  const result = runScript(["--case", MUTATION_CONTROL, "--output", out, "--runtime-gate", "--strict"]);
  assertEq(result.status, 1, "mutation control exits 1 in strict mode");
  const receipt = readJson(out);
  assertEq(receipt.summary.status, "fail", "mutation control receipt status");
  assertEq(receipt.gate.allowed, false, "mutation control gate blocks");
  assertOk(receipt.gate.failedCheckIds.includes("mutation-boundary"), "mutation control catches mutation boundary");
  rmSync(dir, { recursive: true, force: true });
}

console.log("Test 7: prompt-only baseline control fails runtime gate");
{
  const dir = mkdtempSync(join(tmpdir(), "brain-intent-prompt-only-control-"));
  const out = join(dir, "prompt-only-control.eval.json");
  const result = runScript(["--case", PROMPT_ONLY_CONTROL, "--output", out, "--runtime-gate", "--strict"]);
  assertEq(result.status, 1, "prompt-only control exits 1 in strict mode");
  const receipt = readJson(out);
  assertEq(receipt.summary.status, "fail", "prompt-only control receipt status");
  assertEq(receipt.gate.allowed, false, "prompt-only gate blocks");
  assertOk(receipt.gate.failedCheckIds.includes("approval-minted"), "prompt-only control catches missing approval");
  rmSync(dir, { recursive: true, force: true });
}

console.log("Test 8: fleet trust auditor adds a third brain family");
{
  const dir = mkdtempSync(join(tmpdir(), "brain-intent-fleet-"));
  const out = join(dir, "fleet.eval.json");
  const result = runScript(["--case", FLEET_CASE, "--brain", FLEET_BRAIN, "--output", out, "--runtime-gate", "--strict"]);
  assertEq(result.status, 0, "fleet case exits 0 in strict mode");
  const receipt = readJson(out);
  assertEq(receipt.summary.status, "pass", "fleet receipt status");
  assertEq(receipt.brain.name, "fleet-trust-auditor-brain", "fleet brain name extracted");
  assertEq(receipt.gate.allowed, true, "fleet runtime gate allows passing receipt");
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${testsRun - testsFailed}/${testsRun} tests passed`);
if (testsFailed) process.exit(1);
