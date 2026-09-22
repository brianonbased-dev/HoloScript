#!/usr/bin/env node
/**
 * Core test baseline gate — makes "no NEW test failures" trustworthy.
 *
 * The core vitest suite is NOT green and NOT deterministic: `run-vitest.mjs`
 * shards into 4, and a set of memory-heavy / timing-sensitive files
 * (ChoreographyTrait.prod, RuntimeOptimization, the perf benchmarks, …) flake
 * under shard memory pressure — they pass in isolation but fail intermittently
 * in the full sharded run. That makes a raw "did any test fail?" check useless
 * as a regression gate: flake reads as regression, and a real regression hides
 * among the noise. (Discovered during board task_1780207572551_ax8w; see
 * research/2026-05-31_core-onramp-optional-peer-barrel-diagnosis.md.)
 *
 * This gate classifies every failure against `test-baseline.json`:
 *   - in `flakyFiles`        → IGNORED (known flaky file)
 *   - in `stableFailures`    → IGNORED (known pre-existing deterministic failure)
 *   - anything else          → NEW FAILURE (a real regression) → exit 1
 *
 * So a change is "baseline-clean" iff it introduces zero failures outside the
 * captured baseline. Run AFTER a change to prove it added no regressions:
 *   node scripts/check-core-test-baseline.mjs                 # runs the suite (~19 min)
 *   pnpm --filter @holoscript/core test:baseline              # same, by name
 *
 * Classify a run that ALREADY happened — no second suite execution:
 *   pnpm --filter @holoscript/core test > run.log 2>&1
 *   node scripts/check-core-test-baseline.mjs --from-log run.log
 *
 * The 19 minutes is the SUITE's cost, not this classifier's. --from-log exists so
 * the gate can attach to whatever surface already runs the suite rather than
 * paying for a duplicate run — which is what kept it off pre-push (measured
 * 18m54s, 2026-08-05).
 *
 * Refresh the baseline on a clean tree (run the suite ≥2× yourself first, then):
 *   node scripts/check-core-test-baseline.mjs --update   # rewrites stableFailures
 *   node scripts/check-core-test-baseline.mjs --update --from-log run.log
 * Reseed ONLY when failures were genuinely resolved. Reseeding to make a red run
 * green converts an unrecorded regression into accepted noise.
 *
 * Exit codes: 0 = no new failures, 1 = new failures (regressions), 2 = setup error
 * (including: the log carries no vitest summary, so the run cannot be confirmed
 * to have happened — this gate fails CLOSED rather than reporting a false green).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const coreRoot = resolve(__dir, '..');
const manifestPath = resolve(coreRoot, 'test-baseline.json');
const UPDATE = process.argv.includes('--update');

// --no-receipt: classify and report, but write no receipt.
// The receipt is a PUSH TOKEN, so any run of this gate mints one -- including a
// run whose only purpose is to check that the gate still refuses things. The
// self-test below drives fixture logs through this same script and must not
// leave a proof behind; neither should anyone probing it by hand.
const NO_RECEIPT = process.argv.includes('--no-receipt');

// --from-log <path>: classify a run that ALREADY happened instead of spawning a
// new one. The 19 minutes this gate costs is the suite's cost, not the
// classifier's — decoupling them is what lets the gate attach to a surface that
// already runs the suite, instead of paying for a second full run.
const fromLogIdx = process.argv.indexOf('--from-log');
const fromLog = fromLogIdx === -1 ? null : process.argv[fromLogIdx + 1];
if (fromLogIdx !== -1 && (!fromLog || fromLog.startsWith('--'))) {
  console.error('[baseline-gate] --from-log requires a path argument');
  process.exit(2);
}


// ===========================================================================
// --self-test: prove THIS gate can still refuse.
//
// Nothing tested this script. It is the instrument every packages/core "clean
// baseline" claim rests on, it was rewritten wholesale after it was found blind
// to crashed runs, and its evidence was a handful of commands run by hand once.
// Its sibling check-core-baseline-receipt.mjs has had a --self-test for exactly
// this reason since it was written; this is the same idea applied to the half
// that actually parses the run.
//
// Each case is a fixture log driven through this very script via --from-log,
// with --no-receipt so that testing the gate cannot mint a push token.
// ===========================================================================
if (process.argv.includes('--self-test')) {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(resolve(tmpdir(), 'baseline-gate-selftest-'));
  const sha =
    spawnSync('git', ['rev-parse', 'HEAD:packages/core'], { cwd: coreRoot, encoding: 'utf8' })
      .stdout?.trim() || null;

  const RID = 'selftest-0000-1111-2222';
  const env = (over = {}) =>
    '[run-vitest] run-envelope ' +
    JSON.stringify({
      v: 3,
      runId: RID,
      mode: 'full',
      targets: [],
      coreTreeSha: sha,
      dirtyAtStart: false,
      passes: FULL_PASSES,
      overall: 0,
      ...over,
    });
  const ok = (label) => ({ label, status: 0, signal: null });
  const FULL_PASSES = [
    ok('sequential'),
    ok('shard-1/4'),
    ok('shard-2/4'),
    ok('shard-3/4'),
    ok('shard-4/4'),
  ];
  const begin = (label, runId = RID) => `[run-vitest:${runId}] pass-begin ${label}`;
  const files = (n) => ` Test Files  ${n} passed (${n})`;

  /** A complete, balanced, zero-exit run: five delimited sections, one summary each. */
  const fullBody = () => {
    const out = [];
    for (const label of ['sequential', 'shard-1/4', 'shard-2/4', 'shard-3/4', 'shard-4/4']) {
      out.push(begin(label), files(30));
    }
    return out;
  };

  const CASES = [
    ['accepts a complete, balanced, zero-exit full run', [...fullBody(), env()], 0],

    // ── what a crashed or incomplete run looks like ──────────────────────
    [
      'REFUSES a crashed worker (a pass reported fewer files than it collected)',
      [
        begin('sequential'),
        'Error: [vitest-pool]: Worker forks emitted error.',
        ' Caused by: Error: Worker exited unexpectedly',
        ' Test Files  10 passed (11)',
        ...['shard-1/4', 'shard-2/4', 'shard-3/4', 'shard-4/4'].flatMap((l) => [begin(l), files(30)]),
        env({ passes: [{ label: 'sequential', status: 1, signal: null }, ...FULL_PASSES.slice(1)] }),
      ],
      2,
    ],
    // ISOLATED: status 0, one summary in its own section, nothing else wrong, so
    // only the signal arm can refuse it. With `status: null` as well, the
    // no-exit-status arm also fired and the case proved the pair, not the arm.
    [
      'REFUSES a pass that reports a signal even with a zero status',
      [
        ...fullBody(),
        env({ passes: [{ label: 'sequential', status: 0, signal: 'SIGKILL' }, ...FULL_PASSES.slice(1)] }),
      ],
      2,
    ],
    [
      'REFUSES a pass that ended with no exit status at all',
      [
        ...fullBody(),
        env({ passes: [{ label: 'sequential', status: null, signal: null }, ...FULL_PASSES.slice(1)] }),
      ],
      2,
    ],
    [
      'REFUSES a pass that exited non-zero with no failures OF ITS OWN',
      [
        begin('sequential'),
        ' FAIL  src/__tests__/Known.test.ts > known > pre-existing',
        ' Test Files  1 failed | 29 passed (30)',
        ...['shard-1/4', 'shard-2/4', 'shard-3/4', 'shard-4/4'].flatMap((l) => [begin(l), files(30)]),
        env({
          passes: [
            { label: 'sequential', status: 1, signal: null },
            { label: 'shard-1/4', status: 1, signal: null },
            ...FULL_PASSES.slice(2),
          ],
        }),
      ],
      2,
    ],
    // ISOLATED FROM THE GLOBAL COUNT: five summaries for five passes, so the
    // run-wide tally matches perfectly -- but one pass printed two and another
    // printed none. Only the per-section rule can see this, which is the whole
    // reason a global tally was not enough.
    [
      'REFUSES a run where one pass printed two summaries and another printed none',
      [
        begin('sequential'),
        files(30),
        files(30),
        begin('shard-1/4'),
        begin('shard-2/4'),
        files(30),
        begin('shard-3/4'),
        files(30),
        begin('shard-4/4'),
        files(30),
        env(),
      ],
      2,
    ],

    // ── what the log itself must prove ───────────────────────────────────
    ['REFUSES a log with no envelope at all', fullBody(), 2],
    // ISOLATED, from review: a complete, balanced, all-zero log whose ONLY
    // defect is one crash line inside a section. Every other rule is satisfied,
    // so deleting the crash-marker scan makes exactly this case go green. I had
    // recorded this rule as impossible to isolate; it was not, and the fixture
    // below is the reviewer's, not mine.
    [
      'REFUSES a complete log that carries a worker-crash line inside a section',
      [
        begin('sequential'),
        files(30),
        begin('shard-1/4'),
        ' Caused by: Error: Worker exited unexpectedly',
        files(30),
        ...['shard-2/4', 'shard-3/4', 'shard-4/4'].flatMap((l) => [begin(l), files(30)]),
        env(),
      ],
      2,
    ],
    // ISOLATED, also from review: a complete pass set where every pass claims
    // skipped, so no summary is expected anywhere and the zero-summary refusal
    // is the only rule that can fire. (The skipped-pass restriction added in
    // this commit now also refuses it, which is defence in depth rather than a
    // reason to drop the case.)
    [
      'REFUSES a run in which every pass claims to have been skipped',
      [
        env({
          passes: ['sequential', 'shard-1/4', 'shard-2/4', 'shard-3/4', 'shard-4/4'].map((label) => ({
            label,
            status: 0,
            signal: null,
            skipped: true,
          })),
        }),
      ],
      2,
    ],
    // THE SHAPE THAT BIT A REAL RUN. The gate captures the child's stdout and
    // stderr separately and concatenates them, so a pass-begin marker written to
    // stderr lands after EVERY summary and all five sections come out empty.
    // The markers are on stdout for this reason; this case fails if they move
    // back, instead of the failure surfacing fifteen minutes into a live run.
    [
      'REFUSES a log whose markers were captured on a different stream from its summaries',
      [
        ...['sequential', 'shard-1/4', 'shard-2/4', 'shard-3/4', 'shard-4/4'].map(() => files(30)),
        ...['sequential', 'shard-1/4', 'shard-2/4', 'shard-3/4', 'shard-4/4'].map((l) => begin(l)),
        env(),
      ],
      2,
    ],
    ['REFUSES a log carrying two runs', [...fullBody(), env(), ...fullBody(), env()], 2],
    ['REFUSES a log captured against a different core tree', [...fullBody(), env({ coreTreeSha: 'e'.repeat(40) })], 2],
    ['REFUSES an envelope that declares no passes', [...fullBody(), env({ passes: [] })], 2],
    ['REFUSES an envelope with no runId', [...fullBody(), env({ runId: undefined })], 2],
    // ISOLATED, and it exists to keep a coupling from coming back. A runId IS
    // present here, so the refusal above cannot be what catches it -- only the
    // dirtiness check can. Without this case, the dirty handling could quietly
    // revert to trusting an absent field and nothing would notice, because the
    // runId refusal would go on catching every fixture that lacked both.
    [
      'REFUSES a v3 envelope that carries a runId but will not say whether the tree was dirty',
      [...fullBody(), env({ dirtyAtStart: undefined })],
      2,
    ],

    // ── SCOPE: a partial run cannot certify the suite ────────────────────
    // A five-second one-file run used to mint a receipt the pre-push checker
    // accepted for the whole package. This is that hole.
    // ISOLATED: valid in every other respect -- five delimited sections, one
    // summary each, all zero exits, matching tree -- so ONLY the mode check can
    // refuse it. Deleting that check must make this case go green.
    [
      'REFUSES a run whose envelope says single, however full-shaped it looks',
      [...fullBody(), env({ mode: 'single', targets: ['src/__tests__/One.test.ts'] })],
      2,
    ],
    [
      'REFUSES the real shape of a single-file run too',
      [
        begin('single'),
        files(1),
        env({ mode: 'single', targets: ['src/__tests__/One.test.ts'], passes: [ok('single')] }),
      ],
      2,
    ],
    [
      'REFUSES a full-mode envelope that is missing a shard',
      [
        ...['sequential', 'shard-1/4', 'shard-2/4', 'shard-3/4'].flatMap((l) => [begin(l), files(30)]),
        env({ passes: FULL_PASSES.slice(0, 4) }),
      ],
      2,
    ],

    // ── the forged delimiter ─────────────────────────────────────────────
    // A shard whose OUTPUT contains a pass-begin line used to re-route its
    // failures into another pass's section, turning a crashed-pass refusal
    // green. The marker carries a per-run nonce now, so a forged line with any
    // other id is just text and the crashed pass is still caught.
    [
      'REFUSES a crashed pass even when the log carries a forged pass-begin line',
      // Shaped exactly as review shaped it: the SEQUENTIAL pass exits non-zero
      // with no failure of its own (the crash signature), and a LATER pass
      // prints a forged marker followed by a failure, donating it backwards.
      [
        begin('sequential'),
        files(30),
        begin('shard-1/4'),
        begin('sequential', 'forged-run-id'),
        ' FAIL  src/__tests__/Known.test.ts > known > pre-existing',
        ' Test Files  1 failed | 29 passed (30)',
        ...['shard-2/4', 'shard-3/4', 'shard-4/4'].flatMap((l) => [begin(l), files(30)]),
        env({
          passes: [
            { label: 'sequential', status: 1, signal: null },
            ...FULL_PASSES.slice(1),
          ],
        }),
      ],
      2,
    ],

    // ── and the verdict that is NOT a refusal ────────────────────────────
    [
      'reports a REAL failure as a verdict (exit 1), not as a crash',
      [
        begin('sequential'),
        ' FAIL  src/__tests__/Something.test.ts > it works',
        ' Test Files  1 failed | 29 passed (30)',
        ...['shard-1/4', 'shard-2/4', 'shard-3/4', 'shard-4/4'].flatMap((l) => [begin(l), files(30)]),
        env({ passes: [{ label: 'sequential', status: 1, signal: null }, ...FULL_PASSES.slice(1)] }),
      ],
      1,
    ],
  ];

  // WHAT THIS SELF-TEST DOES NOT PROVE, stated because the alternative is a
  // reader assuming it does. Measured 2026-09-22 by deleting each rule in turn
  // and re-running: FOUR are isolated -- remove the scope refusal, the
  // per-section summary count, the expected-pass-set check or the signal arm,
  // and a named case below goes red. THREE are not, because another rule
  // catches the same fixture first:
  //
  //   delimiter nonce -> the per-section summary count catches the forgery: an
  //                      accepted forged marker resets the section, so the pass
  //                      it targets loses the summary it had collected and the
  //                      per-section rule refuses first. Confirmed by review.
  //
  //   zero-summary refusal -> also not isolable, but for a reason that MOVED.
  //                      Review supplied an all-skipped fixture that isolated
  //                      it, and the skipped-pass restriction added in the same
  //                      commit now refuses that fixture FIRST. Measured after
  //                      adding it: deleting the zero-summary refusal leaves
  //                      this self-test green again. Fixing one hole closed the
  //                      only door through which another could be observed.
  //
  // I had listed the crash-marker scan here too. That was wrong: review
  // supplied a fixture that isolates it, and it is a case above -- a complete,
  // balanced, all-zero log whose only defect is one crash line in a section.
  //
  // AND ONE THING NO FIXTURE HERE CAN PROVE. Whether the RUNNER sends its
  // markers, summaries and FAIL lines down one ordered stream is invisible to
  // every case in this file, because a fixture supplies an already-merged log.
  // Moving them apart leaves this self-test green while breaking per-pass
  // attribution on the live path -- measured, twice. That one is covered by a
  // live run in the PR evidence, not here, and saying so is the point.
  let failed = 0;
  for (const [name, lines, want] of CASES) {
    const log = resolve(dir, name.replace(/[^a-z0-9]+/gi, '-') + '.log');
    writeFileSync(log, lines.join('\n') + '\n');
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--from-log', log, '--no-receipt'], {
      cwd: coreRoot,
      encoding: 'utf8',
    });
    const got = r.status;
    const pass = got === want;
    if (!pass) failed++;
    console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${name} (expected exit ${want}, got ${got})`);
  }
  console.log(
    failed === 0
      ? `\n[baseline-gate] self-test PASS -- accepts a complete run, reports a real failure as a failure, and refuses all ${CASES.filter(([, , want]) => want === 2).length} unverifiable shapes.`
      : `\n[baseline-gate] self-test FAIL -- ${failed} case(s) wrong.`
  );
  process.exit(failed === 0 ? 0 : 1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  console.error(`[baseline-gate] cannot read ${manifestPath}: ${e.message}`);
  process.exit(2);
}

const flakyFiles = new Set(manifest.flakyFiles?.files ?? []);
const stableFailures = new Set(manifest.stableFailures?.tests ?? []);

// Captured BEFORE the suite runs, and this ordering is load-bearing. The core
// suite rewrites tracked files inside packages/core as a side effect (the
// holotorch parity receipts under src/reconstruction/holotorch/receipts/ are
// regenerated on every run). Sampling cleanliness afterwards would therefore
// report dirty for every legitimate run and the receipt would never validate.
// The question the receipt answers is "was the tree clean when testing STARTED",
// i.e. did this run exercise what HEAD contains.
const dirtyAtStart = (() => {
  const r = spawnSync('git', ['status', '--porcelain', '--', '.'], {
    cwd: coreRoot,
    encoding: 'utf8',
  });
  return r.status === 0 ? r.stdout.trim().length > 0 : true;
})();

// Obtain the run output: either read a completed run's log, or produce one.
let out;
let source;
let liveStatus = null;
let liveSignal = null;

if (fromLog) {
  const logPath = resolve(fromLog);
  source = logPath;
  try {
    out = readFileSync(logPath, 'utf8');
  } catch (e) {
    console.error(`[baseline-gate] cannot read --from-log ${logPath}: ${e.message}`);
    process.exit(2);
  }
  console.error(`[baseline-gate] classifying a previously captured run: ${logPath}`);
} else {
  source = 'live run';
  console.error('[baseline-gate] running full core suite (sharded) — this takes a few minutes…');
  const proc = spawnSync(
    process.execPath,
    ['--max-old-space-size=16384', resolve(coreRoot, 'run-vitest.mjs')],
    { cwd: coreRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: process.env }
  );
  // A suite that never started produces no FAIL lines, which would otherwise
  // read as "clean". Surface the spawn failure instead of inheriting its silence.
  if (proc.error) {
    console.error(`[baseline-gate] could not run the suite: ${proc.error.message}`);
    process.exit(2);
  }
  // THE FIELD THIS GATE SPENT ITS LIFE NOT READING.
  // spawnSync exposes `status` (null when the child was killed by a signal) and
  // `signal`. There is no `exitCode`. Reading only `status` and treating null as
  // success would reproduce the hole for signal kills, so both are carried.
  liveStatus = proc.status ?? null;
  liveSignal = proc.signal ?? null;
  out = `${proc.stdout ?? ''}\n${proc.stderr ?? ''}`;
}

// ===========================================================================
// DID THE RUN ACTUALLY HAPPEN, ALL OF IT?
//
// This gate used to answer that with one regex: does the string "Test Files"
// appear anywhere in the output. That does not survive contact with a crash.
// The real crash this suite produced (quoted in test-baseline.json) looks like:
//
//   Error: [vitest-pool]: Worker forks emitted error.
//    Caused by: Error: Worker exited unexpectedly
//    Test Files  10 passed (11)
//
// The dying pass prints its OWN summary, so the old check passed on the crash
// output itself. A crashed worker emits no FAIL line for the tests it never ran,
// so the failure parser saw nothing, and nothing classified as clean. Measured
// 2026-09-22: fed that log, this gate printed "total failures=0 | NEW=0", "OK",
// exit 0, and wrote a receipt saying result "clean" -- which the pre-push check
// accepts, because `result` is the only thing it inspects.
//
// Three independent things now have to line up. Any one failing is a setup error
// (exit 2), never a verdict, because an unverifiable run is not a pass.
// ===========================================================================

// Declared before the checks below use it; the receipt section calls it too.
function coreTreeSha() {
  const r = spawnSync('git', ['rev-parse', 'HEAD:packages/core'], {
    cwd: coreRoot,
    encoding: 'utf8',
  });
  return r.status === 0 ? r.stdout.trim() : null;
}

// Set when the RUNNER reports the tree was dirty when the suite began; ORed
// with this script's own sample, which only speaks for classification time.
let capturedDirty = false;

// Strip ANSI before every parse. A live run comes through a pipe uncoloured, but
// a --from-log capture taken from a terminal does not, and a coloured log would
// silently match nothing at all -- the FAIL lines included.
const ANSI = new RegExp(String.fromCharCode(27) + '[[]' + '[0-9;]*m', 'g');
const plain = out.replace(ANSI, '');

// (1) THE RUNNER'S OWN REPORT OF EACH PASS.
// run-vitest.mjs prints one machine-readable envelope naming every pass and its
// real exit status. On the live path spawnSync's own view is held too.
let envelope = null;
{
  // EVERY envelope, not the first. Without /g this took match[0] and discarded
  // the rest, so a log that had been appended to -- a re-run into the same file,
  // a CI job concatenating steps, a plain `>>` -- could hide a second envelope
  // recording a SIGKILL behind a first one recording success.
  const all = [...plain.matchAll(/^\s*\[run-vitest\] run-envelope (.+)$/gm)];
  if (all.length > 1) {
    console.error(
      `[baseline-gate] ${source} carries ${all.length} run-envelope lines, so it holds more than ` +
        'one run. Classify one run at a time.'
    );
    process.exit(2);
  }
  if (all.length === 1) {
    try {
      envelope = JSON.parse(all[0][1]);
    } catch (e) {
      console.error(`[baseline-gate] run-envelope present but unparseable: ${e.message}`);
      process.exit(2);
    }
  }
}

// (2) EVERY SUMMARY LINE MUST BALANCE.
// "Test Files  10 passed (11)" says eleven files were collected and ten reported.
// The missing one is the crash. Vitest's legitimate shapes all balance:
//   "Test Files  2 failed | 118 passed (120)"  -> 120 of 120
//   "Test Files  1 skipped | 119 passed (120)" -> 120 of 120
/**
 * The ONE definition of "a vitest summary line", used by every rule that counts
 * them.
 *
 * This logic existed twice, copy-pasted, with identical regexes -- the global
 * balance check and the per-section count each had their own. Identical today,
 * and that is the problem: the two rules are meant to be about the same lines,
 * so any drift between the copies would not be a disagreement anyone would
 * notice, it would be a gap between what one rule sees and what the other does.
 * Review named the shape before it bit: the only way to isolate the
 * zero-summary refusal would be a difference between the two parsers, and such
 * a difference is a latent hole rather than a test fixture.
 */
function summariesIn(lines) {
  const found = [];
  for (const line of lines) {
    const m = line.match(/^\s*Test Files\s+(.+?)\s*\((\d+)\)\s*$/);
    if (!m) continue;
    const total = Number(m[2]);
    let accounted = 0;
    for (const part of m[1].split('|')) {
      const g = part.trim().match(/^(\d+)\s+\w+/);
      if (g) accounted += Number(g[1]);
    }
    found.push({ line: line.trim(), accounted, total });
  }
  return found;
}

const summaries = summariesIn(plain.split(/\r?\n/));

// UNREACHABLE BY CONSTRUCTION, and kept only because saying so is cheaper than
// arguing about it later. A log with zero summaries must either declare skipped
// passes -- refused above, since only the sequential pass may be skipped and
// only when serialPassFiles is empty -- or declare passes that ran, which the
// per-section rule refuses because it demands exactly one summary per ran
// section. Both rules now read the same matcher, so there is no third case
// where one sees a summary and the other does not.
//
// That means this cannot be the sole reason for a refusal, and no fixture can
// isolate it: review supplied one, the skipped restriction then refused it
// first. A rule that cannot fire is not a backstop, it is a claim -- so this is
// labelled as a claim rather than counted among the rules that defend anything.
if (summaries.length === 0) {
  console.error(
    `[baseline-gate] no vitest summary found in ${source} -- cannot confirm the suite ran.`
  );
  console.error('[baseline-gate] refusing to report a verdict on an unverifiable run.');
  process.exit(2);
}

const unbalanced = summaries.filter((x) => x.accounted !== x.total);
if (unbalanced.length > 0) {
  console.error('[baseline-gate] a pass collected more test files than it reported:');
  for (const x of unbalanced) {
    console.error(`  ${x.line}   (${x.total - x.accounted} file(s) never reported)`);
  }
  console.error('[baseline-gate] files that never reported did not pass. Refusing a verdict.');
  process.exit(2);
}

// (3) EXPLAIN EVERY NON-ZERO EXIT.
// Non-zero is NORMAL here: the baseline deliberately tolerates known failures and
// vitest exits 1 whenever any test fails. So the rule is not "non-zero is bad", it
// is "non-zero must be ACCOUNTED FOR by failures we can see and classify". A pass
// that exits non-zero while printing no FAIL line at all is the crash signature.
const CRASH_MARKERS =
  /Worker exited unexpectedly|\[vitest-pool\]|JavaScript heap out of memory|FATAL ERROR|Segmentation fault/;

// FAILURES ATTRIBUTED TO THE PASS THAT PRINTED THEM.
//
// Counting FAIL lines across the whole run and then asking "did THIS pass print
// one?" cannot work: the answer is the same for every pass. Review of the first
// version of this fix found exactly that hole -- a crashed shard exiting 1 with
// no failures of its own was excused by one forgiven failure in a different
// pass, and the run still wrote result "clean". That is the defect this gate
// exists to catch, reproduced inside the fix for it.
//
// run-vitest.mjs now prints `[run-vitest] pass-begin <label>` before each pass,
// so the log can be cut into sections and each pass judged on its own output.
function sectionsByPass(text, runId) {
  // ONLY THIS RUN'S MARKERS. The delimiter used to be plain text, so a TEST
  // whose output contained `[run-vitest] pass-begin sequential` re-routed its
  // failures into another pass's section -- review turned a crashed-pass
  // refusal green that way, with a forged line and one forgiven failure. The
  // runner now emits `[run-vitest:<runId>] pass-begin`, the runId lives in the
  // envelope, and it is never placed in the child environment, so the suite
  // cannot read the value it would have to reproduce.
  const escaped = String(runId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const marker = new RegExp('^\\s*\\[run-vitest:' + escaped + '\\] pass-begin (.+?)\\s*$');
  const out = new Map();
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const begin = line.match(marker);
    if (begin) {
      current = begin[1];
      out.set(current, []);
      continue;
    }
    if (current !== null) out.get(current).push(line);
  }
  return out;
}

/** The `Test Files ... (N)` summaries inside one section. */
const SECTIONS = sectionsByPass(plain, envelope?.runId);
const isFailLine = (l) => /^\s*FAIL\s+(.*\S)\s*$/.test(l);
const failuresInPass = (label) => (SECTIONS.get(label) ?? []).filter(isFailLine).length;
const failureLines = plain.split(/\r?\n/).filter(isFailLine);

if (envelope) {
  // THE LOG MUST BE ABOUT THIS TREE.
  // --from-log takes an arbitrary path and nothing tied its contents to the code
  // being judged: coreTreeSha is read from the CURRENT tree, so replaying a log
  // captured before a change minted a clean receipt for the change. The runner
  // now stamps the tree it tested into the envelope, and a mismatch is refused.
  // A LOG OF A ONE-FILE RUN CANNOT CERTIFY THE SUITE.
  //
  // v2 bound the log to a TREE, which stopped a stale log certifying new code.
  // It did not stop a five-second `run-vitest.mjs <one test> > single.log` from
  // being replayed through --from-log into a clean receipt that the pre-push
  // checker accepted for the whole package -- reproduced in review, and the
  // docblock above invites exactly that capture. The envelope now says what the
  // run WAS, and only a complete one earns a verdict.
  if (!envelope.runId) {
    console.error(
      '[baseline-gate] the run-envelope carries no runId, so its pass markers cannot be trusted.'
    );
    console.error('[baseline-gate] re-capture with a current run-vitest.mjs.');
    process.exit(2);
  }
  const mode = envelope.mode ?? null;
  if (mode !== 'full') {
    console.error(
      `[baseline-gate] this log is a "${mode ?? 'unknown'}" run` +
        (envelope.targets?.length ? ` of ${envelope.targets.join(', ')}` : '') +
        ' -- it says nothing about the rest of the suite.'
    );
    console.error('[baseline-gate] a verdict needs a full run: node run-vitest.mjs (no arguments).');
    process.exit(2);
  }
  const EXPECTED_PASSES = ['sequential', 'shard-1/4', 'shard-2/4', 'shard-3/4', 'shard-4/4'];
  const declared = (envelope.passes ?? []).map((x) => x.label);
  const missing = EXPECTED_PASSES.filter((l) => !declared.includes(l));
  const extra = declared.filter((l) => !EXPECTED_PASSES.includes(l));
  if (missing.length > 0 || extra.length > 0) {
    console.error(
      '[baseline-gate] a full run is the sequential pass plus four shards; this log declares ' +
        `${declared.join(', ') || '(none)'}.`
    );
    if (missing.length) console.error(`[baseline-gate]   missing: ${missing.join(', ')}`);
    if (extra.length) console.error(`[baseline-gate]   unexpected: ${extra.join(', ')}`);
    process.exit(2);
  }

  // DIRTINESS BELONGS TO THE CAPTURE, NOT THE CLASSIFICATION. `dirtyAtStart`
  // below is sampled when this script runs, which for --from-log can be days
  // after the suite. The runner now stamps its own answer; either one counts.
  // FAIL CLOSED: anything that is not an explicit `false` counts as dirty.
  //
  // This was `=== true`, so an envelope that simply did not say was silently
  // treated as clean. That was safe only because the runId refusal above turns
  // away every pre-v3 envelope before reaching this line -- a dependency this
  // line did not advertise and which would have gone away the moment anyone
  // relaxed that refusal. An unknown answer to "was the tree dirty" is not a
  // no, and the current runner always writes the boolean, so refusing a v3
  // envelope that omits it costs nothing on the live path.
  if (typeof envelope.dirtyAtStart !== 'boolean') {
    console.error(
      '[baseline-gate] the run-envelope does not say whether the tree was dirty when the run started.'
    );
    console.error('[baseline-gate] re-capture with a current run-vitest.mjs.');
    process.exit(2);
  }
  if (envelope.dirtyAtStart !== false) capturedDirty = true;

  const stamped = envelope.coreTreeSha ?? null;
  const actual = coreTreeSha();
  if (!stamped) {
    console.error(
      '[baseline-gate] the run-envelope carries no coreTreeSha, so this log cannot be tied to a tree.'
    );
    console.error('[baseline-gate] re-capture with a current run-vitest.mjs.');
    process.exit(2);
  }
  if (actual && stamped !== actual) {
    console.error(
      `[baseline-gate] this log tested packages/core ${stamped.slice(0, 12)}, but HEAD is ` +
        `${actual.slice(0, 12)} -- it says nothing about the tree being judged.`
    );
    process.exit(2);
  }

  // `skipped` IS TRUSTED FROM THE ENVELOPE, SO BOUND WHAT IT CAN EXCUSE.
  //
  // The runner marks the sequential pass skipped when serialPassFiles is empty,
  // and the gate then does not expect a summary for it. Review showed the
  // obvious consequence: an envelope declaring the full pass set with all FOUR
  // SHARDS skipped:true, and one real sequential summary, was accepted -- a
  // full-suite token minted from one pass. Only the sequential pass has a
  // legitimate reason to be skipped, and only when the list it would have run
  // is actually empty.
  const serialPassFiles = manifest.serialPassFiles?.files ?? [];
  for (const pass of Array.isArray(envelope.passes) ? envelope.passes : []) {
    if (!pass.skipped) continue;
    if (pass.label !== 'sequential') {
      console.error(
        `[baseline-gate] pass "${pass.label}" is marked skipped; only the sequential pass may be.`
      );
      process.exit(2);
    }
    if (serialPassFiles.length > 0) {
      console.error(
        '[baseline-gate] the sequential pass is marked skipped, but test-baseline.json lists ' +
          `${serialPassFiles.length} file(s) for it to run.`
      );
      process.exit(2);
    }
  }

  const passes = Array.isArray(envelope.passes) ? envelope.passes : [];
  if (passes.length === 0) {
    console.error('[baseline-gate] the run-envelope declares no passes at all.');
    process.exit(2);
  }
  const ran = passes.filter((x) => !x.skipped);
  // PER SECTION, not a global tally. A global count matching by coincidence let
  // a pass that printed two summaries cover for a pass that printed none.
  for (const pass of ran) {
    const own = summariesIn(SECTIONS.get(pass.label) ?? []);
    if (own.length !== 1) {
      console.error(
        `[baseline-gate] pass "${pass.label}" printed ${own.length} vitest summaries; exactly one is expected.`
      );
      process.exit(2);
    }
  }
  if (summaries.length !== ran.length) {
    console.error(
      `[baseline-gate] the runner reported ${ran.length} pass(es) that ran, but the log carries ` +
        `${summaries.length} summary line(s) -- a pass produced no summary at all.`
    );
    process.exit(2);
  }
  for (const pass of passes) {
    if (pass.signal) {
      console.error(`[baseline-gate] pass "${pass.label}" was killed by signal ${pass.signal}.`);
      process.exit(2);
    }
    if (pass.status === null) {
      console.error(`[baseline-gate] pass "${pass.label}" reported no exit status.`);
      process.exit(2);
    }
    // THIS pass's own failures, not the run's. See sectionsByPass above.
    if (pass.status !== 0 && failuresInPass(pass.label) === 0) {
      const delimited = SECTIONS.has(pass.label);
      console.error(
        `[baseline-gate] pass "${pass.label}" exited ${pass.status} with no failures of its own -- ` +
          'the run crashed rather than failing. Refusing a verdict.'
      );
      if (!delimited) {
        console.error(
          `[baseline-gate]   (no "pass-begin ${pass.label}" delimiter in the log; ` +
            're-capture with a current run-vitest.mjs)'
        );
      }
      process.exit(2);
    }
  }
} else {
  // NO ENVELOPE MEANS THE RUNNER DIED. There is no benign version of this.
  //
  // This used to be a lenient fallback "for a runner that predates the
  // envelope", and it applied NO completeness check at all -- the per-pass
  // reconciliation lives in the branch above. But run-vitest.mjs prints the
  // envelope as its LAST line, so on the live path its absence means the runner
  // never reached that line. Review demonstrated the consequence: a stand-in
  // runner that ran two passes, died, and never ran shards 3 and 4 was reported
  // clean with exit 0 and a receipt to match.
  //
  // A missing envelope is now the same refusal whether the run was live or
  // replayed from a log, which is also the honest description of both.
  if (liveSignal) {
    console.error(`[baseline-gate] the suite was killed by signal ${liveSignal}.`);
    process.exit(2);
  }
  // --from-log with no envelope: the exit status is simply not in the file, and a
  // gate that cannot see it must say so rather than assume zero.
  console.error(
    `[baseline-gate] ${source} carries no run-envelope line, so nothing says which passes ran ` +
      'or how they ended.'
  );
  console.error(
    liveStatus !== null
      ? `[baseline-gate] the runner exited ${liveStatus} without printing one -- it did not finish.`
      : '[baseline-gate] re-capture the log with a current run-vitest.mjs.'
  );
  process.exit(2);
}

// The cheap backstop: crash text anywhere, even when every count balanced.
if (CRASH_MARKERS.test(plain)) {
  const hit = plain.split(/\r?\n/).find((l) => CRASH_MARKERS.test(l)) || '';
  console.error(`[baseline-gate] the run output carries a crash signature: ${hit.trim()}`);
  console.error('[baseline-gate] refusing a verdict on a run that crashed.');
  process.exit(2);
}

// Parse vitest " FAIL  <id>" lines into normalized failure identifiers.
const failures = new Set();
for (const line of plain.split(/\r?\n/)) {
  const m = line.match(/^\s*FAIL\s+(.*\S)\s*$/);
  if (m) failures.add(m[1].trim());
}

const isFlakyFile = (id) => {
  // id is either "<file> > describe > test" or "<file> [ <file> ]" (file-level).
  const file = id.split(' > ')[0].split(' [')[0].trim();
  return flakyFiles.has(file);
};

const newFailures = [...failures].filter((id) => !stableFailures.has(id) && !isFlakyFile(id));
const knownStable = [...failures].filter((id) => stableFailures.has(id));
const knownFlaky = [...failures].filter((id) => !stableFailures.has(id) && isFlakyFile(id));

if (UPDATE) {
  // RESEEDING IS THE MOST DANGEROUS THING THIS SCRIPT DOES: it converts whatever
  // failed into permanently accepted noise. The refusals above already stop a
  // crashed run getting here, but two conditions that merely INVALIDATE a run
  // did not block it -- a dirty tree and borrowed dependencies both mean the run
  // did not test what HEAD contains, and the receipt records them precisely so
  // that the verdict is not trusted. A reseed is a stronger act than a verdict,
  // so it must not accept evidence a verdict would be refused for.
  if (dirtyAtStart) {
    console.error(
      '[baseline-gate] --update refused: the working tree was dirty when the run started, so this ' +
        'run did not test what HEAD contains.'
    );
    process.exit(2);
  }
  if (nodeModulesBorrowedFrom()) {
    console.error(
      '[baseline-gate] --update refused: dependencies were borrowed from another checkout, so module ' +
        'identity in this run was that checkout, not this tree.'
    );
    process.exit(2);
  }
  const updated = [...failures].filter((id) => !isFlakyFile(id)).sort();
  manifest.stableFailures.count = updated.length;
  manifest.stableFailures.tests = updated;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.error(
    `[baseline-gate] --update: wrote ${updated.length} stable failures to test-baseline.json`
  );
  process.exit(0);
}

console.error(
  `[baseline-gate] total failures=${failures.size} | known-stable=${knownStable.length} | known-flaky=${knownFlaky.length} | NEW=${newFailures.length}`
);

// Emit a receipt bound to the CONTENT of packages/core at HEAD, not to a commit
// sha — so an amend or rebase that leaves core's tree untouched keeps the proof
// valid, while any real change to core invalidates it. This is what lets a
// ~15-minute suite gate a push in milliseconds: the cost is paid once, whenever
// the developer chooses, and the receipt proves it was paid for THIS core tree.
const receiptPath = resolve(coreRoot, '.test-baseline-receipt.json');
const dirty = dirtyAtStart || capturedDirty;

/**
 * True when this tree's dependencies are borrowed from a DIFFERENT checkout.
 *
 * A HoloRepo candidate worktree ships no `node_modules`, so the only way to run
 * anything in one is to junction/symlink another checkout's. pnpm's workspace
 * links inside those then resolve `@holoscript/core/*` back to the tree that
 * OWNS them — so a test importing a module by package specifier and a test
 * importing it by relative path get two different files, and any identity
 * assertion between them fails on structurally identical objects.
 *
 * Measured 2026-08-16 (task_1786942099138_9ad3):
 * `src/traits/__tests__/SharedTraitBarrelPopulation.test.ts` fails in a
 * candidate worktree and passes in the owning checkout, with all 79 package
 * `node_modules` junctioned — so it is not a coverage gap that more links fix.
 * A run under those conditions did not test THIS tree, exactly as a dirty run
 * did not test HEAD, so the receipt records it and the gate refuses it.
 */
function nodeModulesBorrowedFrom() {
  try {
    const link = resolve(coreRoot, 'node_modules');
    const real = realpathSync.native(link);
    const owner = realpathSync.native(coreRoot);
    // Same tree: the realpath of core/node_modules sits under core itself.
    if (real === resolve(owner, 'node_modules')) return null;
    return real;
  } catch {
    // No node_modules at all, or an unreadable link. Either way we cannot show
    // it was borrowed, and the suite could not have run without deps anyway.
    return null;
  }
}
const borrowedFrom = nodeModulesBorrowedFrom();
try {
  if (NO_RECEIPT) throw new Error('--no-receipt: not writing a push token for this run');
  writeFileSync(
    receiptPath,
    JSON.stringify(
      {
        '//': 'Local proof that the core baseline gate ran for this packages/core tree. Not committed. Consumed by scripts/holo-ci/check-core-baseline-receipt.mjs on pre-push.',
        // v2, and the bump is deliberate. Every v1 receipt was produced by a
        // gate that could not tell a finished run from a crashed one, so no v1
        // receipt is evidence of anything. The pre-push checker rejects an
        // unrecognised schema, which retires them all rather than grandfathering
        // proofs that were never sound.
        schema: 'holoscript.core-baseline-receipt.v2',
        result: newFailures.length > 0 ? 'new-failures' : 'clean',
        // What made the verdict trustworthy, recorded so the pre-push half can
        // check it rather than taking `result` on faith.
        runCompleted: {
          summaries: summaries.length,
          filesCollected: summaries.reduce((n, x) => n + x.total, 0),
          filesReported: summaries.reduce((n, x) => n + x.accounted, 0),
          exitStatusKnown: Boolean(envelope) || liveStatus !== null || liveSignal !== null,
          // failures is per-pass, so the pre-push half can apply the same rule
          // the gate does: a non-zero pass must have failures of its OWN.
          passes: envelope
            ? envelope.passes.map((x) => ({
                label: x.label,
                status: x.status,
                signal: x.signal,
                failures: failuresInPass(x.label),
                // A SKIPPED PASS DID NOT EXIT 0; IT DID NOT EXIT.
                // run-vitest.mjs records a skipped sequential pass with status 0
                // so the arithmetic above stays simple, and dropping the flag
                // here turned that into a receipt asserting a pass ran and
                // succeeded when it never started -- a fabricated success field,
                // the same thing this change removed from the perf dashboard.
                skipped: Boolean(x.skipped),
              }))
            : [{ label: 'live', status: liveStatus, signal: liveSignal, failures: failureLines.length }],
          envelopeTreeSha: envelope ? (envelope.coreTreeSha ?? null) : null,
          // WHAT THIS RECEIPT IS A RECEIPT FOR. Recorded so the pre-push half
          // can refuse a token minted by a partial run rather than trusting
          // that this script already did.
          scope: envelope
            ? { mode: envelope.mode ?? null, runId: envelope.runId ?? null, targets: envelope.targets ?? [] }
            : null,
        },
        coreTreeSha: coreTreeSha(),
        // A run against a dirty tree did not test what HEAD contains, so the
        // receipt records that and the gate refuses to honour it.
        capturedFromDirtyWorkingTree: dirty,
        // Null when this tree owns its dependencies. A path here names the
        // checkout they were borrowed from, which means module identity in this
        // run belonged to that checkout, not this one.
        nodeModulesBorrowedFrom: borrowedFrom,
        totals: {
          failures: failures.size,
          knownStable: knownStable.length,
          knownFlaky: knownFlaky.length,
          new: newFailures.length,
        },
        newFailures: newFailures.sort(),
        source,
        capturedAtIso: new Date().toISOString(),
      },
      null,
      2
    ) + '\n'
  );
} catch (e) {
  console.error(
    NO_RECEIPT
      ? '[baseline-gate] --no-receipt: no receipt written.'
      : `[baseline-gate] warning: could not write receipt: ${e.message}`
  );
}

if (newFailures.length > 0) {
  console.error('\n[baseline-gate] NEW FAILURES (not in baseline — likely regressions):');
  for (const id of newFailures.sort()) console.error(`  ✗ ${id}`);
  console.error(
    '\n[baseline-gate] FAIL — the change introduced failures outside the captured baseline.'
  );
  process.exit(1);
}

console.error(
  '\n[baseline-gate] OK — no failures outside the captured baseline (no new regressions).'
);
if (dirty) {
  console.error(
    '[baseline-gate] NOTE: working tree was dirty — this run did not test what HEAD contains,'
  );
  console.error('[baseline-gate]       so the receipt will not satisfy the pre-push gate.');
  console.error('[baseline-gate]       Commit your changes, then re-run to produce a valid proof.');
}
process.exit(0);
