#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUTPUT = path.join(REPO_ROOT, '.tmp', 'relationship-onboarding-emergence', 'self-test.json');

const result = spawnSync(
  process.execPath,
  ['scripts/relationship-onboarding-emergence.mjs', '--self-test'],
  {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  }
);

assert.equal(result.status, 0, result.stderr || result.stdout);
assert.equal(existsSync(OUTPUT), true, 'self-test receipt should be written');

const receipt = JSON.parse(readFileSync(OUTPUT, 'utf8'));
assert.equal(receipt.schemaVersion, 'hololand.relationship-onboarding-emergence.v0.1.0');
assert.equal(receipt.measurements.learningProgress, 0.21999999999999997);
assert.equal(receipt.measurements.thresholdProgress, 0.84);
assert.equal(receipt.stage, 'S2_THRESHOLD');
assert.equal(receipt.familySurface.economyVisible, false);
assert.equal(receipt.familySurface.copyLane, 'your_soul_learned_this_week');
assert.equal(receipt.creatorSurface.economyVisible, true);
assert.equal(receipt.compulsiveUseFalsifier.falsified, false);
assert.equal(receipt.summary.creditIsHeldOutLearningProgress, true);

console.log('Relationship onboarding emergence test passed.');
