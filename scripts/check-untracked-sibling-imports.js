#!/usr/bin/env node
/**
 * Untracked-Sibling Import Checker (pre-commit gate).
 *
 * Blocks a commit when any staged code file imports a sibling/relative path
 * that is NOT tracked in git. This is the root-cause fix for SEC-T-Zero
 * (2026-04): 32 files imported by committed code were missing from git —
 * local tests passed (files on disk), Railway builds failed MODULE_NOT_FOUND.
 *
 * Scope
 * -----
 *  - Runs on staged `.ts / .tsx / .js / .jsx / .mjs / .cjs` files (diff-filter ACM).
 *  - Detects static import, CJS require(), dynamic import(), TS
 *    `export ... from '<path>'`, and TS `import type ... from '<path>'`.
 *  - Only validates RELATIVE specifiers (start with `./` or `../`). Absolute
 *    npm / tsconfig-path aliases are skipped — resolving those reliably at
 *    hook time is out of scope.
 *
 * Pass/fail rules
 * ---------------
 *  - A relative target that resolves to a file tracked in git  → pass.
 *  - A relative target that resolves to a file also staged for this commit
 *    (same `git diff --cached` set) → pass. Covers "I staged A and B
 *    together" — they're both entering git in this commit.
 *  - A relative target that resolves only to an untracked file
 *    (`git ls-files --others --exclude-standard`) → FAIL.
 *  - A relative target that doesn't resolve at all → SKIP (not our job;
 *    lint/tsc handles broken imports. Staying strict about "untracked"
 *    avoids false positives on legit runtime-resolution paths).
 *
 * Performance
 * -----------
 *  - Runs in <500ms on typical diffs (<50 files). One `git ls-files` +
 *    one `git ls-files --others --exclude-standard` call, cached in
 *    memory; per-file read with regex scan.
 *  - Returns early (exit 0) if no staged code files.
 *
 * Opt-out
 * -------
 *  - `git commit --no-verify` (bypasses all hooks; git default).
 *  - `HOLOMESH_SKIP_UNTRACKED_SIBLING_CHECK=1` env var (bypasses just
 *    this gate, for rare CI / emergency cases).
 *
 * Exit codes
 * ----------
 *   0  pass (or skipped via env / no staged code files).
 *   1  fail: at least one (importer, untracked target) pair found.
 *
 * See: SEC-T-Zero retro, W.078 (knowledge store).
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[1;33m';
const NC = '\x1b[0m';

// ---- Env-based opt-out ----
if (process.env.HOLOMESH_SKIP_UNTRACKED_SIBLING_CHECK === '1') {
  console.log(`${YELLOW}UntrackedSiblings: SKIPPED (HOLOMESH_SKIP_UNTRACKED_SIBLING_CHECK=1)${NC}`);
  process.exit(0);
}

// ---- Git helpers ----
function gitLines(args) {
  try {
    const out = execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out.split('\n').filter(Boolean);
  } catch (err) {
    // If git fails (e.g. not a repo), be permissive — do not block.
    return null;
  }
}

function gitRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
  }
}

// ---- File-set snapshots (computed once) ----
const ROOT = gitRoot();

const stagedCode = gitLines('diff --cached --name-only --diff-filter=ACM');
if (stagedCode === null) {
  // git failed — do not block commits.
  process.exit(0);
}

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;
const stagedCodeFiles = stagedCode.filter((f) => CODE_EXT.test(f));

// Fast-path: no staged code files → nothing to scan.
if (stagedCodeFiles.length === 0) {
  console.log(`${GREEN}UntrackedSiblings OK${NC} (no staged code files)`);
  process.exit(0);
}

const trackedSet = new Set(gitLines('ls-files') || []);
const untrackedSet = new Set(gitLines('ls-files --others --exclude-standard') || []);
// "Staged-for-this-commit" set — files the hook sees in --cached. Importers
// and their siblings can land together; a sibling that's staged is entering
// git in this commit, so it's fine.
const stagedSet = new Set(gitLines('diff --cached --name-only') || []);

// ---- Import detection ----
// We scan for relative specifiers only. Absolute paths and bare specifiers
// (npm packages, path aliases) are ignored — resolving those correctly
// requires tsconfig-paths + node_modules introspection, which is out of
// scope for a fast pre-commit gate. The symptom the gate catches is
// "relative sibling missing from git", which is exactly what bit SEC-T-Zero.
//
// Patterns (multiline-aware):
//   import ... from '<spec>'
//   import '<spec>'
//   import(...'<spec>'...)       — dynamic
//   require('<spec>')            — CJS
//   export ... from '<spec>'
//
// `<spec>` is the captured string, single or double quoted.
const IMPORT_PATTERNS = [
  // import ... from 'x' | import 'x' | export ... from 'x'
  /(?:^|[\s;])(?:import|export)\s*(?:[\s\S]*?\s*from\s*)?['"]([^'"]+)['"]/g,
  // require('x') — only match require called as a function
  /(?:^|[^.\w$])require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // dynamic import('x')
  /(?:^|[^.\w$])import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

// Extension-probing order for resolving a relative spec. Matches what
// Node + ts-node + tsup + vitest all try; tsconfig-paths not included.
const PROBE_EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const INDEX_FILES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.mjs', 'index.cjs'];

function toRepoRel(abs) {
  // Normalize to forward-slash paths relative to repo root, matching git's
  // output format.
  return path.relative(ROOT, abs).replace(/\\/g, '/');
}

function tryFile(candidate) {
  // Return the first resolved repo-relative path, or null.
  const variants = [candidate, ...PROBE_EXTS.map((e) => candidate + e)];
  for (const v of variants) {
    if (v && fs.existsSync(v) && fs.statSync(v).isFile()) {
      return toRepoRel(v);
    }
  }
  // Directory with index.*
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    for (const idx of INDEX_FILES) {
      const p = path.join(candidate, idx);
      if (fs.existsSync(p)) return toRepoRel(p);
    }
  }
  return null;
}

function resolveSpec(importerAbs, spec) {
  // Only resolve relative specs. Everything else is a bare module or
  // tsconfig-path alias; out of scope.
  if (!spec.startsWith('./') && !spec.startsWith('../')) return null;
  const base = path.dirname(importerAbs);
  const candidate = path.resolve(base, spec);
  return tryFile(candidate);
}

function extractSpecs(source) {
  const specs = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    // Reset lastIndex on global regex (defensive; new instance per-file would
    // also work, but these are compiled once at top-level).
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(source)) !== null) {
      if (m[1]) specs.add(m[1]);
    }
  }
  return specs;
}

// ---- Scan ----
const violations = []; // { importer, spec, resolved }
const missingResolve = []; // informational; not a block

for (const rel of stagedCodeFiles) {
  const abs = path.join(ROOT, rel);
  let src;
  try {
    src = fs.readFileSync(abs, 'utf8');
  } catch {
    // File may have been deleted between `git diff --cached` and read. Skip.
    continue;
  }
  const specs = extractSpecs(src);
  for (const spec of specs) {
    if (!spec.startsWith('./') && !spec.startsWith('../')) continue;
    const resolved = resolveSpec(abs, spec);
    if (!resolved) {
      // Broken or alias import. Not our gate's problem (lint/tsc catches).
      missingResolve.push({ importer: rel, spec });
      continue;
    }
    const tracked = trackedSet.has(resolved);
    const staged = stagedSet.has(resolved);
    const untracked = untrackedSet.has(resolved);
    if (!tracked && !staged) {
      // Only flag if we can confirm it's specifically in the untracked set.
      // If it's neither tracked, staged, nor untracked-new (e.g. ignored by
      // .gitignore), we stay silent — those are the user's call.
      if (untracked) {
        violations.push({ importer: rel, spec, resolved });
      }
    }
  }
}

// ---- Report ----
if (violations.length === 0) {
  const count = stagedCodeFiles.length;
  console.log(`${GREEN}UntrackedSiblings OK${NC} (${count} staged code file${count === 1 ? '' : 's'} scanned)`);
  process.exit(0);
}

console.log(`${RED}UntrackedSiblings: ${violations.length} import(s) reference untracked sibling file(s)${NC}`);
console.log('  These imports will fail MODULE_NOT_FOUND on any clean checkout (CI, Railway, teammate).');
console.log('');
for (const v of violations) {
  console.log(`  ${RED}${v.importer}${NC}`);
  console.log(`      imports  '${v.spec}'`);
  console.log(`      resolves to untracked file: ${YELLOW}${v.resolved}${NC}`);
}
console.log('');
console.log(`  ${YELLOW}FIX:${NC} git add <the untracked file(s) listed above>`);
console.log(`  ${YELLOW}EMERGENCY BYPASS:${NC} HOLOMESH_SKIP_UNTRACKED_SIBLING_CHECK=1 git commit ...`);
console.log('  (or: git commit --no-verify — bypasses ALL hooks)');
process.exit(1);
