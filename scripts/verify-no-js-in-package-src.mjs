#!/usr/bin/env node
/**
 * Recurrence lock: no new emitted JS / declaration shadows under packages/<name>/src/.
 *
 * TypeScript belongs in src/ as .ts / .tsx. Committed .js or .d.ts can shadow .ts in Node
 * resolution (see CI note in .github/workflows/ci.yml).
 *
 * Known legacy paths are listed in scripts/allowlists/package-src-emit-legacy.txt (must match
 * the repo exactly — stale lines fail). Optional extra paths:
 *   VERIFY_SRC_EMIT_ALLOWLIST=packages/foo/src/x.d.ts,...
 *
 * Usage: node scripts/verify-no-js-in-package-src.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LEGACY_FILE = path.join(__dirname, 'allowlists', 'package-src-emit-legacy.txt');

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git', '__pycache__']);

function isForbiddenEmitFile(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.tsx')) return false;
  if (lower.endsWith('.ts')) {
    return lower.endsWith('.d.ts') || lower.endsWith('.d.ts.map');
  }
  if (lower.endsWith('.js') || lower.endsWith('.js.map')) return true;
  return false;
}

function loadLegacyAllowlist() {
  const raw = fs.readFileSync(LEGACY_FILE, 'utf8');
  const lines = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    lines.push(t.replace(/\\/g, '/'));
  }
  return new Set(lines);
}

function walkSrc(srcRoot, found) {
  if (!fs.existsSync(srcRoot)) return;
  const stack = [srcRoot];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue;
        stack.push(full);
        continue;
      }
      if (!isForbiddenEmitFile(ent.name)) continue;
      const rel = path.relative(ROOT, full).split(path.sep).join('/');
      found.add(rel);
    }
  }
}

function main() {
  const allowed = loadLegacyAllowlist();
  for (const p of (process.env.VERIFY_SRC_EMIT_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim().replace(/\\/g, '/'))
    .filter(Boolean)) {
    allowed.add(p);
  }

  const found = new Set();
  const pkgRoot = path.join(ROOT, 'packages');
  if (fs.existsSync(pkgRoot)) {
    for (const name of fs.readdirSync(pkgRoot)) {
      walkSrc(path.join(pkgRoot, name, 'src'), found);
    }
  }

  const unexpected = [...found].filter((p) => !allowed.has(p)).sort();
  const stale = [...allowed].filter((p) => !found.has(p)).sort();

  if (unexpected.length === 0 && stale.length === 0) {
    console.log(
      `[verify-no-js-in-package-src] OK — packages/*/src/ emit artifacts match allowlist (${found.size} legacy path(s))`
    );
    process.exit(0);
  }

  if (unexpected.length > 0) {
    console.error(
      `[verify-no-js-in-package-src] FAIL — ${unexpected.length} path(s) not in legacy allowlist (remove or get approval, then add to allowlists/package-src-emit-legacy.txt):`
    );
    for (const v of unexpected) console.error(`  ${v}`);
    console.error('');
  }
  if (stale.length > 0) {
    console.error(
      `[verify-no-js-in-package-src] FAIL — ${stale.length} stale allowlist line(s) (file missing — delete the line(s) from package-src-emit-legacy.txt):`
    );
    for (const v of stale) console.error(`  ${v}`);
    console.error('');
  }
  process.exit(1);
}

main();
