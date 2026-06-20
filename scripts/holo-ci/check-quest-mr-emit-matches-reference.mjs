#!/usr/bin/env node
// check-quest-mr-emit-matches-reference.mjs — golden gate for compile_to_quest (surface: immersive_mr).
//
// Runs the MR emitter and FAILS on any drift between an EMITTED file and the committed reference app
// (apps/quest-universal-qr-scanner/android-mr). This is what enforces "edit the spec, not the
// generated Kotlin": if someone hand-edits ScannerContent.kt instead of scanner.holo, this goes red.
// CRLF is normalised so git autocrlf doesn't cause false drift.
//
//   node scripts/holo-ci/check-quest-mr-emit-matches-reference.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MR_GOLDEN_MANIFEST, emitMrFiles } from '../../apps/quest-universal-qr-scanner/quest-emit-mr.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const appDir = join(repoRoot, 'apps', 'quest-universal-qr-scanner');
const specPath = join(appDir, 'scanner.holo');
const refDir = join(appDir, 'android-mr');

const norm = (s) => s.replace(/\r\n/g, '\n');
const emitted = emitMrFiles(specPath);
let failures = 0;
let emittedCount = 0;

for (const f of MR_GOLDEN_MANIFEST) {
  if (f.status !== 'emitted') continue;
  emittedCount++;
  let ref;
  try {
    ref = readFileSync(join(refDir, f.path), 'utf8');
  } catch {
    console.error(`✗ MISSING reference file: ${f.path}`);
    failures++;
    continue;
  }
  const got = emitted[f.path];
  if (got == null) {
    console.error(`✗ declared 'emitted' but emitter produced nothing: ${f.path}`);
    failures++;
    continue;
  }
  if (norm(got) !== norm(ref)) {
    console.error(`✗ DRIFT: emitted output != reference for ${f.path}`);
    const a = norm(got).split('\n');
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

console.log(`\nquest-mr emit: ${emittedCount}/${MR_GOLDEN_MANIFEST.length} emitted file(s) checked vs android-mr`);
if (failures) {
  console.error(`\n❌ ${failures} drift/missing failure(s) — emitter diverged from reference (edit scanner.holo, not the generated Kotlin).`);
  process.exit(1);
}
console.log('✅ emitted MR file(s) byte-match the reference; no drift.');
