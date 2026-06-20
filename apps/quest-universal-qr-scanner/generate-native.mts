#!/usr/bin/env tsx
/**
 * Native generator for the Universal QR Scanner immersive-MR app.
 *
 * Parses scanner.holo through the REAL HoloCompositionParser and compiles it through the in-core
 * QuestCompiler (surface: immersive_mr → trait-dispatch). Writes the @generated files into android-mr/.
 * This REPLACES the regex facade (quest-emit-mr.mjs). Run: npx tsx generate-native.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HoloCompositionParser } from '../../packages/core/src/parser/HoloCompositionParser';
import { QuestCompiler } from '../../packages/core/src/compiler/QuestCompiler';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = join(here, 'scanner.holo');
const refDir = join(here, 'android-mr');

const parsed = new HoloCompositionParser().parse(readFileSync(specPath, 'utf8'));
if (!parsed.success || !parsed.ast) {
  console.error('scanner.holo parse failed:', parsed.errors);
  process.exit(1);
}

const files = new QuestCompiler().compile(parsed.ast, '');
let n = 0;
for (const [rel, content] of Object.entries(files)) {
  const out = join(refDir, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, content);
  console.log(`  wrote ${rel} (${content.length} bytes)`);
  n++;
}
console.log(`generate-native: wrote ${n} @generated file(s) into android-mr/`);
