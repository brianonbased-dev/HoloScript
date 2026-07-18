#!/usr/bin/env node
/**
 * check-grammar-authority.mjs — the surface grammar has ONE authority; its coverage never regresses.
 *
 * WHY THIS GATE EXISTS (language stratum taxonomy §5, docs/spec/language-architecture.md — the LAST
 * open circle): "which grammar is canonical?" was re-opened repeatedly (2026-07-02 → 07-16) and
 * never machine-settled. §5 names the Rust/WASM grammar (packages/compiler-wasm) the growing
 * authority for surface syntax. This gate makes that enforceable: every source file the authority
 * ALREADY parses must keep parsing. A file flipping from authority-pass to authority-fail is a real
 * grammar regression and fails CI — the ratchet that closes the circle the way check:language-strata
 * closed the meaning-mirror circle.
 *
 * HONEST SCOPE (do not overstate — the investigation corrected §5's original wording): the WASM
 * authority parses `.hs` and a growing `.hsplus` @trait subset; `.holo` and full `.hsplus` are
 * authored by the TS parsers (docs/spec/holoscript-grammar-ssot.md). So this gate rides the
 * `.hsplus` differential corpus, where the authority's coverage is a MOVING TARGET under active
 * improvement — the invariant is "already-parsed stays parsed", NOT "disagreement must not grow"
 * (new TS-fail/authority-pass agreement is expected and good).
 *
 * MECHANISM — wires the existing, working engine (F.154, don't rebuild):
 *   1. FRESHNESS PREREQUISITE: run check:compiler-wasm-drift so we never differentially test against
 *      a stale pkg-node artifact. Its failure fails this gate (the authority binary must be current).
 *   2. REGRESSION GATE: run scripts/lang-audit/shadow-compare-rust-ts.mjs against the frozen baseline;
 *      it exits 1 iff any file the baseline authority parsed now fails. That exit is propagated.
 *
 * The baseline (scripts/lang-audit/shadow-compare-results-2026-07-17.json) IS the conformance
 * corpus's frozen truth; regenerate it deliberately (--json-out) when the authority's coverage
 * legitimately grows, and commit the new baseline as the raised floor.
 *
 * Usage:
 *   node scripts/holo-ci/check-grammar-authority.mjs                 # freshness + regression gate
 *   node scripts/holo-ci/check-grammar-authority.mjs --skip-drift    # regression only (drift gate ran elsewhere)
 *   node scripts/holo-ci/check-grammar-authority.mjs --baseline <p>  # override baseline path
 *
 * Exit 0 = authority fresh + zero coverage regressions. Exit 1 = a regression (or stale authority).
 * Exit 2 = misconfiguration (baseline or engine missing).
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const SKIP_DRIFT = args.includes('--skip-drift');
const baselineIdx = args.indexOf('--baseline');
const ROOT = process.cwd();
const TAG = '[grammar-authority]';

const ENGINE = join('scripts', 'lang-audit', 'shadow-compare-rust-ts.mjs');
const DRIFT = join('scripts', 'holo-ci', 'check-compiler-wasm-drift.mjs');
const BASELINE =
  baselineIdx >= 0 ? args[baselineIdx + 1] : join('scripts', 'lang-audit', 'shadow-compare-results-2026-07-17.json');

for (const [label, p] of [['engine', ENGINE], ['baseline', BASELINE]]) {
  if (!existsSync(join(ROOT, p))) {
    console.error(`${TAG} EXIT 2 — ${label} not found: ${p}`);
    process.exit(2);
  }
}

// 1. Freshness prerequisite — the authority binary must not be stale.
if (!SKIP_DRIFT && existsSync(join(ROOT, DRIFT))) {
  console.log(`${TAG} step 1/2 — authority freshness (check:compiler-wasm-drift)…`);
  const drift = spawnSync(process.execPath, [DRIFT], { stdio: 'inherit', cwd: ROOT });
  if (drift.status !== 0) {
    console.error(`${TAG} FAIL — the WASM authority artifact is stale; rebuild pkg-node before differential testing.`);
    process.exit(1);
  }
}

// 2. Regression gate — files the authority already parses must keep parsing.
console.log(`${TAG} step 2/2 — coverage regression vs baseline ${BASELINE}…`);
const gate = spawnSync(process.execPath, [ENGINE, '--baseline', BASELINE], { stdio: 'inherit', cwd: ROOT });
if (gate.status !== 0) {
  console.error(`${TAG} FAIL — surface-grammar coverage regressed (a file the authority parsed now fails). (§5)`);
  process.exit(gate.status || 1);
}
console.log(`${TAG} OK — authority fresh, zero coverage regressions. The grammar has one authority. (§5)`);
process.exit(0);
