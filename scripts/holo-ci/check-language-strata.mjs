#!/usr/bin/env node
/**
 * check-language-strata.mjs — one meaning, defined once, imported everywhere.
 *
 * WHY THIS GATE EXISTS (language stratum taxonomy ruling, 2026-07-17):
 *   The language design looped for weeks because one word ("uAAL") named three strata at
 *   once (surface / meaning / execution), and the meaning stratum ended up defined TWICE:
 *   the mature family semantics in packages/uaal/src (resolve* for 16 families) and a
 *   structural re-derivation in core (HSI — "mirrored UAALResolution structurally" because
 *   core may not import packages/uaal). Canon is now docs/spec/language-architecture.md:
 *   the meaning stratum is ONE typed IR — HoloMeaning — defined once in one home and
 *   imported by compiler, reward, corpus grader, and VMs alike. Mirrored nowhere.
 *   This gate is rule §6.2 of that spec: it makes a second definition of any meaning
 *   family a CI event instead of an archaeology finding.
 *
 * WHAT IT DOES (read-only, no install, no network):
 *   - Enumerates the canonical meaning-family resolvers: `export function resolve<Family>`
 *     under the meaning home (packages/meaning/src — contract + family semantics since
 *     §8.2 stage 2, 2026-07-17; @holoscript/uaal re-exports via shims).
 *   - Walks every packages/<pkg>/src TS source outside the home (skipping tests, fixtures,
 *     stories, dist, node_modules, .d.ts) and reports:
 *       RULE-A  duplicate resolver — a function/const DEFINITION reusing a canonical
 *               resolver name outside the home (same-name fork).
 *       RULE-B  resolution-record mirror — a type-position union re-declaring the
 *               canonical resolution states ('resolved' | 'unresolvable') outside the
 *               home. This is the exact shape of the HSI mirror (HSICausalLoop.ts).
 *       RULE-C  gap-reason enum mirror — a union re-declaring >=2 of the closed
 *               abstention-reason codes (underdetermined | unprioritized_conflict |
 *               cyclic_dependency | missing_precondition) outside the home.
 *   - Comment lines are skipped (describing the mirror is documentation, not debt).
 *     CONSUMING the types (imports, `=== 'unresolvable'` comparisons) never fires —
 *     only re-DECLARING them does. Consumers are the point; mirrors are the debt.
 *
 * MODE: report-only by default (exit 0 with findings printed); --strict exits 1 on findings.
 *   §8.2 stage 1 landed 2026-07-17 (contract extracted to @holoscript/meaning, both mirrors
 *   retired); the pre-commit dev floor and the HoloCI 'language-strata' gate run --strict.
 *
 * Usage:
 *   node scripts/holo-ci/check-language-strata.mjs            # report-only, always exit 0
 *   node scripts/holo-ci/check-language-strata.mjs --strict   # exit 1 on any finding
 *   node scripts/holo-ci/check-language-strata.mjs --root <repo-root>
 *
 * Exit 0 = no findings, or report-only mode. Exit 1 = findings under --strict.
 * Exit 2 = usage / canonical home missing or empty (the gate itself is broken — fix it,
 *          don't route around it).
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const rootIdx = args.indexOf('--root');
const ROOT = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();

// The ONE home of the meaning stratum (language-architecture.md §8.2 — stage 2 landed 2026-07-17):
// packages/meaning/src (@holoscript/meaning) holds the contract AND the family semantics
// (semantic/beneficiary/vibe/affective-harm). @holoscript/uaal re-exports via shims and is
// scanned like any other consumer. If the home ever moves again, update these in the same commit.
const CONTRACT_HOMES = [join('packages', 'meaning', 'src')];
const RESOLVER_HOME = join('packages', 'meaning', 'src');

const TAG = '[language-strata]';
const CANON_POINTER = 'docs/spec/language-architecture.md §6.2';

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '__tests__',
  'fixtures',
  'examples',
  '.turbo',
]);
const SKIP_FILE = /(\.test\.|\.spec\.|\.stories\.|\.d\.ts$)/;
const TS_FILE = /\.(ts|mts|cts)$/;

const GAP_REASONS = [
  'underdetermined',
  'unprioritized_conflict',
  'cyclic_dependency',
  'missing_precondition',
];
const RESOLUTION_UNION =
  /['"]resolved['"]\s*\|\s*['"]unresolvable['"]|['"]unresolvable['"]\s*\|\s*['"]resolved['"]/;
const RESOLVER_EXPORT = /export\s+function\s+(resolve[A-Z]\w*)\s*\(/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (TS_FILE.test(name) && !SKIP_FILE.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

for (const home of CONTRACT_HOMES) {
  if (!existsSync(join(ROOT, home))) {
    console.error(`${TAG} EXIT 2 — canonical meaning home not found: ${home}`);
    console.error(
      `${TAG} If the HoloMeaning extraction moved it, update CONTRACT_HOMES in this gate (same commit).`
    );
    process.exit(2);
  }
}
const resolverHomeAbs = join(ROOT, RESOLVER_HOME);

// 1. Enumerate canonical resolvers from the resolver home (self-maintaining — no hardcoded family list).
const canonicalResolvers = new Map(); // name -> defining file (repo-relative)
for (const file of walk(resolverHomeAbs)) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(RESOLVER_EXPORT)) {
    canonicalResolvers.set(m[1], relative(ROOT, file).split(sep).join('/'));
  }
}
if (canonicalResolvers.size === 0) {
  console.error(
    `${TAG} EXIT 2 — zero resolve* exports under ${RESOLVER_HOME}; the canonical set is empty.`
  );
  process.exit(2);
}

// 2. Scan every other packages/<pkg>/src for mirrors.
const packagesDir = join(ROOT, 'packages');
const findings = [];
const dupDefRe = new RegExp(
  `(?:export\\s+)?(?:async\\s+)?(?:function\\s+(resolve[A-Z]\\w*)\\s*\\(|const\\s+(resolve[A-Z]\\w*)\\s*=)`
);

for (const pkg of readdirSync(packagesDir)) {
  const src = join(packagesDir, pkg, 'src');
  if (!existsSync(src) || !statSync(src).isDirectory()) continue;
  for (const file of walk(src)) {
    const rel = relative(ROOT, file).split(sep).join('/');
    if (CONTRACT_HOMES.some((home) => rel.startsWith(home.split(sep).join('/')))) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      const loc = `${rel}:${i + 1}`;

      const dup = line.match(dupDefRe);
      const dupName = dup && (dup[1] || dup[2]);
      if (dupName && canonicalResolvers.has(dupName)) {
        findings.push(
          `RULE-A ${loc} — duplicate resolver definition '${dupName}' (canonical: ${canonicalResolvers.get(dupName)})`
        );
      }

      if (RESOLUTION_UNION.test(line)) {
        findings.push(
          `RULE-B ${loc} — resolution-record union ('resolved' | 'unresolvable') re-declared outside home`
        );
      }

      const reasonsHit = GAP_REASONS.filter(
        (r) => line.includes(`'${r}'`) || line.includes(`"${r}"`)
      );
      if (reasonsHit.length >= 2 && line.includes('|')) {
        findings.push(
          `RULE-C ${loc} — gap-reason enum mirror (${reasonsHit.join(', ')}) re-declared outside home`
        );
      }
    });
  }
}

// 3. Report.
console.log(
  `${TAG} contract home: ${CONTRACT_HOMES[0]} · resolver home: ${RESOLVER_HOME} (${canonicalResolvers.size} resolvers)`
);
for (const f of findings) console.log(`${TAG} ${f}`);
if (findings.length === 0) {
  console.log(`${TAG} OK — one meaning stratum, defined once. (${CANON_POINTER})`);
} else {
  console.log(
    `${TAG} ${findings.length} finding(s) — each is a second definition of the meaning stratum. ` +
      `Import HoloMeaning; never mirror it. (${CANON_POINTER})`
  );
  console.log(
    `${TAG} mode: ${STRICT ? 'STRICT (failing)' : 'report-only (exit 0) — flip with --strict after §8.2 lands'}`
  );
}
process.exit(STRICT && findings.length > 0 ? 1 : 0);
