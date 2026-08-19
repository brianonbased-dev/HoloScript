/* global process */

import assert from 'node:assert/strict';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  canonicalDigest,
  initializePersistentStore,
} from '../model-village-phase0b-runtime.mjs';
import {
  ATOMIC_REPLACEMENT_MIN_REPLACEMENTS,
  ATOMIC_REPLACEMENT_PROBE_SCHEMA,
  ATOMIC_REPLACEMENT_VERDICTS,
  buildValidatorFixture,
  CRASH_DRILL_ENGINE,
  CRASH_DRILL_SCENARIO_EXPECTATIONS,
  CRASH_DRILL_SCENARIOS,
  CRASH_DRILL_SCHEMA,
  deriveRecoveredInFreshProcess,
  isObservedPid,
  ModelVillageCrashDrillError,
  parseSelfReportedPid,
  resolveLocalModuleClosure,
  runAtomicReplacementProbe,
  runCrashDrill,
  runNegativeControl,
  runTornReadProbe,
  runVanishProbe,
  verifyAtomicReplacementProbeReceipt,
  TORN_READ_CALIBRATED_HIT_RATE,
  TORN_READ_MIN_PUBLICATIONS_WITNESSED,
  TORN_READ_PROBE_SCHEMA,
  TORN_READ_REQUIRED_ATTEMPTS,
  TORN_READ_VERDICTS,
  VANISH_MEASURED_HIT_RATE,
  VANISH_MIN_REPLACEMENTS_WITNESSED,
  VANISH_PROBE_SCHEMA,
  VANISH_REQUIRED_POLLS,
  VANISH_VERDICTS,
  verifyCrashDrillReceipt,
  verifyTornReadProbeReceipt,
  verifyVanishProbeReceipt,
} from '../model-village-crash-drill.mjs';

const SCRATCH_ROOT = path.join(
  os.tmpdir(),
  `mv-b5-crash-drill-tests-${randomUUID()}`,
);
mkdirSync(SCRATCH_ROOT, { recursive: true });

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SCENARIO_TIMEOUT_MS = 90000;

after(() => {
  try {
    rmSync(SCRATCH_ROOT, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

function assertCommonReceipt(receipt, scenario) {
  assert.equal(verifyCrashDrillReceipt(receipt), true, 'receipt must self-verify');
  assert.equal(receipt.schema, CRASH_DRILL_SCHEMA);
  assert.equal(receipt.engine, CRASH_DRILL_ENGINE);
  assert.equal(receipt.scenario, scenario);
  assert.equal(receipt.recoveredInFreshProcess, true);

  // Recovery really happened in a FRESH process, and the receipt says so only
  // because three OBSERVED pids say so. -1 / null placeholders are not pids.
  assert.ok(isObservedPid(receipt.workerPid), 'workerPid is an observed pid');
  assert.ok(isObservedPid(receipt.recoveryPid), 'recoveryPid is an observed pid');
  assert.ok(isObservedPid(receipt.harnessPid), 'harnessPid is an observed pid');
  assert.equal(
    receipt.harnessPid,
    process.pid,
    'harnessPid is the process that actually ran the drill',
  );
  assert.notEqual(
    receipt.recoveryPid,
    receipt.workerPid,
    'recovery pid must differ from the crashed worker pid',
  );
  assert.notEqual(
    receipt.recoveryPid,
    receipt.harnessPid,
    'recovery must not have run inside the harness process',
  );
  assert.equal(
    receipt.recoveredInFreshProcess,
    deriveRecoveredInFreshProcess({
      workerPid: receipt.workerPid,
      recoveryPid: receipt.recoveryPid,
      harnessPid: receipt.harnessPid,
    }),
    'the fresh-process claim is derived from the pids, not asserted',
  );

  // The child was really killed: it did NOT exit cleanly.
  const exitedCleanly =
    receipt.workerExitCode === 0 && receipt.workerExitSignal === null;
  assert.ok(!exitedCleanly, 'crash worker must not have exited cleanly');

  assert.ok(
    receipt.storeStateHashAfterRecovery === null
      || SHA256_PATTERN.test(receipt.storeStateHashAfterRecovery),
    'store state hash is sha256 or null',
  );
  assert.ok(
    typeof receipt.observedOutcome === 'string'
      && receipt.observedOutcome.length > 0
      && receipt.observedOutcome.length <= 600,
    'observedOutcome is a bounded non-empty string',
  );
}

for (const scenario of CRASH_DRILL_SCENARIOS) {
  test(
    `scenario ${scenario}: real kill, fresh recovery, honest invariant`,
    { timeout: SCENARIO_TIMEOUT_MS },
    async () => {
      const { receipt } = await runCrashDrill({ scratchRoot: SCRATCH_ROOT, scenario });
      assertCommonReceipt(receipt, scenario);

      const expected = CRASH_DRILL_SCENARIO_EXPECTATIONS[scenario];
      assert.equal(
        receipt.invariantHeld,
        expected,
        `invariantHeld must be ${expected} for ${scenario} — observed: ${receipt.observedOutcome}`,
      );

      // Gap scenarios must be receipted honestly with a gap reference.
      if (expected === false) {
        assert.match(receipt.gapReference, /^G\d+$/, 'gap scenario carries a gapReference');
      } else {
        assert.equal(receipt.gapReference, null, 'recoverable scenario has no gapReference');
      }
    },
  );
}

test('custody-seal recovery is non-vacuous (object was not admitted as valid)', {
  timeout: SCENARIO_TIMEOUT_MS,
}, async () => {
  const { receipt } = await runCrashDrill({
    scratchRoot: SCRATCH_ROOT,
    scenario: 'custody-seal-killed-mid-write',
  });
  assert.equal(receipt.invariantHeld, true);
  assert.match(
    receipt.observedOutcome,
    /not admitted as a valid recorded object/,
    'observedOutcome documents the object was rejected/absent/unrecorded',
  );
});

test('access-log-torn recovery fails closed with a typed integrity error', {
  timeout: SCENARIO_TIMEOUT_MS,
}, async () => {
  const { receipt } = await runCrashDrill({
    scratchRoot: SCRATCH_ROOT,
    scenario: 'access-log-torn-append',
  });
  assert.equal(receipt.invariantHeld, true);
  assert.match(receipt.observedOutcome, /failed closed/i);
});

test('the two formerly-gapped scenarios (G1, G2) now hold and stay unmasked', {
  timeout: SCENARIO_TIMEOUT_MS,
}, async () => {
  // G1: destroyContentKey commits its tombstone FIRST, so a crash after that
  // commit point is rolled forward at open rather than wedging the store.
  const g1 = await runCrashDrill({
    scratchRoot: SCRATCH_ROOT,
    scenario: 'custody-destroy-key-killed-mid-destroy',
  });
  assert.equal(
    g1.receipt.invariantHeld,
    true,
    `G1 must stay fixed — observed: ${g1.receipt.observedOutcome}`,
  );
  assert.equal(g1.receipt.gapReference, null);
  assert.match(g1.receipt.observedOutcome, /rolled FORWARD/);
  assert.match(g1.receipt.observedOutcome, /CustodyKeyDestroyedError/);
  assert.doesNotMatch(g1.receipt.observedOutcome, /REGRESSION/);

  // G2: the phase0b state.lock is pid-stamped, so a lock leaked by a SIGKILLed
  // holder is reclaimed once its recorded pid is proven dead.
  const g2 = await runCrashDrill({
    scratchRoot: SCRATCH_ROOT,
    scenario: 'persistent-state-lock-leak-after-kill',
  });
  assert.equal(
    g2.receipt.invariantHeld,
    true,
    `G2 must stay fixed — observed: ${g2.receipt.observedOutcome}`,
  );
  assert.equal(g2.receipt.gapReference, null);
  assert.match(g2.receipt.observedOutcome, /reclaimed/);
  assert.doesNotMatch(g2.receipt.observedOutcome, /REGRESSION/);
});

test('NEGATIVE CONTROL: recovery checker catches a torn state.json (drill is not vacuous)', {
  timeout: SCENARIO_TIMEOUT_MS,
}, () => {
  const result = runNegativeControl({ scratchRoot: SCRATCH_ROOT });
  assert.equal(
    result.caught,
    true,
    `negative control must catch the corruption; verdict: ${result.verdict.observedOutcome}`,
  );
  assert.equal(result.verdict.invariantHeld, false);
});

test('verifyCrashDrillReceipt rejects a tampered receipt', {
  timeout: SCENARIO_TIMEOUT_MS,
}, async () => {
  const { receipt } = await runCrashDrill({
    scratchRoot: SCRATCH_ROOT,
    scenario: 'persistent-state-killed-after-rename',
  });
  // Flip the invariant without recomputing the hash → must be rejected.
  const tampered = { ...receipt, invariantHeld: !receipt.invariantHeld };
  assert.throws(
    () => verifyCrashDrillReceipt(tampered),
    ModelVillageCrashDrillError,
    'altered receipt must fail hash verification',
  );

  // Extra/missing key → rejected.
  const withExtra = { ...receipt, sneaky: true };
  assert.throws(() => verifyCrashDrillReceipt(withExtra), ModelVillageCrashDrillError);
});

/**
 * Rebuilds a receipt with overrides AND a correctly recomputed receiptHash, so
 * the receipt is internally consistent. Anything that still gets rejected below
 * is rejected on the MEANING of the pids, not because the hash broke.
 */
function reseal(receipt, overrides) {
  const { receiptHash, ...rest } = { ...receipt, ...overrides };
  void receiptHash;
  return { ...rest, receiptHash: canonicalDigest(rest) };
}

test('the fresh-process claim cannot survive a degraded pid (the hardcoded-literal hole)', {
  timeout: SCENARIO_TIMEOUT_MS,
}, async () => {
  const { receipt } = await runCrashDrill({
    scratchRoot: SCRATCH_ROOT,
    scenario: 'persistent-state-killed-after-rename',
  });

  // POSITIVE CONTROL: reseal is faithful. Without this, every rejection below
  // could be nothing but a broken hash, and this test would be vacuous.
  assert.equal(
    verifyCrashDrillReceipt(reseal(receipt, {})),
    true,
    'a resealed but unmodified receipt must still verify',
  );

  // The exact shape the drill used to emit when spawn gave no pid: a -1
  // placeholder next to a hardcoded recoveredInFreshProcess:true. This is the
  // mutation that left the whole gate green at exit 0.
  assert.throws(
    () => verifyCrashDrillReceipt(
      reseal(receipt, { recoveryPid: -1, recoveredInFreshProcess: true }),
    ),
    /recoveryPid must be an observed pid/,
    'a -1 recovery pid must never certify a fresh process',
  );

  // Recovery "in" the harness process is not a fresh process.
  assert.throws(
    () => verifyCrashDrillReceipt(
      reseal(receipt, { recoveryPid: receipt.harnessPid, recoveredInFreshProcess: true }),
    ),
    /disagrees with the observed pids/,
    'recovering in the harness process must not certify a fresh process',
  );

  // Recovery "in" the crashed worker's process is not a fresh process.
  assert.throws(
    () => verifyCrashDrillReceipt(
      reseal(receipt, { recoveryPid: receipt.workerPid, recoveredInFreshProcess: true }),
    ),
    /disagrees with the observed pids/,
    'a pid collision with the crashed worker must not certify a fresh process',
  );

  // A missing harness pid is ABSENT EVIDENCE, and absent evidence blocks.
  assert.throws(
    () => verifyCrashDrillReceipt(reseal(receipt, { harnessPid: 0 })),
    /harnessPid must be an observed pid/,
    'an unobserved harness pid must block the claim',
  );

  // And the claim cannot be flipped away from what the pids derive either.
  assert.throws(
    () => verifyCrashDrillReceipt(reseal(receipt, { recoveredInFreshProcess: false })),
    /disagrees with the observed pids/,
    'the boolean must track the derivation in BOTH directions',
  );
});

test('deriveRecoveredInFreshProcess rejects every non-observed pid shape', () => {
  const good = { workerPid: 111, recoveryPid: 222, harnessPid: 333 };
  assert.equal(deriveRecoveredInFreshProcess(good), true);
  assert.equal(deriveRecoveredInFreshProcess({ ...good, recoveryPid: -1 }), false);
  assert.equal(deriveRecoveredInFreshProcess({ ...good, recoveryPid: 0 }), false);
  assert.equal(deriveRecoveredInFreshProcess({ ...good, recoveryPid: null }), false);
  assert.equal(deriveRecoveredInFreshProcess({ ...good, recoveryPid: 222.5 }), false);
  assert.equal(deriveRecoveredInFreshProcess({ ...good, recoveryPid: 111 }), false);
  assert.equal(deriveRecoveredInFreshProcess({ ...good, recoveryPid: 333 }), false);
  assert.equal(deriveRecoveredInFreshProcess({ ...good, workerPid: -1 }), false);
  assert.equal(deriveRecoveredInFreshProcess({ ...good, harnessPid: -1 }), false);
  // THE ROW THAT WAS MISSING, and its absence was a live hole. `workerPid`
  // degraded to the harness pid derived TRUE, which made the load-bearing
  // `recoveryPid !== workerPid` arm compare against the wrong process and go
  // vacuous. The one-token production mutation
  // (`workerPid: crash.pid` -> `workerPid: harnessPid`) left the whole
  // durability gate green while every drill line reported the gate's own pid as
  // the SIGKILLed crash worker.
  assert.equal(
    deriveRecoveredInFreshProcess({ ...good, workerPid: 333 }),
    false,
    'the harness cannot be the process it SIGKILLed',
  );
  assert.equal(
    deriveRecoveredInFreshProcess({ workerPid: 333, recoveryPid: 333, harnessPid: 333 }),
    false,
  );
  assert.equal(deriveRecoveredInFreshProcess({}), false);
  assert.equal(isObservedPid(-1), false);
  assert.equal(isObservedPid(0), false);
  assert.equal(isObservedPid(process.pid), true);
});

test('runCrashDrill rejects an unknown scenario', async () => {
  await assert.rejects(
    () => runCrashDrill({ scratchRoot: SCRATCH_ROOT, scenario: 'does-not-exist' }),
    ModelVillageCrashDrillError,
  );
});

test('scratch is cleaned up per case (no lingering case dirs)', {
  timeout: SCENARIO_TIMEOUT_MS,
}, async () => {
  const localRoot = path.join(SCRATCH_ROOT, `cleanup-${randomUUID()}`);
  await runCrashDrill({
    scratchRoot: localRoot,
    scenario: 'persistent-state-killed-after-rename',
  });
  // The per-case dir is removed in runCrashDrill's finally; only the root
  // (created by the drill) may remain and it must be empty of case dirs.
  const leftovers = existsSync(localRoot) ? readdirSync(localRoot) : [];
  assert.equal(leftovers.length, 0, `no leftover case dirs: ${leftovers.join(',')}`);
});

test('the G1 ORDERING case really interrupts production code at the commit boundary', {
  timeout: SCENARIO_TIMEOUT_MS,
}, async () => {
  // The completion-then-restore case (custody-destroy-key-killed-mid-destroy)
  // leaves the SAME on-disk state whether the commit record is written first or
  // last, so it can only prove the recovery half of G1. This case interrupts
  // the real destroyContentKey AT the key scrub, which only a commit-first
  // ordering survives — it is the assertion that goes red if the ordering
  // regresses.
  const { receipt } = await runCrashDrill({
    scratchRoot: SCRATCH_ROOT,
    scenario: 'custody-destroy-key-killed-before-key-scrub',
  });
  assertCommonReceipt(receipt, 'custody-destroy-key-killed-before-key-scrub');
  assert.equal(
    receipt.invariantHeld,
    true,
    `ordering must stay fixed — observed: ${receipt.observedOutcome}`,
  );
  assert.equal(receipt.gapReference, null);
  assert.match(receipt.observedOutcome, /rolled FORWARD/);
  assert.doesNotMatch(receipt.observedOutcome, /REGRESSION/);
  // On this host the injected fault must really have interrupted production
  // code; anything else would make the case non-discriminating, and the receipt
  // says which mechanism ran rather than implying coverage it does not have.
  assert.match(
    receipt.observedOutcome,
    /really interrupted AT the key scrub|did NOT discriminate the commit ordering/,
    'the receipt states which mechanism the run achieved',
  );
});

// ---------------------------------------------------------------------------
// TORN-READ PROBE (DEFECT A).
//
// These are the only assertions in this suite that can see the write MECHANISM.
// Everything above passes unchanged when writeAtomicState is replaced by a naive
// direct write — that was measured, not assumed, and the A/B test below is that
// measurement, kept in the suite so it can never quietly stop being true.
// ---------------------------------------------------------------------------

const PROBE_TIMEOUT_MS = 120000;
const RUNTIME_FILE = 'model-village-phase0b-runtime.mjs';
const SCRIPTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The modules a standalone crash-drill tree needs — DERIVED from the two entry
 * files' own relative imports rather than hand-listed. The hand-listed version
 * turned "someone added an import to the runtime" into a wall of
 * ERR_MODULE_NOT_FOUND in drills that have nothing to do with imports.
 *
 * The walk itself is the SHIPPING one, imported from the drill, not a second
 * copy of the same regex living here: two copies is how one of them silently
 * stops matching what the other matches.
 *
 * Fails LOUD by construction: a file that cannot be read is simply not copied,
 * and the drill that needs it dies at the import instead of quietly passing.
 */
const MUTANT_TREE_FILES = Object.freeze(
  resolveLocalModuleClosure(SCRIPTS_DIR, [
    'model-village-crash-drill.mjs',
    RUNTIME_FILE,
  ]),
);

const WRITE_ATOMIC_SIGNATURE =
  "function writeAtomicState(storeDir, state, faultInjection = 'none') {";
const WRITE_ATOMIC_TAIL = '\nconst LOCK_HOLDER_MESSAGE =';

/**
 * The DEFECT A mutation, verbatim: writeAtomicState becomes a naive direct
 * write — no temp file, no fsync, no atomic rename — keeping only the two
 * faultInjection throws so the fault-seam drills behave exactly as before.
 */
const NAIVE_WRITE_ATOMIC_STATE = [
  WRITE_ATOMIC_SIGNATURE,
  "  if (faultInjection === 'before_rename') {",
  "    throw new Error('injected fault before atomic rename');",
  '  }',
  "  writeFileSync(statePath(storeDir), `${canonicalJson(state)}\\n`, 'utf8');",
  "  if (faultInjection === 'after_rename') {",
  "    throw new Error('injected fault after atomic rename');",
  '  }',
  '}',
  '',
].join('\n');

/**
 * Builds a throwaway copy of the crash-drill tree whose writeAtomicState is the
 * naive direct write, and returns its crash-drill module URL. Fails LOUD if the
 * anchors are gone: a refactor that moves writeAtomicState must break this test
 * rather than silently turn it into a no-op that "passes".
 */
function buildWriteAtomicMutantTree(label, bodySource, assertMutated) {
  const dir = mkdtempSync(path.join(os.tmpdir(), `mv-b5-${label}-mutant-`));
  for (const file of MUTANT_TREE_FILES) {
    copyFileSync(path.join(SCRIPTS_DIR, file), path.join(dir, file));
  }
  const runtimePath = path.join(dir, RUNTIME_FILE);
  const source = readFileSync(runtimePath, 'utf8');
  const start = source.indexOf(WRITE_ATOMIC_SIGNATURE);
  const end = source.indexOf(WRITE_ATOMIC_TAIL);
  assert.ok(
    start !== -1 && end > start,
    `the ${label} mutation anchors must still exist in the production runtime; `
    + 'if writeAtomicState moved, this A/B proof must be repaired, not skipped',
  );
  const mutated = source.slice(0, start) + bodySource + source.slice(end);
  assertMutated(mutated);
  writeFileSync(runtimePath, mutated, 'utf8');
  return { dir, moduleUrl: pathToFileURL(path.join(dir, 'model-village-crash-drill.mjs')).href };
}

function buildNaiveWriteMutantTree() {
  return buildWriteAtomicMutantTree('naive-write', NAIVE_WRITE_ATOMIC_STATE, (mutated) => {
    assert.ok(!mutated.includes('renameSync(temporary, target)'), 'the atomic rename is gone');
    assert.ok(mutated.includes('writeFileSync(statePath(storeDir)'), 'the naive write is in');
  });
}

/**
 * DEFECT A' (adversarial review FINDING A): atomic on CREATE, naive on REPLACE.
 * This is the mutation that exposed the torn-read probe as a CREATE-path probe:
 * initializePersistentStore refuses a live store, so every write the torn-read
 * harness can drive takes the create branch below and never the replace branch.
 */
const REPLACE_NAIVE_ATOMIC_STATE = [
  WRITE_ATOMIC_SIGNATURE,
  '  const target = statePath(storeDir);',
  '  if (existsSync(target)) {',
  "    if (faultInjection === 'before_rename') {",
  "      throw new Error('injected fault before atomic rename');",
  '    }',
  "    writeFileSync(target, `${canonicalJson(state)}\\n`, 'utf8');",
  "    if (faultInjection === 'after_rename') {",
  "      throw new Error('injected fault after atomic rename');",
  '    }',
  '    return;',
  '  }',
  '  const temporary = path.join(',
  '    storeDir,',
  '    `.state-${process.pid}-${randomUUID()}.tmp`,',
  '  );',
  "  const descriptor = openSync(temporary, 'wx');",
  '  let renamed = false;',
  '  try {',
  "    writeFileSync(descriptor, `${canonicalJson(state)}\\n`, 'utf8');",
  '    fsyncSync(descriptor);',
  '    closeSync(descriptor);',
  "    if (faultInjection === 'before_rename') {",
  "      throw new Error('injected fault before atomic rename');",
  '    }',
  '    renameSync(temporary, target);',
  '    renamed = true;',
  "    if (faultInjection === 'after_rename') {",
  "      throw new Error('injected fault after atomic rename');",
  '    }',
  '  } catch (error) {',
  '    try {',
  '      closeSync(descriptor);',
  '    } catch {',
  '      // Descriptor was already closed.',
  '    }',
  '    if (!renamed && existsSync(temporary)) unlinkSync(temporary);',
  '    throw error;',
  '  }',
  '}',
  '',
].join('\n');

/**
 * G-VANISH (adversarial review FINDING B): the standard "Windows will not
 * rename over an existing file" workaround, placed AFTER the before_rename
 * fault check. Identity still changes, so the atomic-replacement probe reads it
 * as atomic; the file is briefly absent, which the torn-read probe counts as
 * evidence the race happened rather than as a defect.
 */
const UNLINK_BEFORE_RENAME_ATOMIC_STATE = [
  WRITE_ATOMIC_SIGNATURE,
  '  const target = statePath(storeDir);',
  '  const temporary = path.join(',
  '    storeDir,',
  '    `.state-${process.pid}-${randomUUID()}.tmp`,',
  '  );',
  "  const descriptor = openSync(temporary, 'wx');",
  '  let renamed = false;',
  '  try {',
  "    writeFileSync(descriptor, `${canonicalJson(state)}\\n`, 'utf8');",
  '    fsyncSync(descriptor);',
  '    closeSync(descriptor);',
  "    if (faultInjection === 'before_rename') {",
  "      throw new Error('injected fault before atomic rename');",
  '    }',
  '    if (existsSync(target)) unlinkSync(target);',
  '    renameSync(temporary, target);',
  '    renamed = true;',
  "    if (faultInjection === 'after_rename') {",
  "      throw new Error('injected fault after atomic rename');",
  '    }',
  '  } catch (error) {',
  '    try {',
  '      closeSync(descriptor);',
  '    } catch {',
  '      // Descriptor was already closed.',
  '    }',
  '    if (!renamed && existsSync(temporary)) unlinkSync(temporary);',
  '    throw error;',
  '  }',
  '}',
  '',
].join('\n');

/**
 * G-VANISH RESIDUAL 6: the CONDITIONAL form of the same win32 workaround,
 * gated on the rename genuinely THROWING rather than firing unconditionally
 * on every write. This is the pattern the gap register calls "a strictly more
 * likely real-world form of this defect": `try { rename } catch { if
 * (existsSync(target)) unlink(target); rename }`. It is invisible to every
 * Node-only probe in this file (torn-read, atomic-replacement, vanish)
 * because none of them can make `renameSync` itself throw -- Node always
 * opens with FILE_SHARE_DELETE, so a Node reader/prober can never deny the
 * writer delete access. Exercising this mutant for real needs a NON-Node
 * actor holding the target open without FILE_SHARE_DELETE; see
 * `spawnNonNodeExclusiveLocker` and the "REAL" test below.
 *
 * `renameFailureCatchState` is a sentinel bumped ONLY from inside the catch,
 * with the real errno recorded, so a passing test that never actually
 * triggered the first rename failure cannot be mistaken for a real repro.
 */
const RENAME_FAILURE_CONDITIONAL_UNLINK_ATOMIC_STATE = [
  WRITE_ATOMIC_SIGNATURE,
  '  const target = statePath(storeDir);',
  '  const temporary = path.join(',
  '    storeDir,',
  '    `.state-${process.pid}-${randomUUID()}.tmp`,',
  '  );',
  "  const descriptor = openSync(temporary, 'wx');",
  '  let renamed = false;',
  '  try {',
  "    writeFileSync(descriptor, `${canonicalJson(state)}\\n`, 'utf8');",
  '    fsyncSync(descriptor);',
  '    closeSync(descriptor);',
  "    if (faultInjection === 'before_rename') {",
  "      throw new Error('injected fault before atomic rename');",
  '    }',
  '    try {',
  '      renameSync(temporary, target);',
  '    } catch (renameError) {',
  '      renameFailureCatchState.hits += 1;',
  '      renameFailureCatchState.errnoSamples.push(',
  '        renameError && renameError.code ? renameError.code : String(renameError),',
  '      );',
  '      if (existsSync(target)) unlinkSync(target);',
  '      renameSync(temporary, target);',
  '    }',
  '    renamed = true;',
  "    if (faultInjection === 'after_rename') {",
  "      throw new Error('injected fault after atomic rename');",
  '    }',
  '  } catch (error) {',
  '    try {',
  '      closeSync(descriptor);',
  '    } catch {',
  '      // Descriptor was already closed.',
  '    }',
  '    if (!renamed && existsSync(temporary)) unlinkSync(temporary);',
  '    throw error;',
  '  }',
  '}',
  'export const renameFailureCatchState = { errnoSamples: [], hits: 0 };',
  'export { statePath, writeAtomicState };',
  '',
].join('\n');

function buildRenameFailureConditionalUnlinkMutantTree() {
  return buildWriteAtomicMutantTree(
    'rename-failure-conditional-unlink',
    RENAME_FAILURE_CONDITIONAL_UNLINK_ATOMIC_STATE,
    (mutated) => {
      assert.ok(
        /catch \(renameError\) \{[\s\S]*?if \(existsSync\(target\)\) unlinkSync\(target\);\s*\n\s*renameSync/
          .test(mutated),
        'the conditional unlink sits inside the rename-failure catch, immediately before the retry',
      );
      assert.ok(
        mutated.includes('export { statePath, writeAtomicState };'),
        'the test-only seam is exported',
      );
    },
  );
}

/**
 * Spawns a REAL non-Node process (PowerShell / .NET) that opens `targetPath`
 * with FileAccess.Read + FileShare.Read only -- i.e. it does NOT request
 * FILE_SHARE_DELETE, the one share mode Node's own fs calls always request.
 * This is the only way to make a Node `renameSync()` targeting that path
 * genuinely throw on win32 (verified standalone: EPERM on rename, EBUSY on
 * unlink, both real OS-level denials, not simulated).
 *
 * Resolves once the lock is confirmed established (a ready-marker file
 * exists on disk, written by the PowerShell process itself). Returns
 * `release()` (signals the PowerShell process to close its handle and exit,
 * and waits for it) and `waitEstablished()`.
 */
function spawnNonNodeExclusiveLocker(targetPath) {
  const readyMarker = `${targetPath}.locker-ready`;
  const releaseMarker = `${targetPath}.locker-release`;
  for (const marker of [readyMarker, releaseMarker]) {
    try {
      if (existsSync(marker)) unlinkSync(marker);
    } catch {
      /* best-effort */
    }
  }
  const escapeForPs = (value) => value.replace(/'/g, "''");
  const psScript = [
    `$fs = [System.IO.File]::Open('${escapeForPs(targetPath)}', `
      + '[System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, '
      + '[System.IO.FileShare]::Read)',
    `New-Item -Path '${escapeForPs(readyMarker)}' -ItemType File -Force | Out-Null`,
    `while (-not (Test-Path '${escapeForPs(releaseMarker)}')) { Start-Sleep -Milliseconds 20 }`,
    '$fs.Close()',
  ].join('\n');
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', psScript],
    { stdio: 'ignore', windowsHide: true },
  );
  const exited = new Promise((resolve) => {
    child.on('exit', (code) => resolve(code));
    child.on('error', (error) => resolve(`spawn-error:${error.code || error.message}`));
  });
  return {
    exited,
    async release() {
      try {
        writeFileSync(releaseMarker, 'release', 'utf8');
      } catch {
        /* best-effort */
      }
      await exited;
      for (const marker of [readyMarker, releaseMarker]) {
        try {
          if (existsSync(marker)) unlinkSync(marker);
        } catch {
          /* best-effort */
        }
      }
    },
    async waitEstablished(deadlineMs = 10000) {
      const deadline = Date.now() + deadlineMs;
      while (!existsSync(readyMarker)) {
        if (Date.now() > deadline) {
          throw new Error(
            'powershell locker did not establish its exclusive lock before the deadline',
          );
        }
        await delay(15);
      }
    },
  };
}

test(
  'CONTROL: renameSync over an EXISTING, UNLOCKED target succeeds on this host '
    + '(the workaround is not needed merely because the target exists)',
  () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'mv-b5-residual6-baseline-'));
    try {
      const target = path.join(dir, 'state.json');
      const temp = path.join(dir, 'state.tmp');
      writeFileSync(target, 'original\n', 'utf8');
      writeFileSync(temp, 'replacement\n', 'utf8');
      // Plain node:fs semantics -- no mutant needed to establish this control.
      renameSync(temp, target);
      assert.equal(readFileSync(target, 'utf8'), 'replacement\n');
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  },
);

test('torn-read probe: the REAL writeAtomicState never lets a reader see a partial state', {
  timeout: PROBE_TIMEOUT_MS,
}, async () => {
  const { receipt } = await runTornReadProbe({
    scratchRoot: path.join(SCRATCH_ROOT, `torn-read-${randomUUID()}`),
  });
  assert.equal(verifyTornReadProbeReceipt(receipt), true, 'probe receipt self-verifies');
  assert.equal(receipt.schema, TORN_READ_PROBE_SCHEMA);
  assert.equal(
    receipt.verdict,
    TORN_READ_VERDICTS.HELD,
    `atomic replacement must hold — observed: ${JSON.stringify(receipt.observed)} `
    + `unmeasured: ${receipt.unmeasuredReasons.join('; ')}`,
  );
  assert.equal(receipt.hits, 0);
  assert.equal(receipt.observed.readsTorn, 0);
  assert.deepEqual(receipt.unmeasuredReasons, []);

  // The race must be PROVEN to have happened; "no tear seen" over no race is the
  // exact false green this probe exists to remove.
  assert.equal(receipt.observed.writerSignalledFirstWrite, true);
  assert.equal(receipt.observed.writerExitedEarly, false);
  assert.equal(receipt.observed.writerExitSignal, 'SIGKILL', 'the writer was really killed');
  assert.equal(receipt.observed.readersReporting, receipt.observed.readerCount);
  assert.ok(
    receipt.observed.publicationsWitnessed >= TORN_READ_MIN_PUBLICATIONS_WITNESSED,
    `readers witnessed ${receipt.observed.publicationsWitnessed} completed replacements`,
  );
  assert.ok(
    receipt.observed.publicationWindowAttempts >= TORN_READ_REQUIRED_ATTEMPTS,
    `${receipt.observed.publicationWindowAttempts} in-window attempts >= the power floor`,
  );
  assert.ok(
    receipt.power.detectionAtCalibratedRate >= 0.95,
    'the run reached >=95% detection at the calibrated hit rate',
  );
});

test('NON-VACUITY, EXECUTED: the probe goes VIOLATED against a naive direct write', {
  timeout: PROBE_TIMEOUT_MS,
}, async () => {
  // This is the whole point of the probe, and it is RUN rather than argued: a
  // real tree whose writeAtomicState has no temp file, no fsync and no rename.
  // Against that tree every OTHER gate in this slice stays green — measured —
  // so if this assertion ever stops firing, the probe has become decoration.
  const { dir, moduleUrl } = buildNaiveWriteMutantTree();
  try {
    const mutant = await import(moduleUrl);
    const { receipt } = await mutant.runTornReadProbe({
      scratchRoot: path.join(dir, 'scratch'),
    });
    assert.equal(
      receipt.verdict,
      mutant.TORN_READ_VERDICTS.VIOLATED,
      'a naive direct write MUST be caught — observed: '
      + `${JSON.stringify(receipt.observed)}`,
    );
    assert.ok(receipt.hits > 0, `at least one torn read (got ${receipt.hits})`);
    assert.ok(receipt.observed.tornSamples.length > 0, 'the tear is sampled, not just counted');
    assert.match(
      receipt.observed.tornSamples.join(' | '),
      /SyntaxError|Error/,
      'the sample names the real parse/validation failure the reader hit',
    );
    // The gap receipt must still be a VALID receipt: a real defect is receipted
    // honestly, never rejected as malformed and quietly dropped.
    assert.equal(mutant.verifyTornReadProbeReceipt(receipt), true);

    // And the measured hit rate must be in the neighbourhood of the calibration
    // the power constant was derived from. A rate that collapsed by orders of
    // magnitude would mean n is no longer sized for this defect class.
    const measured = receipt.observed.readsTorn / receipt.observed.publicationWindowAttempts;
    assert.ok(
      measured > TORN_READ_CALIBRATED_HIT_RATE / 10,
      `measured hit rate ${measured.toExponential(3)} must not have collapsed far below `
      + `the calibrated ${TORN_READ_CALIBRATED_HIT_RATE.toExponential(3)} that sized n`,
    );
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test('a run that cannot reach its power floor reports UNMEASURED, never HELD', {
  timeout: PROBE_TIMEOUT_MS,
}, async () => {
  // An attempt floor no run can reach in the deadline. The honest answer is
  // "could not measure", and it must NOT look like success.
  const { receipt } = await runTornReadProbe({
    scratchRoot: path.join(SCRATCH_ROOT, `torn-read-unmeasured-${randomUUID()}`),
    requiredAttempts: 50000000,
    deadlineMs: 4000,
  });
  assert.equal(receipt.verdict, TORN_READ_VERDICTS.UNMEASURED);
  assert.equal(receipt.hits, 0, 'no tear was seen — and that is exactly why it proves nothing');
  assert.ok(receipt.unmeasuredReasons.length > 0, 'the reason is stated');
  assert.match(receipt.unmeasuredReasons.join(' '), /in-window read attempts/);
  assert.equal(
    receipt.power.attemptsAchieved,
    receipt.observed.publicationWindowAttempts,
    'the reported power is derived from the attempts this run actually made',
  );
  assert.ok(
    receipt.power.attemptsAchieved < receipt.power.requiredAttempts,
    'the run genuinely fell short of its own floor',
  );
  assert.equal(verifyTornReadProbeReceipt(receipt), true, 'an UNMEASURED receipt is still valid');

  // Launder it into a HELD claim, re-signed exactly the way the harness signs.
  // The verdict re-derivation lets this one through (no hits, no reasons), and
  // the HELD PRECONDITIONS are what must catch it.
  const unsigned = { ...receipt, unmeasuredReasons: [], verdict: TORN_READ_VERDICTS.HELD };
  delete unsigned.receiptHash;
  const laundered = { ...unsigned, receiptHash: canonicalDigest(unsigned) };
  assert.throws(
    () => verifyTornReadProbeReceipt(laundered),
    /without meeting every measurement precondition/,
    'an under-powered run may not be relabelled HELD',
  );
});

test('a torn-read receipt with no observations at all cannot claim HELD', {
  timeout: PROBE_TIMEOUT_MS,
}, async () => {
  // The purest vacuous receipt: nothing ran, nothing was seen, everything zero.
  // "0 tears in 0 attempts" must never be a pass.
  const { receipt } = await runTornReadProbe({
    scratchRoot: path.join(SCRATCH_ROOT, `torn-read-vacuous-${randomUUID()}`),
    requiredAttempts: 50000000,
    deadlineMs: 4000,
  });
  const zeroed = {
    ...receipt,
    observed: {
      ...receipt.observed,
      readsAbsent: 0,
      readsComplete: 0,
      readsTorn: 0,
      readsTotal: 0,
      readsTransient: 0,
      publicationWindowAttempts: 0,
      publicationsWitnessed: 0,
      tornSamples: [],
    },
    power: {
      ...receipt.power,
      attemptsAchieved: 0,
      detectionAtCalibratedRate: 0,
      minimumHitRateStillDetectedAt95: 1,
    },
    unmeasuredReasons: [],
    verdict: TORN_READ_VERDICTS.HELD,
  };
  delete zeroed.receiptHash;
  const signed = { ...zeroed, receiptHash: canonicalDigest(zeroed) };
  assert.throws(
    () => verifyTornReadProbeReceipt(signed),
    /without meeting every measurement precondition/,
    'zero attempts is not zero tears',
  );
});

test('verifyTornReadProbeReceipt re-derives the verdict and rejects tampering', {
  timeout: PROBE_TIMEOUT_MS,
}, async () => {
  const { receipt } = await runTornReadProbe({
    scratchRoot: path.join(SCRATCH_ROOT, `torn-read-tamper-${randomUUID()}`),
    requiredAttempts: 50000000,
    deadlineMs: 4000,
  });

  // Unsigned edit → hash check.
  assert.throws(
    () => verifyTornReadProbeReceipt({ ...receipt, hits: 7 }),
    ModelVillageCrashDrillError,
  );
  // Extra key → closed-key check.
  assert.throws(
    () => verifyTornReadProbeReceipt({ ...receipt, sneaky: true }),
    ModelVillageCrashDrillError,
  );

  // A re-signed receipt whose observations say VIOLATED but whose verdict says
  // HELD: the verdict is recomputed from the counters, so this cannot survive.
  const hidden = {
    ...receipt,
    hits: 0,
    observed: {
      ...receipt.observed,
      readsTorn: 4,
      readsTotal: receipt.observed.readsTotal + 4,
      publicationWindowAttempts: receipt.observed.publicationWindowAttempts + 4,
    },
    unmeasuredReasons: [],
    verdict: TORN_READ_VERDICTS.HELD,
  };
  delete hidden.receiptHash;
  assert.throws(
    () => verifyTornReadProbeReceipt({ ...hidden, receiptHash: canonicalDigest(hidden) }),
    /does not equal the observed tear count|disagrees with its own observations/,
    'a hidden tear must not verify',
  );

  // Inflating the power block without the attempts to back it is rejected: the
  // power numbers are recomputed from publicationWindowAttempts, never trusted.
  const inflated = {
    ...receipt,
    power: { ...receipt.power, attemptsAchieved: receipt.power.requiredAttempts },
  };
  delete inflated.receiptHash;
  assert.throws(
    () => verifyTornReadProbeReceipt({ ...inflated, receiptHash: canonicalDigest(inflated) }),
    /does not recompute from the achieved attempts/,
    'power must be earned, not declared',
  );
});

test('a torn tombstone append is repaired while a torn access-log tail still fails closed', {
  timeout: SCENARIO_TIMEOUT_MS,
}, async () => {
  const torn = await runCrashDrill({
    scratchRoot: SCRATCH_ROOT,
    scenario: 'custody-tombstone-torn-append',
  });
  assert.equal(
    torn.receipt.invariantHeld,
    true,
    `a torn tombstone must not wedge the store — observed: ${torn.receipt.observedOutcome}`,
  );
  assert.match(torn.receipt.observedOutcome, /exactly one valid line/);
  assert.match(torn.receipt.observedOutcome, /re-emitted from the committed destroy-key/);

  // The authenticated record keeps the OPPOSITE behaviour, on purpose.
  const log = await runCrashDrill({
    scratchRoot: SCRATCH_ROOT,
    scenario: 'access-log-torn-append',
  });
  assert.equal(log.receipt.invariantHeld, true);
  assert.match(log.receipt.observedOutcome, /failed closed/i);
  assert.match(log.receipt.observedOutcome, /no auto-truncate/i);
});

// ---------------------------------------------------------------------------
// ATOMIC-REPLACEMENT PROBE (closes DEFECT A' — the torn-read probe above races
// the CREATE path only) and the two blind spots that remain, pinned by
// execution so the gap register cannot drift away from what is true.
// ---------------------------------------------------------------------------

test('atomic-replacement probe: the production commit path replaces, never rewrites in place', {
  timeout: PROBE_TIMEOUT_MS,
}, async () => {
  const { receipt } = await runAtomicReplacementProbe({
    scratchRoot: path.join(SCRATCH_ROOT, `atomic-replacement-${randomUUID()}`),
  });
  assert.equal(verifyAtomicReplacementProbeReceipt(receipt), true, 'receipt self-verifies');
  assert.equal(receipt.schema, ATOMIC_REPLACEMENT_PROBE_SCHEMA);
  assert.equal(
    receipt.verdict,
    ATOMIC_REPLACEMENT_VERDICTS.HELD,
    `replacement must hold — observed: ${JSON.stringify(receipt.observed)} `
    + `unmeasured: ${receipt.unmeasuredReasons.join('; ')}`,
  );
  assert.equal(receipt.hits, 0);
  assert.deepEqual(receipt.unmeasuredReasons, []);

  // The comparator is CONTROLLED, not trusted: a host where ino/birthtime could
  // not discriminate would otherwise produce a confident wrong answer.
  assert.equal(receipt.observed.comparatorControl.inPlaceRewriteReadsAsSameFile, true);
  assert.equal(receipt.observed.comparatorControl.atomicReplaceReadsAsNewFile, true);
  // The branch under test really was the target-PRESENT branch.
  assert.ok(receipt.observed.replacementsExecuted >= ATOMIC_REPLACEMENT_MIN_REPLACEMENTS);
  assert.equal(
    receipt.observed.replacementsWithTargetPresent,
    receipt.observed.replacementsExecuted,
    'every measured replacement ran with the target present',
  );
  assert.equal(receipt.observed.inPlaceRewritesObserved, 0);
  // The fault seam G-EXPORT called undrivable is driven, on the replacement path.
  assert.equal(receipt.observed.faultBeforeRenameThrew, true);
  assert.equal(receipt.observed.faultBeforeRenameLeftTargetIntact, true);
  assert.equal(receipt.observed.faultAfterRenameThrew, true);
  assert.equal(receipt.observed.faultAfterRenamePublished, true);
  // The seam is provably the shipping bytes plus one appended export line.
  assert.match(receipt.observed.seamShippedRuntimeSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    receipt.observed.seamShippedRuntimeSha256,
    createHash('sha256')
      .update(readFileSync(path.join(SCRIPTS_DIR, RUNTIME_FILE), 'utf8'), 'utf8')
      .digest('hex'),
    'the recorded seam hash is the hash of the SHIPPING runtime file',
  );
  assert.equal(
    receipt.observed.seamAppendedBytes,
    'export { writeAtomicState };'.length + 2,
    'exactly one appended line, and its length is recorded',
  );
});

test('NON-VACUITY, EXECUTED: atomic-replacement goes VIOLATED on the create-atomic/replace-naive mutant', {
  timeout: PROBE_TIMEOUT_MS,
}, async () => {
  // FINDING A of the second adversarial review, run rather than argued. This
  // mutant is atomic on create and naive on replace, so it is INVISIBLE to the
  // torn-read probe (which can only drive the create path) while breaking the
  // exact property the receipt names. Both halves are asserted here: the new
  // probe catches it, and the old one does not. If the second assertion ever
  // starts failing, G-TORNREAD item (0) has become wrong and must be rewritten.
  const { dir, moduleUrl } = buildWriteAtomicMutantTree(
    'replace-naive',
    REPLACE_NAIVE_ATOMIC_STATE,
    (mutated) => {
      assert.ok(mutated.includes('if (existsSync(target)) {'), 'the replace branch is in');
      assert.ok(mutated.includes('renameSync(temporary, target)'), 'the create path stays atomic');
    },
  );
  try {
    const mutant = await import(moduleUrl);
    const replacement = await mutant.runAtomicReplacementProbe({
      scratchRoot: path.join(dir, 'scratch-replacement'),
    });
    assert.equal(
      replacement.receipt.verdict,
      mutant.ATOMIC_REPLACEMENT_VERDICTS.VIOLATED,
      'a naive REPLACE must be caught — observed: '
      + `${JSON.stringify(replacement.receipt.observed)}`,
    );
    assert.ok(
      replacement.receipt.observed.inPlaceRewritesObserved
        >= ATOMIC_REPLACEMENT_MIN_REPLACEMENTS,
      'every replacement rewrote the same file object',
    );
    assert.match(replacement.receipt.observed.sampleDetail, /SAME file object/);
    // A real defect is receipted honestly, never rejected as malformed.
    assert.equal(mutant.verifyAtomicReplacementProbeReceipt(replacement.receipt), true);

    // The other half of the finding: the torn-read probe is blind to it.
    const torn = await mutant.runTornReadProbe({
      scratchRoot: path.join(dir, 'scratch-torn'),
    });
    assert.equal(
      torn.receipt.verdict,
      mutant.TORN_READ_VERDICTS.HELD,
      'DOCUMENTED (G-TORNREAD item 0): the torn-read probe races the CREATE '
      + 'path, so it cannot see a naive REPLACE. If this now fails, the probe '
      + 'got stronger and the gap entry is stale.',
    );
    assert.equal(torn.receipt.hits, 0);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

// ---------------------------------------------------------------------------
// VANISH PROBE (G-VANISH).
//
// The third probe. The two tests below are an A/B pair and both halves matter:
// the vanish probe must CATCH the unlink-before-rename mutant, and the other two
// probes must still MISS it. The second half is not decoration — it is the
// standing proof that this probe is measuring a property nothing else in the
// slice covers. If it ever starts passing, the gap entry is stale and must be
// rewritten rather than left to look closed by accident.
// ---------------------------------------------------------------------------

test('vanish probe: the REAL writeAtomicState never lets a reader see the state file absent', {
  timeout: PROBE_TIMEOUT_MS,
}, async () => {
  const { receipt } = await runVanishProbe({
    scratchRoot: path.join(SCRATCH_ROOT, `vanish-${randomUUID()}`),
  });
  assert.equal(verifyVanishProbeReceipt(receipt), true, 'probe receipt self-verifies');
  assert.equal(receipt.schema, VANISH_PROBE_SCHEMA);
  assert.equal(
    receipt.verdict,
    VANISH_VERDICTS.HELD,
    `continuous publication must hold — observed: ${JSON.stringify(receipt.observed)} `
    + `unmeasured: ${receipt.unmeasuredReasons.join('; ')}`,
  );
  assert.equal(receipt.hits, 0);
  assert.equal(receipt.observed.pollsVanished, 0);
  assert.deepEqual(receipt.unmeasuredReasons, []);

  // The detector must be able to SEE the hit class it is ruling out, measured
  // in-run rather than assumed from the A/B test below (which only runs under
  // `node --test`, never in the gate).
  assert.equal(receipt.observed.detectorControl.absentClassifiedAsVanished, true);
  assert.equal(receipt.observed.detectorControl.presentClassifiedAsPresent, true);
  assert.equal(receipt.observed.detectorControl.identityDiscriminatesReplacement, true);

  // The race must be PROVEN to have happened, reader-side.
  assert.equal(receipt.observed.writerSignalledFirstReplacement, true);
  assert.equal(receipt.observed.writerExitedEarly, false);
  assert.equal(receipt.observed.readersEstablished, receipt.observed.readerCount);
  assert.ok(
    receipt.observed.replacementsWitnessed >= VANISH_MIN_REPLACEMENTS_WITNESSED,
    `readers witnessed ${receipt.observed.replacementsWitnessed} distinct state file objects`,
  );
  assert.ok(
    receipt.observed.pollsTotal >= VANISH_REQUIRED_POLLS,
    `${receipt.observed.pollsTotal} polls >= the power floor`,
  );
  assert.equal(
    receipt.observed.pollsOther,
    0,
    'no poll returned a code the classifier could not name',
  );
  assert.ok(receipt.power.detectionAtMeasuredRate >= 0.95);
});

test('G-VANISH, IN SCOPE: the vanish probe goes VIOLATED on unlink-before-rename', {
  timeout: PROBE_TIMEOUT_MS,
}, async () => {
  // THE ACCEPTANCE MUTATION for G-VANISH: the standard win32 "cannot rename over
  // an existing file" workaround, placed after the before_rename fault check so
  // no crash drill can see it. It is a genuine durability defect — a crash
  // between the unlink and the rename leaves NO state.json at all — and until
  // this probe existed nothing in the slice could tell it from the real thing.
  const { dir, moduleUrl } = buildWriteAtomicMutantTree(
    'unlink-before-rename',
    UNLINK_BEFORE_RENAME_ATOMIC_STATE,
    (mutated) => {
      assert.ok(
        /if \(existsSync\(target\)\) unlinkSync\(target\);\s*\n\s*renameSync/.test(mutated),
        'the unlink sits immediately before the rename',
      );
    },
  );
  try {
    const mutant = await import(moduleUrl);
    const vanish = await mutant.runVanishProbe({
      scratchRoot: path.join(dir, 'scratch-vanish'),
    });
    assert.equal(
      vanish.receipt.verdict,
      mutant.VANISH_VERDICTS.VIOLATED,
      'the unlink window MUST be caught — observed: '
      + `${JSON.stringify(vanish.receipt.observed)}`,
    );
    assert.ok(vanish.receipt.hits > 0, `at least one vanish (got ${vanish.receipt.hits})`);
    assert.ok(
      vanish.receipt.observed.vanishedSamples.length > 0,
      'the disappearance is sampled by errno, not just counted',
    );
    assert.match(
      vanish.receipt.observed.vanishedSamples.join(' | '),
      /ENOENT/,
      'the sample names ENOENT — the entry was GONE, not merely delete-pending',
    );
    // A real defect is receipted honestly, never rejected as malformed.
    assert.equal(mutant.verifyVanishProbeReceipt(vanish.receipt), true);

    // The measured rate must not have collapsed far below the calibration the
    // poll floor was derived from; if it has, n is no longer sized for this
    // defect class and the constant must be re-measured rather than trusted.
    const measured = vanish.receipt.observed.pollsVanished / vanish.receipt.observed.pollsTotal;
    assert.ok(
      measured > VANISH_MEASURED_HIT_RATE / 10,
      `measured vanish rate ${measured.toExponential(3)} must not have collapsed far `
      + `below the calibrated ${VANISH_MEASURED_HIT_RATE.toExponential(3)} that sized n`,
    );
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test('G-VANISH residual: the OTHER two probes are still blind to unlink-before-rename', {
  timeout: PROBE_TIMEOUT_MS,
}, async () => {
  // The half of the finding that is NOT closed, kept executed so the claim
  // boundary cannot drift. If either assertion starts failing, that probe got
  // stronger and the claim boundary must be rewritten.
  const { dir, moduleUrl } = buildWriteAtomicMutantTree(
    'unlink-before-rename-residual',
    UNLINK_BEFORE_RENAME_ATOMIC_STATE,
    (mutated) => {
      assert.ok(
        /if \(existsSync\(target\)\) unlinkSync\(target\);\s*\n\s*renameSync/.test(mutated),
        'the unlink sits immediately before the rename',
      );
    },
  );
  try {
    const mutant = await import(moduleUrl);
    const replacement = await mutant.runAtomicReplacementProbe({
      scratchRoot: path.join(dir, 'scratch-replacement'),
    });
    assert.equal(
      replacement.receipt.verdict,
      mutant.ATOMIC_REPLACEMENT_VERDICTS.HELD,
      'DOCUMENTED (G-VANISH residual): unlink+rename still yields a NEW file '
      + 'object, so the identity comparator reads it as atomic',
    );
    const torn = await mutant.runTornReadProbe({
      scratchRoot: path.join(dir, 'scratch-torn'),
    });
    assert.equal(
      torn.receipt.verdict,
      mutant.TORN_READ_VERDICTS.HELD,
      'DOCUMENTED (G-VANISH residual): the torn-read probe counts ENOENT as '
      + 'evidence the race happened, so a wider disappearance window makes it '
      + 'MORE confident',
    );
    assert.equal(torn.receipt.hits, 0);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

// ---------------------------------------------------------------------------
// G-VANISH RESIDUAL 6: "a rename-failure-conditional window is out of reach
// of this probe" -- the CONDITIONAL win32 workaround (`try { rename } catch {
// if (existsSync(target)) unlink(target); rename }`) that only opens its
// hazard window when renameSync genuinely THROWS. Node cannot ever provoke
// that on itself (FILE_SHARE_DELETE), so closing this residual needs a REAL
// non-Node actor. The two tests below are deliberately split:
//   REAL           -- proves the catch branch is reachable at all, using a
//                     genuine external lock and a real captured errno. This
//                     is the part no Node-only probe in this file can do.
//   CHARACTERIZED  -- proves what the catch branch does once reached: it
//                     deterministically reproduces the intermediate on-disk
//                     state its own two statements (unlink, then retry
//                     rename) would leave if a real crash landed between
//                     them, the same way the codebase's own SIGKILL-based
//                     scenarios construct un-raceable synchronous windows
//                     rather than trying to land a kill inside them.
// ---------------------------------------------------------------------------

test(
  'G-VANISH residual 6, REAL: a non-Node exclusive lock genuinely trips the '
    + 'rename-failure-conditional-unlink catch branch',
  {
    timeout: PROBE_TIMEOUT_MS,
    skip: process.platform !== 'win32'
      ? 'win32-specific: FILE_SHARE_DELETE is a win32 concept, and POSIX '
        + 'rename(2) does not fail merely because the target is open'
      : false,
  },
  async () => {
    const { dir, moduleUrl } = buildRenameFailureConditionalUnlinkMutantTree();
    let locker = null;
    try {
      // Force through the crash-drill entry point too, exactly like every
      // other mutant in this file, so the tree-build contract (anchors still
      // exist, sibling files resolved) is exercised identically.
      await import(moduleUrl);
      const runtimeModuleUrl = pathToFileURL(path.join(dir, RUNTIME_FILE)).href;
      const runtimeMutant = await import(runtimeModuleUrl);
      assert.equal(runtimeMutant.renameFailureCatchState.hits, 0, 'sentinel starts at zero');

      const storeDir = path.join(dir, 'scratch-real-lock', 'phase0b');
      mkdirSync(storeDir, { recursive: true });
      const target = runtimeMutant.statePath(storeDir);
      const originalBytes = `${JSON.stringify({ before: true })}\n`;
      writeFileSync(target, originalBytes, 'utf8');

      locker = spawnNonNodeExclusiveLocker(target);
      await locker.waitEstablished();

      let caught = null;
      try {
        runtimeMutant.writeAtomicState(storeDir, { after: true });
      } catch (error) {
        caught = error;
      }
      await locker.release();
      locker = null;

      assert.ok(
        caught,
        'writeAtomicState must throw while the target is genuinely, externally locked '
        + '(both the first rename AND the retry unlink are denied)',
      );

      // The sentinel proves the catch branch executed for real, exactly once,
      // with a real OS errno -- not a simulated fault, not a assumption.
      assert.equal(
        runtimeMutant.renameFailureCatchState.hits,
        1,
        'the rename-failure catch fired exactly once',
      );
      assert.equal(runtimeMutant.renameFailureCatchState.errnoSamples.length, 1);
      assert.match(
        runtimeMutant.renameFailureCatchState.errnoSamples[0],
        /^(EPERM|EBUSY|EACCES)$/,
        `expected a real win32 share-mode denial, got: `
        + `${runtimeMutant.renameFailureCatchState.errnoSamples[0]}`,
      );

      // Because the external lock also denies delete, the retry's own
      // unlink(target) is ALSO denied for real -- so this particular repro
      // fails loudly with the ORIGINAL state untouched. That is the safe half
      // of the finding; the dangerous half (unlink succeeds, retry does not)
      // is characterized deterministically in the next test.
      assert.equal(
        readFileSync(target, 'utf8'),
        originalBytes,
        'original state.json survives untouched -- the failure was loud, not silent',
      );

      // Sanity: once the external lock is truly released, the SAME mutant's
      // fast (non-catch) path still works normally.
      runtimeMutant.writeAtomicState(storeDir, { after: true });
      assert.equal(
        JSON.parse(readFileSync(target, 'utf8')).after,
        true,
        'a normal write after the lock clears succeeds via the fast path',
      );
      assert.equal(
        runtimeMutant.renameFailureCatchState.hits,
        1,
        'the fast-path write did not touch the catch-branch sentinel',
      );
    } finally {
      if (locker) await locker.release();
      rmSync(dir, { force: true, recursive: true });
    }
  },
);

test(
  'G-VANISH residual 6, CHARACTERIZED: a crash between the workaround\'s unlink '
    + 'and its retry rename leaves NO state.json at all',
  { timeout: PROBE_TIMEOUT_MS },
  () => {
    // This test does not re-derive reachability (the REAL test above already
    // does that with a genuine external lock); it isolates exactly the
    // statement the mutant's catch branch runs immediately before its retry
    // rename, so the intermediate on-disk state a real crash in that gap
    // would leave can be inspected directly -- without the surrounding
    // function's own outer-catch cleanup running afterward (a JS `throw`
    // there would ALSO trigger that cleanup and additionally erase the
    // orphan temp file, which a genuine process death could not do; that
    // would misrepresent the hazard as worse-in-a-different-way than it is).
    //
    // Tied to the real mutant source by containment, so this cannot silently
    // drift if the mutant is ever edited without updating this test.
    assert.ok(
      RENAME_FAILURE_CONDITIONAL_UNLINK_ATOMIC_STATE.includes(
        '      if (existsSync(target)) unlinkSync(target);',
      ),
      'the unlink-before-retry statement must still exist verbatim in the mutant source',
    );

    const caseDir = mkdtempSync(path.join(os.tmpdir(), 'mv-b5-residual6-window-'));
    try {
      const storeDir = path.join(caseDir, 'phase0b');
      mkdirSync(storeDir, { recursive: true });
      const target = path.join(storeDir, 'state.json');
      const originalBytes = `${JSON.stringify({ before: true, revision: 0 })}\n`;
      writeFileSync(target, originalBytes, 'utf8');
      const temporary = path.join(storeDir, `.state-${process.pid}-${randomUUID()}.tmp`);
      const nextBytes = `${JSON.stringify({ after: true, revision: 1 })}\n`;
      writeFileSync(temporary, nextBytes, 'utf8');

      // The exact statement the mutant's catch branch runs at this point.
      assert.ok(existsSync(target));
      unlinkSync(target);

      // A crash HERE -- before the retry renameSync -- is residual 6's
      // window. It is exactly what it was described as: worse than a torn
      // read, because there is no file to read at all.
      assert.equal(
        existsSync(target),
        false,
        'the target is genuinely gone: no state.json at all, the same hazard class '
        + 'G-VANISH already names for the unconditional-unlink defect',
      );
      assert.equal(
        existsSync(temporary),
        true,
        'the new bytes survive on disk, orphaned and unrenamed',
      );
      assert.equal(readFileSync(temporary, 'utf8'), nextBytes);
      assert.throws(
        () => readFileSync(target, 'utf8'),
        /ENOENT/,
        'a reader at this exact instant gets ENOENT, not a torn or stale read',
      );

      // SEVERITY NOTE, demonstrated rather than asserted from reading the
      // source: production initializePersistentStore treats an ABSENT
      // state.json as "this store was never created" -- there is no way for
      // it to distinguish "genuinely fresh" from "just vanished mid-replace".
      // A caller that naively re-initializes after observing exactly this
      // on-disk state does not get a loud failure; it gets a brand-new
      // genesis store, silently discarding every prior ledger entry. This is
      // a real production function, not a mutant, run against a scratch dir.
      const fixture = buildValidatorFixture();
      const reinitialized = initializePersistentStore({
        storeDir,
        trustedValidatorConfig: fixture.trustedValidatorConfig,
        validatorReceipt: fixture.validatorReceipt,
        initialWorld: fixture.initialWorld,
      });
      assert.equal(
        reinitialized.revision,
        0,
        'initializePersistentStore did NOT detect the vanished replace -- it silently '
        + 'created a fresh genesis store (revision 0) instead of failing closed',
      );
    } finally {
      rmSync(caseDir, { force: true, recursive: true });
    }
  },
);

test('YOU CANNOT BLIND THE VANISH DETECTOR: an ENOENT-swallowing classifier reports UNMEASURED', {
  timeout: PROBE_TIMEOUT_MS,
}, async () => {
  // The failure mode this probe would otherwise be wide open to: not a broken
  // production write, but a classifier that stops being able to SEE the hit
  // class. On the correct implementation an ENOENT-swallowing classifier
  // produces exactly the same counters as an honest one (zero vanishes either
  // way), so nothing except the in-run positive control can tell them apart.
  // That control is therefore load-bearing, and this test RUNS the mutation
  // instead of asserting the control exists.
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mv-b5-blind-classifier-'));
  try {
    for (const file of MUTANT_TREE_FILES) {
      copyFileSync(path.join(SCRIPTS_DIR, file), path.join(dir, file));
    }
    const drillPath = path.join(dir, 'model-village-crash-drill.mjs');
    const source = readFileSync(drillPath, 'utf8');
    const anchor = "    if (code === 'ENOENT') {\n"
      + "      return { state: 'vanished', hit: true, "
      + "detail: `${error?.name}:${code}`, identity: '' };\n"
      + '    }';
    assert.ok(
      source.includes(anchor),
      'the ENOENT branch of classifyVanishPoll must still exist; if it moved, '
      + 'this blindness proof must be repaired rather than silently skipped',
    );
    const blinded = source.replace(
      anchor,
      "    if (code === 'ENOENT') {\n"
      + "      return { state: 'transient', hit: false, "
      + "detail: `${error?.name}:${code}`, identity: '' };\n"
      + '    }',
    );
    assert.notEqual(blinded, source, 'the classifier really was mutated');
    writeFileSync(drillPath, blinded, 'utf8');

    const blindModule = await import(pathToFileURL(drillPath).href);
    const { receipt } = await blindModule.runVanishProbe({
      scratchRoot: path.join(dir, 'scratch'),
    });
    assert.equal(
      receipt.verdict,
      blindModule.VANISH_VERDICTS.UNMEASURED,
      'a blind classifier must fail CLOSED, never report a confident HELD — '
      + `observed: ${JSON.stringify(receipt.observed)}`,
    );
    assert.equal(receipt.observed.detectorControl.absentClassifiedAsVanished, false);
    assert.ok(
      receipt.unmeasuredReasons.some((reason) => /can see the defect/.test(reason)),
      `the reason names the blindness: ${receipt.unmeasuredReasons.join('; ')}`,
    );
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test('a vanish run that cannot reach its poll floor reports UNMEASURED, never HELD', {
  timeout: PROBE_TIMEOUT_MS,
}, async () => {
  const { receipt } = await runVanishProbe({
    scratchRoot: path.join(SCRATCH_ROOT, `vanish-underpowered-${randomUUID()}`),
    requiredPolls: 50_000_000,
    deadlineMs: 2500,
  });
  assert.equal(receipt.verdict, VANISH_VERDICTS.UNMEASURED);
  assert.equal(receipt.hits, 0);
  assert.ok(
    receipt.unmeasuredReasons.some((reason) => /polls of the established store/.test(reason)),
    `the shortfall is named: ${receipt.unmeasuredReasons.join('; ')}`,
  );
  // The power block is DERIVED from what this run achieved, not from the floor
  // it was asked for: an under-powered run cannot inherit a full-power number.
  assert.equal(receipt.power.pollsAchieved, receipt.observed.pollsTotal);
  assert.ok(receipt.power.pollsAchieved < 50_000_000);
  assert.equal(receipt.power.requiredPolls, 50_000_000);
  assert.equal(verifyVanishProbeReceipt(receipt), true, 'an honest UNMEASURED still verifies');
});

test('a vanish receipt cannot be laundered into HELD', {
  timeout: PROBE_TIMEOUT_MS,
}, async () => {
  // (a) A caller-supplied floor below the MODULE floor cannot mint a cheap HELD.
  const cheap = await runVanishProbe({
    scratchRoot: path.join(SCRATCH_ROOT, `vanish-cheap-${randomUUID()}`),
    requiredPolls: 5,
  });
  assert.equal(cheap.receipt.verdict, VANISH_VERDICTS.HELD, 'the caller got its cheap verdict');
  assert.throws(
    () => verifyVanishProbeReceipt(cheap.receipt),
    ModelVillageCrashDrillError,
    'but the verifier applies the MODULE floor and rejects it',
  );

  // (b) Flipping the verdict without recomputing the hash is rejected, and so is
  // rewriting the counters (the hits/verdict/power are all re-derived).
  const honest = await runVanishProbe({
    scratchRoot: path.join(SCRATCH_ROOT, `vanish-tamper-${randomUUID()}`),
  });
  assert.throws(
    () => verifyVanishProbeReceipt({ ...honest.receipt, verdict: VANISH_VERDICTS.VIOLATED }),
    ModelVillageCrashDrillError,
  );
  assert.throws(
    () => verifyVanishProbeReceipt({ ...honest.receipt, sneaky: true }),
    ModelVillageCrashDrillError,
  );
  const relabelled = {
    ...honest.receipt,
    hits: 0,
    verdict: VANISH_VERDICTS.HELD,
    observed: { ...honest.receipt.observed, pollsVanished: 3 },
  };
  assert.throws(
    () => verifyVanishProbeReceipt(relabelled),
    ModelVillageCrashDrillError,
    'a receipt whose counters and verdict disagree is rejected',
  );

  // (c) A power block imported from a LARGER n than this run achieved — the
  //     exact way an under-powered run would launder a confident number.
  const inflated = {
    ...honest.receipt,
    power: {
      ...honest.receipt.power,
      pollsAchieved: honest.receipt.power.pollsAchieved * 10,
      falseRedProbabilityUpperBound95: 0,
    },
  };
  assert.throws(
    () => verifyVanishProbeReceipt(inflated),
    ModelVillageCrashDrillError,
    'the power block must re-derive from the polls the run actually made',
  );
});

test('an atomic-replacement receipt cannot be laundered into HELD', {
  timeout: PROBE_TIMEOUT_MS,
}, async () => {
  const { receipt } = await runAtomicReplacementProbe({
    scratchRoot: path.join(SCRATCH_ROOT, `atomic-replacement-launder-${randomUUID()}`),
    replacements: 1,
  });
  // A caller asking for one replacement gets a real verdict...
  assert.equal(receipt.replacementFloor, 1);
  assert.equal(
    receipt.verdict,
    ATOMIC_REPLACEMENT_VERDICTS.HELD,
    'the run itself is honest at the caller floor',
  );
  // ...but the MODULE's floor, not the caller's, is what a HELD must satisfy.
  assert.throws(
    () => verifyAtomicReplacementProbeReceipt(receipt),
    /without meeting every measurement precondition/,
    'a cheaper caller floor must not verify as HELD',
  );

  // And a receipt whose in-run comparator control failed cannot be HELD either:
  // "no in-place rewrite seen" by a comparator that cannot see one is vacuous.
  const blind = {
    ...receipt,
    observed: {
      ...receipt.observed,
      comparatorControl: {
        atomicReplaceReadsAsNewFile: true,
        inPlaceRewriteReadsAsSameFile: false,
      },
      replacementsExecuted: ATOMIC_REPLACEMENT_MIN_REPLACEMENTS,
      replacementsWithTargetPresent: ATOMIC_REPLACEMENT_MIN_REPLACEMENTS,
    },
    replacementFloor: ATOMIC_REPLACEMENT_MIN_REPLACEMENTS,
  };
  delete blind.receiptHash;
  const signedBlind = { ...blind, receiptHash: canonicalDigest(blind) };
  assert.throws(
    () => verifyAtomicReplacementProbeReceipt(signedBlind),
    /without meeting every measurement precondition/,
    'a blind comparator may not be relabelled HELD',
  );
});

test('the torn-read probe carries an IN-RUN detector positive control', {
  timeout: PROBE_TIMEOUT_MS,
}, async () => {
  // Until this existed the gate shipped a detector whose liveness was only
  // proven under `node --test`. A readPersistentState that started tolerating
  // truncation would have turned the gate permanently green while still
  // printing detection=1.
  const { receipt } = await runTornReadProbe({
    scratchRoot: path.join(SCRATCH_ROOT, `torn-read-control-${randomUUID()}`),
  });
  assert.deepEqual(receipt.observed.detectorControl, {
    absentClassified: true,
    completeClassified: true,
    tornClassified: true,
  });
  assert.equal(receipt.verdict, TORN_READ_VERDICTS.HELD);

  // It is load-bearing: a HELD whose control did not fire must not verify.
  const blind = {
    ...receipt,
    observed: {
      ...receipt.observed,
      detectorControl: { ...receipt.observed.detectorControl, tornClassified: false },
    },
  };
  delete blind.receiptHash;
  const signedBlind = { ...blind, receiptHash: canonicalDigest(blind) };
  assert.throws(
    () => verifyTornReadProbeReceipt(signedBlind),
    /without meeting every measurement precondition/,
    'a HELD from a detector that could not see a tear is vacuous',
  );
});

// --------------------------------------------------------------------------
// The SELF-REPORTED PID LAW. Without it `recoveryPid` is any plausible integer
// the emitter chooses, which is exactly how an emitter that ran recovery
// IN-PROCESS -- while spawning a throwaway `node -e 0` purely to source a real
// distinct pid -- certified recoveredInFreshProcess:true for nine scenarios
// with zero fresh recoveries, gate green. Binding the spawn-observed pid to the
// pid the child printed about itself is what closes that.
// --------------------------------------------------------------------------

test('parseSelfReportedPid only accepts a pid a process printed about itself', () => {
  assert.equal(parseSelfReportedPid('MV_CRASH_PID 4242\n'), 4242);
  assert.equal(parseSelfReportedPid('noise\r\nMV_CRASH_PID 7\r\nmore\n'), 7);
  // A throwaway child that printed nothing carries no evidence at all -- this
  // null is what turns the in-process-recovery shortcut into a hard failure.
  assert.equal(parseSelfReportedPid(''), null);
  assert.equal(parseSelfReportedPid(null), null);
  assert.equal(parseSelfReportedPid('MV_CRASH_VERDICT {}\n'), null);
  // Placeholders are ABSENT EVIDENCE, not pids, on this path too.
  assert.equal(parseSelfReportedPid('MV_CRASH_PID -1\n'), null);
  assert.equal(parseSelfReportedPid('MV_CRASH_PID 0\n'), null);
  assert.equal(parseSelfReportedPid('MV_CRASH_PID notanumber\n'), null);
});

test('the crash worker really does report its own pid, and it is the spawned pid', () => {
  // NON-VACUITY for the law above: the marker is not a convention nobody emits.
  // Both roles print it, and the pid printed is the pid the OS gave the child.
  const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'model-village-crash-worker.mjs');
  const result = spawnSync(process.execPath, [workerPath, '--role=bogus'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const reported = parseSelfReportedPid(result.stdout);
  assert.ok(isObservedPid(reported), 'the worker printed an observed pid about itself');
  assert.equal(
    reported,
    result.pid,
    'the pid the child reported must be the pid the parent observed',
  );
  assert.notEqual(reported, process.pid, 'and it is not the harness process');
});

// --------------------------------------------------------------------------
// G-VANISH scope, EXECUTED in both directions. The first version of the vanish
// writer read the store once and re-published byte-identical content forever,
// which made the probe structurally blind to a window that opens only when the
// published bytes CHANGE -- measured: that mutant passed the whole gate green
// while in production every turn changes the state, so its branch would fire on
// every single write. The writer now re-seals a VALID but DIFFERENT persistent
// state each iteration. This is the proof that the fix is real.
// --------------------------------------------------------------------------

const CONTENT_CONDITIONAL_UNLINK_ATOMIC_STATE = [
  WRITE_ATOMIC_SIGNATURE,
  '  const target = statePath(storeDir);',
  '  const temporary = path.join(',
  '    storeDir,',
  '    `.state-${process.pid}-${randomUUID()}.tmp`,',
  '  );',
  "  const descriptor = openSync(temporary, 'wx');",
  '  let renamed = false;',
  '  try {',
  "    writeFileSync(descriptor, `${canonicalJson(state)}\n`, 'utf8');",
  '    fsyncSync(descriptor);',
  '    closeSync(descriptor);',
  "    if (faultInjection === 'before_rename') {",
  "      throw new Error('injected fault before atomic rename');",
  '    }',
  '    let changed = true;',
  '    try {',
  "      changed = readFileSync(target, 'utf8') !== `${canonicalJson(state)}\n`;",
  '    } catch {',
  '      changed = true;',
  '    }',
  '    if (changed && existsSync(target)) unlinkSync(target);',
  '    renameSync(temporary, target);',
  '    renamed = true;',
  "    if (faultInjection === 'after_rename') {",
  "      throw new Error('injected fault after atomic rename');",
  '    }',
  '  } catch (error) {',
  '    try {',
  '      closeSync(descriptor);',
  '    } catch {',
  '      // Descriptor was already closed.',
  '    }',
  '    if (!renamed && existsSync(temporary)) unlinkSync(temporary);',
  '    throw error;',
  '  }',
  '}',
  '',
].join('\n');

test('G-VANISH, IN SCOPE: a CONTENT-CONDITIONAL unlink window is caught', {
  timeout: PROBE_TIMEOUT_MS,
}, async () => {
  const { dir, moduleUrl } = buildWriteAtomicMutantTree(
    'content-conditional-unlink',
    CONTENT_CONDITIONAL_UNLINK_ATOMIC_STATE,
    (mutated) => {
      assert.ok(
        /changed && existsSync\(target\)\) unlinkSync\(target\);\s*\n\s*renameSync/.test(mutated),
        'the unlink fires only when the published bytes differ, immediately before the rename',
      );
    },
  );
  try {
    const mutant = await import(moduleUrl);
    const vanish = await mutant.runVanishProbe({
      scratchRoot: path.join(dir, 'scratch-vanish-content'),
    });
    assert.equal(
      vanish.receipt.verdict,
      mutant.VANISH_VERDICTS.VIOLATED,
      'a window that opens only on a content change MUST be caught now that the '
      + 'writer publishes different bytes every write — observed: '
      + `${JSON.stringify(vanish.receipt.observed)}`,
    );
    assert.ok(vanish.receipt.hits > 0);
    assert.match(vanish.receipt.observed.vanishedSamples.join(' | '), /ENOENT/);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test('the vanish writer publishes a DIFFERENT valid state on every write', () => {
  // NON-VACUITY for the test above: if the writer ever goes back to republishing
  // one constant object, the content-conditional mutant silently stops being
  // reachable and the test above becomes decorative. This pins the mechanism.
  const source = readFileSync(path.join(SCRIPTS_DIR, 'model-village-crash-drill.mjs'), 'utf8');
  const writer = source.slice(source.indexOf('async function vanishWriterChild'));
  const body = writer.slice(0, writer.indexOf('\n}\n'));
  assert.match(body, /runtime\.validatePersistentState\(/, 'production validation, not scribble');
  assert.match(body, /runtime\.canonicalDigest\(/, 're-sealed so the state stays valid');
  assert.match(body, /writeAtomicState\(storeDir, nextState\(\)\)/, 'a fresh state per write');
  assert.doesNotMatch(
    body,
    /writeAtomicState\(storeDir, state\)/,
    'the single constant state must not come back',
  );
});
