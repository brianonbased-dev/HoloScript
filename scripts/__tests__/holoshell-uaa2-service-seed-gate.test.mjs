#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const OUTPUT_DIR = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'uaa2-service-seed-gate');
const FIXTURE_ROOT = path.join(OUTPUT_DIR, 'uaa2-service');
const RECEIPT_PATH = path.join(OUTPUT_DIR, 'receipt.json');
const WILD_RECEIPT_PATH = path.join(OUTPUT_DIR, 'wild-holoscript-intake.json');
const WILD_JS_PATH = path.join(OUTPUT_DIR, 'wild-holoscript-intake.js');
const LEARNING_PATH = path.join(OUTPUT_DIR, 'learning-signal.jsonl');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout ?? 120_000,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeFixture(relativePath, text) {
  const fullPath = path.join(FIXTURE_ROOT, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${text.trim()}\n`, 'utf8');
}

rmSync(OUTPUT_DIR, { recursive: true, force: true });

writeFixture('src/worlds/innovation/agent-orchestration.hsplus', `
@import "../logic/orchestration.ts"
world {
  data_binding { agents: api.post("/agents/query") }
  @for agent in agents { object "station" { @hoverable } }
}
`);
writeFixture('src/services/spatial/scripts/terminal-integration.hsplus', `
object "terminal_shell" {
  @state status = "ready"
  child object "reboot_button" { @on_click { emit("terminal:reboot") } }
}
`);
writeFixture('src/worlds/demo/enterprise-room.holo', `
composition "Enterprise Room" {
  metadata { title: "Enterprise Room" }
  environment { skybox: "quiet" }
  object "receipt_panel" { kind: "panel" }
}
`);
writeFixture('src/services/master-portal/orchestration/lotus.hs', `
pipeline "LotusTelemetry" {
  source RoomState { type: "mcp" }
  sink Shell { type: "mcp" }
}
`);

run(process.execPath, [
  'scripts/holoshell-uaa2-service-seed-gate.mjs',
  '--uaa2-root',
  FIXTURE_ROOT,
  '--output-dir',
  OUTPUT_DIR,
  '--receipt',
  RECEIPT_PATH,
  '--wild-receipt',
  WILD_RECEIPT_PATH,
  '--wild-js',
  WILD_JS_PATH,
  '--learning',
  LEARNING_PATH,
  '--json',
]);

const receipt = readJson(RECEIPT_PATH);
assert.equal(receipt.schema, 'hololand.holoshell.uaa2-service-seed-gate.v0.1.0');
assert.equal(receipt.status, 'pass');
assert.equal(receipt.source.path, 'apps/holoshell/source/holoshell-uaa2-service-seed-gate.hsplus');
assert.equal(receipt.source.format, 'hsplus');
assert.match(receipt.source.sha256, /^[a-f0-9]{64}$/);
assert.equal(receipt.seedReview.status, 'reviewed');
assert.equal(receipt.seedReview.path, 'docs/archive/HOLOLAND_UAA2_INTEGRATION.md');
assert.ok(receipt.seedReview.realCapabilitySignals.includes('ai_assisted_building'));
assert.ok(receipt.seedReview.realCapabilitySignals.includes('holoscript_output'));
assert.ok(receipt.seedReview.speculativeMarkers > 0);
assert.ok(receipt.seedReview.retiredRuntimeClaims.includes('direct HoloLand to uaa2-service API dependency'));
assert.equal(receipt.decision.outcome, 'promoted_to_build_gate');
assert.equal(receipt.decision.directServiceRuntimeDependency, false);
assert.equal(receipt.decision.generatedHoloScriptCanBeAccepted, true);
assert.equal(receipt.decision.adapterReceiptRequiredForWildSource, true);
assert.equal(receipt.wildIntake.status, 'pass');
assert.equal(receipt.wildIntake.summary.status, 'scanned');
assert.equal(receipt.wildIntake.summary.fileCount, 4);
assert.ok(receipt.wildIntake.summary.adapterNeededCount >= 2);
assert.equal(receipt.wildIntake.sourceFilesMutated, false);
assert.equal(receipt.wildIntake.adapterRequiredForExecution, true);
assert.ok(receipt.wildIntake.flagshipPromotionMap.some((item) => item.id === 'terminal-command-bubble'));
assert.equal(receipt.validation.status, 'pass');
assert.equal(receipt.validation.source.status, 'pass');
assert.equal(receipt.validation.seed.status, 'pass');
assert.equal(receipt.validation.wildIntake.status, 'pass');
assert.equal(receipt.learningSignal.status, 'ready');
assert.equal(receipt.learningSignal.rowCount, 3);
assert.equal(receipt.learningSignal.corpusCandidate, true);
assert.match(receipt.receipt.sha256, /^[a-f0-9]{64}$/);

const wildReceipt = readJson(WILD_RECEIPT_PATH);
assert.equal(wildReceipt.summary.status, 'scanned');
assert.equal(wildReceipt.invariants.readOnlyScan, true);
assert.equal(wildReceipt.invariants.sourceFilesMutated, false);
assert.equal(wildReceipt.invariants.adapterRequiredForExecution, true);
assert.ok(existsSync(WILD_JS_PATH), 'wild intake JS bootstrap missing');

const signals = readFileSync(LEARNING_PATH, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
assert.deepEqual(signals.map((signal) => signal.type), ['pattern', 'decision', 'next_action']);
assert.deepEqual(signals.map((signal) => signal.label), [
  'uaa2_service_seed_as_source_gate',
  'direct_service_dependency_retired',
  'promote_flagship_adapters',
]);
assert.ok(signals.every((signal) => signal.sourceReceipt === receipt.receipt.output));

console.log('holoshell uaa2-service seed gate test passed');
