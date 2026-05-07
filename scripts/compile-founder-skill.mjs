#!/usr/bin/env node
/**
 * compile-founder-skill.mjs — Phase 2(a) Iteration 1 self-host PROOF.
 *
 * Reads compositions/founder-core.hs, parses it via @holoscript/core,
 * runs ContextCompiler with compile_to_skill_md, writes the emitted
 * SKILL.md to dist/founder-skill-emitted.md for diff inspection
 * against the live ~/.claude/skills/founder/SKILL.md.
 *
 * This is a PROOF, not a cutover. The live skill file is NOT touched.
 * Iteration 2 (separate task) is the cutover after vocabulary v2 closes
 * the gaps surfaced in the iteration-1 status memo.
 *
 * Usage:
 *   node scripts/compile-founder-skill.mjs
 *
 * Exit codes:
 *   0 — round-trip succeeded; emitted file written
 *   1 — parse error in .hs source
 *   2 — ContextCompiler validation error (likely vocabulary mismatch)
 *   3 — emit error (no SKILL.md key in result.files)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Import via relative dist paths so the script runs from repo root
// without needing workspace package resolution.
import { parseHolo } from '../packages/core/dist/parser.js';
import { ContextCompiler } from '../packages/core/dist/compiler/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, '..');
const SOURCE_HS = resolve(REPO_ROOT, 'compositions/founder-core.hs');
const OUTPUT_MD = resolve(REPO_ROOT, 'dist/founder-skill-emitted.md');

function log(msg) {
  // The script intentionally writes through stderr so stdout stays clean
  // for any piped output. Matches the convention in scripts/safe-commit.sh.
  process.stderr.write(`[compile-founder-skill] ${msg}\n`);
}

function main() {
  log(`source:  ${SOURCE_HS}`);
  log(`output:  ${OUTPUT_MD}`);

  const source = readFileSync(SOURCE_HS, 'utf8');
  const parseResult = parseHolo(source);

  if (parseResult.errors && parseResult.errors.length > 0) {
    log('PARSE ERRORS:');
    for (const err of parseResult.errors) {
      log(`  - ${err.message ?? JSON.stringify(err)}`);
    }
    process.exit(1);
  }

  // parseHolo returns { success, ast, errors, warnings } where `ast` is the
  // HoloComposition the compiler expects.
  const composition = parseResult.ast;
  if (!composition) {
    log('PARSE OK but no AST returned');
    process.exit(1);
  }
  const totalTraits = (composition.objects ?? []).reduce(
    (n, o) => n + (o.traits?.length ?? 0),
    composition.traits?.length ?? 0
  );
  log(`parsed:  ${composition.objects?.length ?? 0} objects, ${totalTraits} traits`);

  const compiler = new ContextCompiler({ formats: ['skill_md'] });

  let result;
  try {
    result = compiler.compile(composition, '');
  } catch (err) {
    log(`COMPILER ERROR: ${err.message}`);
    process.exit(2);
  }

  const emitted = result.files['SKILL.md'];
  if (!emitted) {
    log('No SKILL.md emitted - emit dispatch failed silently');
    process.exit(3);
  }

  if (result.diagnostics && result.diagnostics.length > 0) {
    log(`DIAGNOSTICS (${result.diagnostics.length}):`);
    for (const d of result.diagnostics) {
      log(`  [${d.severity}] ${d.rule}: ${d.message}`);
    }
  }

  mkdirSync(dirname(OUTPUT_MD), { recursive: true });
  writeFileSync(OUTPUT_MD, emitted, 'utf8');

  log(`emitted: ${emitted.length} chars to ${OUTPUT_MD}`);
  log('Round-trip proof complete. Diff against live skill:');
  log(`  diff -u ~/.claude/skills/founder/SKILL.md ${OUTPUT_MD}`);
}

main();
