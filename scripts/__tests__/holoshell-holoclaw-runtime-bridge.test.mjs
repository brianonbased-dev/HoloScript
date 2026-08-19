#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SELF_TEST_DIR = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test');
const BRIDGE_OUTPUT = path.join(SELF_TEST_DIR, 'holoclaw-runtime-bridge.json');
const WORKFLOW_OUTPUT = path.join(SELF_TEST_DIR, 'workflow-latest.json');
const GATE_OUTPUT = path.join(SELF_TEST_DIR, 'brain-intent-gate-latest.json');
const APPROVAL_OUTPUT = path.join(SELF_TEST_DIR, 'holoclaw-workflow-approval.json');
const APPROVAL_JS_OUTPUT = path.join(SELF_TEST_DIR, 'holoclaw-workflow-approval.js');
const APPROVAL_DIR = path.join(SELF_TEST_DIR, 'holoclaw-workflow-approval-bundles');

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
  return result;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

runNode(['scripts/holoshell-holoclaw-runtime-bridge.mjs', '--self-test', '--json']);

assert.equal(existsSync(BRIDGE_OUTPUT), true, 'bridge receipt should be written');
assert.equal(existsSync(WORKFLOW_OUTPUT), true, 'workflow receipt should be written');
assert.equal(existsSync(GATE_OUTPUT), true, 'intent gate receipt should be written');

const bridge = readJson(BRIDGE_OUTPUT);
const workflow = readJson(WORKFLOW_OUTPUT);
const gate = readJson(GATE_OUTPUT);

assert.equal(bridge.schemaVersion, 'hololand.holoshell.holoclaw-runtime-bridge.v0.1.0');
assert.equal(bridge.summary.workflowKind, 'holoclaw_runtime_bridge');
assert.equal(bridge.summary.runtimeReady, true);
assert.equal(bridge.summary.pendingApprovalCount, 1);
assert.equal(bridge.policy.openClawRuntimeBackendAllowed, false);
assert.equal(bridge.policy.nemoClawRuntimeBackendAllowed, false);
assert.equal(bridge.receipt.destructiveActionsTaken, false);
assert.equal(bridge.receipt.runtimeTickExecuted, false);
assert.ok(bridge.skills.selected.some((skill) => skill.name === 'code-health'));

assert.equal(workflow.schemaVersion, 'hololand.holoshell.workflow.v0.1.0');
assert.equal(workflow.summary.workflowKind, 'holoclaw_runtime_bridge');
assert.equal(workflow.summary.targetSurface, 'HoloClaw AgentRunner');
assert.equal(workflow.summary.pendingApprovalCount, 1);
assert.equal(workflow.holoclawRuntime.runtimeMode, 'tick');

assert.equal(gate.schemaVersion, 'hololand.holoshell.brain-intent-gate.v0.1.0');
assert.equal(gate.summary.caseId, 'holoshell-holoclaw-runtime-bridge.v0');
assert.equal(gate.summary.executionAllowed, true);

runNode([
  'scripts/holoshell-workflow-approval-bundle.mjs',
  '--workflow',
  WORKFLOW_OUTPUT,
  '--output',
  APPROVAL_OUTPUT,
  '--js-output',
  APPROVAL_JS_OUTPUT,
  '--bundle-dir',
  APPROVAL_DIR,
  '--json',
]);

const approval = readJson(APPROVAL_OUTPUT);
assert.equal(approval.schemaVersion, 'hololand.holoshell.workflow-approval.v0.1.0');
assert.equal(approval.summary.status, 'pending_user_approval');
assert.equal(approval.sourceAnchors.workflowAdapter, 'scripts/holoshell-holoclaw-runtime-bridge.mjs');
assert.ok(approval.execution.commandPreview.includes('holoshell-holoclaw-runtime-bridge.mjs'));
assert.equal(approval.workflowRequest.agentHandle, 'holoclaw');

console.log('HoloShell HoloClaw runtime bridge test passed.');
