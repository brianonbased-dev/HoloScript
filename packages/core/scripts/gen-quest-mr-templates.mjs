#!/usr/bin/env node
// Generates quest-mr-templates.generated.ts from the readable .kt.tmpl files so the Quest MR emit
// bundles cleanly (no runtime file reads, no __dirname/ESM-CJS issues, no manual escaping). The
// .kt.tmpl files stay human-readable Kotlin with {{TOKEN}} markers; this inlines them as TS string
// constants. Runs before tsup in the core build. Re-run after editing any quest-mr-template.
//
// It ALSO compiles the .hs imperative logic in quest-mr-logic/*.logic.hs to Kotlin via the canonical
// Rust/WASM grammar (@holoscript/wasm `compile_to_kotlin`) and inlines the result as the
// QUEST_MR_COMPILED_LOGIC map. That is what makes WorldPortal's recognition/naming logic
// .hs-authored-and-compiled rather than hand-written Kotlin (D.101 language work; F.014 single
// canonical parser; W.815 — only the Rust/WASM grammar parses .hs logic bodies). The
// quest-mr-emit.ts emitter injects the compiled logic into WorldPortal.kt.tmpl's
// {{WORLDPORTAL_LOGIC}} marker. Re-run after editing any .logic.hs.
//
// --check writes nothing: it says whether the committed file is what the current inputs produce,
// and names the stale entries. The Quest golden-diff compares the emitter's output with the
// reference app using the COMMITTED compiled logic, so a change to the Kotlin bridge (the checker
// build in packages/compiler-wasm/pkg-node) or to a .logic.hs is invisible to it until this file
// is regenerated; the pre-commit Quest gate runs --check for that reason. Every path is read
// relative to this file, so the gate can run a copy of it inside a checkout of the staged files.
//
// Exit codes are set, never forced: main() returns one and the process ends on its own. On
// Windows with Node 24.15, process.exit() right after the wasm has run intermittently ended the
// process with status 127 (a libuv assertion) AFTER it had printed "is current" (claude3's review
// of #469: 30 of 30 with process.exit(0) in a bare repro, 0 of 30 with process.exitCode), and the
// pre-commit gate then refused a clean tree.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const tmplDir = join(here, '..', 'src', 'compiler', 'quest-mr-templates');
const logicDir = join(here, '..', 'src', 'compiler', 'quest-mr-logic');
const outFile = join(here, '..', 'src', 'compiler', 'quest-mr-templates.generated.ts');
const lifecycleFile = join(
  here,
  '..',
  '..',
  '..',
  'apps',
  'quest-universal-qr-scanner',
  'scanner-lifecycle.hsplus'
);

function main() {
  // ── Templates: inline each .kt.tmpl as a TS string constant ────────────────────────────────
  const files = readdirSync(tmplDir)
    .filter((f) => f.endsWith('.kt.tmpl'))
    .sort();
  const templateLines = files.map((f) => [
    `template ${f}`,
    `  ${JSON.stringify(f)}: ${JSON.stringify(readFileSync(join(tmplDir, f), 'utf8'))},`,
  ]);
  const entries = templateLines.map(([, line]) => line).join('\n');

  // ── Compiled logic: .hs → Kotlin via the canonical Rust/WASM grammar ───────────────────────
  // Load the built nodejs WASM artifact. If pkg-node is missing/stale, fail loud with the rebuild
  // command — silently shipping un-compiled logic would defeat the whole native-authoring point.
  const require = createRequire(import.meta.url);
  const wasmPath = join(here, '..', '..', 'compiler-wasm', 'pkg-node', 'holoscript_wasm.js');
  let wasm;
  try {
    wasm = require(wasmPath);
    if (typeof wasm.compile_to_kotlin !== 'function') {
      throw new Error('compile_to_kotlin export missing from built WASM');
    }
  } catch (err) {
    console.error(
      `gen-quest-mr-templates: cannot load @holoscript/wasm compile_to_kotlin from ${wasmPath}\n` +
        `  ${err.message}\n` +
        `  Build it first:  (cd packages/compiler-wasm && wasm-pack build --target nodejs --out-dir pkg-node)`
    );
    return 1;
  }

  let logicFiles = [];
  try {
    logicFiles = readdirSync(logicDir)
      .filter((f) => f.endsWith('.logic.hs'))
      .sort();
  } catch {
    logicFiles = []; // no logic dir yet — emit an empty map
  }

  const logicLines = [];
  for (const f of logicFiles) {
    const src = readFileSync(join(logicDir, f), 'utf8');
    const kotlin = wasm.compile_to_kotlin(src, '  ');
    // compile_to_kotlin returns {"error": "..."} JSON on parse/emit failure (same convention as
    // parse()). Detect it and fail the build — a broken .hs must not ship as a broken constant.
    if (kotlin.trimStart().startsWith('{') && kotlin.includes('"error"')) {
      console.error(`gen-quest-mr-templates: compile_to_kotlin failed for ${f}: ${kotlin}`);
      return 1;
    }
    // Key the compiled logic by the logic base name (e.g. "WorldPortal").
    const key = basename(f, '.logic.hs');
    logicLines.push([
      `compiled logic ${key} (quest-mr-logic/${f} through the checker build in packages/compiler-wasm/pkg-node)`,
      `  ${JSON.stringify(key)}: ${JSON.stringify(kotlin)},`,
    ]);
  }
  const logicEntries = logicLines.map(([, line]) => line).join('\n');

  // HoloQR lifecycle: preserve the authored .hsplus source in the compiler bundle. quest-mr-emit
  // lowers this exact source through the canonical HSPlus parser -> HSI-IR -> Kotlin adapter at
  // compile time. Missing source is a hard release failure; a Kotlin fallback would bypass HSI-IR.
  let lifecycleSource;
  try {
    lifecycleSource = readFileSync(lifecycleFile, 'utf8');
  } catch (err) {
    console.error(
      `gen-quest-mr-templates: missing HoloQR lifecycle source ${lifecycleFile}\n  ${err.message}`
    );
    return 1;
  }

  const out = `// @generated by scripts/gen-quest-mr-templates.mjs
//   - QUEST_MR_TEMPLATES: from src/compiler/quest-mr-templates/*.kt.tmpl
//   - QUEST_MR_COMPILED_LOGIC: .hs in src/compiler/quest-mr-logic/*.logic.hs compiled to Kotlin
//     via the canonical Rust/WASM grammar (@holoscript/wasm compile_to_kotlin)
// DO NOT EDIT. Edit the .kt.tmpl / .logic.hs sources and re-run:
//   node scripts/gen-quest-mr-templates.mjs
/* eslint-disable */
export const QUEST_MR_TEMPLATES: Record<string, string> = {
${entries}
};

/** Kotlin function bodies compiled from quest-mr-logic/*.logic.hs, keyed by logic base name. */
export const QUEST_MR_COMPILED_LOGIC: Record<string, string> = {
${logicEntries}
};

/** Authored .hsplus sources lowered through HSI-IR by quest-mr-emit at compile time. */
export const QUEST_MR_HSPLUS_SOURCES: Record<string, string> = {
  "ScannerLifecycle": ${JSON.stringify(lifecycleSource)},
};
`;
  if (process.argv.includes('--check')) {
    let committed = '';
    try {
      committed = readFileSync(outFile, 'utf8');
    } catch {
      // A missing file is stale like any other.
    }
    if (committed === out) {
      console.log(
        `gen-quest-mr-templates --check: ${basename(outFile)} is current (${files.length} template(s), ${logicFiles.length} compiled-logic block(s), 1 HSI lifecycle source)`
      );
      return 0;
    }
    const stale = [
      ...templateLines,
      ...logicLines,
      [
        'HSI lifecycle source (apps/quest-universal-qr-scanner/scanner-lifecycle.hsplus)',
        JSON.stringify(lifecycleSource),
      ],
    ]
      .filter(([, line]) => !committed.includes(line))
      .map(([name]) => name);
    console.error(
      `gen-quest-mr-templates --check: ${basename(outFile)} is not what the current inputs produce.\n` +
        `  Stale: ${stale.length ? stale.join('; ') : 'the file around the entries (header or entry list)'}\n` +
        `  Fix: node packages/core/scripts/gen-quest-mr-templates.mjs, commit the file, then run\n` +
        `  npx tsx scripts/holo-ci/check-quest-mr-emit-matches-reference.mts (the reference app may need\n` +
        `  npx tsx apps/quest-universal-qr-scanner/generate-native.mts).`
    );
    return 1;
  }
  writeFileSync(outFile, out);
  console.log(
    `gen-quest-mr-templates: wrote ${files.length} template(s) + ${logicFiles.length} compiled-logic block(s) + 1 HSI lifecycle source -> ${outFile}`
  );
  return 0;
}

process.exitCode = main();
