/* global Buffer, structuredClone */

// Offline tests for the Model Village run conductor (the T-7 twelve-run dress
// rehearsal). node --test, node builtins only, zero network.
//
// NOTE ON THE PROBE URL BELOW. The provider-call tests dispatch against
// `http://provider.invalid/...`. `.invalid` is reserved by RFC 2606 and can
// never resolve, and in any case the fence REFUSES every absolute-http target
// before delegating, so no socket is ever opened. It is a sentinel chosen to
// exercise the classifier, not a stand-in for a real service.
//
// TWO THINGS THESE TESTS EXIST TO PROVE, because the audit that preceded this
// slice found both absent across the lane:
//
//  (1) THE PROVIDER-CALL COUNTER IS REAL. The lane's previous zero was
//      assert(0 === 0): the lifecycle emitted the literal `providerCalls: 0`
//      and then asserted the sum was 0, with nothing intercepting fetch. Here a
//      turn executor is fed that DOES call the fetch handed down to it, and the
//      rehearsal must FAIL — with every other measurement still green, so the
//      failure is attributable to the counter alone.
//
//  (2) THE CLAIM BOUNDARY SURVIVES CONSTANT MUTATION. Following the only
//      template in this lane that survived it
//      (__tests__/hololand-model-village-alias-custody.test.mjs:477-496): flip
//      a claim, RE-SIGN the receipt so the hash recomputes, and assert the
//      verifier still rejects with a specific reason. A boundary that only
//      catches un-re-hashed edits is a ritual.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';

import {
  REHEARSAL_EXPECTATIONS,
  assertRunPlanSequence,
  buildSeatAliasBindings,
  buildVillageRunPlan,
  REHEARSAL_VARIANCE_ALLOWLIST,
  compareRehearsalExecutions,
  createReplayTurnExecutor,
  deriveAggregate,
  deriveRunPlacement,
  installProviderCallFence,
  isProviderFetchTarget,
  loadStudyPolicyManifest,
  runRehearsal,
  verifyRehearsalReceipt,
} from '../model-village-run-conductor.mjs';
import { loadFrozenAssignmentMatrix } from '../model-village-alias-vault.mjs';
import { canonicalDigest } from '../model-village-phase0b-runtime.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const scratchBase = path.join(repoRoot, '.tmp', 'hololand', 'model-village', 'conductor-tests');

/** Reserved, non-resolvable, and refused by the fence before any dispatch. */
const PROBE_TARGET = 'http://provider.invalid/v1/chat/completions';

/** Re-signs a mutated receipt body so the self-hash recomputes cleanly. */
function reSign(receipt, mutate) {
  const unsigned = { ...receipt };
  delete unsigned.receiptHash;
  const mutated = mutate(structuredClone(unsigned));
  return { ...mutated, receiptHash: canonicalDigest(mutated) };
}

/**
 * The FULL forgery: rewrite every run entry, RESEAL each entryHash, RE-DERIVE
 * the aggregate, and re-sign the receipt. A forgery that fails only because a
 * hash went stale proves nothing about the field it rewrote, so per-run
 * mutations in this file go through here rather than through reSign alone.
 */
function reSignRuns(receipt, mutateRun) {
  return reSign(receipt, (body) => {
    body.runs = body.runs.map((run, index) => {
      const { entryHash, ...unsigned } = run;
      void entryHash;
      const mutated = mutateRun(unsigned, index);
      return { ...mutated, entryHash: canonicalDigest(mutated) };
    });
    body.aggregate = deriveAggregate(body.runs);
    return body;
  });
}

after(() => {
  if (existsSync(scratchBase)) {
    try {
      rmSync(scratchBase, { force: true, recursive: true });
    } catch {
      // Windows can hold a handle briefly after teardown; leftover scratch is
      // not a test failure.
    }
  }
});

// ---------------------------------------------------------------------------

describe('study policy source', () => {
  let studyBundle;

  before(async () => {
    studyBundle = await loadStudyPolicyManifest({ hololandRoot: repoRoot });
  });

  test('mv-study-policy-v1 carries the study shape the production plan requires', () => {
    assert.equal(studyBundle.policy.policyId, 'mv-study-policy-v1');
    assert.equal(studyBundle.policy.residentsPerTurn, 6);
    assert.equal(studyBundle.policy.turnsPerRun, 6);
    assert.equal(studyBundle.policy.concurrencyLimit, 2);
    assert.equal(studyBundle.policy.retryCount, 0);
    assert.equal(studyBundle.policy.adjudicationDefault, 'deny');
    assert.equal(
      studyBundle.policy.barrierRule,
      'all-turns-resolved-before-any-adjudication',
    );
  });

  test('the lane statement REQUIRES sealed alias assignment (the inverse of mv-b2)', () => {
    const statement = studyBundle.policy.laneStatement;
    assert.match(statement, /sealed alias assignment is REQUIRED/i);
    // The MV-B2 clause that seals that policy against MV-B3 must NOT be
    // restated here — that is the whole reason this is a new source.
    assert.doesNotMatch(statement, /no blinded alias assignment is performed/i);
  });

  test('the vocabulary is referenced, never duplicated', () => {
    assert.equal(
      studyBundle.policy.vocabularyRef,
      'model-village-adapter-custody-drill.hs#ModelVillageProposalVocabulary',
    );
    // The loaded vocabulary is MV-B1's, arriving through MV-B1's own loader.
    assert.deepEqual(
      [...studyBundle.vocabulary.allowedActions].sort(),
      ['abstain', 'contribute_water'],
    );
    assert.equal(studyBundle.vocabulary.defaultDecision, 'deny');
  });

  test('the pre-authorized catalog is wider than one action and states its own limit', () => {
    assert.ok(
      studyBundle.catalogActions.length >= 2,
      'a one-action catalog is a permission check, not a choice set',
    );
    const actions = studyBundle.catalogActions.map((entry) => entry.action).sort();
    assert.deepEqual(actions, ['abstain', 'contribute_water']);
    assert.match(studyBundle.catalog.catalogStatement, /catalog width/i);
    assert.match(
      studyBundle.catalog.catalogStatement,
      /idea-seeds\/2026-07-26-open-outcome-receipt-tier\.md/,
    );
  });

  test('the block order is derived from the frozen kernel, not authored beside it', () => {
    // Loading already refuses on disagreement; this pins the observed values.
    assert.deepEqual(studyBundle.conditionOrder.block1, [
      'mixed', 'adapter_a_only', 'adapter_b_only', 'adapter_c_only',
    ]);
    assert.deepEqual(studyBundle.conditionOrder.block2, [
      'adapter_b_only', 'adapter_c_only', 'mixed', 'adapter_a_only',
    ]);
    assert.deepEqual(studyBundle.conditionOrder.block3, [
      'adapter_c_only', 'adapter_b_only', 'adapter_a_only', 'mixed',
    ]);
  });

  test('the scheduler projection is the exact eight-key bundle MV-B2 accepts', () => {
    assert.deepEqual(
      Object.keys(studyBundle.schedulerPolicyBundle).sort(),
      [
        'manifestHash', 'policy', 'policyHash', 'preauthorizedCatalog',
        'promptTemplate', 'snapshotFixture', 'vocabulary', 'vocabularyHash',
      ],
    );
    assert.equal(
      studyBundle.schedulerPolicyBundle.policyHash,
      studyBundle.schedulerPolicyBundle.manifestHash,
    );
  });

  test('the plan is three seed blocks of four conditions = twelve village-runs', () => {
    const plan = buildVillageRunPlan(studyBundle);
    assert.equal(plan.length, 12);
    assert.equal(new Set(plan.map((run) => run.runId)).size, 12);
    assert.deepEqual([...new Set(plan.map((run) => run.dayIndex))], [1, 2, 3]);
  });

  test('homogeneous conditions give all six seats one alias; mixed takes the latin square row', () => {
    const matrixBundle = loadFrozenAssignmentMatrix({ hololandRoot: repoRoot });
    const homogeneous = buildSeatAliasBindings({
      blockId: 'block1',
      condition: 'adapter_b_only',
      matrix: matrixBundle.matrix,
    });
    assert.equal(homogeneous.length, 6);
    assert.deepEqual([...new Set(homogeneous.map((b) => b.adapterAlias))], ['adapter_b']);

    const mixed = buildSeatAliasBindings({
      blockId: 'block1',
      condition: 'mixed',
      matrix: matrixBundle.matrix,
    });
    assert.deepEqual(
      mixed.map((b) => b.adapterAlias),
      matrixBundle.matrix.blocks.block1,
    );
    // Seat -> alias is public study vocabulary; no route ever appears here.
    assert.equal(canonicalDigest(mixed).length, 64);
    assert.doesNotMatch(JSON.stringify(mixed), /sovereign-|http/i);
  });
});

// ---------------------------------------------------------------------------

describe('provider-call fence', () => {
  test('classifies absolute http targets as provider calls and everything else as not', () => {
    assert.equal(isProviderFetchTarget(PROBE_TARGET), true);
    assert.equal(isProviderFetchTarget('https://example.invalid/x'), true);
    assert.equal(isProviderFetchTarget('/holoscript_wasm_bg.wasm'), false);
    assert.equal(isProviderFetchTarget('file:///tmp/x'), false);
    assert.equal(isProviderFetchTarget('not a url'), false);
  });

  test('the counter increments and the provider call is refused', async () => {
    const fence = installProviderCallFence();
    try {
      await assert.rejects(
        () => fence.fetch(PROBE_TARGET),
        /provider call was attempted/,
      );
      assert.equal(fence.state.providerCalls, 1);
      // Counted off the fence's own baseline cursor, which is taken after the
      // install-time self-test probe that proves the counter can move at all.
      assert.equal(fence.state.calls - fence.baseline.calls, 1);
      assert.deepEqual(fence.state.providerTargets, [PROBE_TARGET]);
    } finally {
      fence.restore();
    }
  });

  test('restore puts the original binding back', () => {
    const original = globalThis.fetch;
    const fence = installProviderCallFence();
    assert.notEqual(globalThis.fetch, original);
    fence.restore();
    assert.equal(globalThis.fetch, original);
  });
});

// ---------------------------------------------------------------------------

describe('the twelve-run dress rehearsal', () => {
  let result;
  let receipt;

  before(async () => {
    result = await runRehearsal({
      hololandRoot: repoRoot,
      scratchRoot: path.join(scratchBase, 'clean'),
      writeReceipt: false,
    });
    receipt = result.receipt;
  });

  test('it executes and passes', () => {
    assert.deepEqual(result.failures, [], 'rehearsal reported expectation failures');
    assert.equal(receipt.passed, true);
    assert.equal(receipt.schema, 'hololand.model-village-rehearsal.v1');
    assert.equal(receipt.studyPolicyId, 'mv-study-policy-v1');
  });

  test('the twelve-run shape actually ran', () => {
    assert.equal(receipt.runs.length, 12);
    assert.equal(receipt.aggregate.villageRunsExecuted, 12);
    assert.equal(receipt.aggregate.turnRoundsExecuted, 72);
    assert.equal(receipt.aggregate.modelTurnsResolved, 432);
    assert.equal(receipt.aggregate.turnOutcomeCounts.completed, 432);
    assert.equal(receipt.aggregate.turnOutcomeCounts.failed, 0);
    assert.equal(receipt.aggregate.turnOutcomeCounts.timedOut, 0);
    for (const run of receipt.runs) {
      assert.equal(run.turnRounds.length, 6);
    }
  });

  test('zero provider calls, MEASURED — and non-provider traffic is published, not hidden', () => {
    assert.equal(receipt.observed.providerFetchCallsObserved, 0);
    assert.deepEqual(receipt.observed.providerFetchCallTargets, []);
    // The fence saw at least the HoloScript core WASM initialization. It is
    // counted and named rather than silently excluded.
    assert.ok(receipt.observed.fetchCallsObserved >= 0);
    assert.equal(
      receipt.observed.nonProviderFetchCallTargets.every(
        (target) => !isProviderFetchTarget(target),
      ),
      true,
    );
  });

  test('every replayed turn was one sealed-custody read', () => {
    assert.equal(
      receipt.observed.custodyResponseReadsObserved,
      receipt.aggregate.modelTurnsResolved,
    );
    assert.equal(receipt.observed.custodyResponseReadsObserved, 432);
  });

  test('all five slices actually composed', () => {
    // MV-B2 isolation: twelve distinct shards, none carrying cross-run state.
    assert.equal(receipt.aggregate.distinctRunDirectoryCount, 12);
    assert.equal(receipt.aggregate.crossRunStateFindings, 0);
    // MV-B3 alias vault: sealed per block, and the sealed record re-derived
    // every public commitment at unblinding.
    assert.equal(receipt.observed.aliasBlocksSealed, 3);
    assert.equal(receipt.observed.aliasUnblindingsVerified, 3);
    assert.equal(receipt.observed.aliasCommitmentVerificationFailures, 0);
    // MV-B4: the conductor's OWN run manifest is the one that was signed and
    // fleet-verified against the published trust registry.
    assert.equal(receipt.observed.trustRegistryEntriesAppended, 12);
    assert.equal(receipt.observed.trustRegistryVerified, true);
    assert.equal(receipt.aggregate.runManifestSignaturesVerified, 12);
    assert.equal(receipt.aggregate.runManifestSignatureFailures, 0);
    // MV-B2 adjudication chains close on every round of every run.
    assert.equal(receipt.aggregate.chainVerificationFailures, 0);
    assert.equal(receipt.aggregate.schedulerFrozenRounds, 0);
  });

  test('both catalog entries were exercised, so the wider catalog is not decorative', () => {
    const counts = receipt.aggregate.decisionCounts;
    assert.ok(counts.preauthorizedMatch > 0, 'the gating action never occurred');
    assert.ok(counts.noPreauthorizedMatch > 0, 'the deny case never occurred');
    assert.equal(counts.admitted, counts.preauthorizedMatch + counts.noPreauthorizedMatch);
    assert.equal(counts.admitted + counts.denied, receipt.aggregate.modelTurnsResolved);
  });

  test('no route identity leaks into the public rehearsal receipt', () => {
    const serialized = JSON.stringify(receipt);
    assert.doesNotMatch(serialized, /sovereign-holoserve|sovereign-holollama/);
    assert.doesNotMatch(serialized, /127\.0\.0\.1|192\.168\./);
  });

  test('the receipt verifies', () => {
    const check = verifyRehearsalReceipt(receipt);
    assert.equal(check.ok, true, check.failureReason);
    assert.deepEqual(check.failures, []);
  });

  // -------------------------------------------------------------------------
  // Claim enforcement: flip AND RE-SIGN.
  // -------------------------------------------------------------------------

  test('a flipped `passed` cannot be laundered by re-signing', () => {
    const forged = reSign(receipt, (body) => {
      body.passed = false;
      return body;
    });
    const check = verifyRehearsalReceipt(forged);
    assert.equal(check.ok, false, '`passed` was allowed to disagree with the recomputation');
    assert.match(check.failureReason, /does not match the recomputed verdict/);
  });

  test('a flipped observed counter cannot be laundered by re-signing', () => {
    for (const [key, value] of [
      ['providerFetchCallsObserved', 7],
      ['custodyResponseReadsObserved', 431],
      ['aliasBlocksSealed', 2],
      ['aliasUnblindingsVerified', 0],
      ['trustRegistryEntriesAppended', 11],
    ]) {
      const forged = reSign(receipt, (body) => {
        body.observed = { ...body.observed, [key]: value };
        return body;
      });
      const check = verifyRehearsalReceipt(forged);
      assert.equal(check.ok, false, `observed.${key} was allowed to be rewritten`);
    }
  });

  test('a flipped aggregate cannot be laundered by re-signing (it is re-derived)', () => {
    for (const mutate of [
      (body) => { body.aggregate = { ...body.aggregate, villageRunsExecuted: 13 }; return body; },
      (body) => { body.aggregate = { ...body.aggregate, modelTurnsResolved: 999 }; return body; },
      (body) => { body.aggregate = { ...body.aggregate, rehearsalRoot: '0'.repeat(64) }; return body; },
    ]) {
      const forged = reSign(receipt, mutate);
      const check = verifyRehearsalReceipt(forged);
      assert.equal(check.ok, false, 'a rewritten aggregate survived');
      assert.match(check.failureReason, /aggregate does not re-derive/);
    }
  });

  test('a run entry cannot be dropped, and a dropped run cannot be papered over', () => {
    const forged = reSign(receipt, (body) => {
      body.runs = body.runs.slice(0, 11);
      return body;
    });
    const check = verifyRehearsalReceipt(forged);
    assert.equal(check.ok, false);
    assert.match(check.failureReason, /aggregate does not re-derive/);

    // ...and rebuilding the aggregate around the drop still hits the
    // independent expectation table.
    const forgedConsistent = reSign(receipt, (body) => {
      body.runs = body.runs.slice(0, 11);
      body.aggregate = deriveAggregate(body.runs);
      return body;
    });
    const consistentCheck = verifyRehearsalReceipt(forgedConsistent);
    assert.equal(consistentCheck.ok, false);
    assert.match(consistentCheck.failureReason, /recomputed verdict/);
  });

  test('a run entry field cannot be edited without breaking its own entryHash', () => {
    const forged = reSign(receipt, (body) => {
      body.runs = body.runs.map((run, index) => (
        index === 0 ? { ...run, chainVerified: false } : run
      ));
      return body;
    });
    const check = verifyRehearsalReceipt(forged);
    assert.equal(check.ok, false);
    assert.match(check.failureReason, /entryHash does not recompute/);
  });

  test('a re-signed run entry still cannot break the round chain', () => {
    const forged = reSign(receipt, (body) => {
      const run = structuredClone(body.runs[0]);
      delete run.entryHash;
      run.turnRounds[3].priorReceiptHash = '0'.repeat(64);
      run.turnRounds[3].terminalReceiptHash = '1'.repeat(64);
      const resealed = { ...run, entryHash: canonicalDigest(run) };
      body.runs = [resealed, ...body.runs.slice(1)];
      body.aggregate = deriveAggregate(body.runs);
      return body;
    });
    const check = verifyRehearsalReceipt(forged);
    assert.equal(check.ok, false, 'a broken round chain survived a full re-sign');
    assert.match(
      check.failureReason,
      /does not chain from|does not recompute from its round chain/,
    );
  });

  // -------------------------------------------------------------------------
  // THE DAY SEQUENCE. Every forgery below is built the way a real forger would
  // have to build it — rewrite the field, RESEAL each entryHash, RE-DERIVE the
  // aggregate, RE-SIGN the receipt — so nothing here can be caught by a stale
  // hash. Before the fix these all returned ok:true, failures:[].
  // -------------------------------------------------------------------------

  test('the resealing machinery itself is honest (identity re-seal still verifies)', () => {
    // THE CONTROL. If this failed, every "forgery rejected" assertion below
    // would be proving only that resealing breaks a receipt.
    const resealed = reSignRuns(receipt, (run) => run);
    const check = verifyRehearsalReceipt(resealed);
    assert.equal(check.ok, true, check.failureReason);
    assert.deepEqual(check.failures, []);
    assert.notEqual(resealed.receiptHash, undefined);
  });

  test('the day sequence cannot be collapsed to a single day, even fully re-signed', () => {
    const forged = reSignRuns(receipt, (run) => ({ ...run, dayIndex: 1 }));
    assert.deepEqual(
      forged.runs.map((run) => run.dayIndex),
      Array.from({ length: 12 }, () => 1),
      'the forgery did not actually collapse the day sequence',
    );
    const check = verifyRehearsalReceipt(forged);
    assert.equal(check.ok, false, 'a twelve-run receipt claiming one single day verified');
    assert.match(check.failureReason, /dayIndex is 1 but position 4 .* is day 2/);
  });

  test('a non-integer dayIndex cannot be laundered by re-signing', () => {
    const forged = reSignRuns(receipt, (run) => ({ ...run, dayIndex: 'not-a-day' }));
    const check = verifyRehearsalReceipt(forged);
    assert.equal(check.ok, false, 'dayIndex "not-a-day" verified');
    assert.match(check.failureReason, /dayIndex is "not-a-day"/);
  });

  test('the day sequence cannot be reordered, even fully re-signed', () => {
    const forged = reSignRuns(receipt, (run) => ({ ...run, dayIndex: 4 - run.dayIndex }));
    const check = verifyRehearsalReceipt(forged);
    assert.equal(check.ok, false, 'a reversed day sequence verified');
    assert.match(check.failureReason, /day sequence is RE-DERIVED/);
  });

  test('dayIndex cannot be rescued by relabelling the block it derives from', () => {
    // The obvious next move for a forger: if dayIndex is derived from the
    // block, rewrite the block too. That breaks the runId identity and the
    // one-condition-per-block law instead.
    const forged = reSignRuns(receipt, (run) => ({
      ...run,
      blockId: 'block1',
      dayIndex: 1,
    }));
    const check = verifyRehearsalReceipt(forged);
    assert.equal(check.ok, false, 'a rewritten block sequence verified');
    assert.match(check.failureReason, /blockId is "block1" but position 4/);
  });

  test('a run cannot be relabelled and keep its runId', () => {
    const forged = reSignRuns(receipt, (run, index) => (
      index === 0 ? { ...run, condition: 'adapter_a_only' } : run
    ));
    const check = verifyRehearsalReceipt(forged);
    assert.equal(check.ok, false, 'a run whose runId no longer derives verified');
    assert.match(check.failureReason, /runId is .* but its own \(blockId, condition\) pair derives/);
  });

  test('the plan-sequence law is positional, not a re-statement of the receipt', async () => {
    // Cross-check against the independently built plan: the law the verifier
    // enforces must be the same one buildVillageRunPlan produces.
    const plan = buildVillageRunPlan(await loadStudyPolicyManifest({ hololandRoot: repoRoot }));
    for (const [index, planned] of plan.entries()) {
      const placement = deriveRunPlacement(index);
      assert.equal(placement.dayIndex, planned.dayIndex);
      assert.equal(placement.blockId, planned.blockId);
      assert.equal(placement.conditionIndex, planned.conditionIndex);
    }
    assert.throws(() => deriveRunPlacement(12), /outside the frozen plan/);
    assert.throws(() => assertRunPlanSequence([]), /at least one village-run/);
    assert.throws(
      () => assertRunPlanSequence([...receipt.runs, receipt.runs[0]]),
      /the frozen study plan has exactly 12/,
    );
    // A front-slice (the bounded smoke shape) is a LEGAL prefix and must not be
    // rejected by the sequence law — that is what keeps `--runs N` usable.
    assert.equal(assertRunPlanSequence(receipt.runs.slice(0, 6)), true);
  });

  test('an intra-block CONDITION PERMUTATION cannot keep its identity fields', () => {
    // THE FORGERY THE PREVIOUS LAW MISSED, and the reason validatorId,
    // runDirectory and roundRunId are now re-derived. Swapping the condition
    // between two runs of the SAME block preserves the per-block condition set,
    // so "repeats a study condition" and "runs all four conditions" never fire;
    // recomputing each runId from its new condition satisfies "pair derives".
    // Before this change the receipt verified CLEAN and the gate exited 0 while
    // runs[0] read condition=adapter_a_only against a validatorId, a shard
    // directory and six roundRunIds that all still named `mixed`.
    assert.equal(receipt.runs[0].blockId, receipt.runs[1].blockId, 'same block');
    const swapped = [receipt.runs[1].condition, receipt.runs[0].condition];
    const forged = reSignRuns(receipt, (run, index) => {
      if (index > 1) return run;
      const condition = swapped[index];
      const runId = `mv-b2-study-${run.blockId}-${condition.replace(/_/g, '-')}`;
      return {
        ...run,
        condition,
        runId,
        receiptChainRoot: canonicalDigest({
          roundTerminalHashes: run.turnRounds.map((round) => round.terminalReceiptHash),
          runId,
        }),
      };
    });
    const check = verifyRehearsalReceipt(forged);
    assert.equal(check.ok, false, 'a condition permutation must not verify clean');
    assert.match(check.failureReason, /validatorId is \S+ but its own \(blockId, condition\) pair/);

    // ...and each sibling law holds on its own, so none of them is carried by
    // the other two.
    for (const [mutate, pattern] of [
      [(run) => ({ ...run, validatorId: 'mv-study-val-block3-mixed' }),
        /validatorId is \S+ but its own/],
      [(run) => ({ ...run, runDirectory: path.join('X', 'mv-b2-study-block2-mixed') }),
        /runDirectory ends in/],
      [(run) => ({
        ...run,
        turnRounds: run.turnRounds.map((round) => ({
          ...round,
          roundRunId: 'mv-b2-study-block9-nonsense-r0',
        })),
      }), /roundRunId is/],
    ]) {
      const single = reSignRuns(receipt, (run, index) => (index === 0 ? mutate(run) : run));
      const singleCheck = verifyRehearsalReceipt(single);
      assert.equal(singleCheck.ok, false);
      assert.match(singleCheck.failureReason, pattern);
    }

    // NON-VACUITY: the reseal machinery itself is honest — an untouched pass
    // through reSignRuns still verifies.
    assert.equal(verifyRehearsalReceipt(reSignRuns(receipt, (run) => run)).ok, true);
  });

  test('a pinned declared flag cannot be flipped, even with a recomputed hash', () => {
    for (const flag of [
      'liveStudyRunClaimed',
      'openOutcomeTierClaimed',
      'operationalBlindingProven',
      'phase1AdmissionClaimed',
      'tamperProofReceiptClaimed',
      'worldMutationPerformedClaimed',
    ]) {
      const forged = reSign(receipt, (body) => {
        body.declared = { ...body.declared, [flag]: true };
        return body;
      });
      const check = verifyRehearsalReceipt(forged);
      assert.equal(check.ok, false, `${flag} was allowed to flip to true`);
      assert.match(check.failureReason, /pinned claim flag/);
    }
  });

  test('declared{} may not shadow a measured key', () => {
    const forged = reSign(receipt, (body) => {
      body.declared = { ...body.declared, providerFetchCallsObserved: 0 };
      return body;
    });
    const check = verifyRehearsalReceipt(forged);
    assert.equal(check.ok, false);
    assert.match(check.failureReason, /keys differ|shadows a measured key/);
  });

  test('an un-re-signed edit still fails on the self-hash', () => {
    const edited = { ...receipt, generatedAt: '2000-01-01T00:00:00.000Z' };
    const check = verifyRehearsalReceipt(edited);
    assert.equal(check.ok, false);
    assert.match(check.failureReason, /receiptHash does not recompute/);
  });

  test('a provider call cannot be reclassified out of the gated count', () => {
    const forged = reSign(receipt, (body) => {
      body.observed = {
        ...body.observed,
        fetchCallsObserved: body.observed.fetchCallsObserved + 1,
        nonProviderFetchCallTargets: [
          ...body.observed.nonProviderFetchCallTargets,
          PROBE_TARGET,
        ],
      };
      return body;
    });
    const check = verifyRehearsalReceipt(forged);
    assert.equal(check.ok, false);
    assert.match(check.failureReason, /recomputed verdict/);
  });
});

// ---------------------------------------------------------------------------

describe('the provider-call counter is load-bearing', () => {
  let receipt;
  let failures;

  before(async () => {
    // An executor that calls the fetch the conductor hands down, swallows the
    // refusal, and then replays normally. EVERYTHING else about this run is
    // green — every turn completes, every chain verifies, every signature
    // verifies — so the only thing that can fail the rehearsal is the measured
    // provider-call count. That is what makes this a test of the counter
    // rather than a test of the executor.
    const result = await runRehearsal({
      hololandRoot: repoRoot,
      scratchRoot: path.join(scratchBase, 'provider-call'),
      turnExecutorFactory: (context) => {
        const inner = createReplayTurnExecutor({
          captureIndex: context.captureIndex,
          readCounter: context.readCounter,
          turnCursor: context.turnCursor,
          vocabulary: context.vocabulary,
        });
        return async (args) => {
          try {
            await args.fetchImpl(PROBE_TARGET);
          } catch {
            // The fence refused it. It was still counted — that is the point.
          }
          return inner(args);
        };
      },
      writeReceipt: false,
    });
    receipt = result.receipt;
    failures = result.failures;
  });

  test('the rehearsal FAILS', () => {
    assert.equal(receipt.passed, false, 'a rehearsal that made provider calls passed');
    assert.ok(failures.length > 0);
    assert.ok(
      failures.some((entry) => entry.includes('providerFetchCallsObserved')),
      `provider-call failure not reported; got ${JSON.stringify(failures)}`,
    );
  });

  test('the counter actually counted — one call per model turn', () => {
    assert.equal(receipt.observed.providerFetchCallsObserved, 432);
    assert.equal(
      receipt.observed.providerFetchCallsObserved,
      receipt.aggregate.modelTurnsResolved,
    );
    assert.ok(receipt.observed.providerFetchCallTargets.length > 0);
    assert.equal(
      isProviderFetchTarget(receipt.observed.providerFetchCallTargets[0]),
      true,
    );
  });

  test('nothing ELSE failed, so the failure is attributable to the counter alone', () => {
    assert.equal(receipt.aggregate.turnOutcomeCounts.completed, 432);
    assert.equal(receipt.aggregate.turnOutcomeCounts.failed, 0);
    assert.equal(receipt.aggregate.chainVerificationFailures, 0);
    assert.equal(receipt.aggregate.runManifestSignatureFailures, 0);
    assert.equal(receipt.aggregate.villageRunsExecuted, 12);
  });

  test('the failing receipt still verifies as an honest record of failure', () => {
    const check = verifyRehearsalReceipt(receipt);
    assert.equal(check.ok, true, check.failureReason);
    assert.ok(check.failures.length > 0);
  });

  test('the failure cannot be laundered by flipping `passed` and re-signing', () => {
    const forged = reSign(receipt, (body) => {
      body.passed = true;
      return body;
    });
    const check = verifyRehearsalReceipt(forged);
    assert.equal(check.ok, false, 'a failed rehearsal was laundered into a pass');
    assert.match(check.failureReason, /does not match the recomputed verdict/);
  });

  test('zeroing the counter alone breaks its own incident log', () => {
    const forged = reSign(receipt, (body) => {
      body.observed = { ...body.observed, providerFetchCallsObserved: 0 };
      body.passed = true;
      return body;
    });
    const check = verifyRehearsalReceipt(forged);
    assert.equal(check.ok, false, 'the counter was zeroed without contradiction');
    assert.match(check.failureReason, /recomputed verdict/);
  });
});

// ---------------------------------------------------------------------------

describe('expectation table', () => {
  test('the twelve-run arithmetic is internally consistent', () => {
    const e = REHEARSAL_EXPECTATIONS;
    assert.equal(e.villageRunsExecuted, 12);
    assert.equal(e.turnRoundsExecuted, e.villageRunsExecuted * 6);
    assert.equal(e.modelTurnsResolved, e.turnRoundsExecuted * 6);
    assert.equal(
      e.modelTurnsResolved,
      e.turnsCompleted + e.turnsFailed + e.turnsTimedOut,
    );
    assert.equal(e.providerFetchCallsObserved, 0);
  });

  test('deriveAggregate refuses a non-array', () => {
    assert.throws(() => deriveAggregate(null), /runs must be an array/);
  });

  test('Buffer-backed hashing is available offline', () => {
    assert.equal(canonicalDigest({ a: Buffer.from('x').toString('hex') }).length, 64);
  });
});

// ---------------------------------------------------------------------------

// REPEAT-EXECUTION EQUALITY — the gate row previously named "Seed and
// deterministic clock", which nothing tested.
//
// These tests are deliberately PURE: they drive compareRehearsalExecutions with
// synthetic receipt pairs rather than paying for four more rehearsals. The
// EXECUTED end of the property lives in the checker
// (scripts/check-hololand-model-village-rehearsal.mjs step 7), which runs the
// conductor twice in two fresh processes. What is proven here is the part a
// live run cannot prove about itself: that the exemption list has teeth.
describe('repeat-execution equality', () => {
  /** A minimal receipt with the exact leaf paths the allowlist names. */
  function syntheticReceipt(suffix, extra = {}) {
    return {
      aggregate: {
        blockChainRoots: { block1: `aa${suffix}`, block2: `bb${suffix}` },
        rehearsalRoot: `cc${suffix}`,
        villageRunsExecuted: 1,
      },
      generatedAt: '2026-07-27T00:00:00.000Z',
      observed: { providerFetchCallsObserved: 0, rehearsalWallClockMs: 0 },
      passed: true,
      receiptHash: `dd${suffix}`,
      runs: [{
        aliasCommitmentReceiptHash: `ee${suffix}`,
        blockId: 'block1',
        condition: 'mixed',
        entryHash: `ff${suffix}`,
        receiptChainRoot: `01${suffix}`,
        runDirectory: `/scratch-${suffix}/mv-b2-study-block1-mixed`,
        runManifestHash: `02${suffix}`,
        turnRounds: [{
          barrierHash: `03${suffix}`,
          priorReceiptHash: `04${suffix}`,
          terminalReceiptHash: `05${suffix}`,
          turnIndex: 1,
        }],
        ...extra,
      }],
    };
  }

  test('two executions that vary ONLY in allowlisted material compare equal', () => {
    const result = compareRehearsalExecutions(syntheticReceipt('a'), syntheticReceipt('b'));
    assert.equal(result.ok, true, result.failures.join(' | '));
    assert.equal(result.unallowlistedDifferences.length, 0);
    assert.equal(result.structuralDrift.length, 0);
    assert.ok(result.comparedLeaves > 0, 'a comparison over zero leaves is vacuous');
  });

  // THE ACCEPTANCE PROPERTY. A new nondeterministic field must go RED rather
  // than be absorbed by a nearby wildcard.
  test('a NEW nondeterministic field in a run entry is caught', () => {
    const result = compareRehearsalExecutions(
      syntheticReceipt('a', { stampedAt: '2026-07-27T00:00:00.000Z' }),
      syntheticReceipt('b', { stampedAt: '2026-07-27T00:00:07.311Z' }),
    );
    assert.equal(result.ok, false);
    assert.deepEqual(result.unallowlistedDifferences, ['runs[0].stampedAt']);
    assert.match(result.failures.join(' '), /NOT on the pinned variance allowlist/);
  });

  // A field that exists in one execution and not the other is nondeterministic
  // STRUCTURE, and is not allowed to slip through as "equal where present".
  test('a field present in only one execution is structural drift', () => {
    const result = compareRehearsalExecutions(
      syntheticReceipt('a', { sometimesPresent: 1 }),
      syntheticReceipt('b'),
    );
    assert.equal(result.ok, false);
    assert.deepEqual(result.structuralDrift, ['runs[0].sometimesPresent']);
  });

  // Rule (3): a stale exemption must fail LOUD. Without this, renaming a field
  // leaves a permissive entry behind that silently widens the check.
  test('an allowlist entry matching nothing fails as a dead exemption', () => {
    const result = compareRehearsalExecutions(syntheticReceipt('a'), syntheticReceipt('b'), {
      allowlist: [
        ...REHEARSAL_VARIANCE_ALLOWLIST,
        { path: 'runs[*].fieldThatNoLongerExists', reason: 'stale' },
      ],
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.deadAllowlistEntries, ['runs[*].fieldThatNoLongerExists']);
  });

  // Rule (4): the exemption list cannot be padded with stable fields. This is
  // what stops a future agent from "fixing" a red by appending the offending
  // path — appending a path that does NOT actually vary is itself a failure.
  test('an allowlist entry over a field that did not vary fails', () => {
    const result = compareRehearsalExecutions(syntheticReceipt('a'), syntheticReceipt('b'), {
      allowlist: [
        ...REHEARSAL_VARIANCE_ALLOWLIST,
        { path: 'runs[*].condition', reason: 'padding' },
      ],
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.nonVaryingAllowlistEntries, ['runs[*].condition']);
  });

  // ABSENT EVIDENCE MUST BLOCK. Zero runs over zero executions certifies
  // nothing, and must never report ok.
  test('an empty or failing execution is UNMEASURED, never a pass', () => {
    const empty = { ...syntheticReceipt('a'), runs: [] };
    const emptyResult = compareRehearsalExecutions(empty, syntheticReceipt('b'));
    assert.equal(emptyResult.ok, false);
    assert.match(emptyResult.failures.join(' '), /UNMEASURED/);

    const failing = { ...syntheticReceipt('a'), passed: false };
    const failingResult = compareRehearsalExecutions(failing, syntheticReceipt('b'));
    assert.equal(failingResult.ok, false);
    assert.match(failingResult.failures.join(' '), /did not pass/);

    assert.equal(compareRehearsalExecutions(null, null).ok, false);
  });

  // The `.*` wildcard must cover exactly one key, or `aggregate.*` would
  // swallow the whole aggregate subtree including villageRunsExecuted.
  test('the .* wildcard covers one key, not a subtree', () => {
    const a = syntheticReceipt('a');
    const b = syntheticReceipt('b');
    a.aggregate.villageRunsExecuted = 1;
    b.aggregate.villageRunsExecuted = 2;
    const result = compareRehearsalExecutions(a, b);
    assert.equal(result.ok, false);
    assert.deepEqual(result.unallowlistedDifferences, ['aggregate.villageRunsExecuted']);
  });

  // The pinned list is a SHORT list of named paths, not a pattern soup. A
  // future entry that exempts a whole subtree would defeat the check, so the
  // shape is asserted.
  test('every pinned allowlist entry is a concrete path with a stated reason', () => {
    assert.ok(REHEARSAL_VARIANCE_ALLOWLIST.length <= 16, 'the exemption list must stay short');
    for (const entry of REHEARSAL_VARIANCE_ALLOWLIST) {
      assert.equal(typeof entry.path, 'string');
      assert.ok(entry.reason.length > 10, `${entry.path} needs a stated reason`);
      assert.ok(!entry.path.includes('**'), 'subtree wildcards are not permitted');
    }
  });

  // The clock seam is the half of "seed and deterministic clock" that IS
  // implementable. It must actually be injectable.
  test('runRehearsal refuses a non-function nowFn', async () => {
    await assert.rejects(
      () => runRehearsal({ nowFn: 'not-a-function' }),
      /nowFn must be a function/,
    );
  });
});

// ---------------------------------------------------------------------------

describe('injected-clock containment', () => {
  const FROZEN_MS = 1_700_000_000_000;
  let receipt;

  before(async () => {
    const result = await runRehearsal({
      hololandRoot: repoRoot,
      nowFn: () => FROZEN_MS,
      runLimit: 1,
      scratchRoot: path.join(scratchBase, 'frozen-clock'),
      writeReceipt: false,
    });
    receipt = result.receipt;
  });

  test('a frozen clock reaches every clock-derived value the receipt exposes', () => {
    // WHY THIS EXISTS. The repeat-execution probe can only see a clock leak
    // that reaches a COMPARED LEAF, and four of the six threaded sites reach
    // the receipt only through hashes that are allowlisted for an unrelated
    // reason (the alias draw). Deleting `nowFn` from the createTurnScheduler
    // options -- the deepest of the six -- left that probe exit 0 while every
    // round receipt carried real millisecond wall-clock stamps again. The
    // containment law inside runRehearsal is what closes that, and this is its
    // observable half.
    assert.equal(receipt.generatedAt, new Date(FROZEN_MS).toISOString());
    assert.equal(
      receipt.observed.rehearsalWallClockMs,
      0,
      'under a frozen clock no wall time can elapse',
    );
  });

  test('the containment law is measured, not configured', () => {
    // `clockFrozen` is derived by observing that nowFn() has not advanced across
    // the whole rehearsal -- something the real clock cannot do -- so the law
    // arms itself from a measurement rather than from a caller-set flag, and it
    // is inert on the real-clock acceptance path (which is why the twelve-run
    // fixture above, run on Date.now, carries a real generatedAt).
    const source = readFileSync(
      path.join(repoRoot, 'scripts', 'model-village-run-conductor.mjs'),
      'utf8',
    );
    assert.match(source, /if \(clockSamples\.length > 0 && nowFn\(\) === startedAtMs\) \{/);
    assert.match(source, /INJECTED CLOCK NOT CONTAINED/);
    // The law reads the SEALED RECEIPT, not the local variables that fed it, so
    // replacing a receipt field's expression outright cannot route around it.
    // Both leaf-level mutations that previously survived did exactly that.
    assert.match(source, /receipt\.observed\.rehearsalWallClockMs !== 0/);
    assert.match(source, /Date\.parse\(receipt\.generatedAt\) !== startedAtMs/);
    // ...and the sample SET is fenced, because a value that stops registering a
    // sample was measured to slip through the value check (the Math.max clamp).
    assert.match(source, /Missing clock samples/);
    // The cross-module sample is the one a mutation to the createTurnScheduler
    // OPTIONS OBJECT can move, so it must be taken from the scheduler's own
    // emitted timestamp and not from anything the conductor wrote.
    assert.match(source, /barrierReceipt\?\.closedAt/);
  });
});
