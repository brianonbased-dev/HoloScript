#!/usr/bin/env node
/**
 * Validate src/scene.holo with @holoscript/core — the authoritative HoloScript
 * parser (never a regex shim; F.014). Exits non-zero on parse errors so it can
 * gate CI and pre-commit hooks. Run via `npm run validate`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseHolo } from '@holoscript/core';

const scenePath = path.resolve(process.cwd(), 'src/scene.holo');

if (!fs.existsSync(scenePath)) {
  console.error(`✗ Scene file not found: ${scenePath}`);
  process.exit(1);
}

const source = fs.readFileSync(scenePath, 'utf-8');
const result = parseHolo(source);

const errors = (result && result.errors) || [];
const warnings = (result && result.warnings) || [];
const ok = result && result.success !== false && errors.length === 0;

for (const w of warnings) {
  const loc = w && w.line ? ` (line ${w.line})` : '';
  console.warn(`⚠ ${(w && w.message) || w}${loc}`);
}

if (!ok) {
  console.error('✗ scene.holo failed validation:');
  if (errors.length === 0) {
    console.error('  - parser returned an unsuccessful result with no error detail');
  }
  for (const e of errors) {
    const loc = e && e.line ? ` (line ${e.line})` : '';
    console.error(`  - ${(e && e.message) || e}${loc}`);
  }
  process.exit(1);
}

const objectCount = ((result.ast && result.ast.objects) || []).length;
console.log(`✓ scene.holo is valid — composition "${(result.ast && result.ast.name) || 'Untitled'}", ${objectCount} object(s).`);
process.exit(0);
