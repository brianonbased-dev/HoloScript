#!/usr/bin/env tsx
/**
 * Native generator for the Universal QR Scanner immersive-MR app.
 *
 * Parses scanner.holo through the REAL HoloCompositionParser and compiles it through the in-core
 * QuestCompiler (surface: immersive_mr → trait-dispatch). Writes the @generated files into android-mr/.
 * This REPLACES the regex facade (quest-emit-mr.mjs). Run: npx tsx generate-native.mts
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HoloCompositionParser } from '../../packages/core/src/parser/HoloCompositionParser';
import { QuestCompiler } from '../../packages/core/src/compiler/QuestCompiler';
import {
  emitWorldSceneKt,
  emitWorldsRegistryKt,
} from '../../packages/core/src/compiler/quest-world-emit';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = join(here, 'scanner.holo');
const refDir = join(here, 'android-mr');
const srcRel = 'app/src/main/java/com/meta/spatial/samples/startersample';

function parse(file: string) {
  const r = new HoloCompositionParser().parse(readFileSync(file, 'utf8'));
  if (!r.success || !r.ast) {
    console.error(`${basename(file)} parse failed:`, r.errors);
    process.exit(1);
  }
  return r.ast;
}

// ── Scanner app (surface: immersive_mr) ──────────────────────────────────────
const files = new QuestCompiler().compile(parse(specPath), '');
let n = 0;
for (const [rel, content] of Object.entries(files)) {
  const out = join(refDir, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, content);
  console.log(`  wrote ${rel} (${content.length} bytes)`);
  n++;
}

// ── HoloScript worlds (worlds/*.holo → Meta Spatial SDK scene Kotlin) ─────────
const worldsDir = join(here, 'worlds');
if (existsSync(worldsDir)) {
  const worldFiles = readdirSync(worldsDir)
    .filter((f) => f.endsWith('.holo'))
    .sort();
  const worldIds: string[] = [];
  for (const wf of worldFiles) {
    const id = basename(wf, '.holo');
    worldIds.push(id);
    const kt = emitWorldSceneKt(parse(join(worldsDir, wf)), id);
    const rel = `${srcRel}/World_${id.replace(/[^a-zA-Z0-9]+/g, '_')}.kt`;
    writeFileSync(join(refDir, rel), kt);
    console.log(`  wrote ${rel} (${kt.length} bytes)  [world: ${id}]`);
    n++;
  }
  const reg = emitWorldsRegistryKt(worldIds);
  const regRel = `${srcRel}/WorldsRegistry.kt`;
  writeFileSync(join(refDir, regRel), reg);
  console.log(`  wrote ${regRel} (${reg.length} bytes)  [${worldIds.length} world(s): ${worldIds.join(', ')}]`);
  n++;
}

console.log(`generate-native: wrote ${n} @generated file(s) into android-mr/`);
