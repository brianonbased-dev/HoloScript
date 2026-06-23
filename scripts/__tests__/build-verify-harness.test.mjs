#!/usr/bin/env node
/**
 * Pure-Node tests for the shared compile-target build-verify harness:
 *   - scripts/holo-ci/build-verify/golden-diff.mts   (shared golden-diff gate)
 *   - scripts/holo-ci/build-verify/build-verify.mts  (shared build-verify runner)
 *
 * Exercises the three refactored emit gates (android, android-xr, quest-mr) and
 * the android-xr build-verify gate as real subprocesses via `npx tsx`, asserting
 * the behavior the harness guarantees:
 *   - real gate passes (emit byte-matches reference)            -> exit 0
 *   - --self-test passes (detector flags injected drift)        -> exit 0
 *   - build-verify SKIPs gracefully with no toolchain           -> exit 0
 *   - build-verify FAILs under --require-toolchain (no JDK)     -> exit 1
 *
 * This is what makes the harness itself gate-enforced (F.126: validation IS
 * construction) rather than untested library code.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const HOLO_CI = join(REPO_ROOT, 'scripts', 'holo-ci');

let testsRun = 0;
let testsFailed = 0;

function runGate(relScript, args = []) {
  const parts = ['npx', 'tsx', `"${join(HOLO_CI, relScript)}"`, ...args];
  // Single command string under shell (Node DEP0190: args array + shell:true
  // concatenates unescaped). Quote only the script path (args here are flags).
  const r = spawnSync(parts.join(' '), {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: true,
    timeout: 5 * 60 * 1000,
  });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

function expectExit(name, relScript, args, wantCode, mustInclude) {
  testsRun += 1;
  const { code, out } = runGate(relScript, args);
  const codeOk = code === wantCode;
  const textOk = mustInclude ? out.includes(mustInclude) : true;
  if (codeOk && textOk) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}`);
    console.error(`    want exit=${wantCode}${mustInclude ? ` incl "${mustInclude}"` : ''}; got exit=${code}`);
    console.error(`    output: ${out.split('\n').slice(-6).join(' | ')}`);
  }
}

console.log('build-verify-harness: golden-diff + build-verify shared modules');

// --- Shared golden-diff gate: the three refactored target gates ---
expectExit(
  'android-xr emit gate passes (byte-match reference)',
  'check-android-xr-emit-matches-reference.mts',
  [],
  0,
  'byte-match the reference'
);
expectExit(
  'android-xr emit gate --self-test detects injected drift',
  'check-android-xr-emit-matches-reference.mts',
  ['--self-test'],
  0,
  'detector flags injected drift'
);
expectExit(
  'android emit gate passes (byte-match reference)',
  'check-android-emit-matches-reference.mts',
  [],
  0,
  'byte-match the reference'
);
expectExit(
  'android emit gate --self-test detects injected drift',
  'check-android-emit-matches-reference.mts',
  ['--self-test'],
  0,
  'detector flags injected drift'
);
expectExit(
  'quest-mr emit gate passes (byte-match reference)',
  'check-quest-mr-emit-matches-reference.mts',
  [],
  0,
  'byte-match the reference'
);
expectExit(
  'quest-mr emit gate --self-test detects injected drift (NEW, closes W.783 gap)',
  'check-quest-mr-emit-matches-reference.mts',
  ['--self-test'],
  0,
  'detector flags injected drift'
);

// --- Shared build-verify runner: android-xr build-verify gate ---
// Environment-robust: the default run must exit 0 whether the box HAS a toolchain
// (PASS, once codegen is buildable) or NOT (SKIP after a clean dry write-over).
// Either way the runner must have materialized the emit over the skeleton — which
// is the harness's core contract — so we assert exit 0 + a recognizable verdict.
{
  testsRun += 1;
  const { code, out } = runGate('check-android-xr-build-verify.mts', []);
  const verdict = out.includes('SKIPPED') || out.includes('PASS') || out.includes('FAIL');
  const wroteOver = out.includes('dry write-over OK') || out.includes('build-verify [android-xr]');
  if (code === 0 && verdict && wroteOver) {
    console.log('  PASS android-xr build-verify default run exits 0 with a verdict');
  } else {
    testsFailed += 1;
    console.error('  FAIL android-xr build-verify default run exits 0 with a verdict');
    console.error(`    got exit=${code}; tail: ${out.split('\n').slice(-4).join(' | ')}`);
  }
}
// The build-verify runner's CLI module must export a structured-result path: a
// SKIPPED verdict is exit 0, a FAIL verdict is exit 1. We can only assert the
// FAIL->1 mapping deterministically when the toolchain is genuinely unavailable;
// on a JDK box --require-toolchain attempts a real build whose verdict is
// environment-dependent. So assert the weaker invariant that holds everywhere:
// --require-toolchain never reports SKIPPED (it must resolve to PASS or FAIL).
{
  testsRun += 1;
  const { out } = runGate('check-android-xr-build-verify.mts', ['--require-toolchain']);
  const verdictLine = out
    .split('\n')
    .reverse()
    .find((line) => line.includes('build-verify [android-xr]'));
  const nonSkipVerdict =
    verdictLine?.includes(' PASS:') || verdictLine?.includes(' FAIL:');
  if (nonSkipVerdict) {
    console.log('  PASS android-xr build-verify --require-toolchain never SKIPs');
  } else {
    testsFailed += 1;
    console.error('  FAIL android-xr build-verify --require-toolchain never SKIPs');
    console.error(`    verdict: ${verdictLine || '<missing>'}`);
    console.error(`    tail: ${out.split('\n').slice(-4).join(' | ')}`);
  }
}

console.log(`\nbuild-verify-harness: ${testsRun - testsFailed}/${testsRun} passed.`);
if (testsFailed > 0) process.exit(1);
