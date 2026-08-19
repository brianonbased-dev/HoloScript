#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUTPUT = path.join('.tmp', 'holoshell', 'self-test', 'legacy-app-reality.json');

function runSelfTest() {
  const result = spawnSync('node', ['scripts/holoshell-legacy-app-reality.mjs', '--self-test'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`self-test command failed\n${result.stdout}\n${result.stderr}`);
  }
}

function assertSnapshot() {
  const snapshot = JSON.parse(readFileSync(path.resolve(REPO_ROOT, OUTPUT), 'utf8'));
  const failures = [];
  if (snapshot.schemaVersion !== 'hololand.holoshell.legacy-app-reality.v0.1.0') failures.push('schema version mismatch');
  if (snapshot.schemaContract?.validationStatus !== 'pass') failures.push('expected HoloScript contract pass');
  if (snapshot.summary.agentInstanceCount < 2) failures.push('expected agent instances');
  if (snapshot.summary.shellInstanceCount < 1) failures.push('expected shell instance');
  if (snapshot.summary.networkConsumerCount < 2) failures.push('expected network consumers');
  if (snapshot.summary.processCountIsPeerCount !== false) failures.push('process count must not be peer count');
  if (!snapshot.lanes.some((lane) => lane.laneId === 'codex' && lane.color === 'cyan')) failures.push('missing codex cyan lane');
  if (!snapshot.networkConsumers.every((consumer) => consumer.evidence.includes('network_connection_owner'))) failures.push('network evidence missing');
  if (snapshot.redaction.remoteEndpointsIncluded !== false) failures.push('remote endpoints leaked');
  if (failures.length) throw new Error(`legacy app reality assertions failed:\n- ${failures.join('\n- ')}`);
}

runSelfTest();
assertSnapshot();
console.log('holoshell-legacy-app-reality test passed');
