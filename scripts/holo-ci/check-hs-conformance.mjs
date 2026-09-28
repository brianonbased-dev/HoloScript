#!/usr/bin/env node
/**
 * check-hs-conformance.mjs — the Rust checker is the .hs reader.
 *
 * Spec v0.1 says a `.hs` file is valid when `validate_detailed` says so.
 * This gate runs that checker (the native `validate_hs` example, which calls
 * `validate_detailed`) on every `.hs` file in:
 *
 *   examples/native/
 *   distributions/systems/conformance/
 *
 * A rejection fails the gate. The allow-list below is the only exception.
 *
 *   node scripts/holo-ci/check-hs-conformance.mjs
 *   pnpm check:hs-conformance
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const ROOTS = ['examples/native', 'distributions/systems/conformance'];

// Rejections that stay open on purpose. Nothing else belongs here.
const ALLOW_REJECTION = new Set([
  // pending language decision on the official @unknown fallback form
  'examples/native/uncertain-steward-honesty-gate-exit-five.hs',
]);

function toPosix(path) {
  return path.split(sep).join('/');
}

function collectHsFiles(rootRel) {
  const abs = join(repoRoot, rootRel);
  if (!existsSync(abs)) {
    throw new Error(`missing conformance root: ${rootRel}`);
  }
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const info = statSync(path);
      if (info.isDirectory()) {
        walk(path);
      } else if (name.endsWith('.hs')) {
        found.push(toPosix(relative(repoRoot, path)));
      }
    }
  };
  walk(abs);
  found.sort();
  return found;
}

function runChecker(files) {
  const cargo = process.env.CARGO || 'cargo';
  const result = spawnSync(
    cargo,
    ['run', '-q', '--locked', '-p', 'holoscript-wasm', '--example', 'validate_hs', '--', ...files],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    }
  );
  if (result.error) {
    throw new Error(
      `could not run ${cargo}: ${result.error.message}. This gate needs a Rust toolchain that can build packages/compiler-wasm.`
    );
  }
  if (result.status !== 0) {
    const detail = `${result.stderr || ''}${result.stdout || ''}`.trim();
    throw new Error(`Rust checker failed to run (exit ${result.status}).\n${detail}`);
  }
  const byPath = new Map();
  for (const line of String(result.stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const tab = line.indexOf('\t');
    if (tab === -1) {
      throw new Error(`checker line has no tab: ${line}`);
    }
    const path = toPosix(line.slice(0, tab));
    let detail;
    try {
      detail = JSON.parse(line.slice(tab + 1));
    } catch (error) {
      throw new Error(`checker JSON for ${path} did not parse: ${error.message}`);
    }
    byPath.set(path, detail);
  }
  return byPath;
}

function main() {
  const files = ROOTS.flatMap(collectHsFiles);
  if (files.length === 0) {
    console.error('[hs-conformance] FAIL — no .hs files under the conformance roots');
    process.exit(1);
  }

  for (const allowed of ALLOW_REJECTION) {
    if (!files.includes(allowed)) {
      console.error(`[hs-conformance] FAIL — allow-list entry is not in the checked set: ${allowed}`);
      process.exit(1);
    }
  }

  let results;
  try {
    results = runChecker(files);
  } catch (error) {
    console.error(`[hs-conformance] FAIL — ${error.message}`);
    process.exit(1);
  }

  const rejected = [];
  const allowedRejections = [];
  for (const file of files) {
    const detail = results.get(file);
    if (!detail) {
      rejected.push(`${file} | checker produced no result`);
      continue;
    }
    if (detail.valid === true) continue;
    const message =
      (detail.errors && detail.errors[0] && detail.errors[0].message) || 'rejected with no message';
    if (ALLOW_REJECTION.has(file)) {
      allowedRejections.push(`${file} | ${message}`);
      continue;
    }
    rejected.push(`${file} | ${message}`);
  }

  for (const line of allowedRejections) {
    console.log(`[hs-conformance] allow ${line}`);
  }

  if (rejected.length > 0) {
    console.error(
      `[hs-conformance] FAIL — ${rejected.length} of ${files.length} .hs file(s) rejected by validate_detailed:`
    );
    for (const line of rejected) console.error(`  ${line}`);
    process.exit(1);
  }

  console.log(
    `[hs-conformance] PASS ${files.length - allowedRejections.length}/${files.length} checked files accepted by validate_detailed` +
      (allowedRejections.length
        ? ` (${allowedRejections.length} allow-listed rejection${allowedRejections.length === 1 ? '' : 's'})`
        : '')
  );
}

main();
