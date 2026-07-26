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
 * Usage:
 *   node scripts/lang-audit/shadow-compare-rust-ts.mjs [--json-out <path>] [--limit N] [--require-nonzero-ts]
 *   pnpm exec tsx scripts/lang-audit/shadow-compare-rust-ts.mjs --ts-parser-source [other flags]
 *   node scripts/lang-audit/shadow-compare-rust-ts.mjs --write-corpus-manifest <path>
 *   node scripts/lang-audit/shadow-compare-rust-ts.mjs --corpus-manifest <path> [--json-out <path>]
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkReallyValid } from './assert-really-valid.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.tmp-g4',
  'out',
  '.bench-logs',
  'target',
]);
const CORPUS_MANIFEST_SCHEMA = 'holoscript.lang-audit.hsplus-corpus-manifest.v1';

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
  return files.sort((a, b) => toRelFile(a).localeCompare(toRelFile(b)));
}

// Confirmed live via direct smoke test 2026-07-03: pkg-node loads and runs
// correctly under plain `require()` from Node (no wasm-pack/cargo needed on
// this machine -- the committed binary is a ready-to-run artifact).
const wasmPkgPath = path.join(REPO_ROOT, 'packages/compiler-wasm/pkg-node/holoscript_wasm.js');
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

function toRelFile(absFile) {
  return path.relative(REPO_ROOT, absFile).split(path.sep).join('/');
}

function resolveRepoPath(inputPath) {
  return path.isAbsolute(inputPath)
    ? path.normalize(inputPath)
    : path.resolve(REPO_ROOT, inputPath);
}

function getArgValue(args, flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
}

function normalizeManifestRelFile(file) {
  if (typeof file !== 'string' || file.length === 0) {
    throw new Error('Corpus manifest contains a non-string file entry.');
  }
  const relFile = file.replace(/\\/g, '/');
  if (path.isAbsolute(relFile) || relFile.includes('\0')) {
    throw new Error(`Corpus manifest file must be repo-relative: ${file}`);
  }
  const parts = relFile.split('/');
  if (parts.includes('..') || parts.includes('')) {
    throw new Error(`Corpus manifest file must not escape repo root: ${file}`);
  }
  if (!relFile.startsWith('packages/') || !relFile.endsWith('.hsplus')) {
    throw new Error(`Corpus manifest file is outside the .hsplus corpus: ${file}`);
  }
  return relFile;
}

function corpusHash(relFiles) {
  return crypto.createHash('sha256').update(relFiles.join('\n')).digest('hex');
}

function readCorpusManifest(manifestPath) {
  const absManifestPath = resolveRepoPath(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(absManifestPath, 'utf-8'));
  if (manifest.schema !== CORPUS_MANIFEST_SCHEMA) {
    throw new Error(`Unsupported corpus manifest schema ${JSON.stringify(manifest.schema)}`);
  }
  if (!Array.isArray(manifest.files)) {
    throw new Error('Corpus manifest must contain a files array.');
  }
  const relFiles = manifest.files.map(normalizeManifestRelFile);
  const files = relFiles.map((relFile) => {
    const absFile = path.join(REPO_ROOT, relFile);
    if (!fs.existsSync(absFile)) {
      throw new Error(`Corpus manifest file does not exist: ${relFile}`);
    }
    return absFile;
  });
  const sha256 = corpusHash(relFiles);
  if (manifest.sha256 && manifest.sha256 !== sha256) {
    throw new Error(`Corpus manifest hash mismatch: expected ${manifest.sha256}, got ${sha256}`);
  }
  return {
    absManifestPath,
    relManifestPath: toRelFile(absManifestPath),
    relFiles,
    files,
    sha256,
  };
}

function writeCorpusManifest(manifestPath, files) {
  const absManifestPath = resolveRepoPath(manifestPath);
  const relFiles = files.map(toRelFile);
  const manifest = {
    schema: CORPUS_MANIFEST_SCHEMA,
    corpusRoot: 'packages',
    extension: '.hsplus',
    skipDirs: [...SKIP_DIRS].sort(),
    total: relFiles.length,
    sha256: corpusHash(relFiles),
    files: relFiles,
  };
  fs.mkdirSync(path.dirname(absManifestPath), { recursive: true });
  fs.writeFileSync(absManifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

async function main() {
  const args = process.argv.slice(2);
  const limitRaw = getArgValue(args, '--limit');
  const limit = limitRaw ? parseInt(limitRaw, 10) : Infinity;
  const baselinePath = getArgValue(args, '--baseline');
  const requireNonzeroTs = args.includes('--require-nonzero-ts');
  const useTsParserSource = args.includes('--ts-parser-source');
  const corpusManifestPath = getArgValue(args, '--corpus-manifest');
  const writeCorpusManifestPath = getArgValue(args, '--write-corpus-manifest');

  if (limitRaw && !Number.isFinite(limit)) {
    throw new Error(`Invalid --limit value: ${limitRaw}`);
  }

  let parseWithTsSource;
  if (useTsParserSource) {
    const parserModule = await import(
      pathToFileURL(
        path.join(REPO_ROOT, 'packages', 'core', 'src', 'parser', 'HoloScriptPlusParser.ts')
      ).href
    );
    parseWithTsSource = (source) => new parserModule.HoloScriptPlusParser().parse(source);
  }

  let corpus;
  if (corpusManifestPath) {
    corpus = readCorpusManifest(corpusManifestPath);
    console.log(
      `[shadow-compare] Loaded ${corpus.files.length} .hsplus files from ${corpus.relManifestPath} (${corpus.sha256.slice(0, 12)}).`
    );
  } else {
    console.log('[shadow-compare] Walking packages/ for .hsplus files...');
    const files = collectHsplusFiles();
    const relFiles = files.map(toRelFile);
    corpus = {
      absManifestPath: null,
      relManifestPath: null,
      relFiles,
      files,
      sha256: corpusHash(relFiles),
    };
    console.log(`[shadow-compare] Found ${files.length} .hsplus files.`);
  }

  if (writeCorpusManifestPath) {
    const manifest = writeCorpusManifest(writeCorpusManifestPath, corpus.files);
    console.log(
      `[shadow-compare] Corpus manifest written to ${writeCorpusManifestPath} (${manifest.total} files, ${manifest.sha256.slice(0, 12)}).`
    );
    if (!corpusManifestPath && !args.includes('--json-out')) {
      return;
    }
  }

  const files = corpus.files.slice(0, limit);
  const comparedRelFiles = files.map(toRelFile);
  console.log(
    `[shadow-compare] Comparing ${files.length} .hsplus files (corpus hash ${corpusHash(comparedRelFiles).slice(0, 12)}).`
  );

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

    const tsResult = await checkReallyValid(
      source,
      '.hsplus',
      parseWithTsSource ? { parseContent: parseWithTsSource } : {}
    );
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
      relFile: toRelFile(file),
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
  const agreeBothPass = agree - bothFail;
  const rustPassCount = agreeBothPass + tsFailRustPass;
  const tsPassCount = agreeBothPass + tsPassRustFail;
  console.log('\n=== Shadow-mode TS <-> Rust parser comparison ===');
  console.log(`Total .hsplus files compared: ${total}`);
  console.log(
    `Agree (both pass): ${agreeBothPass} (${((agreeBothPass / total) * 100).toFixed(2)}%)`
  );
  console.log(`Agree (both fail): ${bothFail} (${((bothFail / total) * 100).toFixed(2)}%)`);
  console.log(
    `DISAGREE — TS passes, Rust fails: ${tsPassRustFail} (${((tsPassRustFail / total) * 100).toFixed(2)}%)`
  );
  console.log(
    `DISAGREE — TS fails, Rust passes: ${tsFailRustPass} (${((tsFailRustPass / total) * 100).toFixed(2)}%)`
  );
  console.log(
    `TS pass rate: ${tsPassCount}/${total} (${((tsPassCount / total) * 100).toFixed(2)}%)`
  );
  console.log(
    `Rust pass rate: ${rustPassCount}/${total} (${((rustPassCount / total) * 100).toFixed(2)}%)`
  );
  console.log(`Overall agreement rate: ${((agree / total) * 100).toFixed(2)}%`);
  console.log(`TS newline-verdict drift (G1-style bug): ${tsNewlineDrift}/${total}`);
  console.log(`Rust newline-verdict drift: ${rustNewlineDrift}/${total}`);

  const jsonOutPath = getArgValue(args, '--json-out');
  if (jsonOutPath) {
    fs.writeFileSync(
      jsonOutPath,
      JSON.stringify(
        {
          summary: {
            total,
            tsParserMode: useTsParserSource ? 'source-tsx' : 'package-dist',
            corpus: {
              manifestPath: corpus.relManifestPath,
              sha256: corpusHash(comparedRelFiles),
              sourceFileCount: corpus.files.length,
              comparedFileCount: comparedRelFiles.length,
              limited: files.length !== corpus.files.length,
            },
            agreeBothPass,
            agreeBothFail: bothFail,
            tsPassRustFail,
            tsFailRustPass,
            tsPassCount,
            rustPassCount,
            tsPassRate: tsPassCount / total,
            rustPassRate: rustPassCount / total,
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

  if (requireNonzeroTs && tsPassCount === 0) {
    console.error(
      '\n[shadow-compare] TS BOOTSTRAP GATE FAILED: the live TypeScript parser passed 0 files. ' +
        'Run the comparator through tsx with --ts-parser-source or repair package resolution before trusting parity results.'
    );
    process.exitCode = 1;
    return;
  }

  // Regression gate (Step 0 of the lang-arch B/C sequencing synthesis,
  // 2026-07-02): the meaningful CI invariant is NOT "total disagreement must
  // not increase" -- Rust's .hsplus coverage is a moving target under active
  // improvement, so new ts-fail-rust-pass agreement is expected and good. The
  // invariant that actually matters is "files Rust already parses correctly
  // must keep parsing correctly" -- a file flipping from rustPass:true in the
  // baseline to rustPass:false today is a genuine regression in the parser
  // that would eventually be the sole grammar authority, and should fail CI.
  if (baselinePath) {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
    const baselineByRelFile = new Map(
      (baseline.results || []).map((r) => [r.relFile || toRelFile(r.file), r])
    );
    const regressions = [];
    for (const r of results) {
      const baseRow = baselineByRelFile.get(r.relFile);
      if (baseRow && baseRow.rustPass === true && r.rustPass === false) {
        regressions.push({
          relFile: r.relFile,
          wasPass: true,
          nowError: r.rustFirstError,
        });
      }
    }
    if (regressions.length > 0) {
      console.error(
        `\n[shadow-compare] REGRESSION GATE FAILED: ${regressions.length} file(s) that Rust previously parsed correctly now fail:`
      );
      for (const reg of regressions) {
        console.error(`  - ${reg.relFile}: ${reg.nowError}`);
      }
      process.exitCode = 1;
      return;
    }
    const baselineRustPassCount = [...baselineByRelFile.values()].filter(
      (r) => r.rustPass === true
    ).length;
    console.log(
      `\n[shadow-compare] Regression gate passed vs baseline (0 files regressed out of ${baselineRustPassCount} baseline Rust-pass files; ${baselineByRelFile.size} files compared).`
    );
  }
}

main();
