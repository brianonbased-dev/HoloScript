#!/usr/bin/env node
/**
 * check-no-devtools-in-deps — fail when a publishable (non-private) workspace package ships
 * dev tooling in its runtime `dependencies`.
 *
 * Why: @holoscript/absorb-service@6.1.5 shipped vitest/eslint/typescript/@types/* as runtime
 * deps. Every consumer then had to resolve vitest's optional peer set, and npm 10's arborist
 * crashes on it (`TypeError: Cannot read properties of null (reading 'edgesOut')`).
 *
 * Ratchet: KNOWN lists pre-existing violations (package -> deps). A KNOWN entry that is fixed
 * is reported so it can be removed; any violation not in KNOWN fails (exit 1).
 *
 *   node scripts/holo-ci/check-no-devtools-in-deps.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[no-devtools-in-deps]';

export const DEVTOOL_RE =
  /^(vitest|eslint|typescript|tsup|tsx|prettier|jest|@types\/.+|@vitest\/.+|@typescript-eslint\/.+|eslint-(plugin|config)-.+|@eslint\/.+)$/;

// Pre-existing violations at a4fdbacc (2026-10-26). Remove an entry once its package is fixed.
const KNOWN = {
  '@holoscript/cli': ['@types/adm-zip'],
  'holoscript-vscode': ['@types/adm-zip'],
};

const WORKSPACE_DIRS = ['packages', 'packages/plugins', 'services', 'benchmarks'];

export function findViolations(root = ROOT) {
  const out = [];
  for (const base of WORKSPACE_DIRS) {
    const abs = path.join(root, base);
    if (!fs.existsSync(abs)) continue;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const pj = path.join(abs, e.name, 'package.json');
      if (!fs.existsSync(pj)) continue;
      const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
      if (!j.name || j.private) continue;
      const bad = Object.keys(j.dependencies ?? {}).filter((d) => DEVTOOL_RE.test(d));
      if (bad.length) out.push({ name: j.name, file: path.relative(root, pj), deps: bad });
    }
  }
  return out;
}

function main() {
  const violations = findViolations();
  const fresh = [];
  for (const v of violations) {
    const known = new Set(KNOWN[v.name] ?? []);
    const extra = v.deps.filter((d) => !known.has(d));
    if (extra.length) fresh.push({ ...v, deps: extra });
  }
  for (const [name, deps] of Object.entries(KNOWN)) {
    const v = violations.find((x) => x.name === name);
    const still = new Set(v?.deps ?? []);
    const fixed = deps.filter((d) => !still.has(d));
    if (fixed.length) console.log(`${TAG} note: KNOWN entry fixed, remove it: ${name} -> ${fixed.join(', ')}`);
  }
  if (fresh.length) {
    console.error(`${TAG} FAIL: dev tooling in runtime "dependencies" (move to devDependencies):`);
    for (const v of fresh) console.error(`  ${v.file} (${v.name}): ${v.deps.join(', ')}`);
    process.exit(1);
  }
  console.log(`${TAG} OK: no new dev tooling in runtime dependencies (${violations.length} known).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();