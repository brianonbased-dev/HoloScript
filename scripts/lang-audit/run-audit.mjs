#!/usr/bin/env node
/**
 * BLAST 1/3 — quantify the real parse-pass rate behind the D.104
 * native-coverage metric (HoloScript/scripts/holo-ci/check-native-coverage.mjs),
 * which counts .hsplus/.holo/.hs files by EXTENSION only, never attempting to
 * parse them. This script walks the IDENTICAL file set (same root, same
 * SKIP_DIRS, same NATIVE_EXT) and actually parses every file with the SAME
 * parser every live tool uses (packages/cli's `validate`/`parse` subcommand
 * logic, mirrored in scripts/lang-audit/parse-one.mjs), reporting the real
 * pass/fail/timeout/newline-invariance breakdown.
 *
 * Two-pass design for safety: files are chunked (CHUNK_SIZE per subprocess)
 * so ~4100 files needs only ~40 subprocess spawns, not 4100 -- but a single
 * hanging file (reproduced in research/2026-07-02_language-parser-integrity-gaps.md)
 * must not silently swallow its whole chunk's results. Pass 1 runs chunks with
 * a generous timeout and JSON-lines streaming (partial output survives a kill).
 * Any file with no result after pass 1 is a hang suspect; pass 2 retries each
 * suspect ALONE with a short timeout, definitively marking true hangs as
 * 'timeout' rather than silently dropping them from the denominator.
 *
 * Usage: node scripts/lang-audit/run-audit.mjs [--json-out <path>]
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WORKER_PATH = path.join(__dirname, 'chunk-worker.mjs');

// Identical to check-native-coverage.mjs's walk() -- same file set, so the
// inflation comparison is apples-to-apples.
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
const NATIVE_EXT = new Set(['.hsplus', '.holo', '.hs']);

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
    } else if (entry.isFile()) {
      onFile(path.join(dir, entry.name));
    }
  }
}

function collectNativeFiles() {
  const files = [];
  walk(path.join(REPO_ROOT, 'packages'), (abs) => {
    if (NATIVE_EXT.has(path.extname(abs))) files.push(abs);
  });
  return files;
}

const CHUNK_SIZE = 80;
const CHUNK_TIMEOUT_MS = 90_000;
const SINGLE_TIMEOUT_MS = 10_000;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function runChunk(files, timeoutMs) {
  const tmpFile = path.join(
    os.tmpdir(),
    `lang-audit-chunk-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  fs.writeFileSync(tmpFile, JSON.stringify(files));
  try {
    const res = spawnSync(process.execPath, [WORKER_PATH, tmpFile], {
      cwd: REPO_ROOT,
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
      encoding: 'utf-8',
    });
    const lines = (res.stdout || '').split('\n').filter(Boolean);
    const results = [];
    for (const line of lines) {
      try {
        results.push(JSON.parse(line));
      } catch {
        // partial/truncated last line from a kill mid-write -- skip it, the
        // file it belongs to will show up as missing and get retried in pass 2.
      }
    }
    return { results, timedOut: Boolean(res.signal) || res.error?.code === 'ETIMEDOUT' };
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

function main() {
  console.log('[lang-audit] Walking packages/ for native-extension files...');
  const files = collectNativeFiles();
  console.log(
    `[lang-audit] Found ${files.length} files (.hsplus/.holo/.hs) -- identical file set to check-native-coverage.mjs.`
  );

  const byPath = new Map();
  const chunks = chunk(files, CHUNK_SIZE);
  console.log(
    `[lang-audit] Pass 1: ${chunks.length} chunks of up to ${CHUNK_SIZE} files, ${CHUNK_TIMEOUT_MS}ms timeout each.`
  );

  for (let i = 0; i < chunks.length; i++) {
    const { results, timedOut } = runChunk(chunks[i], CHUNK_TIMEOUT_MS);
    for (const r of results) byPath.set(r.file, r);
    process.stdout.write(
      `\r[lang-audit] Pass 1: chunk ${i + 1}/${chunks.length} (${byPath.size}/${files.length} files resolved)${timedOut ? ' [chunk timed out]' : ''}   `
    );
  }
  console.log('');

  const missing = files.filter((f) => !byPath.has(f));
  console.log(
    `[lang-audit] Pass 2: ${missing.length} file(s) had no result after pass 1 -- isolating individually (${SINGLE_TIMEOUT_MS}ms each).`
  );
  for (const f of missing) {
    const { results, timedOut } = runChunk([f], SINGLE_TIMEOUT_MS);
    if (results.length === 1) {
      byPath.set(f, results[0]);
    } else {
      byPath.set(f, {
        file: f,
        ext: path.extname(f),
        outcome: 'timeout',
        errorCount: null,
        timedOut,
      });
    }
  }

  const all = files.map((f) => byPath.get(f));
  const summary = {
    totalFiles: all.length,
    byExt: {},
    overall: { pass: 0, fail: 0, timeout: 0, exception: 0, 'read-error': 0 },
    newlineNonInvariant: [],
    nodeCountNonFidelity: [],
    guardErrorCounts: {},
  };
  for (const r of all) {
    summary.byExt[r.ext] ??= { pass: 0, fail: 0, timeout: 0, exception: 0, 'read-error': 0 };
    const bucket = r.outcome in summary.overall ? r.outcome : 'exception';
    summary.overall[bucket]++;
    summary.byExt[r.ext][bucket]++;
    if (r.newlineInvariant === false) summary.newlineNonInvariant.push(r.file);
    if (r.nodeCountFidelity === false) summary.nodeCountNonFidelity.push(r.file);
    for (const code of r.guardErrors ?? []) {
      summary.guardErrorCounts[code] = (summary.guardErrorCounts[code] ?? 0) + 1;
    }
  }

  const realPassRate = summary.overall.pass / summary.totalFiles;
  console.log('\n=== BLAST 1/3 parse-audit results ===');
  console.log(
    `Total native-extension files (packages/ only, same set as D.104 metric): ${summary.totalFiles}`
  );
  for (const ext of ['.hsplus', '.holo', '.hs']) {
    const b = summary.byExt[ext] || {};
    console.log(
      `  ${ext}: pass=${b.pass ?? 0} fail=${b.fail ?? 0} timeout=${b.timeout ?? 0} exception=${b.exception ?? 0} read-error=${b['read-error'] ?? 0}`
    );
  }
  console.log(
    `Overall: pass=${summary.overall.pass} fail=${summary.overall.fail} timeout=${summary.overall.timeout} exception=${summary.overall.exception}`
  );
  console.log(
    `REAL parse-pass rate: ${(realPassRate * 100).toFixed(2)}% (vs the extension-only D.104 metric's 87.48%, which assumes 100%)`
  );
  console.log(
    `Files that flip verdict on trailing-newline presence alone (G1 EOF-DEDENT bug): ${summary.newlineNonInvariant.length}`
  );
  console.log(
    `Files whose AST loses source-declared semantic nodes (G3 fidelity bug): ${summary.nodeCountNonFidelity.length}`
  );
  console.log(`Guard rejection codes: ${JSON.stringify(summary.guardErrorCounts)}`);

  const argIdx = process.argv.indexOf('--json-out');
  const jsonOutPath = argIdx >= 0 ? process.argv[argIdx + 1] : null;
  if (jsonOutPath) {
    fs.writeFileSync(jsonOutPath, JSON.stringify({ summary, all }, null, 2));
    console.log(`\n[lang-audit] Full per-file results written to ${jsonOutPath}`);
  }
}

main();
