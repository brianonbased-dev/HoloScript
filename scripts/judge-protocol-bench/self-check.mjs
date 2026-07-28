/**
 * Fast, network-free sanity check for the judge-protocol-benchmark-v0
 * fixture corpus: does every fixture's deterministic ground truth actually
 * match what the deterministic checker computes? Run this before any real
 * (paid) LLM run — it catches fixture-authoring bugs (accidental AABB
 * overlaps, stray dangling references, etc.) for free.
 *
 * Usage: node scripts/judge-protocol-bench/self-check.mjs
 */
import { ITEMS, DOMAINS, REQUIRED_EDGE_CASES } from './fixtures.mjs';
import {
  validateHsplusLike,
  validateSceneComposition,
  validateAgentTrace,
} from './deterministic.mjs';

function detCheck(item, variant) {
  if (item.domain === 'code') return validateHsplusLike(variant.text);
  if (item.domain === 'scene') return validateSceneComposition(variant.text, item.sceneOpts ?? {});
  if (item.domain === 'trace')
    return validateAgentTrace(JSON.parse(variant.text), item.traceRules ?? []);
  throw new Error(`unknown domain: ${item.domain}`);
}

let failures = 0;
const domainCounts = Object.fromEntries(DOMAINS.map((d) => [d, 0]));
const edgeCaseSeen = new Set();

for (const item of ITEMS) {
  domainCounts[item.domain] = (domainCounts[item.domain] ?? 0) + 1;
  for (const ec of item.edgeCases ?? []) edgeCaseSeen.add(ec);

  for (const [key, variant] of Object.entries(item.variants)) {
    const det = detCheck(item, variant);
    const expectAdmissible = variant.admissible !== false;
    const actuallyAdmissible = det.valid && !det.unsafe;

    if (expectAdmissible !== actuallyAdmissible) {
      failures++;
      console.error(
        `[FAIL] ${item.id}/${key}: expected admissible=${expectAdmissible}, ` +
          `got valid=${det.valid} unsafe=${det.unsafe} errors=${JSON.stringify(det.errors)}`
      );
    }

    // both_unsafe fixtures must be inadmissible one way or another: either
    // the domain-specific `unsafe` banned-pattern flag (code/trace) or plain
    // `valid=false` (scene has no separate unsafe concept — bad geometry is
    // its inadmissible form, per the generalization noted in fixtures.mjs).
    if (item.edgeCases?.includes('both_unsafe') && actuallyAdmissible) {
      failures++;
      console.error(`[FAIL] ${item.id}/${key}: both_unsafe item was not actually inadmissible`);
    }
    // invalid_but_pretty items must have exactly one inadmissible variant
    if (item.edgeCases?.includes('invalid_but_pretty')) {
      const inadmissibleCount = Object.values(item.variants).filter(
        (v) => v.admissible === false
      ).length;
      if (inadmissibleCount !== 1) {
        failures++;
        console.error(
          `[FAIL] ${item.id}: invalid_but_pretty item has ${inadmissibleCount} inadmissible variants, expected 1`
        );
      }
    }
  }
}

console.log(`Items per domain: ${JSON.stringify(domainCounts)}`);
console.log(`Total items: ${ITEMS.length}`);
console.log(`Edge cases present: ${[...edgeCaseSeen].sort().join(', ')}`);

for (const ec of REQUIRED_EDGE_CASES) {
  if (!edgeCaseSeen.has(ec)) {
    failures++;
    console.error(`[FAIL] required edge case "${ec}" not present in any fixture`);
  }
}

if (ITEMS.length < 30 || ITEMS.length > 45) {
  failures++;
  console.error(`[FAIL] item count ${ITEMS.length} outside the spec'd 30-45 range`);
}

for (const d of DOMAINS) {
  if (domainCounts[d] < 10) {
    failures++;
    console.error(`[FAIL] domain "${d}" has only ${domainCounts[d]} items, expected >= 10`);
  }
}

if (failures > 0) {
  console.error(`\nself-check FAILED: ${failures} problem(s)`);
  process.exit(1);
} else {
  console.log('\nself-check PASSED: all fixtures match their declared deterministic ground truth.');
}
