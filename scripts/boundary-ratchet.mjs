#!/usr/bin/env node
/**
 * boundary-ratchet.mjs — a generic "shrink-OK, grow-FAIL" drift ratchet.
 *
 * Inherited construction (uaa2-service `scripts/check-boundary.mjs`): a guard
 * whose tracked count may DECREASE freely but may never INCREASE past a recorded
 * baseline. It turns an aspirational coding RULE into a mechanical GATE — you
 * can pay down debt without ceremony, but you cannot add more.
 *
 * This is the generic, config-driven HoloScript port. It complements (does not
 * duplicate) `check-architecture-coupling.js` (allowlisted circular-dep pairs)
 * and `check:tropical-mentions`. Baselines live in `boundary-baselines.json`
 * (data, not code) so a legitimate reduction is recorded with `--update`.
 *
 * Guard modes:
 *   - 'occurrences': total regex matches across the matched files.
 *   - 'file-count' : number of files matching the predicate.
 *
 * Usage:
 *   node scripts/boundary-ratchet.mjs            # enforce (exit 1 on growth)
 *   node scripts/boundary-ratchet.mjs --update   # record current counts as baseline
 *
 * Exit 0 = clean (counts ≤ baseline). Exit 1 = a guard grew.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_FILE = join(ROOT, 'scripts', 'boundary-baselines.json');
const UPDATE = process.argv.includes('--update');

const IGNORED_DIRS = new Set([
  '.git',
  '.next',
  'coverage',
  'node_modules',
  'dist',
  'pkg',
  'target',
  '.scratch',
]);

// `any` escape hatches in TypeScript type position (the standard bans `any`;
// WHY: 3 production bugs — see CLAUDE.md coding standards).
const ANY_PATTERN = /:\s*any\b|\bas any\b|<any>|\bArray<any>|Record<[^>]*,\s*any>|\bany\[\]/g;

const isTestFile = (p) =>
  /\.(test|spec)\.[cm]?tsx?$/.test(p) ||
  /\.prod\.test\.[cm]?tsx?$/.test(p) ||
  /[\\/]__tests__[\\/]/.test(p) ||
  /\.d\.ts$/.test(p); // hand-crafted .d.ts (generate-types.mjs) is exempt

/**
 * The guards. Each tracks one drift dimension. Add a guard here, run --update,
 * commit the new baseline — that's the whole workflow.
 */
const GUARDS = [
  {
    key: 'any-in-core-src',
    label: '`any` escape-hatches in @holoscript/core production source',
    dir: 'packages/core/src',
    mode: 'occurrences',
    pattern: ANY_PATTERN,
    include: (p) => ['.ts', '.tsx'].includes(extname(p)) && !isTestFile(p),
    remedy: 'Replace new `any` with `unknown` + a narrowing guard (CLAUDE.md: no `any`).',
  },
];

function toRepoPath(abs) {
  return relative(ROOT, abs).split(sep).join('/');
}

function collectFiles(relDir, include) {
  const root = join(ROOT, relDir);
  if (!existsSync(root)) return [];
  const files = [];
  (function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) visit(join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      const repoPath = toRepoPath(join(dir, entry.name));
      if (include(repoPath)) files.push(repoPath);
    }
  })(root);
  return files.sort();
}

function measure(guard) {
  const files = collectFiles(guard.dir, guard.include);
  if (guard.mode === 'file-count') return files.length;
  // occurrences
  let total = 0;
  for (const f of files) {
    const content = readFileSync(join(ROOT, f), 'utf8');
    const m = content.match(guard.pattern);
    if (m) total += m.length;
  }
  return total;
}

function loadBaselines() {
  if (!existsSync(BASELINE_FILE)) return {};
  return JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
}

function main() {
  const baselines = loadBaselines();
  const measured = {};
  const violations = [];
  const shrank = [];

  for (const guard of GUARDS) {
    const count = measure(guard);
    measured[guard.key] = count;
    const baseline = baselines[guard.key];

    if (UPDATE) continue;

    if (baseline === undefined) {
      violations.push(
        `${guard.key}: no baseline recorded (count=${count}). Run \`node scripts/boundary-ratchet.mjs --update\` to seed.`
      );
    } else if (count > baseline) {
      violations.push(
        `${guard.label}\n      grew to ${count} (baseline ${baseline}, +${count - baseline}). ${guard.remedy}`
      );
    } else if (count < baseline) {
      shrank.push(
        `${guard.key}: shrank to ${count} (was ${baseline}) — run --update to lock in the win.`
      );
    }
  }

  if (UPDATE) {
    writeFileSync(BASELINE_FILE, JSON.stringify(measured, null, 2) + '\n', 'utf8');
    console.log('boundary-ratchet: baselines updated →', measured);
    return;
  }

  for (const s of shrank) console.log(`  ↓ ${s}`);

  if (violations.length === 0) {
    console.log(`boundary-ratchet: clean (${GUARDS.length} guard(s) at or below baseline).`);
    process.exit(0);
  }

  console.error(`boundary-ratchet FAILED — ${violations.length} guard(s) grew:\n`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

main();
