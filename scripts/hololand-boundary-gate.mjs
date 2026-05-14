#!/usr/bin/env node
/**
 * hololand-boundary-gate.mjs
 *
 * CI gate: prevents broken @hololand/* dynamic imports and API contamination.
 *
 * Checks:
 *   1. Every dynamic import of @hololand/<pkg> has a matching directory
 *      in the HoloLand repo packages/ tree.
 *   2. packages/core/src/barrel/index.ts does NOT re-export hololand-runtime.
 *   3. packages/core/src/barrel/exports-semantics-diff-wasm.ts does NOT
 *      re-export hololand namespace.
 *
 * Exit 0 on pass, exit 1 on failure with actionable diagnostics.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const HOLOSCRIPT_ROOT = resolve(import.meta.dirname, '..');
const HOLoland_ROOT = resolve(HOLOSCRIPT_ROOT, '..', 'HoloLand');

const failures = [];

function fail(msg) {
  failures.push(msg);
}

// ── 1. Enumerate known HoloLand packages ─────────────────────────────────────
const knownHololandPackages = new Set();

function scanDir(dir, prefix = '') {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      knownHololandPackages.add(name);
      scanDir(join(dir, entry.name), name);
    }
  }
}

// Known top-level package roots in HoloLand repo
const hololandPackageRoots = [
  join(HOLoland_ROOT, 'packages', 'platform'),
  join(HOLoland_ROOT, 'packages', 'adapters'),
  join(HOLoland_ROOT, 'packages', 'brittney'),
];

for (const root of hololandPackageRoots) {
  scanDir(root);
}

// Also check flat packages/ directory if it exists
const flatPackages = join(HOLoland_ROOT, 'packages');
if (existsSync(flatPackages)) {
  for (const entry of readdirSync(flatPackages, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      knownHololandPackages.add(entry.name);
      scanDir(join(flatPackages, entry.name), entry.name);
    }
  }
}

// Whitelist: packages that are known to exist or are cross-repo contracts
const ALLOWLIST = new Set([
  '@hololand/world',
  '@hololand/voice',
  '@hololand/gestures',
  '@hololand/navigation',
  '@hololand/three-adapter',
  '@hololand/react-three',
  '@hololand/ai-bridge',
  '@hololand/renderer', // verified live 2026-05-13
]);

// ── 2. Scan HoloScript for @hololand/* dynamic imports ──────────────────────
const DYNAMIC_IMPORT_RE = /await\s+import\s*\(\s*['"`](@hololand\/[^'"`]+)['"`]\s*\)/g;

function scanFile(filePath) {
  const text = readFileSync(filePath, 'utf-8');
  let m;
  while ((m = DYNAMIC_IMPORT_RE.exec(text)) !== null) {
    const pkg = m[1];
    const shortName = pkg.replace('@hololand/', '');
    if (ALLOWLIST.has(pkg)) continue;
    if (knownHololandPackages.has(shortName)) continue;
    fail(`Broken dynamic import: ${pkg} in ${filePath.replace(HOLOSCRIPT_ROOT + '/', '')}`);
  }
}

function walk(dir, cb) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
      walk(p, cb);
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      cb(p);
    }
  }
}

walk(join(HOLOSCRIPT_ROOT, 'packages'), scanFile);

// ── 3. Barrel contamination checks ──────────────────────────────────────────
const barrelIndex = join(HOLOSCRIPT_ROOT, 'packages', 'core', 'src', 'barrel', 'index.ts');
const barrelWasm = join(HOLOSCRIPT_ROOT, 'packages', 'core', 'src', 'barrel', 'exports-semantics-diff-wasm.ts');

if (existsSync(barrelIndex)) {
  const text = readFileSync(barrelIndex, 'utf-8');
  if (text.includes("export * from './hololand-runtime'")) {
    fail(`API contamination: packages/core/src/barrel/index.ts re-exports hololand-runtime`);
  }
}

if (existsSync(barrelWasm)) {
  const text = readFileSync(barrelWasm, 'utf-8');
  if (text.includes("export * as hololand from '../hololand'")) {
    fail(`API contamination: packages/core/src/barrel/exports-semantics-diff-wasm.ts re-exports hololand namespace`);
  }
}

// ── 4. Report ────────────────────────────────────────────────────────────────
if (failures.length === 0) {
  console.log('✅ hololand-boundary-gate: PASS');
  process.exit(0);
} else {
  console.error(`❌ hololand-boundary-gate: ${failures.length} failure(s)`);
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  console.error('\nRemediation: fix the import, move the code to HoloLand, or add to ALLOWLIST.');
  process.exit(1);
}
