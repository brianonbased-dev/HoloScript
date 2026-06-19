#!/usr/bin/env node
// check-quest-emit-matches-reference.mjs — golden-output diff gate for compile_to_quest.
//
// Runs the Quest emitter and FAILS on any drift between an EMITTED file and the committed
// reference app (apps/quest-universal-qr-scanner). This is the pre-mortem keystone: it makes
// "the emitter silently diverged from the maintained reference" (the dangerous failure mode)
// impossible to miss. As files flip 'reference' → 'emitted' in quest-emit.mjs, this gate's
// coverage grows automatically. Line endings are normalised (CRLF→LF) so git checkout config
// doesn't cause false drift; everything else must byte-match.
//
//   node scripts/holo-ci/check-quest-emit-matches-reference.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GOLDEN_MANIFEST,
  emitQuestFiles,
} from '../../apps/quest-universal-qr-scanner/quest-emit.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const appDir = join(repoRoot, 'apps', 'quest-universal-qr-scanner');
const specPath = join(appDir, 'scanner.holo');

const norm = (s) => s.replace(/\r\n/g, '\n');

const emitted = emitQuestFiles(specPath);
let failures = 0;
let emittedCount = 0;
let referenceCount = 0;

for (const f of GOLDEN_MANIFEST) {
  let refContent;
  try {
    refContent = readFileSync(join(appDir, f.path), 'utf8');
  } catch {
    console.error(`✗ MISSING reference file: ${f.path}`);
    failures++;
    continue;
  }

  if (f.status === 'emitted') {
    emittedCount++;
    const got = emitted[f.path];
    if (got == null) {
      console.error(`✗ declared 'emitted' but emitter produced nothing: ${f.path}`);
      failures++;
      continue;
    }
    if (norm(got) !== norm(refContent)) {
      console.error(`✗ DRIFT: emitted output != reference for ${f.path}`);
      const a = norm(got).split('\n');
      const b = norm(refContent).split('\n');
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
  } else {
    referenceCount++;
  }
}

console.log(
  `\nquest emit coverage: ${emittedCount}/${GOLDEN_MANIFEST.length} emitted, ` +
    `${referenceCount} hand-authored (golden, awaiting emit)`
);

if (failures) {
  console.error(`\n❌ ${failures} drift/missing failure(s) — emitter diverged from reference.`);
  process.exit(1);
}
console.log('✅ all emitted files byte-match the reference app; no drift.');
