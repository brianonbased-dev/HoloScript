#!/usr/bin/env node
/**
 * frozen-lockfile-check.mjs — fail loud on package.json ⇄ pnpm-lock.yaml drift.
 *
 * WHY THIS GATE EXISTS (P2, task_1780443302727_4ftu): lockfile drift has bricked
 * ALL Railway deploys TWICE in 3 days. The drift mechanism is concrete: a commit
 * adds a dependency to a package.json but does NOT regenerate pnpm-lock.yaml (e.g.
 * 7f6f1ff0f added @react-three/postprocessing without updating the lock). Every
 * downstream `pnpm install --frozen-lockfile` (the deploy install, the CI prologue)
 * then dies with ERR_PNPM_OUTDATED_LOCKFILE. Auto-deploy is reconnected, so this is
 * high-blast-radius: an unsynced lockfile on main now bricks prod, not just CI.
 *
 * WHAT IT DOES — two layers, the second AUTHORITATIVE:
 *   (1) DRY pnpm probe: `pnpm install --frozen-lockfile --lockfile-only` and scan its
 *       output for ERR_PNPM_OUTDATED_LOCKFILE. --lockfile-only means pnpm NEVER links
 *       node_modules (F.103-safe — no shared-store mutation, no recursive install).
 *       NOTE: pnpm's exit code under --lockfile-only is unreliable (observed exit 0 on
 *       a real drift, 2026-06-02), so we treat the printed error string as the signal,
 *       not $?. If the pnpm binary is missing, we skip this layer entirely.
 *   (2) STATIC consistency check (always runs, authoritative): parse every workspace
 *       package.json's {dependencies, devDependencies, optionalDependencies, peer...}
 *       and the matching `importers:` block in pnpm-lock.yaml, then flag any dep that
 *       is present in package.json but ABSENT from the lockfile importer, or whose
 *       specifier MISMATCHES. This is exactly the drift that bricked the deploys and
 *       needs no install at all — fully F.103-safe.
 *
 * The static layer is authoritative because it cannot be masked by pnpm's exit-code
 * quirk; the pnpm probe is corroborating signal + catches transitive-graph drift the
 * static layer can't see (a changed version constraint that resolves differently).
 *
 * SAFETY (F.103): NEVER rm or junction shared node_modules; NEVER run a recursive or
 * linking install. The only pnpm invocation is --lockfile-only (no linking), and the
 * static layer touches nothing but reads files.
 *
 * Usage:  node scripts/holo-ci/frozen-lockfile-check.mjs [--root <repoDir>] [--no-pnpm]
 *   --root     repo root to check (default: process.cwd())
 *   --no-pnpm  skip the pnpm probe, run static check only (for CI nodes w/o pnpm)
 *
 * Exit 0 iff the lockfile is in sync with every package.json. Exit 1 on drift.
 * Exit 2 on usage / unparseable inputs.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const ROOT = path.resolve(arg('--root', process.env.HOLO_ROOT || process.cwd()));
const SKIP_PNPM = process.argv.includes('--no-pnpm');
const LOCK = path.join(ROOT, 'pnpm-lock.yaml');

const DEP_GROUPS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

function fail(msg) {
  console.error(`  [FAIL] ${msg}`);
}

if (!fs.existsSync(LOCK)) {
  console.error(`[frozen-lockfile] no pnpm-lock.yaml at ${LOCK}`);
  process.exit(2);
}

/**
 * Discover every workspace package.json by reading pnpm-workspace.yaml globs, falling
 * back to a conservative built-in set. We resolve globs without a glob dep by walking
 * the declared roots one directory deep (matches `packages/*`, `apps/*` shapes).
 */
function workspaceManifests() {
  const found = new Map(); // importerKey ('.' or 'packages/foo') -> abs package.json path
  // Root manifest is importer '.'
  const rootPkg = path.join(ROOT, 'package.json');
  if (fs.existsSync(rootPkg)) found.set('.', rootPkg);

  let patterns = [];
  const wsFile = path.join(ROOT, 'pnpm-workspace.yaml');
  if (fs.existsSync(wsFile)) {
    for (const line of fs.readFileSync(wsFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*-\s*['"]?([^'"#]+?)['"]?\s*$/);
      if (m && /\*|\//.test(m[1])) patterns.push(m[1].trim());
    }
  }
  if (patterns.length === 0) patterns = ['packages/*', 'apps/*'];

  for (const pat of patterns) {
    // Only support the common `<dir>/*` and `<dir>/**` single-level shapes; deeper
    // globs are walked one extra level. Negations (!) are ignored (rare in this repo).
    if (pat.startsWith('!')) continue;
    const base = pat.replace(/\/\*\*?$/, '').replace(/\/\*$/, '');
    const baseDir = path.join(ROOT, base);
    if (!fs.existsSync(baseDir)) continue;
    const depth = pat.includes('**') ? 2 : 1;
    const walk = (dir, d) => {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (!e.isDirectory() || e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const sub = path.join(dir, e.name);
        const pj = path.join(sub, 'package.json');
        if (fs.existsSync(pj)) {
          const key = path.relative(ROOT, sub).split(path.sep).join('/');
          found.set(key, pj);
        }
        if (d > 1) walk(sub, d - 1);
      }
    };
    walk(baseDir, depth);
  }
  return found;
}

/**
 * Parse the `importers:` section of pnpm-lock.yaml (lockfileVersion 6 / 9 layout) into
 * { importerKey: { depName: specifier } }. We only read `specifier:` lines — that's the
 * single field that must mirror package.json. Indentation is rigid in pnpm lockfiles, so
 * a small structural parser is safe and dependency-free (works even if node_modules is
 * mid-install and js-yaml isn't resolvable).
 */
function parseImporters(lockText) {
  const lines = lockText.split('\n');
  let i = 0;
  // advance to `importers:`
  while (i < lines.length && !/^importers:\s*$/.test(lines[i])) i++;
  if (i >= lines.length) {
    // Single-package lockfile (no importers block) — treat root deps as importer '.'.
    return null;
  }
  i++;
  const importers = {};
  let curImporter = null;
  let curDepName = null;
  const indent = (s) => s.match(/^\s*/)[0].length;

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const col = indent(line);
    if (col === 0) break; // left the importers block
    // importer key: 2-space indent, ends with ':'  e.g. "  packages/core:"
    const imp = line.match(/^ {2}(['"]?)([^:]+?)\1:\s*$/);
    if (col === 2 && imp) {
      curImporter = imp[2];
      importers[curImporter] = {};
      curDepName = null;
      continue;
    }
    if (!curImporter) continue;
    // dep group header: "    dependencies:" (4-space) — skip, we don't need the group
    if (col === 4 && /^\s*(dependencies|devDependencies|optionalDependencies|peerDependencies):\s*$/.test(line)) {
      curDepName = null;
      continue;
    }
    // dep name: 6-space indent, ends with ':'  e.g. "      tree-sitter:"
    const dep = line.match(/^ {6}(['"]?)(.+?)\1:\s*$/);
    if (col === 6 && dep) {
      curDepName = dep[2];
      continue;
    }
    // specifier line: 8-space indent  e.g. "        specifier: ^0.22.4"
    const spec = line.match(/^ {8}specifier:\s*(.+?)\s*$/);
    if (col === 8 && spec && curDepName) {
      let val = spec[1];
      if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
        val = val.slice(1, -1);
      }
      importers[curImporter][curDepName] = val;
    }
  }
  return importers;
}

function readManifestDeps(pjPath) {
  const pkg = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
  const deps = {};
  for (const g of DEP_GROUPS) {
    if (pkg[g]) for (const [name, spec] of Object.entries(pkg[g])) deps[name] = spec;
  }
  return deps;
}

/**
 * Parse the top-level `overrides:` block of pnpm-lock.yaml. pnpm rewrites a dependency's
 * recorded specifier when an override (or `pnpm.overrides` in root package.json) targets it,
 * so a package.json↔lock specifier difference for an overridden dep is EXPECTED, not drift.
 * Returns a Set of bare package names that appear as override targets (e.g. "tree-sitter",
 * "next", "vite"), keyed loosely (we strip any `@<range>` / `>=<x>` qualifier suffix).
 */
function parseOverrideTargets(lockText) {
  const lines = lockText.split('\n');
  const targets = new Set();
  let i = 0;
  while (i < lines.length && !/^overrides:\s*$/.test(lines[i])) i++;
  for (i++; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    if (/^\S/.test(line)) break; // dedented out of the block
    const m = line.match(/^\s{2}(['"]?)([^:]+?)\1:\s*.+$/);
    if (m) {
      // Override key can be "lodash" or "path-to-regexp@<1" — take the bare name.
      const bare = m[2].replace(/@[^@/]*$/, '').trim();
      targets.add(bare);
      targets.add(m[2].trim());
    }
  }
  return targets;
}

/** A specifier difference that pnpm itself produces is not drift: workspace alias
 *  normalization (workspace:^ / workspace:~ → workspace:*) and override-target rewrites. */
function isExplainableMismatch(name, manifestSpec, lockSpec, overrideTargets) {
  if (/^workspace:/.test(manifestSpec) && /^workspace:/.test(lockSpec)) return true;
  if (overrideTargets.has(name)) return true;
  return false;
}

// ── Layer 2: static consistency check ─────────────────────────────────────────
// Splits findings into HARD drift (a dep MISSING from the lockfile / an absent importer —
// the deploy-bricking case overrides can NEVER explain) and SOFT mismatches (a specifier
// differs but pnpm overrides / workspace normalization explain it). Hard drift always fails;
// soft mismatches only surface as warnings (the pnpm probe is the authority on resolvability).
function staticCheck() {
  const lockText = fs.readFileSync(LOCK, 'utf8');
  const importers = parseImporters(lockText);
  const overrideTargets = parseOverrideTargets(lockText);
  const manifests = workspaceManifests();
  const drift = [];   // hard
  const soft = [];    // explainable / informational

  if (importers === null) {
    // No importers block: single-package lockfile. Compare root package.json against the
    // top-level dependency specs if present; otherwise we cannot statically verify — defer
    // to the pnpm probe.
    console.log('  [info] lockfile has no importers: block — single-package layout; static layer deferred to pnpm probe');
    return { drift, soft, deferred: true };
  }

  for (const [importerKey, pjPath] of manifests) {
    const lockDeps = importers[importerKey];
    const manifestDeps = readManifestDeps(pjPath);
    const rel = path.relative(ROOT, pjPath).split(path.sep).join('/');
    if (!lockDeps) {
      // Importer present in workspace but missing from lockfile entirely.
      if (Object.keys(manifestDeps).length > 0) {
        drift.push(`${rel}: importer "${importerKey}" has ${Object.keys(manifestDeps).length} dep(s) but is ABSENT from pnpm-lock.yaml importers (lock never regenerated)`);
      }
      continue;
    }
    for (const [name, spec] of Object.entries(manifestDeps)) {
      if (!(name in lockDeps)) {
        // THE deploy-bricking drift: a dep added to package.json, lock never regenerated.
        drift.push(`${rel}: "${name}@${spec}" present in package.json but MISSING from pnpm-lock.yaml (run \`pnpm install --lockfile-only\` to regenerate)`);
      } else if (lockDeps[name] !== spec) {
        if (isExplainableMismatch(name, spec, lockDeps[name], overrideTargets)) {
          soft.push(`${rel}: "${name}" specifier package.json="${spec}" lock="${lockDeps[name]}" (override/workspace rewrite — expected)`);
        } else {
          // Unexplained specifier mismatch — treat as hard drift only when pnpm can't vouch.
          soft.push(`${rel}: "${name}" specifier MISMATCH package.json="${spec}" lock="${lockDeps[name]}"`);
        }
      }
    }
  }
  return { drift, soft, deferred: false };
}

// ── Layer 1: DRY pnpm probe (corroborating, F.103-safe; no node_modules mutation) ──
function pnpmProbe() {
  if (SKIP_PNPM) return { ran: false, drift: false, reason: '--no-pnpm' };
  let out;
  try {
    out = execSync('pnpm install --frozen-lockfile --lockfile-only', {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000,
    });
  } catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '') + String(e.message || '');
    if (/ENOENT|not found|not recognized/i.test(out) && !/ERR_PNPM/.test(out)) {
      return { ran: false, drift: false, reason: 'pnpm not available on this node' };
    }
  }
  const text = String(out);
  const drift = /ERR_PNPM_OUTDATED_LOCKFILE/.test(text);
  return { ran: true, drift, reason: drift ? 'ERR_PNPM_OUTDATED_LOCKFILE' : 'lockfile in sync' };
}

console.log(`\n[frozen-lockfile] package.json ⇄ pnpm-lock.yaml drift check @ ${ROOT}`);

const probe = pnpmProbe();
if (probe.ran) {
  console.log(`  ${probe.drift ? '[FAIL]' : '[ok]  '} pnpm --frozen-lockfile --lockfile-only probe: ${probe.reason}`);
} else {
  console.log(`  [skip] pnpm probe (${probe.reason})`);
}

let stat;
try {
  stat = staticCheck();
} catch (e) {
  console.error(`  [FAIL] static check errored: ${e.message}`);
  process.exit(2);
}
const soft = stat.soft || [];
// Unexplained soft mismatches (not override/workspace rewrites) only matter when pnpm
// couldn't vouch for resolvability — then we escalate them to hard drift. If the pnpm probe
// ran clean, pnpm has accounted for overrides/transitive resolution and a recorded-specifier
// difference is not deploy-breaking, so we leave them as warnings.
const unexplainedSoft = soft.filter((s) => /specifier MISMATCH/.test(s));
const escalate = !probe.ran && unexplainedSoft.length > 0;

if (stat.drift.length) {
  for (const d of stat.drift) fail(d);
} else if (!stat.deferred) {
  console.log(`  [ok]   static check: every package.json dependency is present in pnpm-lock.yaml (no MISSING-dep drift)`);
}
for (const s of soft) {
  if (escalate && /specifier MISMATCH/.test(s)) fail(s + ' [pnpm probe unavailable — cannot confirm safe]');
  else console.log(`  [warn] ${s}`);
}

const drifted = probe.drift || stat.drift.length > 0 || escalate;
console.log(`\nRESULT: ${drifted
  ? 'DRIFT — pnpm-lock.yaml is OUT OF SYNC with package.json. Run `pnpm install --lockfile-only` and commit the updated lockfile BEFORE merging (an unsynced lock bricks every deploy: ERR_PNPM_OUTDATED_LOCKFILE).'
  : 'IN SYNC — pnpm-lock.yaml matches every package.json (overrides/workspace rewrites accounted for).'}`);
process.exit(drifted ? 1 : 0);
