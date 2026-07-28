#!/usr/bin/env node
/**
 * check-family-admission.mjs — every admitted meaning family closes its honest-abstention loop.
 *
 * WHY THIS GATE EXISTS (language stratum taxonomy §4/§6.5, docs/spec/language-architecture.md):
 *   §4 makes family admission a standing rule instead of a per-vertical debate: a family is
 *   admitted iff it introduces a typed distinction the IR can't already express AND it arrives
 *   with its honest-abstention loop closed — resolver + FAMILY-SCOPED gap reason + corpus +
 *   benchmark. Collapsing a family's honesty failure into a generic base bucket
 *   ('missing_precondition') instead of a family-scoped code ('affordance.unstated_precondition')
 *   is itself a form of confabulation (contract.ts). This gate machine-checks the in-repo half of
 *   that loop: every family in the RESOLVERS registry must emit at least one family-scoped gap code.
 *
 * SCOPE (honest boundary): the meaning stratum (resolvers, gap codes) lives in this repo; the
 *   training artifacts (per-family corpora, benchmarks) live in the ai-ecosystem repo and are NOT
 *   checkable from HoloScript CI without a fragile cross-repo checkout. This gate covers the
 *   §4.1/§4.2 half — resolver present + family-scoped gap code present. The §4.3/§4.4 half
 *   (corpus row + benchmark) is a documented cross-repo follow-up (see the spec §8 roadmap).
 *
 * SELF-MAINTAINING: the family list is parsed live from the RESOLVERS object in
 *   packages/meaning/src/verifier.ts — no hardcoded family list to drift. Three families use a
 *   non-resolve<Family> resolver name (presupposition→resolveAtomStatus, analogy→resolveValidity,
 *   affordance→resolveAffords); this gate keys off the REGISTRY names, never the resolver names,
 *   so those three are handled correctly.
 *
 * MODE: report-only by default (exit 0). Under --strict, exit 1 if any admitted family lacks a
 *   family-scoped gap code. Ships report-only: known backlog (occlusion / norm_status /
 *   dischargeable — the grandfathered containment/deontic/composition families) emit only coarse
 *   base buckets today; that red is the pain-receipt for giving them family-scoped codes.
 *
 * Usage:
 *   node scripts/holo-ci/check-family-admission.mjs            # report-only, exit 0
 *   node scripts/holo-ci/check-family-admission.mjs --strict   # exit 1 on any incomplete family
 *   node scripts/holo-ci/check-family-admission.mjs --root <repo-root>
 *
 * Exit 0 = every family has a family-scoped gap code, or report-only. Exit 1 = incomplete under
 *   --strict. Exit 2 = the registry/home is missing or unparseable (the gate itself is broken).
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const rootIdx = args.indexOf('--root');
const ROOT = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();

const TAG = '[family-admission]';
const CANON = 'docs/spec/language-architecture.md §4/§6.5';
const MEANING_HOME = join('packages', 'meaning', 'src');
const REGISTRY_FILE = join(MEANING_HOME, 'verifier.ts');

const homeAbs = join(ROOT, MEANING_HOME);
const registryAbs = join(ROOT, REGISTRY_FILE);
if (!existsSync(registryAbs)) {
  console.error(`${TAG} EXIT 2 — family registry not found: ${REGISTRY_FILE}`);
  process.exit(2);
}

// 1. Parse the family list live from the RESOLVERS object literal (keys before ': (ir').
const registryText = readFileSync(registryAbs, 'utf8');
const resolversStart = registryText.indexOf('const RESOLVERS');
if (resolversStart < 0) {
  console.error(`${TAG} EXIT 2 — RESOLVERS registry block not found in ${REGISTRY_FILE}`);
  process.exit(2);
}
// Bound the scan to the object literal body (up to the first '};' after the declaration).
const resolversBody = registryText.slice(
  resolversStart,
  registryText.indexOf('};', resolversStart)
);
const families = [];
for (const m of resolversBody.matchAll(/^\s*([a-z_]+):\s*\(ir/gm)) families.push(m[1]);
if (families.length === 0) {
  console.error(`${TAG} EXIT 2 — zero families parsed from the RESOLVERS registry.`);
  process.exit(2);
}

// 2. Collect every family-scoped gap-code literal in the meaning home ('<family>.<code>').
const TS_FILE = /\.(ts|mts|cts)$/;
const SKIP = /(\.test\.|\.spec\.|\.d\.ts$)/;
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules' && name !== 'dist') walk(full, out);
    } else if (TS_FILE.test(name) && !SKIP.test(name)) out.push(full);
  }
  return out;
}
const homeText = walk(homeAbs)
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
// A family-scoped code is a string literal whose head is `<family>.<something>`.
const codePrefixes = new Set();
for (const m of homeText.matchAll(/['"]([a-z_]+)\.[a-z_]+['"]/g)) codePrefixes.add(m[1]);

// 3. Report: each admitted family must have >=1 family-scoped gap code.
const incomplete = families.filter((f) => !codePrefixes.has(f));

console.log(`${TAG} ${families.length} admitted families (registry: ${REGISTRY_FILE})`);
for (const f of incomplete) {
  console.log(
    `${TAG} INCOMPLETE ${f} — resolver present but NO family-scoped gap code (emits only a coarse base bucket; §4.2)`
  );
}
if (incomplete.length === 0) {
  console.log(`${TAG} OK — every admitted family emits a family-scoped gap code. (${CANON})`);
} else {
  console.log(
    `${TAG} ${incomplete.length}/${families.length} families incomplete: ${incomplete.join(', ')}. ` +
      `Give each a family-scoped code via structuredGap('<family>.<code>', …). (${CANON})`
  );
  console.log(
    `${TAG} cross-repo half (corpus row + benchmark, §4.3/§4.4) tracked separately — ai-ecosystem scripts/corpus + scripts/benchmark-*.`
  );
  console.log(`${TAG} mode: ${STRICT ? 'STRICT (failing)' : 'report-only (exit 0)'}`);
}
process.exit(STRICT && incomplete.length > 0 ? 1 : 0);
