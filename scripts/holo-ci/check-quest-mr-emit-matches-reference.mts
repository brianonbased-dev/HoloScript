#!/usr/bin/env tsx
// Golden gate for compile_to_quest (surface: immersive_mr) — NATIVE compiler path.
//
// Parses apps/quest-universal-qr-scanner/scanner.holo through the REAL HoloCompositionParser and
// compiles it through the in-core QuestCompiler (trait-dispatch). FAILS on any drift between the
// emitted files and the committed reference app (apps/quest-universal-qr-scanner/android-mr). This is
// what enforces "edit the spec, not the generated Kotlin": hand-edit a generated .kt instead of
// scanner.holo (or edit scanner.holo without re-running generate-native.mts) and this goes red.
// CRLF is normalised so git autocrlf can't cause false drift.
//
//   npx tsx scripts/holo-ci/check-quest-mr-emit-matches-reference.mts
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HoloCompositionParser } from '../../packages/core/src/parser/HoloCompositionParser';
import { QuestCompiler } from '../../packages/core/src/compiler/QuestCompiler';
import {
  emitWorldSceneKt,
  emitWorldsRegistryKt,
} from '../../packages/core/src/compiler/quest-world-emit';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const appDir = join(repoRoot, 'apps', 'quest-universal-qr-scanner');
const specPath = join(appDir, 'scanner.holo');
const refDir = join(appDir, 'android-mr');
const srcRel = 'app/src/main/java/com/meta/spatial/samples/startersample';

const norm = (s: string) => s.replace(/\r\n/g, '\n');

function parseOrDie(file: string, label: string) {
  const r = new HoloCompositionParser().parse(readFileSync(file, 'utf8'));
  if (!r.success || !r.ast) {
    console.error(`✗ ${label} failed to parse:`, r.errors);
    process.exit(1);
  }
  return r.ast;
}

const emitted: Record<string, string> = new QuestCompiler().compile(parseOrDie(specPath, 'scanner.holo'), '');

// HoloScript worlds (worlds/*.holo → Meta Spatial SDK scene Kotlin) — same drift invariant.
const worldsDir = join(appDir, 'worlds');
if (existsSync(worldsDir)) {
  const worldFiles = readdirSync(worldsDir).filter((f) => f.endsWith('.holo')).sort();
  const worldIds: string[] = [];
  for (const wf of worldFiles) {
    const id = basename(wf, '.holo');
    worldIds.push(id);
    emitted[`${srcRel}/World_${id.replace(/[^a-zA-Z0-9]+/g, '_')}.kt`] = emitWorldSceneKt(
      parseOrDie(join(worldsDir, wf), wf),
      id
    );
  }
  emitted[`${srcRel}/WorldsRegistry.kt`] = emitWorldsRegistryKt(worldIds);
}

let failures = 0;
const paths = Object.keys(emitted);
for (const rel of paths) {
  let ref: string;
  try {
    ref = readFileSync(join(refDir, rel), 'utf8');
  } catch {
    console.error(`✗ MISSING reference file: ${rel}`);
    failures++;
    continue;
  }
  if (norm(emitted[rel]) !== norm(ref)) {
    console.error(`✗ DRIFT: emitted output != reference for ${rel}`);
    const a = norm(emitted[rel]).split('\n');
    const b = norm(ref).split('\n');
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) {
        console.error(`    first diff at line ${i + 1}:`);
        console.error(`      emitted  : ${JSON.stringify(a[i])}`);
        console.error(`      reference: ${JSON.stringify(b[i])}`);
        break;
      }
    }
    failures++;
  }
}

console.log(`\nquest-mr emit: ${paths.length} emitted file(s) checked vs android-mr (native compiler path)`);
if (failures) {
  console.error(
    `\n❌ ${failures} drift/missing failure(s) — edit scanner.holo (not the generated Kotlin) and re-run generate-native.mts.`
  );
  process.exit(1);
}
console.log('✅ emitted MR file(s) byte-match the reference; no drift.');
