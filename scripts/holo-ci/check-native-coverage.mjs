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
// What `native` counts. A baseline computed under another definition is not comparable; the gate
// refuses it instead of reporting a false drop or a false rise.
export const DEFINITION =
  'native-authoring-v2 (2026-09-28): HoloScript-extension files under packages/, excluding descriptor twins';

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
 * `Native .hsplus surface for <path>.ts`. Re-measured 2026-09-28: 2,232 of them were
 * added on 2026-06-25 in 116 "D.104 wave" commits that each also rewrote this gate's
 * baseline, a median of 94 days after the `.ts` they name. Nothing compiles them — there is no `.hsplus` loader or
 * compiler in any repo. Canon's own source-of-truth test (docs/definitions/
 * 04-architecture-concepts.md) is "could you regenerate the artifact byte-identically
 * from a HoloScript source you own?", and a file written after, and about, its
 * counterpart inverts that: the projection claiming to be the source.
 *
 * The header alone does not decide it: `packages/std/src/math.hsplus` carries the SAME
 * header and IS shipped in the npm package and executed by the Rust engine. The static
 * consumer check that separates the two (census 2026-09-28, spec-vs-reality-gap.md): a
 * header file is a real source when its package's package.json names that exact file
 * (exports, files, entrypoint). std names math.hsplus and collections.hsplus that way;
 * a package that ships a whole `src` folder names no single twin. Every other header
 * file is a descriptor and is not counted as native authoring.
 */
const packageNamedFiles = new Map();

/** Absolute HoloScript file paths a package.json names explicitly, anywhere in it. */
function namedByPackage(pkgJsonPath) {
  if (packageNamedFiles.has(pkgJsonPath)) return packageNamedFiles.get(pkgJsonPath);
  const named = new Set();
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    const dir = path.dirname(pkgJsonPath);
    const visit = (value) => {
      if (typeof value === 'string') {
        if (/\.(hsplus|holo|hs)$/.test(value)) named.add(path.resolve(dir, value));
      } else if (Array.isArray(value)) {
        value.forEach(visit);
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach(visit);
      }
    };
    visit(pkg);
  } catch {
    // An unreadable package.json names nothing.
  }
  packageNamedFiles.set(pkgJsonPath, named);
  return named;
}

/** The nearest package.json above `abs`, not looking above `root`'s parent. */
function owningPackageJson(abs, root) {
  const stop = path.dirname(path.resolve(root));
  let dir = path.dirname(abs);
  while (dir.length > stop.length && dir.startsWith(stop)) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}

/** Does the TypeScript a header names still exist? Headers often omit the package's `src/`. */
function twinExists(abs, named, root) {
  const [pkg, ...rest] = named.split('/');
  const candidates = [
    path.resolve(path.dirname(abs), named),
    path.join(REPO_ROOT, named),
    path.join(root, named),
    path.join(root, pkg, 'src', ...rest),
  ];
  return candidates.some((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

/** 'none' (no header), 'shipped' (header, but its package names the file), or a descriptor. */
function descriptorState(abs, root) {
  let head;
  try {
    head = fs.readFileSync(abs, 'utf-8').slice(0, 400);
  } catch {
    return { kind: 'none' };
  }
  const m = head.match(/Native \.hsplus surface for\s+([^\s,)]+)/);
  if (!m) return { kind: 'none' };
  const pkgJson = owningPackageJson(abs, root);
  if (pkgJson && namedByPackage(pkgJson).has(path.resolve(abs))) return { kind: 'shipped' };
  const named = m[1].replace(/[.,;]$/, '');
  return { kind: 'descriptor', twinLive: twinExists(abs, named, root) };
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
  let descriptorTwinsLive = 0;
  let shippedWithHeader = 0;
  let filesByExtension = 0;
  const byExt = { '.hsplus': 0, '.holo': 0, '.hs': 0 };

  walk(root, (abs) => {
    const ext = path.extname(abs);
    const base = path.basename(abs);
    if (NATIVE_EXT.has(ext)) {
      filesByExtension++;
      if (ext === '.hsplus') {
        const d = descriptorState(abs, root);
        if (d.kind === 'descriptor') {
          descriptors++;
          if (d.twinLive) descriptorTwinsLive++;
          return;
        }
        if (d.kind === 'shipped') shippedWithHeader++;
      }
      native++;
      byExt[ext]++;
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
  // What the pre-2026-09-28 definition enforced (every file with a HoloScript extension).
  // Reported so the correction stays visible; never enforced.
  const denomByExtension = filesByExtension + handTsTraits;
  const ratioByExtension = denomByExtension === 0 ? 0 : filesByExtension / denomByExtension;
  return {
    definition: DEFINITION,
    native,
    handTsTraits,
    byExt,
    ratio: Number(ratio.toFixed(6)),
    descriptors,
    descriptorTwinsLive,
    shippedWithHeader,
    filesByExtension,
    ratioByExtension: Number(ratioByExtension.toFixed(6)),
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
      `  ↳ not counted: ${metrics.descriptors} descriptor twins ("Native .hsplus surface for" files their package does not ship; ` +
        `${metrics.descriptorTwinsLive} still name a living TypeScript file). Counted: ${metrics.shippedWithHeader} header file(s) ` +
        `their package names explicitly. By file extension alone the ratio would read ${(metrics.ratioByExtension * 100).toFixed(2)}%.`
    );
  }
  if (!baseline) {
    console.error('✗ no baseline found — run with --update to seed it.');
    process.exit(1);
  }
  if (baseline.definition !== DEFINITION) {
    console.error(
      `✗ the baseline was computed under a different definition (${baseline.definition ?? 'native-authoring-v1: every HoloScript-extension file'}); ` +
        'the numbers are not comparable. Review the change in what is counted, then reseed with --update.'
    );
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
