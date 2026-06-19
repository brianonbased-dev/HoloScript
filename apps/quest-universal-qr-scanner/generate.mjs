#!/usr/bin/env node
// generate.mjs — CLI wrapper over the Quest emitter (quest-emit.mjs).
// Writes every currently-EMITTED file in place. Run after editing scanner.holo.
//
//   node generate.mjs
//
// What is emitted vs still hand-authored is defined by GOLDEN_MANIFEST in quest-emit.mjs.
// The golden-diff gate (scripts/holo-ci/check-quest-emit-matches-reference.mjs) enforces that
// emitted output never drifts from the committed reference app.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitQuestFiles } from './quest-emit.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const files = emitQuestFiles(join(here, 'scanner.holo'));

for (const [rel, content] of Object.entries(files)) {
  const out = join(here, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, content);
  console.log('emitted', rel);
}
console.log(`done — ${Object.keys(files).length} file(s) emitted from scanner.holo`);
