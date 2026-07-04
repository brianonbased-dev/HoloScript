#!/usr/bin/env node
/**
 * Regression tests for scripts/holo-ci/check-interaction-taste.mjs — the
 * assembled-vs-considered INTERACTION discriminator (Track A of the
 * ultra-unique+interactive language plan). The gate must separate a considered
 * fixture (state cycle + delivered @interaction_profile + world-event handlers)
 * from an assembled fixture (generic show_info_panel stubs) with zero drift.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, classify, isGenericStub, hasRealLogic } from '../holo-ci/check-interaction-taste.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const FIXTURES = join(REPO_ROOT, 'scripts', 'holo-ci', '__fixtures__', 'interaction-taste');

let testsRun = 0;
let testsFailed = 0;

console.log('check-interaction-taste.test.mjs');

function assert(cond, label) {
  testsRun++;
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    testsFailed++;
    console.error(`  ✗ ${label}`);
  }
}

// isGenericStub — the assembled tell.
assert(isGenericStub('trigger "show_info_panel"').stub === true, 'generic show_info_panel trigger is a stub');
assert(isGenericStub('  emit "show_details" ').stub === true, 'generic show_details emit is a stub');
assert(isGenericStub('trigger "ignite"').stub === false, 'a specific (non-generic) trigger is NOT a stub');
assert(isGenericStub('set glow: 4.0\ntrigger "ignite"').stub === false, 'a multi-statement body is NOT a stub');

// hasRealLogic — object-specific behavior.
assert(hasRealLogic('set mantle_emissive: 4.0\ntrigger "ignite"') === true, 'multi-statement body has real logic');
assert(hasRealLogic('if (near) { set glow: true }') === true, 'a conditional has real logic');
assert(hasRealLogic('state.drawing = true') === true, 'a state mutation has real logic');
assert(hasRealLogic('trigger "show_info_panel"') === false, 'a lone generic trigger has no real logic');

// classify — the considered fixture.
const c = classify(join(FIXTURES, 'considered.holo'));
assert(c.category === 'considered', 'considered fixture classifies as CONSIDERED');
assert(c.assembledHits.length === 0, 'considered fixture has zero assembled hits');
assert(c.profileMismatches.length === 0, '@interaction_profile(react_to:"dusk approach") is DELIVERED (no mismatch)');

// classify — the assembled fixture.
const a = classify(join(FIXTURES, 'assembled.holo'));
assert(a.category === 'assembled', 'assembled fixture classifies as ASSEMBLED');
assert(a.assembledHits.length === 2, 'assembled fixture reports both generic-stub handlers');
assert(a.assembledHits.every((h) => h.generic === 'show_info_panel'), 'each hit names the generic event show_info_panel');

// scan — the gate discriminates in a directory sweep.
const s = scan(FIXTURES);
assert(s.counts.considered === 1, 'directory scan finds exactly 1 considered file');
assert(s.counts.assembled === 1, 'directory scan finds exactly 1 assembled file');
assert(s.assembledHits.length === 2, 'directory scan surfaces both assembled hits with file:line');

console.log(`\n${testsFailed ? '✗' : '✓'} ${testsRun - testsFailed}/${testsRun} passed`);
process.exit(testsFailed ? 1 : 0);
