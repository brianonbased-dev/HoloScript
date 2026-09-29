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
 * It also holds a floor under every tracked `.hs` file (G11, proposals/
 * HS_Checker_Names_Calls_Returns_v1.md, proof 3): each file listed in
 * hs-valid-floor.json must stay valid, and the valid files must keep at least
 * the recorded number of typed functions. Deleting a file's types dodges every
 * rule that applies only to typed functions, so a drop in that count fails too.
 * `--update-floor` rewrites the floor from the current tree; review the diff.
 *
 * Exit codes: 0 pass, 1 a file was rejected (or the gate's own inputs are
 * wrong), 2 the checker could not run at all (no Rust toolchain, or it failed
 * to build). The pre-commit hook words 1 and 2 differently, so a missing
 * toolchain is never reported as a rejected file.
 *
 *   node scripts/holo-ci/check-hs-conformance.mjs
 *   pnpm check:hs-conformance
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const EXIT_COULD_NOT_RUN = 2;

/** The checker could not run; distinct from a file being rejected. */
class CouldNotRun extends Error {}

/**
 * cargo from CARGO, else PATH, else rustup's default install. A shell that
 * never loaded rustup's PATH line (Git Bash on Windows, hook runners) still
 * finds the toolchain rustup installed.
 */
function cargoCandidates() {
  if (process.env.CARGO) return [process.env.CARGO];
  const rustup = join(homedir(), '.cargo', 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo');
  return existsSync(rustup) ? ['cargo', rustup] : ['cargo'];
}

const ROOTS = ['examples/native', 'distributions/systems/conformance'];
const FLOOR_PATH = join(repoRoot, 'scripts', 'holo-ci', 'hs-valid-floor.json');
const FLOOR_DEFINITION =
  'hs-valid-floor-v1: tracked .hs files validate_detailed accepts; typed = a `function` with a parameter or return type';
const updateFloor = process.argv.includes('--update-floor');

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

function trackedHsFiles() {
  const result = spawnSync('git', ['ls-files', '*.hs'], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`git ls-files failed: ${String(result.stderr || '').trim()}`);
  }
  return String(result.stdout).split(/\r?\n/).filter(Boolean).map(toPosix).sort();
}

/** `function name(...)` headers that state a parameter or return type. */
function countTypedFunctions(source) {
  const header = /\bfunction\s+[A-Za-z_]\w*\s*(?:<[^>{]*>)?\s*\(([^)]*)\)\s*(:\s*[^{\n]+)?\{/g;
  let count = 0;
  for (const match of source.matchAll(header)) {
    if (match[1].includes(':') || match[2]) count += 1;
  }
  return count;
}

/**
 * The floor: every recorded file stays valid, and the valid files keep at least the recorded
 * number of typed functions. Returns the failures (empty when it holds).
 */
function checkFloor(tracked, results) {
  const valid = tracked.filter((file) => results.get(file)?.valid === true);
  const typed = valid.reduce(
    (sum, file) => sum + countTypedFunctions(readFileSync(join(repoRoot, file), 'utf8')),
    0
  );
  if (updateFloor) {
    writeFileSync(
      FLOOR_PATH,
      `${JSON.stringify(
        { definition: FLOOR_DEFINITION, typedFunctions: typed, validFiles: valid },
        null,
        2
      )}\n`
    );
    console.log(
      `[hs-conformance] floor written: ${valid.length} valid .hs files, ${typed} typed functions`
    );
    return [];
  }
  if (!existsSync(FLOOR_PATH)) return [`no floor at ${toPosix(relative(repoRoot, FLOOR_PATH))}`];
  const floor = JSON.parse(readFileSync(FLOOR_PATH, 'utf8'));
  if (floor.definition !== FLOOR_DEFINITION) {
    return [`the floor was recorded under another definition (${floor.definition})`];
  }
  const failures = [];
  const trackedSet = new Set(tracked);
  for (const file of floor.validFiles) {
    if (!trackedSet.has(file)) continue; // deleted or renamed: the typed count below still holds
    if (results.get(file)?.valid !== true) {
      const message = results.get(file)?.errors?.[0]?.message ?? 'rejected with no message';
      failures.push(`${file} was valid and is now rejected | ${message}`);
    }
  }
  if (typed < floor.typedFunctions) {
    failures.push(
      `valid .hs files hold ${typed} typed functions; the floor is ${floor.typedFunctions}. ` +
        'Removing types dodges the typed-function rules; keep them, or lower the floor with --update-floor and say why'
    );
  }
  console.log(
    `[hs-conformance] floor ${failures.length ? 'FAILS' : 'holds'}: ${valid.length} valid tracked .hs files ` +
      `(floor lists ${floor.validFiles.length}), ${typed} typed functions (floor ${floor.typedFunctions})`
  );
  return failures;
}

function runChecker(files) {
  const args = ['run', '-q', '--locked', '-p', 'holoscript-wasm', '--example', 'validate_hs', '--', ...files];
  const tried = [];
  let cargo;
  let result;
  for (cargo of cargoCandidates()) {
    result = spawnSync(cargo, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
    if (!(result.error && result.error.code === 'ENOENT')) break;
    tried.push(cargo);
  }
  if (result.error) {
    throw new CouldNotRun(
      `could not run cargo (tried ${tried.length ? tried.join(', ') : cargo}): ${result.error.message}. ` +
        'This gate needs a Rust toolchain that can build packages/compiler-wasm. ' +
        'Install it with rustup, or set CARGO to the cargo binary.'
    );
  }
  if (result.status !== 0) {
    const detail = `${result.stderr || ''}${result.stdout || ''}`.trim();
    throw new CouldNotRun(`Rust checker failed to run (exit ${result.status}).\n${detail}`);
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
  let tracked;
  try {
    tracked = trackedHsFiles();
    results = runChecker([...new Set([...files, ...tracked])]);
  } catch (error) {
    if (error instanceof CouldNotRun) {
      console.error(`[hs-conformance] COULD NOT RUN — ${error.message}`);
      process.exit(EXIT_COULD_NOT_RUN);
    }
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

  const floorFailures = checkFloor(tracked, results);
  if (floorFailures.length > 0) {
    console.error(`[hs-conformance] FAIL — the valid .hs floor does not hold:`);
    for (const line of floorFailures) console.error(`  ${line}`);
    process.exit(1);
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
