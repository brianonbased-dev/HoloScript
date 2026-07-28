#!/usr/bin/env node
/**
 * Regression tests for scripts/holo-ci/check-embodied-mind.mjs — the D.102
 * "does the body load the mind?" gate (Track C). The gate must flag an embodied
 * AGENT that renders a body but carries no mind-carry seam (soulless), while NOT
 * flagging player/human avatars (the human is the mind) or compute-only agents.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, classify, seamComplete } from '../holo-ci/check-embodied-mind.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const FIXTURES = join(REPO_ROOT, 'scripts', 'holo-ci', '__fixtures__', 'embodied-mind');

let testsRun = 0;
let testsFailed = 0;
console.log('check-embodied-mind.test.mjs');
function assert(cond, label) {
  testsRun++;
  if (cond) console.log(`  ✓ ${label}`);
  else {
    testsFailed++;
    console.error(`  ✗ ${label}`);
  }
}

// seamComplete — a seam only counts if it can resolve identity/memory.
assert(
  seamComplete('@portable_mind_seam(mesh_api_base: "x", team_id: "y")') === true,
  'seam with mesh_api_base + team_id is complete'
);
assert(
  seamComplete('@portable_mind_seam(agent_id: "z")') === false,
  'seam missing mesh_api_base/team_id is incomplete'
);
assert(
  seamComplete('@portable_mind(team_id: "t")') === true,
  '@portable_mind with team_id is complete'
);
assert(seamComplete('geometry: "avatar"') === false, 'no seam at all is not complete');

// classify — the minded fixture.
const minded = classify(join(FIXTURES, 'minded.holo'));
assert(minded.category === 'minded', 'minded fixture classifies as MINDED');
assert(minded.soulless.length === 0, 'minded fixture has zero soulless bodies');
assert(minded.entities.length === 1, 'minded fixture has one embodied agent');

// classify — the soulless fixture.
const soulless = classify(join(FIXTURES, 'soulless.holo'));
assert(soulless.category === 'soulless', 'soulless fixture classifies as SOULLESS');
assert(soulless.soulless.length === 1, 'soulless fixture reports the un-minded body');
assert(soulless.soulless[0].name === 'GuideBody', 'the soulless body is named GuideBody');

// scan — the gate discriminates in a directory sweep.
const s = scan(['scripts/holo-ci/__fixtures__/embodied-mind']);
assert(s.counts.minded === 1, 'directory scan finds exactly 1 minded body');
assert(s.counts.soulless === 1, 'directory scan finds exactly 1 soulless body');
assert(s.soullessHits.length === 1, 'directory scan surfaces the soulless hit with file:line');

console.log(`\n${testsFailed ? '✗' : '✓'} ${testsRun - testsFailed}/${testsRun} passed`);
process.exit(testsFailed ? 1 : 0);
