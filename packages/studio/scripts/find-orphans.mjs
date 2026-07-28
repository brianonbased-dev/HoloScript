#!/usr/bin/env node
/**
 * find-orphans.mjs — Studio component orphan detector
 *
 * Identifies src/components files that are NOT reachable from any known entry
 * point, then applies a second-pass ripgrep proof to eliminate false positives
 * from dynamic/lazy imports and registry references.
 *
 * Usage:
 *   node scripts/find-orphans.mjs
 *
 * Output: JSON to stdout { generated_against, candidates, kill_list }
 *
 * Conventions match studio-inventory.mjs:
 *   - Plain Node.js, no deps beyond 'child_process'
 *   - VALID_SOURCE_EXTENSIONS, TEST_FILE_PATTERN, IGNORED_DIRS match
 *   - Uses git ls-files for the universe (honours .gitignore)
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, execFileSync } from 'node:child_process';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const studioRoot = join(scriptDir, '..');
const repoRoot = join(studioRoot, '..', '..');
const srcRoot = join(studioRoot, 'src');
const holoFile = join(studioRoot, '.holo', 'studio.ui.holo');
const panelsHoloDir = join(srcRoot, 'lib', 'studio', 'panels');

const VALID_SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const TEST_FILE_PATTERN =
  /(?:^|[\\/])__(?:tests|mocks|fixtures)__[\\/]|(?:\.test|\.spec)\.[tj]sx?$|__demo__/;

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizePath(p) {
  return p.split(sep).join('/');
}

/**
 * Run a shell command and return trimmed stdout. Returns '' on error.
 */
function run(cmd, cwd = repoRoot) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
  } catch {
    return '';
  }
}

// ── Step 1: Reachable set from .holo/studio.ui.holo ──────────────────────────

function extractHoloFiles() {
  if (!existsSync(holoFile)) {
    throw new Error(
      `studio.ui.holo not found at ${holoFile} — run 'node packages/studio-ui-graph/dist/cli.js generate' first`
    );
  }

  const content = readFileSync(holoFile, 'utf8');
  const reachable = new Set();

  // Extract every @file("packages/studio/...") reference
  for (const match of content.matchAll(/@file\("([^"]+)"\)/g)) {
    const raw = match[1]; // e.g. "packages/studio/src/components/..."
    // Normalise to repo-relative forward-slash path
    reachable.add(normalizePath(raw));
  }

  return reachable;
}

function getHoloMtime() {
  try {
    return statSync(holoFile).mtime.toISOString();
  } catch {
    return 'unknown';
  }
}

// ── Step 2: Additional root entries ─────────────────────────────────────────
//
// The UI graph walks app pages starting from JSX import chains.
// Several entry-point files are imported outside that chain:
//   - src/app/**/layout.tsx   (Next.js roots — rendered on every route)
//   - src/app/providers.tsx   (wrapped around entire app)
//   - src/index.ts exports    (public API consumed by embed consumers)
//   - src/embed/**            (embeddable viewers)
//   - src/components/AppShell.tsx  (layout root via layout.tsx)
//   - src/components/layout/AppShell.tsx
//
// We also collect every `import('...')` or `import("...")` path that appears
// anywhere in src/app/** and src/components/** (covers next/dynamic and
// React.lazy patterns) by reading files directly — avoids shell-quoting issues.

const IGNORED_DIRS = new Set([
  '.git',
  '.next',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'playwright-report',
  'test-results',
  '__tests__',
  '__mocks__',
]);

function walkFiles(root, predicate = () => true) {
  if (!existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) stack.push(join(current, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      const p = join(current, entry.name);
      if (predicate(p)) out.push(p);
    }
  }
  return out.sort();
}

function isSourceFile(p) {
  return VALID_SOURCE_EXTENSIONS.has(extname(p)) && !TEST_FILE_PATTERN.test(p);
}

function resolveAliasToRelative(importPath) {
  // @/ maps to packages/studio/src/
  if (importPath.startsWith('@/')) {
    return 'packages/studio/src/' + importPath.slice(2);
  }
  return null;
}

// Read all source files under a directory and extract @/-prefixed import() paths
function collectDynamicImportPaths() {
  const reachable = new Set();
  // Import expressions: import('@/...') or import("@/...")
  const DYNAMIC_IMPORT_RE = /import\(['"](@\/[^'"]+)['"]\)/g;

  const searchRoots = [join(studioRoot, 'src', 'app'), join(studioRoot, 'src', 'components')];

  for (const root of searchRoots) {
    for (const file of walkFiles(root, isSourceFile)) {
      let content;
      try {
        content = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      for (const m of content.matchAll(DYNAMIC_IMPORT_RE)) {
        const resolved = resolveAliasToRelative(m[1]);
        if (!resolved) continue;
        // The import may omit the extension — add all variants
        for (const ext of ['.tsx', '.ts', '.js', '.jsx', '']) {
          reachable.add(normalizePath(resolved + ext));
        }
      }
    }
  }

  return reachable;
}

function collectStaticEntryImports(entryFiles) {
  const reachable = new Set();
  for (const file of entryFiles) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf8');
    // Static import paths: from '@/components/...' or './components/...'
    for (const match of content.matchAll(/from\s+['"](@\/[^'"]+)['"]/g)) {
      const resolved = resolveAliasToRelative(match[1]);
      if (resolved) {
        for (const ext of ['.tsx', '.ts', '.js', '.jsx', '']) {
          reachable.add(normalizePath(resolved + ext));
        }
        reachable.add(normalizePath(resolved));
      }
    }
  }
  return reachable;
}

function collectAllLayoutFiles() {
  const raw = run('git ls-files packages/studio/src/app', repoRoot);
  return raw
    .split('\n')
    .filter((p) => p.endsWith('/layout.tsx') || p.endsWith('/layout.ts'))
    .map((p) => join(repoRoot, p));
}

// ── Step 3: Universe from git ls-files ───────────────────────────────────────

function collectUniverse() {
  const raw = run('git ls-files packages/studio/src/components', repoRoot);
  return raw
    .split('\n')
    .filter((p) => {
      if (!p) return false;
      if (!VALID_SOURCE_EXTENSIONS.has(extname(p))) return false;
      if (TEST_FILE_PATTERN.test(p)) return false;
      return true;
    })
    .map((p) => normalizePath(p));
}

// ── Step 4: Second-pass ripgrep proof ────────────────────────────────────────
//
// For each candidate, search for its basename (no extension) across:
//   - packages/studio/src (catches string-import dynamic refs and registry refs)
//   - packages/studio/src/lib/studio/panels/*.holo (panel registry wiring)
//
// Exclude the candidate's own file and __tests__ files.
// A candidate is on the kill list only if ZERO external hits are found.
//
// Uses execFileSync with array args to avoid shell-quoting issues with
// basenames that contain special characters.

function rgFiles(pattern, searchPath) {
  try {
    return execFileSync('rg', ['--no-heading', '-l', pattern, searchPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    })
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(normalizePath);
  } catch {
    return [];
  }
}

function secondPassRipgrep(repoRelPath) {
  const base = basename(repoRelPath, extname(repoRelPath));
  const absCandidate = normalizePath(join(repoRoot, repoRelPath));

  // Search src tree for the basename string
  const srcHits = rgFiles(base, 'packages/studio/src').filter((hit) => {
    const absHit = normalizePath(join(repoRoot, hit));
    if (absHit === absCandidate) return false; // own file
    if (TEST_FILE_PATTERN.test(hit)) return false; // test files
    return true;
  });

  // Search panel .holo registry files
  const panelHits = rgFiles(base, 'packages/studio/src/lib/studio/panels').filter((h) =>
    h.endsWith('.holo')
  );

  const allHits = [...new Set([...srcHits, ...panelHits])];
  return allHits;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const holoMtime = getHoloMtime();

// Build the reachable set
const holoReachable = extractHoloFiles();
const dynamicImports = collectDynamicImportPaths();
const layoutFiles = collectAllLayoutFiles();
const providersFile = join(studioRoot, 'src', 'app', 'providers.tsx');
const indexFile = join(studioRoot, 'src', 'index.ts');
const appShellLayout = join(studioRoot, 'src', 'app', 'layout.tsx');
const appShellComponent = join(studioRoot, 'src', 'components', 'AppShell.tsx');
const appShellLayout2 = join(studioRoot, 'src', 'components', 'layout', 'AppShell.tsx');

const entryStaticImports = collectStaticEntryImports([
  ...layoutFiles,
  providersFile,
  indexFile,
  appShellComponent,
  appShellLayout2,
]);

// Merge all reachable paths
const reachable = new Set([...holoReachable, ...dynamicImports, ...entryStaticImports]);

// Add explicit well-known entries (roots that are themselves reachable)
const explicitRoots = [
  'packages/studio/src/app/providers.tsx',
  'packages/studio/src/index.ts',
  'packages/studio/src/components/AppShell.tsx',
  'packages/studio/src/components/layout/AppShell.tsx',
];
for (const r of explicitRoots) reachable.add(normalizePath(r));

// Embed entries
const embedRaw = run('git ls-files packages/studio/src/embed', repoRoot);
for (const p of embedRaw.split('\n')) {
  if (p) reachable.add(normalizePath(p));
}

// Universe: all non-test source files under src/components
const universe = collectUniverse();

// Candidates: universe minus reachable
// We check both the full repo-relative path AND variants with/without extension
function isReachable(repoRelPath) {
  if (reachable.has(repoRelPath)) return true;
  // Also try without extension (for import-path matching)
  const noExt = repoRelPath.replace(/\.[^.]+$/, '');
  if (reachable.has(noExt)) return true;
  // Check if any reachable path is a prefix match for barrel files
  if (repoRelPath.endsWith('/index.ts') || repoRelPath.endsWith('/index.tsx')) {
    const dir = noExt.replace(/\/index$/, '');
    if (reachable.has(dir)) return true;
    if (reachable.has(dir + '/index.ts')) return true;
    if (reachable.has(dir + '/index.tsx')) return true;
  }
  return false;
}

const candidates = universe.filter((p) => !isReachable(p));

// Second pass: ripgrep proof
const killList = [];
const survivorDetails = [];

for (const candidate of candidates) {
  const hits = secondPassRipgrep(candidate);
  if (hits.length === 0) {
    killList.push({
      file: candidate,
      basename: basename(candidate, extname(candidate)),
      evidence: 'no-jsx-import + zero-rg-hits',
    });
  } else {
    survivorDetails.push({ file: candidate, hits: hits.slice(0, 3) });
  }
}

const result = {
  generated_against: holoMtime,
  stats: {
    universe_count: universe.length,
    reachable_holo_count: holoReachable.size,
    dynamic_import_count: dynamicImports.size,
    candidates_before_second_pass: candidates.length,
    survivors_after_second_pass: survivorDetails.length,
    kill_list_count: killList.length,
  },
  candidates: candidates,
  survivors_sample: survivorDetails.slice(0, 10),
  kill_list: killList,
};

console.log(JSON.stringify(result, null, 2));
