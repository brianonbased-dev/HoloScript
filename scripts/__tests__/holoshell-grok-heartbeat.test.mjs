import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = process.cwd();
const testRoot = path.join(repoRoot, '.tmp', 'holoshell', 'self-test');
const heartbeatPath = path.join(testRoot, 'grok-heartbeat.json');
const heartbeatJsPath = path.join(testRoot, 'grok-heartbeat.js');
const lanesPath = path.join(testRoot, 'agent-lanes-from-grok-heartbeat.json');

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(
    result.status,
    0,
    `${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

const heartbeat = runNode([
  'scripts/holoshell-grok-heartbeat.mjs',
  '--self-test',
  '--json',
]);

assert.equal(heartbeat.schemaVersion, 'hololand.holoshell.grok-heartbeat.v0.1.0');
assert.equal(heartbeat.summary.status, 'observing');
assert.equal(heartbeat.summary.agentPresenceStatus, 'active_or_available');
assert.equal(heartbeat.summary.heavyAccessStatus, 'active');
assert.equal(heartbeat.summary.cliOperatorStatus, 'trusted_ready');
assert.equal(heartbeat.summary.authRuntimeStatus, 'authenticated');
assert.equal(heartbeat.summary.autonomyStatus, 'eligible_after_workflow_approval');
assert.equal(heartbeat.summary.latestObservationStatus, 'completed');
assert.ok(existsSync(heartbeatPath), 'expected heartbeat JSON output');
assert.ok(existsSync(heartbeatJsPath), 'expected heartbeat browser bootstrap');
assert.match(readFileSync(heartbeatJsPath, 'utf8'), /HOLOSHELL_GROK_HEARTBEAT/);

const lanes = runNode([
  'scripts/holoshell-agent-lanes.mjs',
  '--no-process-scan',
  '--grok-heartbeat',
  heartbeatPath,
  '--output',
  lanesPath,
  '--json',
]);

const grokLane = lanes.lanes.find((lane) => lane.laneId === 'grok-build');
assert.ok(grokLane, 'expected Grok Build lane');
assert.equal(grokLane.status, 'active_or_available');
assert.equal(grokLane.heartbeat.status, 'observing');
assert.equal(grokLane.heartbeat.cliOperatorStatus, 'trusted_ready');
assert.equal(grokLane.heartbeat.authRuntimeStatus, 'authenticated');
assert.equal(grokLane.heartbeat.latestObservationStatus, 'completed');
assert.equal(lanes.summary.grokHeartbeatStatus, 'observing');
assert.equal(lanes.summary.grokCliOperatorStatus, 'trusted_ready');
assert.equal(lanes.summary.heartbeatLaneCount, 1);

console.log('HoloShell Grok heartbeat test passed.');
