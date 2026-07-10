#!/usr/bin/env node
/**
 * check-verified-view.mjs — @verified_view provenance drift-guard / ratchet.
 *
 * Keeps the Receipt-Bound Surface regime (P.UI-SHIFT slice 4) from regressing
 * across every `.holo` data surface in the repo. A surface that binds data
 * (`@bind` / `@chart` / `@sparkline` / `@model` / `@each`) must route through the
 * `@verified_view` gate: it DECLARES what each element renders (`@projects { node }`)
 * and the Native2DCompiler proves that claim against the actual binding. Freeform
 * generators can emit bindings WITHOUT the paired receipt and silently bypass the
 * whole regime — this gate makes that visible and non-regressing.
 *
 * It runs the SAME diagnosis the compiler consumer uses — `diagnoseVerifiedView`
 * from packages/core/src/reconstruction/enforceVerifiedViewReceipts.ts — over
 * core SRC via tsx (no rebuilt dist required, exactly like check-cross-perceiver).
 *
 * Three buckets per surface:
 *   - HARD VIOLATION  → ALWAYS fails (exit 1), repo-wide, regardless of baseline:
 *       · mismatched-node / hallucinated-root / projects-without-binding  (an active LIE)
 *       · a surface with `@verified_view` ON but a bound element missing `@projects`
 *         (VIEW-UNGROUNDED — the gate is on but a receipt is absent; a compile error)
 *       · a file that clearly intends to be a surface but does not parse (parsed:false)
 *   - UNADOPTED       → binds data but has not opted into the gate (only issue is the
 *       missing composition-level `@verified_view` + its unreceipted bindings). This is a
 *       migration candidate, ratcheted — it does not hard-fail existing panels, but the
 *       COUNT may never rise above the committed baseline (no NEW unverified surface).
 *   - CLEAN           → complete (verified end-to-end, or binding-free / nothing to prove).
 *
 * Non-surface `.holo` files (trait / template / example definitions with no bindings
 * and no surface markers) are skipped — the regime does not apply to them.
 *
 * Usage:
 *   node scripts/holo-ci/check-verified-view.mjs                  # check (exit 1 on regression / hard violation)
 *   node scripts/holo-ci/check-verified-view.mjs --update-baseline # reseed the ratchet to the current state
 *   node scripts/holo-ci/check-verified-view.mjs --json           # print the full report as JSON
 *
 * Exit codes: 0 = pass (holds or improves vs baseline, no hard violations); 1 = hard
 * violation OR a NEW unadopted surface pushed the count above baseline OR any error.
 *
 * Baseline: scripts/holo-ci/verified-view-baseline.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'tsx/esm/api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PACKAGES_ROOT = path.join(REPO_ROOT, 'packages');
const BASELINE_PATH = path.join(__dirname, 'verified-view-baseline.json');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo',
  '.tmp-g4', 'out', '.bench-logs', 'target',
]);

// Reasons that are an active LIE — always hard-fail, everywhere, regardless of baseline.
const LIE_REASONS = new Set(['mismatched-node', 'hallucinated-root', 'projects-without-binding']);

register(); // tsx — lets this .mjs import core TypeScript sources directly (no dist build)

const coreSrc = (rel) =>
  pathToFileURL(path.resolve(REPO_ROOT, 'packages/core/src', rel)).href;
const { diagnoseVerifiedView } = await import(
  coreSrc('reconstruction/enforceVerifiedViewReceipts.ts')
);

/** Recursively collect every `.holo` file under `dir`, skipping SKIP_DIRS. */
function collectHolo(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectHolo(path.join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith('.holo')) {
      out.push(path.join(dir, entry.name));
    }
  }
}

const relPosix = (abs) => path.relative(REPO_ROOT, abs).split(path.sep).join('/');

/**
 * Is this file a 2D data-binding SURFACE the `@verified_view` regime governs?
 * The regime is scoped to Native2D panels (`@native_panel` / `@view(...)`) that
 * bind data — NOT 3D spatial scenes, trait/template definitions, or config
 * schemas that merely use the `composition` keyword. General `.holo`
 * parseability is a different gate's concern (audit-native-parseability.mjs);
 * conflating the two would false-positive every 3D scene that fails to parse.
 *
 * Strong 2D-panel markers (`@native_panel`, `@view(...)`, `@bind`, `@projects`,
 * `@verified_view`, `@chart`, `@sparkline`) are UNAMBIGUOUS — none appear in a
 * 3D scene or a config schema — so a parse failure on such a file IS a broken
 * verifiable surface. `@each` / `@fetch` / `@model` are ambiguous (also used in
 * 3D/non-panel contexts), so those are trusted only via a successful parse that
 * actually derives a binding (`d.hasBindings`).
 */
const SURFACE_MARKER = /@(?:native_panel|verified_view|projects|bind|chart|sparkline)\b|@view\s*\(/;
function isVerifiedViewSurface(source, d) {
  if (SURFACE_MARKER.test(source)) return true;
  if (d.hasBindings) return true;
  return false;
}

/** Classify one surface into skip | clean | unadopted | hard(+reasons). */
function classify(source) {
  const d = diagnoseVerifiedView(source);

  if (!isVerifiedViewSurface(source, d)) return { bucket: 'skip', d };

  if (!d.parsed) {
    return {
      bucket: 'hard',
      d,
      reasons: [{
        element: '(file)',
        node: null,
        reason: 'unparseable-surface',
        detail: 'looks like a data surface but did not parse (degenerate / unparseable) — its VIEW cannot be verified',
      }],
    };
  }

  const lies = d.violations.filter((v) => LIE_REASONS.has(v.reason));
  const missingProjects = d.violations.filter((v) => v.reason === 'missing-projects');

  const hard = [...lies];
  // Gate is ON but a bound element under it declares no receipt = VIEW-UNGROUNDED
  // compile error: the surface advertises verification it does not deliver.
  if (d.verifiedViewOn && missingProjects.length > 0) {
    hard.push(...missingProjects.map((v) => ({
      ...v,
      detail: `@verified_view is ON but ${v.detail} (VIEW-UNGROUNDED)`,
    })));
  }
  if (hard.length > 0) return { bucket: 'hard', d, reasons: hard };

  if (d.complete) return { bucket: 'clean', d };

  // No lies, gate not falsely on-and-incomplete: a plain unadopted migration candidate
  // (binds data, has not opted into @verified_view yet).
  if (d.hasBindings && !d.verifiedViewOn) return { bucket: 'unadopted', d };

  // Defensive: an incomplete surface that fits no known bucket — fail loud rather than
  // silently pass (should be unreachable given the diagnosis invariants).
  return {
    bucket: 'hard',
    d,
    reasons: d.violations.length
      ? d.violations
      : [{ element: '(file)', node: null, reason: 'unclassified', detail: 'incomplete surface that fits no known bucket' }],
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
  const asJson = args.includes('--json');
  const doUpdate = args.includes('--update-baseline');

  const files = [];
  collectHolo(PACKAGES_ROOT, files);
  files.sort();

  const clean = [];
  const unadopted = [];
  const hard = []; // { file, element, node, reason, detail }
  let skipped = 0;

  for (const abs of files) {
    let source;
    try {
      source = fs.readFileSync(abs, 'utf-8');
    } catch {
      continue;
    }
    const rel = relPosix(abs);
    const { bucket, reasons } = classify(source);
    if (bucket === 'skip') { skipped++; continue; }
    if (bucket === 'clean') { clean.push(rel); continue; }
    if (bucket === 'unadopted') { unadopted.push(rel); continue; }
    // hard
    for (const r of reasons) {
      hard.push({ file: rel, element: r.element, node: r.node ?? null, reason: r.reason, detail: r.detail });
    }
  }

  unadopted.sort();

  const report = {
    scanned: files.length,
    skippedNonSurface: skipped,
    cleanCount: clean.length,
    unadoptedCount: unadopted.length,
    hardCount: hard.length,
    unadopted,
    hard,
  };

  if (asJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  if (doUpdate) {
    // A re-baseline still MUST refuse to bless hard violations — those are real bugs,
    // not migration debt. Only the unadopted ratchet is human-adjustable.
    if (hard.length > 0) {
      printHard(hard);
      console.error('\n✗ refusing to reseed the baseline while hard violations exist — fix the lies above first.');
      process.exit(1);
    }
    const payload = {
      unadoptedCount: unadopted.length,
      unadopted,
      note: 'Ratchet baseline for the @verified_view provenance regime. UNADOPTED = a .holo surface that binds data but has not opted into @verified_view (a migration candidate). The gate FAILS if this count RISES (a new unverified data-binding surface was added). Migrate surfaces (add @verified_view + @projects receipts), then reseed with --update-baseline. Hard violations (mismatched-node / hallucinated-root / projects-without-binding / VIEW-UNGROUNDED / unparseable surface) can NEVER be baselined — they always fail.',
      updatedAtIso: new Date().toISOString(),
    };
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n');
    console.log(`✓ verified-view baseline reseeded: unadopted=${unadopted.length}, clean=${clean.length}, hard=0`);
    return;
  }

  console.log(
    `verified-view: scanned ${files.length} .holo · ${skipped} non-surface skipped · ` +
    `clean=${clean.length} · unadopted=${unadopted.length} · hard=${hard.length}`
  );

  let failed = false;

  // 1) Hard violations — ALWAYS fail, regardless of baseline.
  if (hard.length > 0) {
    printHard(hard);
    failed = true;
  }

  // 2) Ratchet on the unadopted count.
  const baseline = readBaseline();
  if (!baseline) {
    console.error('\n✗ no baseline found — run with --update-baseline to seed it.');
    process.exit(1);
  }

  if (unadopted.length > baseline.unadoptedCount) {
    const known = new Set(baseline.unadopted ?? []);
    const added = unadopted.filter((u) => !known.has(u));
    console.error(
      `\n✗ NEW unverified data-binding surface(s) — unadopted rose ${baseline.unadoptedCount} → ${unadopted.length}:`
    );
    for (const a of added) console.error(`    + ${a}`);
    console.error(
      '\n  A new .holo surface binds data without the @verified_view gate. Adopt it:\n' +
      '    add composition-level @verified_view and a @projects { node } receipt on every bound element\n' +
      '    (or route generated surfaces through enforceVerifiedViewReceipts). Then reseed: --update-baseline.'
    );
    failed = true;
  } else if (unadopted.length < baseline.unadoptedCount) {
    console.log(
      `\n➜ migration progress: unadopted fell ${baseline.unadoptedCount} → ${unadopted.length}. ` +
      'Please run --update-baseline to lock in the gain (the ratchet only tightens).'
    );
  }

  if (failed) process.exit(1);

  console.log(
    `✓ verified-view holds vs baseline (unadopted ≤ ${baseline.unadoptedCount}, no hard violations).`
  );
}

function printHard(hard) {
  console.error(`\n✗ ${hard.length} HARD @verified_view violation(s) — these are provenance LIES and always fail:`);
  for (const h of hard) {
    const nodeStr = h.node ? ` node="${h.node}"` : '';
    console.error(`    ${h.file}  [${h.element}]  ${h.reason}${nodeStr}\n        ${h.detail}`);
  }
}

// Run only as a CLI (importable for tests).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { classify, collectHolo };
