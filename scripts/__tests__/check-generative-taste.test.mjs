#!/usr/bin/env node
/**
 * Regression tests for scripts/holo-ci/check-generative-taste.mjs — the Track B
 * "unique per seed, or N clones?" gate. It must separate a seeded + per-instance-varied
 * generator (considered) from a clone-scatter (count, no variation → identical copies)
 * and from a varied-but-unseeded block, using only source signals grounded in the real
 * compile path (SceneIRCompiler.compileProceduralScatterNode).
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, classify, classifyBlock } from '../holo-ci/check-generative-taste.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const FIXTURES = join(REPO_ROOT, 'scripts', 'holo-ci', '__fixtures__', 'generative-taste');

let testsRun = 0;
let testsFailed = 0;
console.log('check-generative-taste.test.mjs');
function assert(cond, label) {
  testsRun++;
  if (cond) console.log(`  ✓ ${label}`);
  else {
    testsFailed++;
    console.error(`  ✗ ${label}`);
  }
}

// classifyBlock — the core assembled-vs-considered generativity decision.
assert(
  classifyBlock('scatter { count: 100 }').state === 'clone',
  'count with no variation is a CLONE (N identical copies)'
);
assert(
  classifyBlock('scatter { count: 100 min_distance: 2 }').state === 'clone',
  'placement constraints alone (min_distance) are not per-instance variation → still CLONE'
);
assert(
  classifyBlock('scatter { count: 100 seed: 5 random_scale: [1,2] random_rotation: [0,360] }')
    .state === 'considered',
  'count + seed + variation is CONSIDERED (unique-per-seed)'
);
assert(
  classifyBlock('scatter { count: 100 random_scale: [0.8,1.4] }').state === 'unseeded',
  'varied but no seed is UNSEEDED (not intentionally reproducible)'
);
assert(
  classifyBlock('procedural { resolution: [512,512] seed: 7 }').state === 'procedural-single',
  'a single procedural surface (no instance count) is not judged as clones'
);

// classify — the considered fixture.
const considered = classify(join(FIXTURES, 'considered.holo'));
assert(considered.category === 'considered', 'considered fixture classifies as CONSIDERED');
assert(considered.clones.length === 0, 'considered fixture has zero clone blocks');

// classify — the clone fixture.
const clone = classify(join(FIXTURES, 'clone.holo'));
assert(clone.category === 'clone', 'clone fixture classifies as CLONE');
assert(clone.clones.length === 1, 'clone fixture reports the un-varied instance set');
assert(clone.clones[0].kind === 'scatter', 'the clone block is a scatter');

// scan — the gate discriminates in a directory sweep.
const s = scan(FIXTURES);
assert(s.counts.considered === 1, 'directory scan finds exactly 1 considered generator');
assert(s.counts.clone === 1, 'directory scan finds exactly 1 clone generator');
assert(s.cloneHits.length === 1, 'directory scan surfaces the clone hit with file:line');

console.log(`\n${testsFailed ? '✗' : '✓'} ${testsRun - testsFailed}/${testsRun} passed`);
process.exit(testsFailed ? 1 : 0);
