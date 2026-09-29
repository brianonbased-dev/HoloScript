#!/usr/bin/env node
/**
 * Regression tests for scripts/holo-ci/typecheck-classify.mjs (task_1784197589328_gywp).
 *
 * THE BUG THIS LOCKS DOWN: when tsc cannot be invoked at all (a missing
 * node_modules/.bin/tsc shim -> MODULE_NOT_FOUND, a crash, or a kill after timeout), the
 * gate used to fold that into the same shape as a clean run and print "(0 errors)" while
 * still failing the commit. "0 errors" is what a CLEAN package looks like, so the operator
 * cannot tell "your diff has a type error" from "the checker never ran" — it cost an agent
 * ~40 minutes hunting a nonexistent type error in a comment-only change before the real
 * cause (MODULE_NOT_FOUND) surfaced.
 *
 * Run: node scripts/__tests__/holo-ci-typecheck-classify.test.mjs
 */
import assert from 'node:assert/strict';
import {
  classifyTypecheckResult,
  countTsDiagnostics,
  DEFAULT_TYPECHECK_TIMEOUT_SECONDS,
  resolveTypecheckTimeoutMs,
  toolingRemedy,
} from '../holo-ci/typecheck-classify.mjs';

let run = 0;
let failed = 0;

function test(name, fn) {
  run += 1;
  try {
    fn();
    console.log(`  PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(err);
  }
}

// The exact stderr seen in the 2026-07-16 incident.
const MODULE_NOT_FOUND_OUT = `node:internal/modules/cjs/loader:1479
  throw err;
  ^

Error: Cannot find module 'C:\\Users\\josep\\Documents\\GitHub\\HoloScript\\node_modules\\typescript\\bin\\tsc'
    at Module._resolveFilename (node:internal/modules/cjs/loader:1476:15)
    at Module._load (node:internal/modules/cjs/loader:1262:25) {
  code: 'MODULE_NOT_FOUND',
  requireStack: []
}`;

const REAL_TYPE_ERROR_OUT = `src/foo.ts(12,3): error TS2322: Type 'string' is not assignable to type 'number'.
src/bar.ts(4,9): error TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'.`;

console.log('holo-ci typecheck classifier:');

test('clean run: exit 0, no diagnostics -> ok, not a tooling failure', () => {
  const r = classifyTypecheckResult(0, '');
  assert.equal(r.ok, true);
  assert.equal(r.errors, 0);
  assert.equal(r.toolingFailure, false);
});

test('REGRESSION: tsc could not run (MODULE_NOT_FOUND) -> toolingFailure, NOT reported as 0 clean errors', () => {
  const r = classifyTypecheckResult(1, MODULE_NOT_FOUND_OUT);
  assert.equal(r.ok, false, 'must not pass');
  assert.equal(r.errors, 0, 'there are genuinely no TS diagnostics to parse');
  // The whole point: errors===0 here must NOT be presentable as "(0 errors)".
  assert.equal(
    r.toolingFailure,
    true,
    'non-zero exit with zero parseable diagnostics means the check never ran'
  );
});

test('real type errors: exit 1 with parseable diagnostics -> type failure, NOT a tooling failure', () => {
  const r = classifyTypecheckResult(1, REAL_TYPE_ERROR_OUT);
  assert.equal(r.ok, false);
  assert.equal(r.errors, 2);
  assert.equal(r.toolingFailure, false, 'tsc ran fine; the code is broken, not the tooling');
});

test('crash/kill (e.g. 180s timeout) with no diagnostics -> toolingFailure', () => {
  const r = classifyTypecheckResult(
    null ?? 143,
    '\n[typecheck] tsc timed out after 180s and was killed.'
  );
  assert.equal(r.toolingFailure, true);
});

test('tsc config error is a real diagnostic (TS5083), not a tooling failure', () => {
  const r = classifyTypecheckResult(1, "error TS5083: Cannot read file 'tsconfig.json'.");
  assert.equal(r.errors, 1);
  assert.equal(r.toolingFailure, false);
});

// 2026-09-29: a merge from main staged 7 packages; with the laptop at 100% CPU from other
// sessions' tests, studio's tsc was stopped at the fixed 180s (alone it took 4m49s) and the gate
// told the author to run "pnpm install --force", which fixes nothing for a busy machine.
test('a run stopped at the time limit is a timeout, even if it printed diagnostics first', () => {
  const partial = `${REAL_TYPE_ERROR_OUT}\n[typecheck] tsc was still running after 600s and was stopped.`;
  const r = classifyTypecheckResult(null, partial, { timedOut: true });
  assert.equal(r.ok, false);
  assert.equal(r.timedOut, true);
  assert.equal(r.toolingFailure, true, 'an unfinished run is not "2 errors": it never finished');
});

test('a finished run is never marked timed out', () => {
  assert.equal(classifyTypecheckResult(0, '').timedOut, false);
  assert.equal(classifyTypecheckResult(1, REAL_TYPE_ERROR_OUT).timedOut, false);
});

test('the time limit defaults to 600s and HOLO_TYPECHECK_TIMEOUT_SECONDS overrides it', () => {
  assert.equal(DEFAULT_TYPECHECK_TIMEOUT_SECONDS, 600);
  assert.equal(resolveTypecheckTimeoutMs({}), 600_000);
  assert.equal(resolveTypecheckTimeoutMs({ HOLO_TYPECHECK_TIMEOUT_SECONDS: '900' }), 900_000);
  for (const bad of ['', 'abc', '0', '-5', '1.5', ' ']) {
    assert.equal(
      resolveTypecheckTimeoutMs({ HOLO_TYPECHECK_TIMEOUT_SECONDS: bad }),
      600_000,
      `"${bad}" is not a positive whole number of seconds`
    );
  }
});

test('the remedy for a timeout is not "reinstall"; the remedy for a missing tsc still is', () => {
  const slow = toolingRemedy([{ pkg: 'studio', timedOut: true }]);
  assert.equal(slow.length, 1);
  assert.match(slow[0], /Timed out \(studio\)/);
  assert.match(slow[0], /HOLO_TYPECHECK_TIMEOUT_SECONDS/);
  assert.doesNotMatch(slow[0], /pnpm install/);

  const missing = toolingRemedy([{ pkg: 'core', timedOut: false }]);
  assert.match(missing.join('\n'), /pnpm install --force/);

  const both = toolingRemedy([
    { pkg: 'studio', timedOut: true },
    { pkg: 'core', timedOut: false },
  ]);
  assert.equal(both.length, 2);
});

test('countTsDiagnostics tolerates empty/undefined output', () => {
  assert.equal(countTsDiagnostics(''), 0);
  assert.equal(countTsDiagnostics(undefined), 0);
  assert.equal(countTsDiagnostics(REAL_TYPE_ERROR_OUT), 2);
});

console.log(`\n${run - failed}/${run} passed`);
process.exit(failed ? 1 : 0);
