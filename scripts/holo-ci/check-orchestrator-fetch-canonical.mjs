#!/usr/bin/env node
/**
 * check-orchestrator-fetch-canonical.mjs — CHOKEPOINT-CAPTURE ratchet for orchestrator fetches.
 *
 * WHY THIS GATE EXISTS (dependency-sovereignty-ladder ruling, 2026-07-16):
 *   A same-day audit found ~236 raw fetch() sites hardcoding the Railway orchestrator URL
 *   (the 'mcp-orchestrator-production-45f9' literal) while the typed client
 *   packages/connector-core/src/ResilientOrchestratorFetch.ts went mostly unused. The
 *   ratified precondition for an eventual Jetson-primary orchestrator is CHOKEPOINT CAPTURE:
 *   the typed client (now Jetson-first, short-timeout, circuit-breaking) must be the only
 *   GROWING path to the orchestrator. Modeled on check-render-surface-native.mjs:
 *
 *     • Files that already contain the raw literal are GRANDFATHERED into a checked-in
 *       baseline (seeded via --update). They are legacy debt to migrate, not new debt.
 *     • Any NEW file containing the raw literal (outside packages/connector-core and the
 *       @holoscript/config package) grows the chokepoint escape surface and is blocked
 *       (CHOKEPOINT-GREW, exit 1). Route through ResilientOrchestratorFetch or
 *       @holoscript/config ENDPOINTS instead.
 *     • As raw sites migrate to the typed client the baseline shrinks toward
 *       connector-core + config only; lock in shrinkage via --update.
 *
 * WHAT IT DOES (read-only, no install, no network):
 *   - Enumerates git-tracked files (git ls-files — untracked peer debris never counts).
 *   - Flags files containing the raw literal, excluding the canonical homes
 *     (packages/connector-core, any package named @holoscript/config), this script,
 *     and its baseline.
 *   - check mode: exit 1 (CHOKEPOINT-GREW) if the file count grows past the baseline,
 *     naming the new files. Shrinkage is reported (CHOKEPOINT-SHRANK) with a hint to
 *     --update so the ratchet tightens.
 *   - --files <comma|newline list>: staged-scope mode for the pre-commit dev floor —
 *     evaluates ONLY the named repo-relative paths; a staged file containing the literal
 *     that is not in the baseline fails, so a peer's unstaged WIP can't block a commit.
 *
 * Usage:
 *   node scripts/holo-ci/check-orchestrator-fetch-canonical.mjs            # check, exit 1 on growth
 *   node scripts/holo-ci/check-orchestrator-fetch-canonical.mjs --update   # (re)seed baseline
 *   node scripts/holo-ci/check-orchestrator-fetch-canonical.mjs --files "a.ts,b.mjs"
 *   node scripts/holo-ci/check-orchestrator-fetch-canonical.mjs --root <dir>
 *
 * Exit 0 iff the raw-literal surface did not grow. Exit 1 on growth. Exit 2 on usage/env error.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const RAW_LITERAL = 'mcp-orchestrator-production-45f9';
const MIGRATION_HINT =
  'Route orchestrator calls through the typed client ResilientOrchestratorFetch ' +
  '(packages/connector-core/src/ResilientOrchestratorFetch.ts — Jetson-first cascade, ' +
  'short LAN timeout, circuit breaker) or @holoscript/config ENDPOINTS.MCP_ORCHESTRATOR. ' +
  'Do not hardcode the Railway URL.';

const args = process.argv.slice(2);
const UPDATE = args.includes('--update');
const rootIdx = args.indexOf('--root');
const ROOT = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();

const filesIdx = args.indexOf('--files');
const EXPLICIT_FILES =
  filesIdx >= 0
    ? (args[filesIdx + 1] || '')
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

const SELF = 'scripts/holo-ci/check-orchestrator-fetch-canonical.mjs';
const BASELINE_REL = 'scripts/holo-ci/orchestrator-fetch-canonical-baseline.json';
const BASELINE = join(ROOT, ...BASELINE_REL.split('/'));

// Binary-ish payloads the literal cannot meaningfully live in (and large-file cap).
const SKIP_EXT =
  /\.(png|jpe?g|gif|webp|ico|bmp|woff2?|ttf|otf|eot|wasm|gguf|bin|onnx|npz|pt|safetensors|zip|gz|tgz|tar|7z|pdf|mp[34]|wav|ogg|glb|usdz?|so|dll|exe|node|jar|class|pyc|db|sqlite3?|lockb)$/i;
const MAX_BYTES = 2 * 1024 * 1024;

function toPosix(p) {
  return p.split(sep).join('/');
}

/** Canonical homes: the typed client package + any package named @holoscript/config. */
function canonicalDirs() {
  const dirs = ['packages/connector-core'];
  const packagesAbs = join(ROOT, 'packages');
  let entries = [];
  try {
    entries = readdirSync(packagesAbs, { withFileTypes: true });
  } catch {
    return dirs;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const pkgJson = join(packagesAbs, e.name, 'package.json');
    if (!existsSync(pkgJson)) continue;
    try {
      const pkg = JSON.parse(readFileSync(pkgJson, 'utf8'));
      if (pkg.name === '@holoscript/config') dirs.push(`packages/${e.name}`);
    } catch {
      /* unparseable package.json — not the config package */
    }
  }
  return dirs;
}

const CANONICAL_DIRS = canonicalDirs();

function isExcluded(rel) {
  if (rel === SELF || rel === BASELINE_REL) return true;
  return CANONICAL_DIRS.some((d) => rel === d || rel.startsWith(d + '/'));
}

function containsLiteral(relPath) {
  const abs = join(ROOT, ...relPath.split('/'));
  if (SKIP_EXT.test(relPath)) return false;
  let st;
  try {
    st = statSync(abs);
  } catch {
    return false; // deleted/renamed on disk — cannot grow the surface
  }
  if (!st.isFile() || st.size > MAX_BYTES) return false;
  try {
    return readFileSync(abs, 'utf8').includes(RAW_LITERAL);
  } catch {
    return false;
  }
}

function trackedFiles() {
  try {
    const out = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return out.split('\0').filter(Boolean).map(toPosix);
  } catch (err) {
    console.error(
      `[orchestrator-fetch] git ls-files failed under ${ROOT}: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(2);
  }
}

function readBaseline() {
  if (!existsSync(BASELINE)) {
    console.error(`[orchestrator-fetch] baseline missing: ${BASELINE} — run --update to create it`);
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(BASELINE, 'utf8'));
  } catch {
    console.error(`[orchestrator-fetch] baseline unparseable: ${BASELINE}`);
    process.exit(1);
  }
}

// ── --files scope (staged-only, pre-commit dev floor) ────────────────────────
if (EXPLICIT_FILES !== null && !UPDATE) {
  const baseline = readBaseline();
  const baselineSet = new Set(baseline.files || []);
  const errors = [];
  for (const f of EXPLICIT_FILES) {
    const rel = toPosix(f);
    if (isExcluded(rel) || baselineSet.has(rel)) continue;
    if (containsLiteral(rel)) {
      errors.push(
        `CHOKEPOINT-GREW  ${rel} — new raw '${RAW_LITERAL}' literal outside the canonical client.`
      );
    }
  }
  if (errors.length) {
    console.error(`[orchestrator-fetch] ${errors.length} issue(s):`);
    for (const e of errors) console.error('  ' + e);
    console.error(`\n[orchestrator-fetch] ${MIGRATION_HINT}`);
    console.error(`[orchestrator-fetch] (intentional grandfather/rename: node ${SELF} --update)`);
    process.exit(1);
  }
  console.log('[orchestrator-fetch] OK — no staged file grows the raw orchestrator-URL surface.');
  process.exit(0);
}

// ── full-tree inventory ──────────────────────────────────────────────────────
const offenders = trackedFiles()
  .filter((rel) => !isExcluded(rel))
  .filter(containsLiteral)
  .sort();

// ── --update: (re)seed the baseline ──────────────────────────────────────────
if (UPDATE) {
  writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        _comment:
          'CHOKEPOINT-CAPTURE baseline (dependency-sovereignty-ladder, 2026-07-16). Grandfathered files containing ' +
          `the raw '${RAW_LITERAL}' orchestrator literal outside packages/connector-core and @holoscript/config. ` +
          'New raw-literal files are blocked (CHOKEPOINT-GREW); migrate call sites to ResilientOrchestratorFetch ' +
          '(packages/connector-core) or @holoscript/config ENDPOINTS, then shrink this list via --update. ' +
          `Regenerate with: node ${SELF} --update`,
        literal: RAW_LITERAL,
        count: offenders.length,
        files: offenders,
      },
      null,
      2
    ) + '\n'
  );
  console.log(
    `[orchestrator-fetch] baseline seeded: ${offenders.length} grandfathered raw-literal file(s) -> ${BASELINE}`
  );
  process.exit(0);
}

// ── check mode ───────────────────────────────────────────────────────────────
const baseline = readBaseline();
const baselineFiles = new Set(baseline.files || []);
const baselineCount = typeof baseline.count === 'number' ? baseline.count : baselineFiles.size;

const newFiles = offenders.filter((f) => !baselineFiles.has(f));
const goneFiles = [...baselineFiles].filter((f) => !offenders.includes(f));

if (offenders.length > baselineCount) {
  console.error(
    `[orchestrator-fetch] CHOKEPOINT-GREW — raw '${RAW_LITERAL}' surface grew: ${offenders.length} file(s) vs baseline ${baselineCount}.`
  );
  for (const f of newFiles) console.error(`  CHOKEPOINT-GREW  ${f}`);
  console.error(`\n[orchestrator-fetch] ${MIGRATION_HINT}`);
  console.error(`[orchestrator-fetch] (intentional grandfather: node ${SELF} --update)`);
  process.exit(1);
}

if (newFiles.length) {
  console.log(
    `[orchestrator-fetch] note: ${newFiles.length} path(s) not in baseline (moved/renamed; total did not grow) — reconcile via --update:`
  );
  for (const f of newFiles) console.log(`  NEW-PATH  ${f}`);
}
if (goneFiles.length) {
  console.log(
    `[orchestrator-fetch] CHOKEPOINT-SHRANK — ${goneFiles.length} baseline file(s) no longer carry the raw literal. ` +
      `Lock in the lower baseline: node ${SELF} --update`
  );
}

console.log(
  `[orchestrator-fetch] OK — ${offenders.length} grandfathered raw-literal file(s) (baseline ${baselineCount}); ` +
    `growth blocked. Canonical client: ResilientOrchestratorFetch (packages/connector-core).`
);
process.exit(0);
