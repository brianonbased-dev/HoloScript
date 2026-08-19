/* global Buffer, process */

/**
 * Offline node --test suite for the MV-B5 durability checker
 * (scripts/check-hololand-model-village-durability.mjs). Runs the REAL drill
 * once (spawning + SIGKILLing real child processes, racing real child processes
 * for contention, and re-verifying a real sealed store read-only), then asserts
 * the emitted receipt's shape, schema, drill presence, honest gap surfacing,
 * exact claim-boundary flags, self-hash verification, tamper rejection, and
 * scratch isolation.
 *
 * No network, no providers, no git. Every store lives under an os.tmpdir scratch
 * root the drill creates and removes; the only durable artifact is the receipt
 * written to a temp --output path this suite cleans up.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { clearTimeout, setTimeout } from 'node:timers';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  AUDIT_OPEN_SCHEMA,
} from '../model-village-audit-open.mjs';
import {
  CONTENTION_DRILL_SCHEMA,
} from '../model-village-contention-drill.mjs';
import {
  ATOMIC_REPLACEMENT_MIN_REPLACEMENTS,
  ATOMIC_REPLACEMENT_PROBE_SCHEMA,
  ATOMIC_REPLACEMENT_VERDICTS,
  CRASH_DRILL_SCENARIO_EXPECTATIONS,
  CRASH_DRILL_SCENARIOS,
  CRASH_DRILL_SCHEMA,
  deriveRecoveredInFreshProcess,
  isObservedPid,
  TORN_READ_MIN_PUBLICATIONS_WITNESSED,
  TORN_READ_PROBE_SCHEMA,
  TORN_READ_REQUIRED_ATTEMPTS,
  TORN_READ_VERDICTS,
  VANISH_MIN_REPLACEMENTS_WITNESSED,
  VANISH_PROBE_SCHEMA,
  VANISH_REQUIRED_POLLS,
  VANISH_VERDICTS,
} from '../model-village-crash-drill.mjs';
import {
  canonicalDigest,
  releasePersistentStoreLock,
} from '../model-village-phase0b-runtime.mjs';
import {
  DURABILITY_RECEIPT_SCHEMA,
  runDurabilityDrill,
  verifyDurabilityReceipt,
} from '../check-hololand-model-village-durability.mjs';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SUITE_TIMEOUT_MS = 120000;

// The full drill is expensive (spawns + kills many child processes). Run it ONCE
// in a before() hook and share the receipt across the assertion tests.
let SCRATCH_BASE;
let OUTPUT_PATH;
let RECEIPT;

before(async () => {
  SCRATCH_BASE = mkdtempSync(path.join(os.tmpdir(), 'mv-b5-durability-test-'));
  const storeRoot = path.join(SCRATCH_BASE, 'store');
  mkdirSync(storeRoot, { recursive: true });
  OUTPUT_PATH = path.join(SCRATCH_BASE, 'durability-receipt.json');
  const result = await runDurabilityDrill({
    storeRoot,
    output: OUTPUT_PATH,
    root: SCRATCH_BASE,
    // Smaller contention config keeps the suite bounded while still contending.
    contentionWorkerCount: 3,
    contentionOpsPerWorker: 2,
  });
  RECEIPT = result.receipt;
}, { timeout: SUITE_TIMEOUT_MS });

after(() => {
  try {
    rmSync(SCRATCH_BASE, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

test('receipt has the exact top-level schema shape', { timeout: SUITE_TIMEOUT_MS }, () => {
  assert.equal(RECEIPT.schema, DURABILITY_RECEIPT_SCHEMA);
  assert.ok(SHA256_PATTERN.test(RECEIPT.receiptHash), 'receiptHash is sha256 hex');
  assert.equal(typeof RECEIPT.allInvariantsHeld, 'boolean');
  assert.ok(!Number.isNaN(Date.parse(RECEIPT.generatedAt)), 'generatedAt parses');

  const keys = Object.keys(RECEIPT).sort();
  assert.deepEqual(keys, [
    'allInvariantsHeld',
    'atomicReplacementProbe',
    'auditOpenDrill',
    'claimBoundary',
    'contentionDrill',
    'crashDrills',
    'gapsObserved',
    'generatedAt',
    'receiptHash',
    'schema',
    'tornReadProbe',
    'vanishProbe',
  ]);
});

test('every crash scenario ran ONCE and matches its documented expectation', {
  timeout: SUITE_TIMEOUT_MS,
}, () => {
  const scenarios = RECEIPT.crashDrills.map((drill) => drill.scenario);
  // Full scenario set, each exactly once (not swept).
  assert.deepEqual(
    [...scenarios].sort(),
    [...CRASH_DRILL_SCENARIOS].sort(),
    'all known crash scenarios are present',
  );
  assert.equal(new Set(scenarios).size, scenarios.length, 'no scenario ran twice');

  for (const drill of RECEIPT.crashDrills) {
    assert.equal(drill.schema, CRASH_DRILL_SCHEMA);
    assert.equal(drill.recoveredInFreshProcess, true);
    // The claim must be BACKED: three observed pids, all distinct in the ways
    // that matter, and the boolean must equal what they derive.
    assert.ok(isObservedPid(drill.workerPid), `${drill.scenario} workerPid observed`);
    assert.ok(isObservedPid(drill.recoveryPid), `${drill.scenario} recoveryPid observed`);
    assert.ok(isObservedPid(drill.harnessPid), `${drill.scenario} harnessPid observed`);
    assert.notEqual(drill.recoveryPid, drill.workerPid, 'recovery ran in a fresh process');
    assert.notEqual(
      drill.recoveryPid,
      drill.harnessPid,
      'recovery did not run inside the gate process',
    );
    assert.equal(
      drill.recoveredInFreshProcess,
      deriveRecoveredInFreshProcess({
        workerPid: drill.workerPid,
        recoveryPid: drill.recoveryPid,
        harnessPid: drill.harnessPid,
      }),
      `${drill.scenario} fresh-process claim is derived from its pids`,
    );
    assert.equal(
      drill.invariantHeld,
      CRASH_DRILL_SCENARIO_EXPECTATIONS[drill.scenario],
      `${drill.scenario} must match its documented expectation`,
    );
  }
});

test('contention drill and audit-open drill are both present and honest', {
  timeout: SUITE_TIMEOUT_MS,
}, () => {
  assert.equal(RECEIPT.contentionDrill.schema, CONTENTION_DRILL_SCHEMA);
  assert.equal(RECEIPT.contentionDrill.finalChainLinear, true);
  assert.equal(RECEIPT.contentionDrill.persistenceStoreLock.serialized, true);
  assert.equal(RECEIPT.contentionDrill.nonVacuityControl.flaggedByChainCheck, true);
  assert.equal(
    RECEIPT.contentionDrill.opsCommitted,
    RECEIPT.contentionDrill.workerCount * RECEIPT.contentionDrill.opsPerWorker,
  );

  assert.equal(RECEIPT.auditOpenDrill.schema, AUDIT_OPEN_SCHEMA);
  assert.equal(RECEIPT.auditOpenDrill.ok, true);
  assert.equal(RECEIPT.auditOpenDrill.appendedNothing, true);
  assert.equal(RECEIPT.auditOpenDrill.createdNoLock, true);
  assert.equal(RECEIPT.auditOpenDrill.mtimeUnchanged, true);
  assert.ok(SHA256_PATTERN.test(RECEIPT.auditOpenDrill.accessLogTailHash));
  assert.ok(Array.isArray(RECEIPT.auditOpenDrill.checkNames));
  assert.ok(RECEIPT.auditOpenDrill.checkNames.includes('access-log-chain'));
});

test('the torn-read probe measured atomic replacement and is embedded honestly', {
  timeout: SUITE_TIMEOUT_MS,
}, () => {
  // DEFECT A: before this probe existed, replacing writeAtomicState with a naive
  // direct write left every other assertion in this file green — including the
  // crash drills named ...-before-rename and ...-after-rename. This block is the
  // only thing here that can tell the two implementations apart.
  const probe = RECEIPT.tornReadProbe;
  assert.equal(probe.schema, TORN_READ_PROBE_SCHEMA);
  assert.equal(
    probe.verdict,
    TORN_READ_VERDICTS.HELD,
    `atomic replacement must be MEASURED to hold — ${JSON.stringify(probe.observed)} `
    + `${probe.unmeasuredReasons.join('; ')}`,
  );
  assert.equal(probe.hits, 0);
  assert.equal(probe.observed.readsTorn, 0);
  assert.deepEqual(probe.unmeasuredReasons, []);

  // The measurement preconditions are asserted here too, so a probe that
  // silently stopped racing cannot ride along on a HELD label.
  assert.equal(probe.observed.writerSignalledFirstWrite, true);
  assert.equal(probe.observed.writerExitedEarly, false);
  assert.equal(probe.observed.readersReporting, probe.observed.readerCount);
  assert.ok(
    probe.observed.publicationsWitnessed >= TORN_READ_MIN_PUBLICATIONS_WITNESSED,
    `readers witnessed ${probe.observed.publicationsWitnessed} completed replacements`,
  );
  assert.ok(
    probe.observed.publicationWindowAttempts >= TORN_READ_REQUIRED_ATTEMPTS,
    `${probe.observed.publicationWindowAttempts} in-window attempts >= the power floor `
    + `${TORN_READ_REQUIRED_ATTEMPTS}`,
  );
  assert.ok(probe.power.detectionAtCalibratedRate >= 0.95);
  assert.equal(probe.power.attemptsAchieved, probe.observed.publicationWindowAttempts);

  // allInvariantsHeld must be gated on this probe, not merely accompanied by it.
  assert.equal(RECEIPT.allInvariantsHeld, true);
});

test('a laundered torn-read probe is rejected by verifyDurabilityReceipt', {
  timeout: SUITE_TIMEOUT_MS,
}, () => {
  const probe = RECEIPT.tornReadProbe;

  // (a) A probe that SAW tears but is labelled HELD, re-signed at both levels.
  const tornObserved = {
    ...probe,
    hits: 3,
    observed: {
      ...probe.observed,
      readsTorn: 3,
      readsTotal: probe.observed.readsTotal + 3,
      publicationWindowAttempts: probe.observed.publicationWindowAttempts + 3,
    },
  };
  delete tornObserved.receiptHash;
  const signedTorn = { ...tornObserved, receiptHash: canonicalDigest(tornObserved) };
  const launderedTorn = { ...RECEIPT, tornReadProbe: signedTorn };
  delete launderedTorn.receiptHash;
  const verificationTorn = verifyDurabilityReceipt({
    ...launderedTorn,
    receiptHash: canonicalDigest(launderedTorn),
  });
  assert.equal(verificationTorn.ok, false, 'an observed tear cannot be labelled HELD');
  assert.match(verificationTorn.failureReason, /torn-read/i);

  // (b) An UNMEASURED probe must fail the durability receipt outright — a probe
  //     that could not measure must never be indistinguishable from one that did.
  const unmeasured = {
    ...probe,
    unmeasuredReasons: ['synthetic: the probe could not measure'],
    verdict: TORN_READ_VERDICTS.UNMEASURED,
  };
  delete unmeasured.receiptHash;
  const signedUnmeasured = { ...unmeasured, receiptHash: canonicalDigest(unmeasured) };
  const launderedUnmeasured = { ...RECEIPT, tornReadProbe: signedUnmeasured };
  delete launderedUnmeasured.receiptHash;
  const verificationUnmeasured = verifyDurabilityReceipt({
    ...launderedUnmeasured,
    receiptHash: canonicalDigest(launderedUnmeasured),
  });
  assert.equal(verificationUnmeasured.ok, false, 'UNMEASURED must fail closed');
  assert.match(verificationUnmeasured.failureReason, /did not measure/i);

  // (c) Dropping the probe entirely is rejected by the closed-key assertion.
  const stripped = { ...RECEIPT };
  delete stripped.tornReadProbe;
  assert.equal(verifyDurabilityReceipt(stripped).ok, false, 'the probe cannot be removed');
});

test('gaps are surfaced honestly, and the two fixed HIGH gaps stay fixed', {
  timeout: SUITE_TIMEOUT_MS,
}, () => {
  // G1 (destroyContentKey crash wedge) and G2 (phase0b lock leak) are FIXED, so
  // no crash drill may receipt a gap and allInvariantsHeld must be true. This
  // assertion is the regression tripwire: if either fix regresses, its drill
  // receipts invariantHeld:false and this flips back to false.
  assert.equal(
    RECEIPT.allInvariantsHeld,
    true,
    'both HIGH durability gaps are fixed; a regression must not be hidden',
  );

  const executed = RECEIPT.gapsObserved.filter((gap) => gap.executed === true);
  assert.deepEqual(
    executed.map((gap) => gap.ref).sort(),
    [],
    'no executed gap remains (G1 and G2 are fixed)',
  );

  // The formerly-gapped scenarios must now assert their POSITIVE invariants.
  for (const scenario of [
    'custody-destroy-key-killed-mid-destroy',
    'persistent-state-lock-leak-after-kill',
  ]) {
    const drill = RECEIPT.crashDrills.find((entry) => entry.scenario === scenario);
    assert.ok(drill, `${scenario} still runs`);
    assert.equal(drill.invariantHeld, true, `${scenario} must hold now that it is fixed`);
    assert.equal(drill.gapReference, null, `${scenario} no longer references a gap`);
    assert.doesNotMatch(
      drill.observedOutcome,
      /REGRESSION/,
      `${scenario} must not report a regression`,
    );
  }

  // Documented-only gaps stay catalogued honestly, with file:line + owner.
  for (const gap of RECEIPT.gapsObserved) {
    assert.equal(gap.executed, false, 'every remaining gap is documented-only');
    assert.match(gap.file, /:\d/, 'gap carries a file:line reference');
    assert.ok(gap.minimalFix.length > 0, 'gap names a minimal fix');
    assert.ok(gap.owner.length > 0, 'gap names an owning lane');
  }

  // Anti-hiding invariant retained: any crash drill that DID report a gap must
  // appear as an executed gap.
  for (const drill of RECEIPT.crashDrills) {
    if (drill.invariantHeld === false) {
      const match = RECEIPT.gapsObserved.find(
        (gap) => gap.ref === drill.gapReference && gap.executed === true,
      );
      assert.ok(match, `crash gap ${drill.gapReference} is not hidden`);
    }
  }
});

test('claim-boundary flags are pinned exactly (honest about what is NOT proven)', {
  timeout: SUITE_TIMEOUT_MS,
}, () => {
  const cb = RECEIPT.claimBoundary;
  assert.equal(cb.fleetOrMultiHostConsensusClaimed, false);
  assert.equal(cb.mediaFailureDurabilityClaimed, false);
  assert.equal(cb.productionDeploymentClaimed, false);
  // fsync is TRUSTED, not proven — pinned true on purpose.
  assert.equal(cb.fsyncHonestyAssumed, true);
  assert.ok(Array.isArray(cb.observed) && cb.observed.length > 0);
  assert.ok(Array.isArray(cb.notObserved) && cb.notObserved.length > 0);
  // The boundary must name the process-crash + contention + audit-open proofs.
  assert.match(cb.observed.join(' '), /process-crash/i);
  assert.match(cb.observed.join(' '), /multi-process/i);
  assert.match(cb.observed.join(' '), /audit-open/i);
  // ...and it must say that atomic replacement is MEASURED, not inferred, and
  // that the crash drills alone do not discriminate the write mechanism.
  // CORRECTED 2026-07-27: this used to match "ATOMIC STATE REPLACEMENT ITSELF
  // is measured", which was the overclaim a second adversarial review broke.
  // The torn-read probe measures atomic PUBLICATION on the CREATE path; atomic
  // REPLACEMENT is measured by a separate deterministic probe. Both rows must be
  // present and must not be collapsed back into one.
  assert.match(
    cb.observed.join(' '),
    /ATOMIC STATE PUBLICATION ON THE CREATE PATH is measured/,
  );
  assert.match(
    cb.observed.join(' '),
    /ATOMIC STATE REPLACEMENT ON THE PRODUCTION COMMIT PATH is measured/,
  );
  assert.doesNotMatch(
    cb.observed.join(' '),
    /ATOMIC STATE REPLACEMENT ITSELF is measured/,
    'the create-path probe must never again be described as measuring replacement',
  );
  assert.match(cb.notObserved.join(' '), /do NOT discriminate atomic replacement/);
  assert.match(cb.notObserved.join(' '), /torn-read probe is PROBABILISTIC/);
  // The disappearing-state-file class is now MEASURED — and the part of it that
  // is still a residual (single point of detection, collapse margin, false-red
  // bound, custody store not covered) is disclosed rather than silently carried.
  assert.match(cb.observed.join(' '), /CONTINUOUS PUBLICATION ACROSS REPLACEMENT/);
  assert.match(cb.notObserved.join(' '), /single point of detection/);
  assert.match(cb.notObserved.join(' '), /false-red/);
});

test('the atomic-replacement probe is a real gate row, not a decoration', {
  timeout: SUITE_TIMEOUT_MS,
}, () => {
  const probe = RECEIPT.atomicReplacementProbe;
  assert.ok(probe, 'the receipt carries an atomic-replacement probe');
  assert.equal(probe.schema, ATOMIC_REPLACEMENT_PROBE_SCHEMA);
  assert.equal(probe.verdict, ATOMIC_REPLACEMENT_VERDICTS.HELD);
  assert.equal(probe.hits, 0);
  assert.deepEqual(probe.unmeasuredReasons, []);
  // Deterministic detector, so the floor is anti-vacuity rather than a sample
  // size — but it must still have been MET, with the target actually present.
  assert.ok(probe.observed.replacementsExecuted >= ATOMIC_REPLACEMENT_MIN_REPLACEMENTS);
  assert.equal(
    probe.observed.replacementsWithTargetPresent,
    probe.observed.replacementsExecuted,
  );
  // The comparator that carries the whole claim is controlled in-run.
  assert.equal(probe.observed.comparatorControl.inPlaceRewriteReadsAsSameFile, true);
  assert.equal(probe.observed.comparatorControl.atomicReplaceReadsAsNewFile, true);
  // The seam is recorded so a reader can check it is the shipping bytes.
  assert.match(probe.observed.seamShippedRuntimeSha256, /^[a-f0-9]{64}$/);
  assert.ok(probe.observed.seamAppendedBytes > 0);
  // allInvariantsHeld must be a conjunction that INCLUDES this probe.
  assert.equal(RECEIPT.allInvariantsHeld, true);
});

test('a vanish probe cannot be laundered into the durability receipt', {
  timeout: SUITE_TIMEOUT_MS,
}, () => {
  const probe = RECEIPT.vanishProbe;

  // (a) A probe that SAW the state file vanish but is labelled HELD, re-signed
  //     at BOTH levels so only the re-derivation can catch it.
  const observedVanish = {
    ...probe,
    hits: 3,
    observed: {
      ...probe.observed,
      pollsVanished: 3,
      pollsTotal: probe.observed.pollsTotal + 3,
    },
  };
  delete observedVanish.receiptHash;
  const signedVanish = { ...observedVanish, receiptHash: canonicalDigest(observedVanish) };
  const laundered = { ...RECEIPT, vanishProbe: signedVanish };
  delete laundered.receiptHash;
  const verification = verifyDurabilityReceipt({
    ...laundered,
    receiptHash: canonicalDigest(laundered),
  });
  assert.equal(verification.ok, false, 'an observed disappearance cannot be labelled HELD');
  assert.match(verification.failureReason, /vanish/i);

  // (b) UNMEASURED fails closed.
  const unmeasured = {
    ...probe,
    unmeasuredReasons: ['synthetic: the probe could not measure'],
    verdict: VANISH_VERDICTS.UNMEASURED,
  };
  delete unmeasured.receiptHash;
  const signedUnmeasured = { ...unmeasured, receiptHash: canonicalDigest(unmeasured) };
  const launderedUnmeasured = { ...RECEIPT, vanishProbe: signedUnmeasured };
  delete launderedUnmeasured.receiptHash;
  const verificationUnmeasured = verifyDurabilityReceipt({
    ...launderedUnmeasured,
    receiptHash: canonicalDigest(launderedUnmeasured),
  });
  assert.equal(verificationUnmeasured.ok, false, 'UNMEASURED must fail closed');

  // (c) Dropping the probe entirely is rejected by the closed-key assertion.
  const stripped = { ...RECEIPT };
  delete stripped.vanishProbe;
  assert.equal(verifyDurabilityReceipt(stripped).ok, false, 'the probe cannot be removed');
});

test('the torn-read probe reports its IN-RUN detector control in the receipt', {
  timeout: SUITE_TIMEOUT_MS,
}, () => {
  assert.deepEqual(RECEIPT.tornReadProbe.observed.detectorControl, {
    absentClassified: true,
    completeClassified: true,
    tornClassified: true,
  });
});

test('the gap register records what the torn-read probe does NOT cover', {
  timeout: SUITE_TIMEOUT_MS,
}, () => {
  const tornGap = RECEIPT.gapsObserved.find((gap) => gap.ref === 'G-TORNREAD');
  assert.ok(tornGap, 'the probe carries its own residual-scope entry');
  assert.equal(tornGap.executed, false);
  assert.match(tornGap.summary, /PROBABILISTIC/);
  assert.match(tornGap.summary, /custody/, 'names the store it does not cover');

  // The two entries this audit disproved must carry their corrections.
  const exportGap = RECEIPT.gapsObserved.find((gap) => gap.ref === 'G-EXPORT');
  assert.ok(exportGap, 'G-EXPORT is still catalogued');
  assert.match(
    exportGap.summary,
    /CORRECTED 2026-07-27/,
    'G-EXPORT no longer lets the rename-named crash drills read as mechanism coverage',
  );
  const dirFsyncGap = RECEIPT.gapsObserved.find((gap) => gap.ref === 'G6');
  assert.ok(dirFsyncGap, 'G6 is still catalogued');
  assert.match(
    dirFsyncGap.summary,
    /CORRECTED 2026-07-27/,
    'G6 no longer ASSERTS "never a torn read" as though something measured it',
  );
  assert.doesNotMatch(dirFsyncGap.summary, /consistency-safe: never a torn read/);

  // G-TORNREAD must now own its BIGGEST residual: it races the CREATE path.
  assert.match(
    tornGap.summary,
    /THE PROBE RACES THE CREATE PATH, NOT THE REPLACEMENT PATH/,
    'the scope correction must ride on the gap entry, not only in a comment',
  );

  // G-VANISH: NARROWED, not closed. The probe measures write-conditional
  // windows; a rename-failure-conditional window is out of its reach and the
  // entry must say so with the numbers that prove it, not with silence.
  const vanishGap = RECEIPT.gapsObserved.find((gap) => gap.ref === 'G-VANISH');
  assert.ok(vanishGap, 'the disappearing-state-file class is still catalogued');
  assert.equal(vanishGap.executed, false);
  assert.equal(vanishGap.severity, 'LOW');
  assert.match(vanishGap.file, /model-village-phase0b-runtime\.mjs:\d+/);
  assert.match(vanishGap.summary, /NARROWED, NOT CLOSED/);
  assert.doesNotMatch(
    vanishGap.summary,
    /CLOSED by the VANISH PROBE/,
    'the unqualified class-closure claim was disproven and must not come back',
  );
  assert.match(
    vanishGap.summary,
    /11\/11 VIOLATED/,
    'the mutant detection must be carried as a measured number, not a claim',
  );
  assert.match(
    vanishGap.summary,
    /6,306,137 polls/,
    'the false-positive measurement that justified shipping it must ride along',
  );

  // G-VANISH residual (6): a dedicated non-Node-lock test closed the
  // "cannot be driven at all" complaint (2026-07-28), but that is a
  // detection-capability proof, not live-gate coverage or a production fix.
  // Pin the disclaimer so a future edit cannot quietly drop it while keeping
  // the "a real actor closes it" framing -- the same overclaim shape the
  // CLOSED-by-the-VANISH-PROBE guard above already exists to prevent.
  assert.match(
    vanishGap.summary,
    /still does not spin up a non-Node locker on every run/,
    'residual (6) must keep saying the live gate stays blind to this pattern, not only the dedicated test',
  );
  assert.match(
    vanishGap.summary,
    /cannot distinguish "never created" from "just vanished mid-replace"/,
    'the genesis-reinit hazard that closing residual (6) surfaced must stay recorded, not dropped',
  );
  assert.match(
    vanishGap.summary,
    /RESIDUAL/,
    'what it still does not prove must be stated, not implied by silence',
  );
  // The surviving mutant must be named with its file:line and its measurements,
  // so nobody can read this entry and believe the class is covered.
  assert.match(vanishGap.summary, /rename-failure-conditional/i);
  assert.match(vanishGap.summary, /model-village-phase0b-runtime\.mjs:1563/);
  assert.match(vanishGap.summary, /55,286 polls/);
  assert.match(vanishGap.summary, /108,575 polls/);
  assert.match(vanishGap.summary, /FILE_SHARE_DELETE/);
  // ...and the class it DOES now cover must be stated as covered.
  assert.match(vanishGap.summary, /CONTENT-CONDITIONAL window[\s\S]*IS now closed/);

  const scopeLine = RECEIPT.claimBoundary.notObserved.find(
    (line) => line.includes('DISAPPEARING-STATE-FILE'),
  );
  assert.ok(scopeLine, 'the claim boundary still scopes the disappearing-state-file class');
  assert.match(scopeLine, /only for windows that OPEN ON A WRITE/);
  assert.match(scopeLine, /rename FAILS is NOT measured/);
});

test('the vanish probe is a real gate row, not a decoration', {
  timeout: SUITE_TIMEOUT_MS,
}, () => {
  const probe = RECEIPT.vanishProbe;
  assert.ok(probe, 'the receipt carries a vanish probe');
  assert.equal(probe.schema, VANISH_PROBE_SCHEMA);
  assert.equal(probe.verdict, VANISH_VERDICTS.HELD);
  assert.equal(probe.hits, 0);
  assert.deepEqual(probe.unmeasuredReasons, []);

  // The detector's ability to SEE the hit class is controlled in-run, in the
  // gate process, on every run — not assumed from a `node --test` A/B.
  assert.deepEqual(probe.observed.detectorControl, {
    absentClassifiedAsVanished: true,
    identityDiscriminatesReplacement: true,
    presentClassifiedAsPresent: true,
  });

  // Both fences met: enough polls for the power claim, and enough distinct file
  // objects for those polls to be observations OF a live replacement loop.
  assert.ok(probe.observed.pollsTotal >= VANISH_REQUIRED_POLLS);
  assert.ok(probe.observed.replacementsWitnessed >= VANISH_MIN_REPLACEMENTS_WITNESSED);
  assert.equal(probe.observed.readersEstablished, probe.observed.readerCount);
  assert.equal(
    probe.observed.pollsOther,
    0,
    'no poll returned a code the classifier could not name',
  );

  // The power block is DERIVED from the achieved n, and the false-positive
  // measurement rides in the receipt so nobody has to trust a comment.
  assert.ok(probe.power.detectionAtMeasuredRate >= 0.95);
  assert.equal(probe.power.falsePositiveEventsMeasured, 0);
  assert.ok(probe.power.falsePositivePollsMeasured > 1_000_000);
  // The false-red bound is a function of the ACHIEVED n and n is deliberately
  // uncapped, so a bare `< 0.05` here is a latent red on CORRECT code: with the
  // pinned per-poll bound of 4.757236e-7 the run-level bound
  // 1-(1-4.757236e-7)^n crosses 0.05 at n = ln(0.95)/ln(1-4.757236e-7) ~= 107,821
  // polls, and 128,000-poll runs have already been observed on this host during
  // calibration. The assertion is therefore made against the DESIGN point (the
  // poll floor, which is what the shipping decision was made on) and the
  // achieved-n value is asserted only to be a real, monotone number.
  const floorBound = 1 - ((1 - probe.power.falsePositiveRatePerPollUpperBound95)
    ** probe.power.requiredPolls);
  assert.ok(
    floorBound < 0.05,
    `at the pinned poll floor the false-red bound is ${floorBound}, not < 0.05`,
  );
  assert.equal(typeof probe.power.falseRedProbabilityUpperBound95, 'number');
  assert.ok(probe.power.falseRedProbabilityUpperBound95 >= floorBound);

  // The seam is recorded so a reader can check it is the shipping bytes.
  assert.match(probe.observed.seamShippedRuntimeSha256, /^[a-f0-9]{64}$/);
  assert.ok(probe.observed.seamAppendedBytes > 0);
  // allInvariantsHeld must be a conjunction that INCLUDES this probe.
  assert.equal(RECEIPT.allInvariantsHeld, true);
});

test('the two rename-named crash drills state their own non-coverage', {
  timeout: SUITE_TIMEOUT_MS,
}, () => {
  // These are the drills DEFECT A walked straight through. Their descriptions
  // now say so, so the next reader does not mistake them for mechanism coverage.
  for (const scenario of [
    'persistent-state-killed-after-rename',
    'persistent-state-killed-before-rename',
  ]) {
    const drill = RECEIPT.crashDrills.find((entry) => entry.scenario === scenario);
    assert.ok(drill, `${scenario} still runs`);
    assert.match(
      drill.invariantDescription,
      /NON-COVERAGE/,
      `${scenario} must state that it cannot discriminate the write mechanism`,
    );
    assert.match(drill.invariantDescription, /torn-read probe/);
  }
});

test('emitted receipt file self-verifies via verifyDurabilityReceipt', {
  timeout: SUITE_TIMEOUT_MS,
}, () => {
  assert.ok(existsSync(OUTPUT_PATH), 'receipt file was written');
  const onDisk = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'));
  assert.equal(onDisk.receiptHash, RECEIPT.receiptHash, 'on-disk receipt matches the returned one');
  const verification = verifyDurabilityReceipt(onDisk);
  assert.equal(verification.ok, true, `receipt must self-verify: ${verification.failureReason}`);
});

test('verifyDurabilityReceipt rejects a tampered receipt', { timeout: SUITE_TIMEOUT_MS }, () => {
  // Flip allInvariantsHeld away from reality without recomputing the hash —
  // rejected by the self-hash recompute (and, were the hash rebuilt, by the
  // reality check too). Flipping from the ACTUAL value keeps this a real tamper
  // whichever way the drill currently lands.
  const flipped = { ...RECEIPT, allInvariantsHeld: !RECEIPT.allInvariantsHeld };
  assert.equal(
    verifyDurabilityReceipt(flipped).ok,
    false,
    'an allInvariantsHeld value that contradicts the embedded receipts must be rejected',
  );

  // Missing key → rejected by the closed-key assertion.
  const missingKey = { ...RECEIPT };
  delete missingKey.gapsObserved;
  assert.equal(verifyDurabilityReceipt(missingKey).ok, false, 'missing key must be rejected');

  // Extra key → rejected by the closed-key assertion.
  const extraKey = { ...RECEIPT, sneaky: true };
  assert.equal(verifyDurabilityReceipt(extraKey).ok, false, 'extra key must be rejected');
});

test('a laundered regression is rejected by verifyDurabilityReceipt', {
  timeout: SUITE_TIMEOUT_MS,
}, () => {
  // Now that every scenario is expected to HOLD, a laundered regression is a
  // drill that receipts invariantHeld:false with a re-signed sub-receipt and no
  // matching entry in gapsObserved. Two independent fences reject it: the
  // documented-expectation check fires first, and the anti-hiding rule stands
  // behind it (it has no live executed gap left to catch, by design).
  for (const [index, drill] of RECEIPT.crashDrills.entries()) {
    // Re-sign the mutated drill exactly the way the harness does, so it clears
    // the sub-receipt hash check and a SEMANTIC fence is what rejects it.
    const unsigned = { ...drill };
    delete unsigned.receiptHash;
    const regressed = { ...unsigned, gapReference: 'G1', invariantHeld: false };
    const laundered = {
      ...RECEIPT,
      crashDrills: RECEIPT.crashDrills.map((entry, position) => (
        position === index
          ? { ...regressed, receiptHash: canonicalDigest(regressed) }
          : entry
      )),
    };
    const verification = verifyDurabilityReceipt(laundered);
    assert.equal(
      verification.ok,
      false,
      `a regressed ${drill.scenario} must not verify even with its gap stripped`,
    );
    assert.match(
      verification.failureReason,
      /disagrees with the documented expectation|hidden gap|not surfaced/i,
      `${drill.scenario} must be rejected as a regression, not for an incidental reason`,
    );
  }
});

test('drill scratch is isolated and removed (no lingering store dirs)', {
  timeout: SUITE_TIMEOUT_MS,
}, () => {
  // The drill created its own scratch subtree under storeRoot and removed it in
  // its finally. The only thing left under SCRATCH_BASE is the receipt file (and
  // the now-empty storeRoot). No crash/contention case dirs may remain.
  const storeRoot = path.join(SCRATCH_BASE, 'store');
  const leftovers = existsSync(storeRoot) ? readdirSync(storeRoot) : [];
  assert.equal(leftovers.length, 0, `store scratch must be empty: ${leftovers.join(',')}`);
});

test('a second isolated run reproduces the verdicts and a self-verifying receipt', {
  timeout: SUITE_TIMEOUT_MS,
}, async () => {
  // Point the drill at a brand-new isolated store root and confirm it produces
  // a self-verifying receipt again with the same verdicts — the harness
  // contract is deterministic across fresh scratch roots.
  const isolated = path.join(SCRATCH_BASE, `isolated-${randomUUID()}`);
  mkdirSync(isolated, { recursive: true });
  const output = path.join(isolated, 'receipt.json');
  const { receipt } = await runDurabilityDrill({
    storeRoot: isolated,
    output,
    root: isolated,
    contentionWorkerCount: 2,
    contentionOpsPerWorker: 1,
  });
  assert.equal(receipt.schema, DURABILITY_RECEIPT_SCHEMA);
  assert.equal(verifyDurabilityReceipt(receipt).ok, true);
  assert.equal(receipt.allInvariantsHeld, true, 'the verdicts are reproducible across runs');
  const executedRefs = receipt.gapsObserved
    .filter((gap) => gap.executed === true)
    .map((gap) => gap.ref)
    .sort();
  assert.deepEqual(executedRefs, []);
});

// ---------------------------------------------------------------------------
// MV-B5 gap G2 regression: the phase0b persistence lock is pid-stamped and
// reclaimable. These are DIRECT behavioral proofs against the production lock
// (not the drill): a real second live process is spawned so "a live holder is
// never stolen from" is proven against an actually-running holder rather than a
// simulated one.
// ---------------------------------------------------------------------------

const PHASE0B_URL = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'model-village-phase0b-runtime.mjs'),
).href;

const G2_SCRATCH_DIRS = [];

function g2Scratch() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mv-b5-g2-lock-'));
  G2_SCRATCH_DIRS.push(dir);
  return dir;
}

after(() => {
  for (const dir of G2_SCRATCH_DIRS) rmSync(dir, { force: true, recursive: true });
});

/** Spawns a REAL child that takes the production lock and blocks holding it. */
function spawnLiveLockHolder(storeDir) {
  // No backslash escapes in the generated source: String.fromCharCode(10) is
  // the newline, so nothing here depends on nested escaping surviving.
  const source = [
    `const m = await import(${JSON.stringify(PHASE0B_URL)});`,
    `m.acquirePersistentStoreLock(${JSON.stringify(storeDir)});`,
    "process.stdout.write('HOLDING' + String.fromCharCode(10));",
    'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);',
  ].join('\n');
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('live lock holder never signalled HOLDING'));
    }, 20000);
    child.stdout.on('data', (chunk) => {
      out += String(chunk);
      if (out.includes('HOLDING')) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    let err = '';
    child.stderr.on('data', (chunk) => {
      err += String(chunk);
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`live lock holder exited early (${code}/${signal}): ${err.trim()}`));
    });
  });
}

test('G2: a LIVE holder is never stolen from (real second process)', {
  timeout: SUITE_TIMEOUT_MS,
}, async () => {
  const { acquirePersistentStoreLock } = await import(PHASE0B_URL);
  const storeDir = path.join(g2Scratch(), 'phase0b');
  mkdirSync(storeDir, { recursive: true });

  const holder = await spawnLiveLockHolder(storeDir);
  const lockFile = path.join(storeDir, 'state.lock');
  try {
    const bytesBefore = readFileSync(lockFile, 'utf8');
    assert.equal(
      JSON.parse(bytesBefore).pid,
      holder.pid,
      'the production lock records the holding process pid',
    );
    // A contender must refuse — and must not have touched the lock at all.
    assert.throws(
      () => acquirePersistentStoreLock(storeDir),
      /Persistent authorization store is locked by another writer/,
      "a live holder's lock must never be stolen",
    );
    assert.equal(existsSync(lockFile), true, 'the refused contender left the lock in place');
    assert.equal(
      readFileSync(lockFile, 'utf8'),
      bytesBefore,
      'the refused contender did not rewrite the live holder record',
    );
  } finally {
    holder.kill('SIGKILL');
    await new Promise((resolve) => holder.on('exit', resolve));
  }

  // Now that the holder is genuinely dead, the SAME leaked lock is reclaimable.
  const descriptor = acquirePersistentStoreLock(storeDir);
  assert.equal(
    JSON.parse(readFileSync(lockFile, 'utf8')).pid,
    process.pid,
    'the reclaimed lock is re-stamped with the new holder pid (broken and retaken once)',
  );
  closeSync(descriptor);
  releasePersistentStoreLock(storeDir);
  assert.equal(existsSync(lockFile), false, 'release removes the lock');
});

test('G2: a dead-pid lock is broken exactly once and the store becomes writable', {
  timeout: SUITE_TIMEOUT_MS,
}, async () => {
  const { acquirePersistentStoreLock } = await import(PHASE0B_URL);
  const storeDir = path.join(g2Scratch(), 'phase0b');
  mkdirSync(storeDir, { recursive: true });
  const lockFile = path.join(storeDir, 'state.lock');

  // A pid that has certainly exited: spawn a real child and wait for its exit.
  const corpse = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
  const deadPid = corpse.pid;
  await new Promise((resolve) => corpse.on('exit', resolve));

  const stale = `{"acquiredAt":"2026-07-27T00:00:00.000Z","pid":${deadPid}}\n`;
  writeFileSync(lockFile, stale, 'utf8');

  const descriptor = acquirePersistentStoreLock(storeDir);
  const reclaimed = JSON.parse(readFileSync(lockFile, 'utf8'));
  assert.equal(reclaimed.pid, process.pid, 'the stale lock was broken and retaken');
  assert.notEqual(readFileSync(lockFile, 'utf8'), stale, 'the stale record is gone');
  closeSync(descriptor);
  releasePersistentStoreLock(storeDir);

  // Second acquire on a now-clean dir still works: breaking is per-acquire, not
  // a mode the lock gets stuck in.
  const second = acquirePersistentStoreLock(storeDir);
  closeSync(second);
  releasePersistentStoreLock(storeDir);
  assert.equal(existsSync(lockFile), false);
});

/**
 * Every lock-record shape that names no usable holder. pidIsAlive() answers
 * "not alive" for ALL of them, so any lock that feeds a raw record to a liveness
 * probe treats each one as a DEAD holder and breaks the lock on the strength of
 * garbage. An unknown holder is not a dead holder.
 */
const UNIDENTIFIABLE_HOLDERS = Object.freeze([
  ['empty file (the pre-fix lock shape)', ''],
  ['non-JSON garbage', 'held-by-adversarial-test\n'],
  ['JSON without a pid', '{"acquiredAt":"2026-07-27T00:00:00.000Z"}\n'],
  ['null pid', '{"acquiredAt":"2026-07-27T00:00:00.000Z","pid":null}\n'],
  ['non-integer pid', '{"pid":"not-a-pid"}\n'],
  ['string pid', '{"acquiredAt":"2026-07-27T00:00:00.000Z","pid":"4242"}\n'],
  ['float pid', '{"acquiredAt":"2026-07-27T00:00:00.000Z","pid":12.5}\n'],
  ['zero pid', '{"acquiredAt":"2026-07-27T00:00:00.000Z","pid":0}\n'],
  ['nonsense pid value', '{"pid":-1}\n'],
  ['truncated JSON', '{"acquiredAt":"2026-07-2'],
]);

test('G2: a lock with garbage or missing pid FAILS CLOSED and is left untouched', {
  timeout: SUITE_TIMEOUT_MS,
}, async () => {
  const { acquirePersistentStoreLock } = await import(PHASE0B_URL);
  const storeDir = path.join(g2Scratch(), 'phase0b');
  mkdirSync(storeDir, { recursive: true });
  const lockFile = path.join(storeDir, 'state.lock');

  // An unknown holder is NOT a dead holder: none of these may be broken.
  for (const [label, content] of UNIDENTIFIABLE_HOLDERS) {
    writeFileSync(lockFile, content, 'utf8');
    assert.throws(
      () => acquirePersistentStoreLock(storeDir),
      /Persistent authorization store is locked by another writer/,
      `${label}: an unidentifiable holder must fail closed, never be broken`,
    );
    assert.equal(existsSync(lockFile), true, `${label}: the lock file must survive the refusal`);
    assert.equal(
      readFileSync(lockFile, 'utf8'),
      content,
      `${label}: the lock file must be left byte-identical`,
    );
  }
  rmSync(lockFile, { force: true });
});

test('G2: the CUSTODY lock fails closed on the same table (shared-primitive parity)', {
  timeout: SUITE_TIMEOUT_MS,
}, async () => {
  // The phase0b assertion above proved only ONE of the two locks that share
  // breakStaleLockFile. The custody lock had no pid-plausibility gate of its own
  // and passed a raw `holder.pid` straight to a liveness probe, so 6 of these 10
  // shapes opened a SECOND concurrent handle against the store whose entire lock
  // rationale is that a second handle forks the append-only chain and
  // permanently fails validateAccessLogChain. The gate now lives in the shared
  // primitive, which is what makes "one fix serves both locks" a fact rather
  // than an aspiration — and this test is what stops the two drifting again.
  const custody = await import(
    pathToFileURL(path.join(
      path.dirname(fileURLToPath(import.meta.url)), '..', 'model-village-custody-store.mjs',
    )).href
  );

  for (const [label, content] of UNIDENTIFIABLE_HOLDERS) {
    const rootDir = path.join(g2Scratch(), 'custody');
    const seeded = custody.createSealedCustodyStore({
      operator: 'operator-durability-suite',
      retentionPolicy: {
        description: 'durability suite retention policy, frozen before the run',
        frozenAt: '2026-07-27T00:00:00.000Z',
        policyId: 'durability-suite-retention-v1',
      },
      rootDir,
      runLabel: 'durability-suite',
    });
    seeded.sealObject({
      bytes: Buffer.from('parity-probe'),
      kind: 'raw-model-response',
      label: 'parity-probe',
    });
    seeded.close();

    const lockFile = path.join(rootDir, 'store.lock');
    writeFileSync(lockFile, content, 'utf8');
    let opened = null;
    assert.throws(
      () => {
        opened = custody.openSealedCustodyStore({
          operator: 'operator-durability-suite',
          rootDir,
        });
      },
      custody.CustodyLockError,
      `${label}: an unidentifiable custody holder must fail closed, never be broken`,
    );
    if (opened) {
      try {
        opened.close();
      } catch {
        /* the assertion above already failed; just do not leak a handle */
      }
    }
    assert.equal(existsSync(lockFile), true, `${label}: the custody lock must survive the refusal`);
    assert.equal(
      readFileSync(lockFile, 'utf8'),
      content,
      `${label}: the custody lock must be left byte-identical`,
    );
  }
});

// ---------------------------------------------------------------------------
// MV-B5 gap G2, review round 2: MUTUAL EXCLUSION under a stale lock.
//
// The first G2 fix reclaimed the leaked lock but broke it with a path-bound
// `unlinkSync(target)`: every contender that had read the same dead pid removed
// whatever happened to be at that path, so N contenders became N winners (2-8
// per trial, 12/12 trials) and a LIVE holder's lock could be deleted. The break
// is now identity-bound and only its winner may retry. These tests race REAL OS
// processes — a unit assertion cannot see this class of defect.
// ---------------------------------------------------------------------------

/** Contenders per racing trial, and the ceiling on how long a winner holds. */
const RACE_CONTENDERS = 8;
const RACE_HOLD_CEILING_MS = 5000;

/**
 * Trials per run. This number is the DETECTION POWER of the only test that can
 * see this defect class, so it is derived, not picked.
 *
 * MEASURED against the pre-fix module with this exact race shape (8 contenders,
 * winner holds until every peer reports): 4 double-acquires in 60 trials = 6.7%
 * per trial. Detection probability per run is 1-(1-0.067)^n, so:
 *     6 trials  -> 34%   (the value this test shipped with: it would MISS a
 *                         reintroduced double-acquire about two runs in three)
 *    40 trials  -> 94%
 *    60 trials  -> 98%
 * 40 is the knee. A guard against a fourth wrong cut that passes on a broken
 * lock two runs in three is not a guard.
 *
 * RACE_TIMEOUT_MS is separate from SUITE_TIMEOUT_MS because this one test now
 * spawns 40 x 8 = 320 real processes. Measured locally at 37.8s; the ceiling is
 * set ~8x above that so a loaded CI box fails on the ASSERTION, never on the
 * clock (a timeout here would read as a lock hang and send the next agent
 * hunting a defect that is not there).
 */
const RACE_TRIALS = 40;
const RACE_TIMEOUT_MS = 300000;

/**
 * Source for a child that waits on a barrier, then races for the REAL lock.
 *
 * The winner holds until EVERY other contender has recorded a result (bounded
 * by RACE_HOLD_CEILING_MS). That is load-bearing, not padding. A contender that
 * acquires the lock here never releases it — it just exits — so with a fixed
 * short hold a straggler whose process started late would find a lock whose
 * recorded pid is now genuinely dead, break it correctly, and be counted as a
 * second "winner" even though the two never coexisted. Measured on this host:
 * that sequential-reclaim case fired in 6/60 trials against the PRE-FIX module
 * and 1/60 against the fixed one, i.e. it tracks process-start jitter and not
 * the defect at all. Holding until everyone has reported removes it: while the
 * winner is alive and holding, a second winner can only mean two LIVE holders.
 * The recorded acquire/release stamps let the assertion say which case it saw
 * instead of guessing.
 */
function contenderSource(storeDir, barrier, resultFile) {
  return [
    `const m = await import(${JSON.stringify(PHASE0B_URL)});`,
    "const fs = await import('node:fs');",
    `const barrier = ${JSON.stringify(barrier)};`,
    `const resultFile = ${JSON.stringify(resultFile)};`,
    'const nap = (ms) => {',
    '  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);',
    '};',
    // A busy `while (!existsSync(barrier))` spin here is CPU-bound and starves
    // its own peers: at higher contender counts it delayed contenders badly
    // enough to look like a lock hang. Napping 1ms between polls keeps the
    // release just as tight while leaving the scheduler room to start everyone.
    'const barrierDeadline = Date.now() + 20000;',
    'while (!fs.existsSync(barrier) && Date.now() < barrierDeadline) { nap(1); }',
    'const reported = () => {',
    '  try {',
    "    return fs.readFileSync(resultFile, 'utf8')",
    '      .split(String.fromCharCode(10)).filter((line) => line.length > 0).length;',
    '  } catch { return 0; }',
    '};',
    'let row;',
    'try {',
    `  m.acquirePersistentStoreLock(${JSON.stringify(storeDir)});`,
    '  const acquiredAt = Date.now();',
    `  const holdUntil = acquiredAt + ${RACE_HOLD_CEILING_MS};`,
    `  while (reported() < ${RACE_CONTENDERS - 1} && Date.now() < holdUntil) { nap(2); }`,
    `  const raw = fs.readFileSync(${JSON.stringify(path.join(storeDir, 'state.lock'))}, 'utf8');`,
    '  row = { pid: process.pid, won: true, recordedPid: JSON.parse(raw).pid,',
    '    acquiredAt, releasedAt: Date.now() };',
    '} catch { row = { pid: process.pid, won: false, at: Date.now() }; }',
    `fs.appendFileSync(${JSON.stringify(resultFile)}, JSON.stringify(row) + String.fromCharCode(10));`,
  ].join('\n');
}

async function deadPid() {
  const corpse = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
  const pid = corpse.pid;
  await new Promise((resolve) => corpse.on('exit', resolve));
  return pid;
}

/** Same liveness test the production lock uses, for fixture validation only. */
function pidIsAliveForFixture(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

test('G2: N real processes racing ONE stale lock produce exactly one winner', {
  timeout: RACE_TIMEOUT_MS,
}, async () => {
  const storeDir = path.join(g2Scratch(), 'phase0b');
  mkdirSync(storeDir, { recursive: true });
  const lockFile = path.join(storeDir, 'state.lock');
  const barrier = path.join(storeDir, '..', 'barrier');
  const resultFile = path.join(storeDir, '..', 'results.jsonl');
  const source = contenderSource(storeDir, barrier, resultFile);

  const winCounts = [];
  for (let trial = 0; trial < RACE_TRIALS; trial += 1) {
    // A FRESH corpse pid per trial. Reusing one pid across every trial made the
    // fixture rot: Windows recycles pids, and over a long run the "stale" pid
    // was handed to one of the racing children — every contender then read a
    // genuinely LIVE holder and correctly refused, producing a zero-winner
    // trial that looked like a lock defect and was a fixture defect (measured:
    // 1 in 90 trials with a shared pid; 0 in 120 with a per-trial pid).
    const stalePid = await deadPid();
    writeFileSync(resultFile, '', 'utf8');
    rmSync(barrier, { force: true });
    writeFileSync(
      lockFile,
      `{"acquiredAt":"2026-07-27T00:00:00.000Z","pid":${stalePid}}\n`,
      'utf8',
    );
    const kids = [];
    for (let index = 0; index < RACE_CONTENDERS; index += 1) {
      kids.push(spawn(process.execPath, ['--input-type=module', '-e', source], { stdio: 'ignore' }));
    }
    await new Promise((resolve) => { setTimeout(resolve, 250); });
    writeFileSync(barrier, 'go', 'utf8');
    await Promise.all(kids.map((kid) => new Promise((resolve) => kid.on('exit', resolve))));
    const rows = readFileSync(resultFile, 'utf8')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line));
    // Every contender must have reported, or the trial proved nothing.
    assert.equal(
      rows.length,
      RACE_CONTENDERS,
      `trial ${trial}: all ${RACE_CONTENDERS} contenders must report a result, `
      + `got ${rows.length}`,
    );
    // The fixture must still be a DEAD holder. If the pid was recycled onto a
    // live process mid-trial the lock was right to refuse, and this assertion
    // says so instead of letting a fixture artifact masquerade as a defect.
    assert.equal(
      pidIsAliveForFixture(stalePid),
      false,
      `trial ${trial}: the stale-holder pid ${stalePid} was recycled onto a live `
      + 'process, so this trial could not test breaking at all',
    );
    // The break token must never outlive the break that took it: a leaked token
    // would block all future breaking until its age floor expires, which is the
    // one new wedge the serialization could introduce. The staging file the
    // token is link()ed from must not survive either — it is unique per call, so
    // a leaked one is inert, but a persistent leak would still be a bug.
    const residue = readdirSync(storeDir);
    const tokenResidue = residue.filter((name) => name.endsWith('.break'));
    assert.deepEqual(
      tokenResidue,
      [],
      `trial ${trial}: the break token must be released, found: ${tokenResidue.join(',')}`,
    );
    const stagingResidue = residue.filter((name) => name.includes('.break-pending-'));
    assert.deepEqual(
      stagingResidue,
      [],
      `trial ${trial}: token staging files must be cleaned up, found: ${stagingResidue.join(',')}`,
    );
    const winners = rows.filter((row) => row.won).sort((a, b) => a.acquiredAt - b.acquiredAt);
    const overlapping = winners.some(
      (row, index) => index > 0 && row.acquiredAt < winners[index - 1].releasedAt,
    );
    assert.equal(
      winners.length,
      1,
      `trial ${trial}: a stale lock must admit exactly ONE writer, got `
      + `${winners.length} (holds overlapped: ${overlapping}): `
      + `${JSON.stringify(winners)}`,
    );
    assert.equal(
      winners[0].recordedPid,
      winners[0].pid,
      'the single winner is the pid recorded in the lock it holds — a foreign '
      + 'pid means the winner\'s own lock was moved out from under it',
    );
    winCounts.push(winners.length);
    rmSync(lockFile, { force: true });
  }
  assert.deepEqual(winCounts, Array.from({ length: RACE_TRIALS }, () => 1));
});

test('G2: a contender holding a STALE decision refuses rather than stealing a live lock', {
  timeout: SUITE_TIMEOUT_MS,
}, async () => {
  const { acquirePersistentStoreLock, breakStaleLockFile } = await import(PHASE0B_URL);
  const storeDir = path.join(g2Scratch(), 'phase0b');
  mkdirSync(storeDir, { recursive: true });
  const lockFile = path.join(storeDir, 'state.lock');
  const stalePid = await deadPid();
  writeFileSync(
    lockFile,
    `{"acquiredAt":"2026-07-27T00:00:00.000Z","pid":${stalePid}}\n`,
    'utf8',
  );

  // Contender B, step 1: it has read the stale holder and DECIDED to break.
  const observed = readFileSync(lockFile);

  // Meanwhile a real live holder takes the lock through the real function.
  const holder = await spawnLiveLockHolder(storeDir);
  const liveBytes = readFileSync(lockFile, 'utf8');
  assert.equal(JSON.parse(liveBytes).pid, holder.pid);

  try {
    // Contender B, step 2 — the literal post-fix source step.
    const outcome = breakStaleLockFile(lockFile, observed);
    assert.notEqual(outcome, 'broke', "a live holder's lock must never be broken");
    assert.equal(existsSync(lockFile), true, 'the live lock is still there');
    assert.equal(
      readFileSync(lockFile, 'utf8'),
      liveBytes,
      'the live holder record is byte-identical after the refused break',
    );
    assert.throws(
      () => acquirePersistentStoreLock(storeDir),
      /Persistent authorization store is locked by another writer/,
      'and the whole acquire still refuses',
    );
  } finally {
    holder.kill('SIGKILL');
    await new Promise((resolve) => holder.on('exit', resolve));
  }
});

test('G2: release is ownership-verified — it never removes a successor lock', {
  timeout: SUITE_TIMEOUT_MS,
}, async () => {
  const { acquirePersistentStoreLock } = await import(PHASE0B_URL);
  const storeDir = path.join(g2Scratch(), 'phase0b');
  mkdirSync(storeDir, { recursive: true });
  const lockFile = path.join(storeDir, 'state.lock');

  const descriptor = acquirePersistentStoreLock(storeDir);
  // Model the residual case the break can still produce: this holder's lock is
  // removed and a SUCCESSOR takes the path.
  rmSync(lockFile, { force: true });
  const successor = `{"acquiredAt":"2026-07-27T00:00:00.000Z","pid":${process.pid + 1}}\n`;
  writeFileSync(lockFile, successor, 'utf8');

  closeSync(descriptor);
  releasePersistentStoreLock(storeDir);
  assert.equal(
    existsSync(lockFile),
    true,
    "a stale holder's release must not delete the successor's lock",
  );
  assert.equal(readFileSync(lockFile, 'utf8'), successor, 'left byte-identical');
  rmSync(lockFile, { force: true });
});
