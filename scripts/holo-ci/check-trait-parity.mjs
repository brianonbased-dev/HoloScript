#!/usr/bin/env node
/**
 * check-trait-parity.mjs — CI gate: every HoloScript trait must have
 * a registered BrowserRuntime handler OR an explicit no-op classification
 * in TRAIT_NOOP_MANIFEST.json.
 *
 * WHY THIS GATE EXISTS (research/2026-06-15_trait-parity-and-tsx-deprecation.md §5.6):
 *   BrowserRuntime.TraitSystem.register() lists the live native handlers.
 *   TRAIT_NOOP_MANIFEST.json classifies traits that have no client-side handler by design
 *   (AR/XR hardware, GPU-compute, server-side features, compile-time markers, etc.).
 *   The gate ensures every known HoloScript trait falls in one of these two buckets.
 *
 * THREE BUCKETS:
 *   1. HANDLED  — trait name appears in a `  name: '...'` property in
 *                 packages/runtime/src/traits/*.ts (TraitHandler objects).
 *   2. NOOP     — trait name is in scripts/holo-ci/TRAIT_NOOP_MANIFEST.json.
 *   3. UNCOVERED — in TRAIT_REGISTRY.json but in neither bucket → CI FAIL.
 *
 * SOURCES:
 *   - Trait registry:       scripts/holo-ci/TRAIT_REGISTRY.json (canonical list)
 *   - Registered handlers:  packages/runtime/src/traits/*.ts  (name: '...' properties)
 *   - No-op classifications: scripts/holo-ci/TRAIT_NOOP_MANIFEST.json
 *
 * ADDING TRAITS:
 *   When adding a new trait to HoloScript, also add it to TRAIT_REGISTRY.json
 *   AND either implement a TraitHandler or add it to TRAIT_NOOP_MANIFEST.json.
 *
 * USAGE:
 *   node scripts/holo-ci/check-trait-parity.mjs            # check, exit 1 on gap
 *   node scripts/holo-ci/check-trait-parity.mjs --verbose  # print all three buckets
 *   node scripts/holo-ci/check-trait-parity.mjs --root <dir>
 *
 * EXIT CODES:
 *   0 — all traits in the registry are handled or classified as no-op
 *   1 — at least one trait is in neither bucket (uncovered → CI failure)
 *   2 — usage / configuration error (missing source files)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { readdirSync, statSync } from 'node:fs';

// ── CLI args ─────────────────────────────────────────────────────────────────
function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const VERBOSE = process.argv.includes('--verbose');
const ROOT = resolve(arg('--root', process.env.HOLO_ROOT ?? process.cwd()));

// ── Source paths ──────────────────────────────────────────────────────────────
const REGISTRY_PATH = join(ROOT, 'scripts/holo-ci/TRAIT_REGISTRY.json');
const RUNTIME_TRAITS_DIR = join(ROOT, 'packages/runtime/src/traits');
const MANIFEST_PATH = join(ROOT, 'scripts/holo-ci/TRAIT_NOOP_MANIFEST.json');

for (const [label, p] of [
  ['TRAIT_REGISTRY.json', REGISTRY_PATH],
  ['runtime/traits/', RUNTIME_TRAITS_DIR],
  ['TRAIT_NOOP_MANIFEST.json', MANIFEST_PATH],
]) {
  if (!existsSync(p)) {
    console.error(`[trait-parity] MISSING ${label}: ${relative(ROOT, p)}`);
    console.error('[trait-parity] Run from the HoloScript repo root or pass --root <dir>');
    process.exit(2);
  }
}

// ── Step 1: Load trait registry ───────────────────────────────────────────────
const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
const knownTraits = new Set(registry.traits ?? []);

// ── Step 2: Extract registered handler names ──────────────────────────────────
// Walks packages/runtime/src/traits/*.ts and finds `  name: 'foo',` lines —
// standalone object property (indented, colon, single-quoted string).
function walkTs(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkTs(full));
    } else if (
      entry.endsWith('.ts') &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.spec.ts')
    ) {
      results.push(full);
    }
  }
  return results;
}

const handlerNames = new Set();
for (const file of walkTs(RUNTIME_TRAITS_DIR)) {
  const src = readFileSync(file, 'utf8');
  // Match lines like:   name: 'foo',   or   name: 'foo'
  // Require leading whitespace so we don't match variable declarations or function args.
  for (const m of src.matchAll(/^\s+name:\s*'([^']+)'/gm)) {
    handlerNames.add(m[1]);
  }
}

// ── Step 3: Load no-op manifest ───────────────────────────────────────────────
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const noopNames = new Set(Object.keys(manifest.noopTraits ?? {}));

// ── Step 4: Classify ──────────────────────────────────────────────────────────
const handled = [];
const noop = [];
const uncovered = [];

for (const trait of [...knownTraits].sort()) {
  if (handlerNames.has(trait)) {
    handled.push(trait);
  } else if (noopNames.has(trait)) {
    noop.push(trait);
  } else {
    uncovered.push(trait);
  }
}

// ── Step 5: Reconciliation warnings ──────────────────────────────────────────
// Stale no-op entries (in manifest but not in registry).
const staleNoop = [...noopNames].filter((n) => !knownTraits.has(n)).sort();
// Promoted entries (have a handler but still listed as no-op).
const promotedNoop = noop.filter((n) => handlerNames.has(n)).sort();

// ── Step 6: Output ────────────────────────────────────────────────────────────
const total = knownTraits.size;
const ok = handled.length + noop.length;

if (VERBOSE || uncovered.length > 0) {
  console.log(`\n[trait-parity] Registry contains ${total} distinct trait names`);
  console.log(`  HANDLED  (BrowserRuntime handler registered): ${handled.length}`);
  console.log(`  NOOP     (classified in manifest):            ${noop.length}`);
  console.log(`  UNCOVERED (CI failure if any):                ${uncovered.length}`);
  console.log(`  Coverage: ${ok}/${total}`);
}

if (VERBOSE) {
  console.log('\n── HANDLED ──────────────────────────────────────────────────────────────');
  for (const t of handled) console.log(`  ✓ ${t}`);
  console.log('\n── NOOP (classified) ────────────────────────────────────────────────────');
  for (const t of noop) console.log(`  ○ ${t}  (${manifest.noopTraits[t]})`);
}

if (uncovered.length > 0) {
  console.log('\n── UNCOVERED (FAIL) ─────────────────────────────────────────────────────');
  for (const t of uncovered) {
    console.log(`  ✗ ${t}`);
  }
  console.log(`
[trait-parity] ${uncovered.length} trait(s) in the registry are in neither bucket.
FIX: for each uncovered trait, do ONE of:
  A) Add a TraitHandler to packages/runtime/src/traits/ with name: '${uncovered[0]}'
     and register it via this.traitSystem.register() in BrowserRuntime.ts.
  B) Add it to scripts/holo-ci/TRAIT_NOOP_MANIFEST.json with a reason.
`);
}

if (staleNoop.length > 0) {
  console.log(`[trait-parity] WARNING: ${staleNoop.length} manifest entry/entries are stale`);
  console.log('  (listed in TRAIT_NOOP_MANIFEST.json but not in TRAIT_REGISTRY.json)');
  console.log('  Stale:', staleNoop.join(', '));
  console.log('  ACTION: remove them from the manifest so it stays accurate.\n');
}

if (promotedNoop.length > 0) {
  console.log(
    `[trait-parity] INFO: ${promotedNoop.length} trait(s) are in the manifest but now have a handler.`
  );
  console.log('  Promoted:', promotedNoop.join(', '));
  console.log('  ACTION: remove them from TRAIT_NOOP_MANIFEST.json — they are HANDLED.\n');
}

if (uncovered.length === 0) {
  if (!VERBOSE) {
    console.log(
      `[trait-parity] ✓ all ${total} traits covered (${handled.length} handled + ${noop.length} noop)`
    );
  } else {
    console.log('\n[trait-parity] ✓ PASS — all traits covered');
  }
  process.exit(0);
} else {
  process.exit(1);
}
