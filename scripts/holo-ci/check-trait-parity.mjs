#!/usr/bin/env node
/**
 * check-trait-parity.mjs — CI gate: every trait emitted by R3FCompiler must have
 * a registered BrowserRuntime handler OR an explicit no-op classification in
 * TRAIT_NOOP_MANIFEST.json.
 *
 * WHY THIS GATE EXISTS (research/2026-06-15_trait-parity-and-tsx-deprecation.md §5.6):
 *   R3FCompiler emits trait names via a large if/else-if chain (name === '...' branches).
 *   BrowserRuntime.TraitSystem.register() separately lists the live native handlers.
 *   The two lists have drifted: traits compiled into scene graphs are silently ignored
 *   at runtime when no handler exists. This gate is the INTERLOCK before R3FCompiler
 *   retirement — if every R3F-emitted trait is either handled or explicitly classified
 *   as a no-op, the compiler output is provably safe to retire.
 *
 * THREE BUCKETS:
 *   1. HANDLED  — trait name appears in a TraitSystem.register({name:'...'}) call
 *                 in packages/runtime/src/traits/*.ts files.
 *   2. NOOP     — trait name is listed in TRAIT_NOOP_MANIFEST.json. These have
 *                 no runtime effect by design (AR/XR hardware, GPU-compute,
 *                 server-side features, props set directly on R3F nodes, etc.).
 *   3. UNCOVERED — R3F emits it, but it's in neither bucket → FAIL.
 *
 * SOURCES:
 *   - R3F-emitted traits: `name === '...'` patterns in R3FCompiler.ts.
 *     Also picks up `d.name === '...'` (directive handling at the bottom of the file).
 *   - Registered handlers: `name: '...'` properties in packages/runtime/src/traits/*.ts.
 *     The property must be a standalone object property line, not a variable or arg.
 *   - No-op classifications: TRAIT_NOOP_MANIFEST.json (sibling to this script).
 *
 * USAGE:
 *   node scripts/holo-ci/check-trait-parity.mjs            # check, exit 1 on gap
 *   node scripts/holo-ci/check-trait-parity.mjs --verbose  # print all three buckets
 *   node scripts/holo-ci/check-trait-parity.mjs --root <dir>
 *
 * EXIT CODES:
 *   0 — all R3F-emitted traits are handled or classified as no-op
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
const R3F_COMPILER = join(ROOT, 'packages/core/src/compiler/R3FCompiler.ts');
const RUNTIME_TRAITS_DIR = join(ROOT, 'packages/runtime/src/traits');
const MANIFEST_PATH = join(ROOT, 'scripts/holo-ci/TRAIT_NOOP_MANIFEST.json');

for (const [label, p] of [
  ['R3FCompiler.ts', R3F_COMPILER],
  ['runtime/traits/', RUNTIME_TRAITS_DIR],
  ['TRAIT_NOOP_MANIFEST.json', MANIFEST_PATH],
]) {
  if (!existsSync(p)) {
    console.error(`[trait-parity] MISSING ${label}: ${relative(ROOT, p)}`);
    console.error('[trait-parity] Run from the HoloScript repo root or pass --root <dir>');
    process.exit(2);
  }
}

// ── Step 1: Extract R3F-emitted trait names ───────────────────────────────────
// Matches both `name === 'foo'` and `d.name === 'foo'` patterns.
// The `|| 'ai_vision'` branch (name === 'vision' || name === 'ai_vision') is
// handled by capturing both names separately from the regex.
const r3fSrc = readFileSync(R3F_COMPILER, 'utf8');
const r3fEmitted = new Set();
for (const m of r3fSrc.matchAll(/\bname\s*===\s*'([^']+)'/g)) {
  r3fEmitted.add(m[1]);
}

// ── Step 2: Extract registered handler names ──────────────────────────────────
// Walks packages/runtime/src/traits/*.ts and finds `  name: 'foo',` lines —
// standalone object property (indented, colon, single-quoted string).
function walkTs(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkTs(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.spec.ts')) {
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

for (const trait of [...r3fEmitted].sort()) {
  if (handlerNames.has(trait)) {
    handled.push(trait);
  } else if (noopNames.has(trait)) {
    noop.push(trait);
  } else {
    uncovered.push(trait);
  }
}

// ── Step 5: Reconciliation warnings ──────────────────────────────────────────
// Stale no-op entries (listed in manifest but R3FCompiler no longer emits them).
const staleNoop = [...noopNames].filter(n => !r3fEmitted.has(n)).sort();
// Promoted entries (now have a handler but still listed as no-op).
const promotedNoop = noop.filter(n => handlerNames.has(n)).sort();

// ── Step 6: Output ────────────────────────────────────────────────────────────
const total = r3fEmitted.size;
const ok = handled.length + noop.length;

if (VERBOSE || uncovered.length > 0) {
  console.log(`\n[trait-parity] R3FCompiler emits ${total} distinct trait names`);
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
[trait-parity] ${uncovered.length} trait(s) emitted by R3FCompiler are in neither bucket.
FIX: for each uncovered trait, do ONE of:
  A) Add a TraitHandler to packages/runtime/src/traits/ with name: '${uncovered[0]}'
     and register it via this.traitSystem.register() in BrowserRuntime.ts.
  B) Add it to scripts/holo-ci/TRAIT_NOOP_MANIFEST.json with a reason.
`);
}

if (staleNoop.length > 0) {
  console.log(`[trait-parity] WARNING: ${staleNoop.length} manifest entry/entries are stale`);
  console.log('  (listed in TRAIT_NOOP_MANIFEST.json but R3FCompiler no longer emits them)');
  console.log('  Stale:', staleNoop.join(', '));
  console.log('  ACTION: remove them from the manifest so it stays accurate.\n');
}

if (promotedNoop.length > 0) {
  console.log(`[trait-parity] INFO: ${promotedNoop.length} trait(s) are in the manifest but now have a handler.`);
  console.log('  Promoted:', promotedNoop.join(', '));
  console.log('  ACTION: remove them from TRAIT_NOOP_MANIFEST.json — they are HANDLED.\n');
}

if (uncovered.length === 0) {
  if (!VERBOSE) {
    console.log(`[trait-parity] ✓ all ${total} R3F-emitted traits covered (${handled.length} handled + ${noop.length} noop)`);
  } else {
    console.log('\n[trait-parity] ✓ PASS — all traits covered');
  }
  process.exit(0);
} else {
  process.exit(1);
}
