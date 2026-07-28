#!/usr/bin/env node
/**
 * check-verifier-of-record.mjs — training/reward labels come from the SHIPPED resolver, never a fork.
 *
 * WHY THIS GATE EXISTS (roadmap Wave 0.1 / language-architecture.md §6.3):
 *   The verifier of record principle: the function that LABELS training data is the function that
 *   RUNS at inference. If a corpus builder or reward term re-derives a resolution verdict with its
 *   own logic (a regex port, a hand-inlined verdict) instead of importing `gradeByResolver` from
 *   the meaning home, you teach the model to satisfy a checker you don't ship — and the fork drifts
 *   silently from the real resolver. The sibling `check:language-strata` already caught two such
 *   verdict mirrors (HSICausalLoop, UAALResolutionRewards) at the type level; this gate catches the
 *   VALUE level: a file that emits abstention LABELS must route them through the shipped resolver.
 *
 * RULE (conservative — low false-positive by design):
 *   A file is FLAGGED iff ALL hold:
 *     (a) it lives in a corpus/reward/self-improvement path (NOT a benchmark — benchmarks are
 *         held-out capability probes with their own ground-truth fixtures, out of scope);
 *     (b) it emits an abstention label — the literal 'unresolvable' appears as a value it writes;
 *     (c) it does NOT import `gradeByResolver` (from @holoscript/meaning OR the @holoscript/uaal
 *         re-export shim — both are the same definition and both are accepted).
 *   (a)+(b) means it is producing resolution gold; (c) means it forked the verdict.
 *
 * SCOPE: default scan is this repo's packages/ (the reward terms — ships green, regression armor).
 *   The corpus builders live in the ai-ecosystem repo; point the gate there with --roots to audit
 *   them (report-only), or run it in that repo. Cross-repo CI is deliberately not hard-wired.
 *
 * MODE: report-only by default (exit 0). --strict exits 1 on any finding.
 *
 * Usage:
 *   node scripts/holo-ci/check-verifier-of-record.mjs                 # scan packages/, report-only
 *   node scripts/holo-ci/check-verifier-of-record.mjs --strict
 *   node scripts/holo-ci/check-verifier-of-record.mjs --roots scripts/corpus   # audit a corpus dir
 *   node scripts/holo-ci/check-verifier-of-record.mjs --root <repo-root>
 *
 * Exit 0 = no forked verdicts, or report-only. Exit 1 = findings under --strict. Exit 2 = a root
 *   does not exist (the gate is misconfigured).
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const rootIdx = args.indexOf('--root');
const ROOT = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();
const rootsIdx = args.indexOf('--roots');
const SCAN_ROOTS = (rootsIdx >= 0 ? args[rootsIdx + 1] : 'packages')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const TAG = '[verifier-of-record]';
const CANON = 'docs/spec/language-architecture.md §6.3 (verifier of record)';

const SRC_FILE = /\.(ts|mts|cts|mjs|js)$/;
const SKIP = /(\.test\.|\.spec\.|\.d\.ts$)/;
const LABELER_PATH = /(corpus|reward|self-improvement)/i;
const BENCHMARK_PATH = /benchmark/i;
const IMPORTS_GRADER = /gradeByResolver/;
const EMITS_ABSTAIN_LABEL = /['"]unresolvable['"]/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!['node_modules', 'dist', 'build', '.turbo', '__tests__'].includes(name)) walk(full, out);
    } else if (SRC_FILE.test(name) && !SKIP.test(name)) out.push(full);
  }
  return out;
}

const files = [];
for (const root of SCAN_ROOTS) {
  const abs = join(ROOT, root);
  if (!existsSync(abs)) {
    console.error(`${TAG} EXIT 2 — scan root does not exist: ${root}`);
    process.exit(2);
  }
  walk(abs, files);
}

const findings = [];
for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join('/');
  if (!LABELER_PATH.test(rel) || BENCHMARK_PATH.test(rel)) continue;
  const text = readFileSync(file, 'utf8');
  if (!EMITS_ABSTAIN_LABEL.test(text)) continue;
  if (IMPORTS_GRADER.test(text)) continue;
  findings.push(rel);
}

console.log(`${TAG} scanned ${files.length} source file(s) under: ${SCAN_ROOTS.join(', ')}`);
for (const f of findings) {
  console.log(
    `${TAG} FORKED-VERDICT ${f} — emits abstention labels but never imports gradeByResolver`
  );
}
if (findings.length === 0) {
  console.log(
    `${TAG} OK — every abstention-labeling file routes through the shipped resolver. (${CANON})`
  );
} else {
  console.log(
    `${TAG} ${findings.length} file(s) label resolutions with a forked verdict. ` +
      `Import gradeByResolver from @holoscript/meaning (or the @holoscript/uaal shim); never re-derive. (${CANON})`
  );
  console.log(`${TAG} mode: ${STRICT ? 'STRICT (failing)' : 'report-only (exit 0)'}`);
}
process.exit(STRICT && findings.length > 0 ? 1 : 0);
