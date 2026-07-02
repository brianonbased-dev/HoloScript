#!/usr/bin/env node
/**
 * audit-native-parseability.mjs — BLAST 1/3 (board task_1783034628547_5ozt).
 *
 * check-native-coverage.mjs (the D.104 gate) counts .hsplus/.holo/.hs files by
 * EXTENSION only — it never parses them. This script quantifies the real gap:
 * of the files that D.104 counts as "native", how many actually parse clean?
 *
 * Root cause (research/2026-07-02_language-parser-integrity-gaps.md, G1-G5):
 * the .hs/.hsplus grammar (Rust+WASM, packages/compiler-wasm/src/) silently
 * corrupts ASTs, lies about success, and disagrees with its own docs. .holo
 * (a separate TS parser, packages/core/src/parser/HoloCompositionParser.ts)
 * is a different, largely-healthy code path.
 *
 * Each extension is parsed with its OWN canonical parser:
 *   .hsplus / .hs -> packages/compiler-wasm/pkg-node (Rust/WASM, parse())
 *   .holo         -> @holoscript/core HoloCompositionParser
 *
 * IMPORTANT — known staleness caveat (found while building this script,
 * 2026-07-02): the committed pkg-node/holoscript_wasm_bg.wasm predates commit
 * de8983409 "fix(compiler-wasm): detect unclosed braces at EOF in
 * consume_braced_body_raw" (WASM built 2026-06-22T23:55Z; that fix landed
 * 2026-06-24). No cargo/wasm-pack toolchain is available on this machine to
 * rebuild it, so this script is measuring the WASM binary CLI tools actually
 * ship with today, not a freshly-rebuilt one. If cargo/wasm-pack are
 * available in your environment, `pnpm --filter @holoscript/wasm build:nodejs`
 * before running this for the most current numbers, and note the WASM's
 * `version()` + git rev in the report either way.
 *
 * Usage:
 *   node scripts/holo-ci/audit-native-parseability.mjs           # human-readable
 *   node scripts/holo-ci/audit-native-parseability.mjs --json    # machine-readable
 *   node scripts/holo-ci/audit-native-parseability.mjs --samples 10  # more sample errors per bucket
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCAN_ROOT = path.join(REPO_ROOT, 'packages'); // matches check-native-coverage.mjs scope

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
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), onFile);
    } else if (entry.isFile()) {
      onFile(path.join(dir, entry.name));
    }
  }
}

function bucket() {
  return { pass: 0, fail: 0, threw: 0, sampleErrors: [] };
}

function recordFail(b, file, detail, maxSamples) {
  b.fail++;
  if (b.sampleErrors.length < maxSamples) {
    b.sampleErrors.push({ file: path.relative(REPO_ROOT, file), detail });
  }
}

function recordThrow(b, file, detail, maxSamples) {
  b.threw++;
  if (b.sampleErrors.length < maxSamples) {
    b.sampleErrors.push({ file: path.relative(REPO_ROOT, file), detail: `THREW: ${detail}` });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const samplesIdx = args.indexOf('--samples');
  const maxSamples = samplesIdx >= 0 ? Number(args[samplesIdx + 1]) || 5 : 5;

  const results = { '.hsplus': bucket(), '.hs': bucket(), '.holo': bucket() };
  const files = { '.hsplus': [], '.hs': [], '.holo': [] };

  walk(SCAN_ROOT, (abs) => {
    const ext = path.extname(abs);
    if (ext in files) files[ext].push(abs);
  });

  // --- .hsplus / .hs via compiler-wasm (Rust/WASM) ---
  const wasmPkgPath = path.join(REPO_ROOT, 'packages', 'compiler-wasm', 'pkg-node', 'holoscript_wasm.js');
  let wasm = null;
  let wasmVersion = null;
  let wasmError = null;
  try {
    wasm = require(wasmPkgPath);
    wasmVersion = wasm.version();
  } catch (err) {
    wasmError = String(err);
  }

  if (wasm) {
    for (const ext of ['.hsplus', '.hs']) {
      const b = results[ext];
      for (const abs of files[ext]) {
        let src;
        try {
          src = fs.readFileSync(abs, 'utf8');
        } catch (err) {
          recordThrow(b, abs, String(err), maxSamples);
          continue;
        }
        let out;
        try {
          out = wasm.parse(src);
        } catch (err) {
          recordThrow(b, abs, String(err).slice(0, 200), maxSamples);
          continue;
        }
        let parsed;
        try {
          parsed = JSON.parse(out);
        } catch {
          parsed = null;
        }
        const hasErrors = parsed && Array.isArray(parsed.errors) && parsed.errors.length > 0;
        const isErrorObj = parsed && typeof parsed.error === 'string';
        if (hasErrors || isErrorObj) {
          recordFail(b, abs, JSON.stringify(parsed).slice(0, 200), maxSamples);
        } else {
          b.pass++;
        }
      }
    }
  } else {
    results['.hsplus'].skipped = true;
    results['.hs'].skipped = true;
  }

  // --- .holo via @holoscript/core HoloCompositionParser ---
  let coreError = null;
  try {
    const core = await import('@holoscript/core');
    const { HoloCompositionParser } = core;
    const parser = new HoloCompositionParser();
    const b = results['.holo'];
    for (const abs of files['.holo']) {
      let src;
      try {
        src = fs.readFileSync(abs, 'utf8');
      } catch (err) {
        recordThrow(b, abs, String(err), maxSamples);
        continue;
      }
      let result;
      try {
        result = parser.parse(src);
      } catch (err) {
        recordThrow(b, abs, String(err).slice(0, 200), maxSamples);
        continue;
      }
      if (result && result.success) {
        b.pass++;
      } else {
        const errs = (result && result.errors) || [];
        recordFail(b, abs, JSON.stringify(errs.slice(0, 2)).slice(0, 250), maxSamples);
      }
    }
  } catch (err) {
    coreError = String(err);
    results['.holo'].skipped = true;
  }

  const totalCounted = Object.values(files).reduce((s, arr) => s + arr.length, 0);
  const totalPass = Object.values(results).reduce((s, b) => s + (b.pass || 0), 0);
  const totalFail = Object.values(results).reduce((s, b) => s + (b.fail || 0) + (b.threw || 0), 0);
  const parseablePct = totalCounted === 0 ? 0 : (totalPass / totalCounted) * 100;

  const report = {
    generatedAtIso: new Date().toISOString(),
    scanRoot: path.relative(REPO_ROOT, SCAN_ROOT),
    wasm: { version: wasmVersion, loadError: wasmError },
    coreParserLoadError: coreError,
    counts: {
      '.hsplus': { extensionTotal: files['.hsplus'].length, ...results['.hsplus'] },
      '.hs': { extensionTotal: files['.hs'].length, ...results['.hs'] },
      '.holo': { extensionTotal: files['.holo'].length, ...results['.holo'] },
    },
    summary: {
      totalCountedByD104: totalCounted,
      totalActuallyParseable: totalPass,
      totalFailingOrThrowing: totalFail,
      realParseablePct: Number(parseablePct.toFixed(2)),
    },
    caveat:
      'compiler-wasm pkg-node binary may be stale relative to packages/compiler-wasm/src/*.rs ' +
      '(no cargo/wasm-pack toolchain available to rebuild on this machine at audit time) — ' +
      'see header comment. Rebuild with `pnpm --filter @holoscript/wasm build:nodejs` for current numbers.',
  };

  if (asJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  console.log(`native-parseability audit (BLAST 1/3) — ${report.generatedAtIso}`);
  console.log(`wasm version: ${wasmVersion ?? '(failed to load: ' + wasmError + ')'}`);
  console.log('');
  for (const ext of ['.hsplus', '.hs', '.holo']) {
    const c = report.counts[ext];
    if (c.skipped) {
      console.log(`${ext}: SKIPPED (parser unavailable)`);
      continue;
    }
    const total = c.extensionTotal;
    const pct = total === 0 ? 0 : ((c.pass / total) * 100).toFixed(2);
    console.log(`${ext}: ${c.pass}/${total} parse clean (${pct}%) — fail=${c.fail} threw=${c.threw}`);
    for (const s of c.sampleErrors) {
      console.log(`    ${s.file}: ${s.detail}`);
    }
  }
  console.log('');
  console.log(
    `D.104 counts ${report.summary.totalCountedByD104} files as "native" by extension. ` +
      `Only ${report.summary.totalActuallyParseable} (${report.summary.realParseablePct}%) actually parse clean.`
  );
  console.log(`\nCAVEAT: ${report.caveat}`);
}

main();
