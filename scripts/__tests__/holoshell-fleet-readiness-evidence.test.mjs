#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const tempRoot = mkdtempSync(path.join(tmpdir(), 'holoshell-fleet-readiness-'));
const fixture = path.join(
  repoRoot,
  'scripts',
  '__tests__',
  'fixtures',
  'holoshell-fleet-job-readiness-evidence.json'
);
const fleetOutput = path.join(tempRoot, 'fleet-readiness-evidence.json');
const fleetJsOutput = path.join(tempRoot, 'fleet-readiness-evidence.js');
const shellOutput = path.join(tempRoot, 'shell-objects.json');
const shellJsOutput = path.join(tempRoot, 'shell-objects.js');
const liveOutput = path.join(tempRoot, 'live-feed.json');
const liveJsOutput = path.join(tempRoot, 'live-feed.js');

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
  return result.stdout;
}

runNode([
  'scripts/holoshell-fleet-readiness-evidence.mjs',
  '--self-test',
  '--output',
  path.join(tempRoot, 'self-test-fleet.json'),
  '--js-output',
  path.join(tempRoot, 'self-test-fleet.js'),
]);

runNode([
  'scripts/holoshell-fleet-readiness-evidence.mjs',
  '--source',
  fixture,
  '--output',
  fleetOutput,
  '--js-output',
  fleetJsOutput,
]);

const fleet = JSON.parse(readFileSync(fleetOutput, 'utf8'));
assert.equal(fleet.schemaVersion, 'hololand.holoshell.fleet-readiness-evidence.v0.1.0');
assert.equal(fleet.summary.status, 'blocked');
assert.equal(fleet.summary.jobId, 'example-snn-smoke');
assert.equal(fleet.summary.laneProfile, 'webgpu-smoke');
assert.equal(fleet.summary.blockedReasonCount, 6);
assert.equal(fleet.summary.passGateCount, 2);
assert.equal(fleet.summary.mutationPerformed, false);
assert.equal(fleet.summary.fleetJobMutationPerformed, false);
assert.ok(fleet.tokens.some((token) => token.id === 'fleet-job-ready.lane-identity'));
assert.ok(fleet.blockers.some((blocker) => blocker.gateId === 'permission-envelope'));
assert.match(readFileSync(fleetJsOutput, 'utf8'), /HOLOSHELL_FLEET_READINESS_EVIDENCE/);
assert.ok(!JSON.stringify(fleet).includes('C:/Users/josep/Documents/GitHub/HoloScript'));

runNode([
  'scripts/holoshell-shell-objects.mjs',
  '--tmp-dir',
  tempRoot,
  '--output',
  shellOutput,
  '--js-output',
  shellJsOutput,
]);

const graph = JSON.parse(readFileSync(shellOutput, 'utf8'));
assert.ok(graph.objects.some((object) => object.id === 'room.fleet-readiness'));
assert.ok(graph.objects.some((object) => object.id === 'fleet.lane.unassigned'));
assert.ok(graph.objects.some((object) => object.id === 'fleet.job.example-snn-smoke'));
assert.ok(graph.objects.some((object) => object.id === 'receipt.fleet-job-ready.lane-identity'));
assert.ok(graph.objects.some((object) => object.objectKind === 'fleet_job_blocker'));
assert.equal(graph.summary.fleetReadinessStatus, 'blocked');
assert.equal(graph.summary.fleetLaneObjectCount, 1);
assert.equal(graph.summary.fleetJobObjectCount, 1);
assert.match(readFileSync(shellJsOutput, 'utf8'), /HOLOSHELL_SHELL_OBJECTS/);

runNode([
  'scripts/holoshell-live-feed.mjs',
  '--tmp-dir',
  tempRoot,
  '--output',
  liveOutput,
  '--js-output',
  liveJsOutput,
]);

const live = JSON.parse(readFileSync(liveOutput, 'utf8'));
assert.equal(live.summary.fleetReadinessStatus, 'blocked');
assert.equal(live.summary.fleetJobId, 'example-snn-smoke');
assert.equal(live.summary.fleetBudgetStatus, 'missing');
assert.equal(live.summary.fleetBlockedReasonCount, 6);
assert.equal(live.summary.fleetMutationPerformed, false);
assert.ok(live.timeline.some((entry) => entry.kind === 'fleet_readiness_evidence'));
assert.match(readFileSync(liveJsOutput, 'utf8'), /HOLOSHELL_LIVE_FEED/);

console.log('PASS holoshell Fleet readiness evidence projection');
