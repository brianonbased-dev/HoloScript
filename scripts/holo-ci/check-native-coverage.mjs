#!/usr/bin/env node
/**
 * check:native-coverage — the D.104 ratchet gate.
 *
 * D.104: the TS layer must push capability UP into native authoring
 * (.hsplus / .holo / .hs); TS growing as TS is not language progress, TS
 * dissolving INTO native authoring is. This gate makes that measurable and
 * non-regressing: it counts native-authored sources vs hand-authored TS trait
 * files and fails CI if the native fraction (or the native count) drops below a
 * committed baseline. Coverage must rise or hold, never fall.
 *
 * It replaces an UNVERIFIED paper figure ("1.32% native trait annotation") with
 * a real number computed from the tree — the anti-fabrication discipline the
 * paper program never applied to its own native-coverage claim.
 *
 * Usage:
 *   node scripts/holo-ci/check-native-coverage.mjs            # check (exit 1 on regression)
 *   node scripts/holo-ci/check-native-coverage.mjs --update   # reseed the baseline
 *   node scripts/holo-ci/check-native-coverage.mjs --json     # print metrics as JSON
 *
 * Baseline: scripts/holo-ci/native-coverage-baseline.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BASELINE_PATH = path.join(__dirname, 'native-coverage-baseline.json');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.tmp-g4',
  'out',
  '.bench-logs',
  'target',
]);
const NATIVE_EXT = new Set(['.hsplus', '.holo', '.hs']);
// Epsilon so float noise can't fail the gate; real regressions exceed it.
const EPSILON = 1e-9;

/** Recursively walk, calling onFile(absPath) for every file. */
function walk(dir, onFile) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.') {
      // allow dotfiles but skip dot-dirs we don't care about
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    }
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), onFile);
    } else if (entry.isFile()) {
      onFile(path.join(dir, entry.name));
    }
  }
}

/**
 * Is this `.hsplus` file DESCRIBING hand-written TypeScript rather than being the
 * source the TypeScript is generated from?
 *
 * Measured 2026-09-16: 2,249 of 2,474 tracked `.hsplus` carry a header of the form
 * `Native .hsplus surface for <path>.ts`, and were added in six bulk commits MONTHS
 * after the `.ts` they name. Nothing compiles them — there is no `.hsplus` loader or
 * compiler in any repo. Canon's own source-of-truth test (docs/definitions/
 * 04-architecture-concepts.md) is "could you regenerate the artifact byte-identically
 * from a HoloScript source you own?", and a file written after, and about, its
 * counterpart inverts that: the projection claiming to be the source.
 *
 * WHAT THIS CANNOT SEE, stated because a detector that hides its blind spot is the
 * defect it exists to expose: `packages/std/src/math.hsplus` carries the SAME header
 * and IS genuinely shipped in the npm package and executed by the Rust engine. The
 * header alone proves nothing; a real verdict needs a consumer check this static
 * script does not perform. So this number is REPORTED, never enforced, and it is a
 * floor on the descriptor count rather than a precise one.
 */
function descriptorState(abs) {
  let head;
  try {
    head = fs.readFileSync(abs, 'utf-8').slice(0, 400);
  } catch {
    return 'none';
  }
  const m = head.match(/Native \.hsplus surface for\s+([^\s,)]+)/);
  if (!m) return 'none';
  const named = m[1].replace(/[.,;]$/, '');
  // Only count it when the TypeScript it names still exists: a descriptor of a
  // deleted file is stale bookkeeping, not a shadow of living code.
  const candidates = [
    path.resolve(path.dirname(abs), named),
    path.join(REPO_ROOT, named),
    path.join(REPO_ROOT, 'packages', named),
  ];
  const resolved = candidates.some((c) => {
    try {
      return fs.statSync(c).isFile();
    } catch {
      return false;
    }
  });
  return resolved ? 'resolved' : 'header-only';
}

/**
 * Compute the coverage metrics over the shipped capability surface (`packages/`).
 * Examples, docs, and research are EXCLUDED on purpose: D.104 is about the TS
 * implementation dissolving into native authoring *as capability*, not about
 * demo scenes (many example `.holo` files are illustrative and some don't even
 * parse). Scoping to `packages/` keeps the number honest and meaningful.
 */
export function computeCoverage(root = path.join(REPO_ROOT, 'packages')) {
  let native = 0;
  let handTsTraits = 0;
  let descriptors = 0;
  let descriptorHeaders = 0;
  const byExt = { '.hsplus': 0, '.holo': 0, '.hs': 0 };

  walk(root, (abs) => {
    const ext = path.extname(abs);
    const base = path.basename(abs);
    if (NATIVE_EXT.has(ext)) {
      native++;
      byExt[ext]++;
      if (ext === '.hsplus') {
        const d = descriptorState(abs);
        if (d !== 'none') descriptorHeaders++;
        if (d === 'resolved') descriptors++;
      }
      return;
    }
    // hand-authored TS trait surface: *Trait.ts under a package src, excluding tests
    if (
      base.endsWith('Trait.ts') &&
      !base.endsWith('.test.ts') &&
      abs.includes(`${path.sep}src${path.sep}`) &&
      abs.includes(`${path.sep}packages${path.sep}`)
    ) {
      handTsTraits++;
    }
  });

  const denom = native + handTsTraits;
  const ratio = denom === 0 ? 0 : native / denom;
  // The same ratio with descriptors removed from the numerator. Reported, never
  // enforced: the gate's verdict stays on `ratio` so this disclosure cannot
  // silently fail a build, and so nobody is tempted to reseed against it.
  const denomSansDesc = native - descriptors + handTsTraits;
  const ratioSansDescriptors =
    denomSansDesc <= 0 ? 0 : (native - descriptors) / denomSansDesc;
  return {
    native,
    handTsTraits,
    descriptors,
    descriptorHeaders,
    byExt,
    ratio: Number(ratio.toFixed(6)),
    ratioSansDescriptors: Number(ratioSansDescriptors.toFixed(6)),
  };
}

function readBaseline() {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);
  const metrics = computeCoverage();

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify(metrics, null, 2) + '\n');
    return;
  }

  if (args.includes('--update')) {
    const payload = {
      ...metrics,
      note: 'D.104 native-authoring ratchet baseline. Coverage must rise or hold. Reseed only when it has GENUINELY risen (more native authoring), never to mask a regression.',
      updatedAtIso: new Date().toISOString(),
    };
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n');
    console.log(
      `✓ native-coverage baseline reseeded: native=${metrics.native} handTsTraits=${metrics.handTsTraits} ratio=${(metrics.ratio * 100).toFixed(2)}%`
    );
    return;
  }

  const baseline = readBaseline();
  console.log(
    `native-coverage: native=${metrics.native} (.hsplus ${metrics.byExt['.hsplus']} / .holo ${metrics.byExt['.holo']} / .hs ${metrics.byExt['.hs']}) · hand-TS traits=${metrics.handTsTraits} · ratio=${(metrics.ratio * 100).toFixed(2)}%`
  );
  if (metrics.descriptors > 0) {
    console.log(
      `  ↳ ${metrics.descriptorHeaders} of the ${metrics.byExt['.hsplus']} .hsplus declare themselves a "Native .hsplus surface for" ` +
        `existing TypeScript — i.e. they DESCRIBE code rather than generate it. Of those, ${metrics.descriptors} name a file ` +
        `this script could resolve, so the true count sits between ${metrics.descriptors} and ${metrics.descriptorHeaders}. ` +
        `Ratio excluding the resolved ones: ${(metrics.ratioSansDescriptors * 100).toFixed(2)}%. ` +
        `The ENFORCED number above counts by file extension only and cannot tell a source from a description.`
    );
  }
  if (!baseline) {
    console.error('✗ no baseline found — run with --update to seed it.');
    process.exit(1);
  }

  const errors = [];
  if (metrics.native < baseline.native) {
    errors.push(
      `native authoring count dropped: ${baseline.native} → ${metrics.native} (TS is replacing native — D.104 violation).`
    );
  }
  if (metrics.ratio + EPSILON < baseline.ratio) {
    errors.push(
      `native fraction dropped: ${(baseline.ratio * 100).toFixed(2)}% → ${(metrics.ratio * 100).toFixed(2)}% (hand-TS grew faster than native — D.104 violation).`
    );
  }

  if (errors.length) {
    console.error('\n✗ native-coverage regressed (D.104):');
    for (const e of errors) console.error(`  - ${e}`);
    console.error(
      '\n  Fix by authoring capability natively (.hsplus/.holo/.hs), not as new hand-TS.'
    );
    console.error(
      '  If the drop is legitimate (e.g. native files removed for a real reason), reseed: --update.'
    );
    process.exit(1);
  }

  console.log(
    `✓ native-coverage holds vs baseline (native ≥ ${baseline.native}, ratio ≥ ${(baseline.ratio * 100).toFixed(2)}%).`
  );
}

// Run only as a CLI (importable for tests).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
