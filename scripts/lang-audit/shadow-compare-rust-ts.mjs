#!/usr/bin/env node
/**
 * Shadow-mode TS <-> Rust parser comparator (lang-arch, task_1783050218646_4bdm).
 *
 * Runs the SAME .hsplus corpus through both the live TS parser
 * (HoloScriptPlusParser, via checkReallyValid's default parseWithLiveToolParser)
 * and the current Rust/WASM parser (packages/compiler-wasm/pkg-node, built and
 * committed by the parallel Jetson lane, R.023 -- verified same-commit/same-
 * timestamp as the latest compiler-wasm/src Rust source, so this compares
 * against genuinely current Rust output, not stale binary).
 *
 * SHADOW MODE ONLY: this never changes which parser's result is served to any
 * caller. It exists purely to produce real agreement/disagreement data so an
 * eventual Phase 2 cutover decision (collapse to Rust as sole grammar
 * authority) is made from evidence, not from the extension-count-only D.104
 * metric or an assumed parity that hasn't been measured.
 *
 * Reuses scripts/lang-audit/assert-really-valid.mjs's checkReallyValid() guard
 * (BLAST 2/3 hardening: real-errors-not-lying-success-flag, newline-invariance)
 * via its pluggable `parseContent` option -- the SAME hardened analysis, just
 * pointed at a different parser backend. AST-node-count-fidelity is NOT
 * compared across parsers (the two parsers produce structurally different
 * ASTs; that check is TS-AST-shape-specific per assert-really-valid.mjs's
 * keyword/type tables and would not be a meaningful cross-parser signal) --
 * only pass/fail agreement and each parser's own newline-invariance are
 * compared.
 *
 * Usage: node scripts/lang-audit/shadow-compare-rust-ts.mjs [--json-out <path>] [--limit N]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkReallyValid } from './assert-really-valid.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo',
  '.tmp-g4', 'out', '.bench-logs', 'target',
]);

function walk(dir, onFile) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.') {
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    }
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), onFile);
    } else if (entry.isFile() && entry.name.endsWith('.hsplus')) {
      onFile(path.join(dir, entry.name));
    }
  }
}

function collectHsplusFiles() {
  const files = [];
  walk(path.join(REPO_ROOT, 'packages'), (abs) => files.push(abs));
  return files;
}

// Confirmed live via direct smoke test 2026-07-03: pkg-node loads and runs
// correctly under plain `require()` from Node (no wasm-pack/cargo needed on
// this machine -- the committed binary is a ready-to-run artifact).
const wasmPkgPath = path.join(
  REPO_ROOT,
  'packages/compiler-wasm/pkg-node/holoscript_wasm.js'
);
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const rustWasm = require(wasmPkgPath);

/**
 * Adapter matching checkReallyValid's expected parse-result shape
 * ({success, errors, ast}) so the SAME hardened guard (newline-invariance
 * etc.) runs against Rust's output. Rust's validate_detailed() returns
 * {valid, errors} with no AST -- ast stays null, which is fine since
 * node-count-fidelity is intentionally not part of the cross-parser
 * comparison (see header).
 */
function parseWithRustWasm(source, _format) {
  const raw = rustWasm.validate_detailed(source);
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return {
    success: Boolean(parsed.valid),
    errors: Array.isArray(parsed.errors) ? parsed.errors : [],
    ast: null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

  console.log('[shadow-compare] Walking packages/ for .hsplus files...');
  const files = collectHsplusFiles().slice(0, limit);
  console.log(`[shadow-compare] Found ${files.length} .hsplus files.`);

  const results = [];
  let agree = 0;
  let tsPassRustFail = 0;
  let tsFailRustPass = 0;
  let bothFail = 0;
  let rustNewlineDrift = 0;
  let tsNewlineDrift = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const source = fs.readFileSync(file, 'utf-8');

    const tsResult = await checkReallyValid(source, '.hsplus');
    const rustResult = await checkReallyValid(source, '.hsplus', {
      parseContent: parseWithRustWasm,
    });

    const tsPass = tsResult.primary.errorCount === 0;
    const rustPass = rustResult.primary.errorCount === 0;

    if (!tsResult.newlineInvariant) tsNewlineDrift++;
    if (!rustResult.newlineInvariant) rustNewlineDrift++;

    let bucket;
    if (tsPass && rustPass) {
      agree++;
      bucket = 'agree-pass';
    } else if (!tsPass && !rustPass) {
      agree++;
      bothFail++;
      bucket = 'agree-fail';
    } else if (tsPass && !rustPass) {
      tsPassRustFail++;
      bucket = 'ts-pass-rust-fail';
    } else {
      tsFailRustPass++;
      bucket = 'ts-fail-rust-pass';
    }

    results.push({
      file,
      bucket,
      tsPass,
      rustPass,
      tsErrorCount: tsResult.primary.errorCount,
      rustErrorCount: rustResult.primary.errorCount,
      tsNewlineInvariant: tsResult.newlineInvariant,
      rustNewlineInvariant: rustResult.newlineInvariant,
      rustFirstError: rustResult.primary.errors[0]?.message,
      tsFirstError: tsResult.primary.errors[0]?.message,
    });

    if ((i + 1) % 100 === 0 || i === files.length - 1) {
      process.stdout.write(
        `\r[shadow-compare] ${i + 1}/${files.length} compared (agree=${agree}, ts-pass-rust-fail=${tsPassRustFail}, ts-fail-rust-pass=${tsFailRustPass})   `
      );
    }
  }
  console.log('');

  const total = results.length;
  console.log('\n=== Shadow-mode TS <-> Rust parser comparison ===');
  console.log(`Total .hsplus files compared: ${total}`);
  console.log(`Agree (both pass): ${agree - bothFail} (${((agree - bothFail) / total * 100).toFixed(2)}%)`);
  console.log(`Agree (both fail): ${bothFail} (${(bothFail / total * 100).toFixed(2)}%)`);
  console.log(`DISAGREE — TS passes, Rust fails: ${tsPassRustFail} (${(tsPassRustFail / total * 100).toFixed(2)}%)`);
  console.log(`DISAGREE — TS fails, Rust passes: ${tsFailRustPass} (${(tsFailRustPass / total * 100).toFixed(2)}%)`);
  console.log(`Overall agreement rate: ${(agree / total * 100).toFixed(2)}%`);
  console.log(`TS newline-verdict drift (G1-style bug): ${tsNewlineDrift}/${total}`);
  console.log(`Rust newline-verdict drift: ${rustNewlineDrift}/${total}`);

  const argIdx = args.indexOf('--json-out');
  const jsonOutPath = argIdx >= 0 ? args[argIdx + 1] : null;
  if (jsonOutPath) {
    fs.writeFileSync(
      jsonOutPath,
      JSON.stringify(
        {
          summary: {
            total,
            agreeBothPass: agree - bothFail,
            agreeBothFail: bothFail,
            tsPassRustFail,
            tsFailRustPass,
            overallAgreementRate: agree / total,
            tsNewlineDrift,
            rustNewlineDrift,
          },
          results,
        },
        null,
        2
      )
    );
    console.log(`\n[shadow-compare] Full per-file results written to ${jsonOutPath}`);
  }
}

main();
