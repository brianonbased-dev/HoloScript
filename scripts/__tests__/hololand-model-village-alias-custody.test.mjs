#!/usr/bin/env node
/* global URL, process, structuredClone */

// MV-B3 alias custody + captured-response checker tests. Fully OFFLINE by
// design: the checker runs with skipLive, so its "providers" are in-process
// node:http servers bound to the loopback interface on ephemeral ports. That
// is not a stand-in for a remote service — the canonical frozen drill source
// declares the SOVEREIGN production route as a loopback HoloServe endpoint, so
// loopback is the real transport shape this lane certifies against. The stub
// replaces only the model; the transport, certification, sealed custody store,
// and every receipt chain are the real shipped modules.
//
// Nothing here claims a live study run, Phase 1 admission or readiness,
// blinded evaluation, post-lock presentation execution, family-to-model
// attribution, or a swap of custody-backed records into the frozen Phase 0B
// plan. Drop-in ELIGIBILITY is proven; the frozen plan is never mutated.

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { canonicalDigest, canonicalJson } from '../model-village-phase0b-runtime.mjs';
import { loadAdapterCustodyDrillManifest } from '../model-village-adapter-runtime.mjs';
import {
  loadFrozenAssignmentMatrix,
  verifyAliasAssignmentCommitment,
  verifyUnblindingReceipt,
} from '../model-village-alias-vault.mjs';
import { verifyCapturedResponseRecord } from '../model-village-captured-response-custody.mjs';
import {
  ALIAS_CUSTODY_RECEIPT_SCHEMA,
  drawAliasRouteAssignment,
  runAliasCustodyDrill,
  verifyAliasCustodyReceipt,
} from '../check-hololand-model-village-alias-custody.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');

// Every artifact this suite writes lives under ONE test-owned scratch
// directory, so a run can never touch the checker's default receipt path or
// another suite's custody store.
const ownedRelative = path.posix.join(
  '.tmp', 'hololand', 'model-village', 'alias-custody-tests',
  `run-${process.pid}-${randomUUID()}`,
);
mkdirSync(path.join(repoRoot, ...ownedRelative.split('/')), { recursive: true });

const OUTPUT_RELATIVE = path.posix.join(ownedRelative, 'receipt.json');
const STORE_RELATIVE = path.posix.join(ownedRelative, 'store-parent');

/**
 * The route identities the offline lane touches, read from the frozen `.hs`
 * manifest rather than restated here — a hardcoded copy would silently stop
 * matching the moment the manifest moved, and the blinding assertion would
 * pass while testing nothing.
 */
const manifest = await loadAdapterCustodyDrillManifest({ hololandRoot: repoRoot });
const DECLARED_ROUTE_NEEDLES = manifest.routes.flatMap((route) => {
  const url = new URL(route.endpoint);
  return [route.routeId, route.endpoint, url.host, url.hostname];
}).map((value) => value.toLowerCase());

const frozenMatrix = loadFrozenAssignmentMatrix({ hololandRoot: repoRoot });

/** Generic route shapes, independent of this run's specific routes. */
const ROUTE_SHAPED = [
  /sovereign-/i,
  /:\/\//,
  /https?:/i,
  /localhost/i,
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/,
];
const ADAPTER_ALIAS = /adapter[_-][a-z0-9]/i;

/** Collects EVERY key and string value at EVERY depth, with its path. */
function collectStrings(value, label = '$', out = []) {
  if (typeof value === 'string') {
    out.push([label, value]);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectStrings(entry, `${label}[${index}]`, out));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      out.push([`${label} <key>`, key]);
      collectStrings(value[key], `${label}.${key}`, out);
    }
  }
  return out;
}

// One drill run shared by the suite: it starts two stub servers, certifies
// both routes, executes two real model turns through the shipped runtime, and
// exercises four unblinding drills. Running it per-test would multiply that
// without testing anything new.
const { receipt, output, storeRoot } = await runAliasCustodyDrill({
  root: repoRoot,
  output: OUTPUT_RELATIVE,
  storeRoot: STORE_RELATIVE,
  skipLive: true,
});

const records = receipt.capturedResponseRecords;

test('the offline drill emits a verifying receipt of the pinned schema', () => {
  assert.equal(receipt.schema, ALIAS_CUSTODY_RECEIPT_SCHEMA);
  assert.deepEqual(Object.keys(receipt).sort(), [
    'aliasAssignmentCommitment',
    'assignmentManifestHashes',
    'capturedResponseRecords',
    'claimBoundary',
    'custodyAccessLogEntryCount',
    'dropInEligibility',
    'generatedAt',
    'kernelSourceHash',
    'receiptHash',
    'schema',
    'storeManifestHash',
    'unblindingDrills',
  ]);
  const check = verifyAliasCustodyReceipt(receipt, { hololandRoot: repoRoot });
  assert.equal(check.ok, true, check.failureReason ?? '');

  // The receipt on DISK is the artifact other lanes consume; verify that, not
  // just the in-memory object.
  const onDisk = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(onDisk.receiptHash, receipt.receiptHash);
  assert.equal(
    verifyAliasCustodyReceipt(onDisk, { hololandRoot: repoRoot }).ok,
    true,
  );
});

test('every artifact stays inside the test-owned scratch directory', () => {
  assert.ok(
    storeRoot.startsWith(STORE_RELATIVE),
    `store root ${storeRoot} escaped the test-owned directory`,
  );
  const relativeOutput = path.relative(repoRoot, output).split(path.sep).join('/');
  assert.ok(
    relativeOutput.startsWith(ownedRelative),
    `receipt ${relativeOutput} escaped the test-owned directory`,
  );
  // Guards against a default-path regression silently clobbering the CLI receipt.
  assert.ok(!relativeOutput.endsWith('model-village/alias-custody-receipt.json'));
});

test('the alias assignment commitment verifies and binds the frozen source', () => {
  const commitment = receipt.aliasAssignmentCommitment;
  const check = verifyAliasAssignmentCommitment(commitment);
  assert.equal(check.ok, true, check.failureReason ?? '');
  assert.equal(commitment.blockId, 'block1');
  // Pins re-derive from the canonical `.hs`, not merely from each other.
  assert.equal(commitment.kernelSourceHash, frozenMatrix.kernelSourceHash);
  assert.equal(receipt.kernelSourceHash, frozenMatrix.kernelSourceHash);
  assert.deepEqual(
    receipt.assignmentManifestHashes,
    { ...frozenMatrix.assignmentManifestHashByBlock },
  );
  assert.equal(
    commitment.assignmentManifestHash,
    frozenMatrix.assignmentManifestHashByBlock.block1,
  );
  // Three distinct salted digests: equal digests would disclose an alias pairing.
  const digests = Object.values(commitment.aliasCommitments);
  assert.equal(new Set(digests).size, 3);
  // Route reuse over two certified routes is DECLARED, not hidden.
  assert.equal(commitment.routeReuseDeclared, true);
  assert.equal(commitment.distinctRouteCount, 2);
  assert.equal(commitment.certifiedRouteCount, commitment.distinctRouteCount);
});

test('DEEP blinding: no route, endpoint, or salt leaks at any depth', () => {
  const strings = collectStrings(receipt);
  assert.ok(strings.length > 100, 'the walker must actually traverse the receipt');

  // (a) No routeId / endpoint / host this lane declares, anywhere, at any depth.
  for (const [where, value] of strings) {
    const haystack = value.toLowerCase();
    for (const needle of DECLARED_ROUTE_NEEDLES) {
      assert.ok(
        !haystack.includes(needle),
        `route identity leaked at ${where}`,
      );
    }
  }
  // (b) No generic route-shaped string anywhere.
  for (const [where, value] of strings) {
    for (const pattern of ROUTE_SHAPED) {
      assert.ok(!pattern.test(value), `route-shaped string (${pattern}) at ${where}`);
    }
  }
  // (c) The sealed adapter alias never rides a captured record or the drop-in
  //     result. (The commitment's aliasCommitments KEYS are frozen public
  //     study vocabulary and are deliberately excluded from this scope.)
  const scoped = collectStrings({
    capturedResponseRecords: receipt.capturedResponseRecords,
    dropInEligibility: receipt.dropInEligibility,
    unblindingDrills: receipt.unblindingDrills,
  });
  for (const [where, value] of scoped) {
    assert.ok(!ADAPTER_ALIAS.test(value), `sealed adapter alias disclosed at ${where}`);
  }
  // (d) No salt. This is a REAL preimage check, not a shape check: every salt
  //     in this lane is exactly 64 hex, indistinguishable by shape from the
  //     dozens of legitimate hashes in the receipt, so a `>=128 hex` guard can
  //     never fire and would read as coverage while testing nothing. Instead,
  //     for every 64-hex string in the receipt and every declared routeId,
  //     recompute the commitments that salt would produce and assert none of
  //     them is a published commitment — i.e. nothing in the receipt lets a
  //     reader recompute one.
  const hexCandidates = strings
    .map(([where, value]) => [where, value.toLowerCase()])
    .filter(([, value]) => /^[a-f0-9]{64}$/.test(value));
  assert.ok(hexCandidates.length > 10, 'the receipt must actually carry hashes to test');
  const publishedRouteCommitments = new Set(
    records.map((entry) => entry.record.routeCommitment),
  );
  const publishedAliasCommitments = new Set(
    Object.values(receipt.aliasAssignmentCommitment.aliasCommitments),
  );
  const declaredRouteIds = manifest.routes.map((route) => route.routeId);
  for (const [where, candidate] of hexCandidates) {
    for (const routeId of declaredRouteIds) {
      assert.ok(
        !publishedRouteCommitments.has(canonicalDigest({ routeId, salt: candidate })),
        `a routeCommitment salt is recoverable from the receipt at ${where}`,
      );
      for (const alias of ['adapter_a', 'adapter_b', 'adapter_c']) {
        assert.ok(
          !publishedAliasCommitments.has(canonicalDigest({ alias, routeId, salt: candidate })),
          `the vault sealing salt is recoverable from the receipt at ${where}`,
        );
      }
    }
  }

  // (e) Structural blinding on every record: all six ENUMERABLE fields null.
  for (const entry of records) {
    assert.equal(entry.record.routeIdentityBlinded, true);
    const evidence = entry.record.providerRouteEvidence;
    for (const key of [
      'certificationReceiptHash', 'endpointCommitment', 'modelIdReported',
      'packageVersionReported', 'processInstanceId', 'routeId',
    ]) {
      assert.equal(evidence[key], null, `providerRouteEvidence.${key} must be null`);
    }
    // serializerHash survives: it digests the transport descriptor alone and is
    // byte-identical across routes, so it is nonidentifying.
    assert.match(evidence.serializerHash, /^[a-f0-9]{64}$/);
    assert.match(entry.record.routeCommitment, /^[a-f0-9]{64}$/);
  }
  // (f) Both captures traverse the SAME sealed adapter in frozen block1, yet
  //     publish UNLINKABLE commitments — the fresh-salt-per-capture property.
  //     A shared salt would make these equal and disclose the pairing.
  assert.equal(frozenMatrix.matrix.blocks.block1[0], frozenMatrix.matrix.blocks.block1[1]);
  assert.notEqual(
    records[0].record.routeCommitment,
    records[1].record.routeCommitment,
  );
});

test('captured records carry real custody and spec 216-224 sampling evidence', () => {
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((entry) => entry.residentId), ['resident-01', 'resident-02']);
  for (const entry of records) {
    assert.equal(entry.captureOutcome, 'record-issued');
    assert.equal(entry.turnCompleted, true);
    const check = verifyCapturedResponseRecord(entry.record);
    assert.equal(check.ok, true, check.failureReason ?? '');
    // Spec 216-224: seed requested, seed acceptance evidence, temperature, token limit.
    const sampling = entry.record.samplingEvidence;
    assert.equal(Number.isInteger(sampling.seedRequested), true);
    assert.equal(sampling.seedAcceptedEvidence, 'unverified');
    assert.equal(Number.isFinite(sampling.temperature), true);
    assert.ok(sampling.maxOutputTokens > 0);
    // Spec 216-228 raw-response hash + sealed custody LOCATION: recorded, but
    // NOT as a bare digest. The raw provider envelope embeds the route (the
    // completion id and the reported model name both carry it) and the drill
    // pins temperature and seed, so sha256(raw bytes) is a replay-and-compare
    // route oracle that no substring scan can see. Blinded => null, published
    // only as a salted commitment; the true values live in sealed custody.
    for (const key of [
      'rawResponseHash', 'rawResponseCustodyId', 'turnReceiptHash', 'priorReceiptHash',
    ]) {
      assert.equal(
        entry.record[key], null,
        `blinded record.${key} must be null (enumerable provider-bytes digest)`,
      );
    }
    assert.match(entry.record.rawResponseCommitment, /^[a-f0-9]{64}$/);
    assert.match(entry.record.turnReceiptCommitment, /^[a-f0-9]{64}$/);
    assert.match(entry.record.canonicalResponseCustodyId, /^[a-f0-9]{64}$/);
    // The public entry must not re-expose what the record just blinded.
    assert.equal(entry.turnReceiptHash, null);
    assert.equal(entry.record.turnReceiptHash, entry.turnReceiptHash);
  }
  // The commitments are UNLINKABLE across the two captures even though both
  // seats carry the same sealed adapter in frozen block1 (fresh salt each).
  assert.notEqual(
    records[0].record.rawResponseCommitment,
    records[1].record.rawResponseCommitment,
  );
  assert.notEqual(
    records[0].record.turnReceiptCommitment,
    records[1].record.turnReceiptCommitment,
  );
  // Two DISTINCT responses: the frozen consumer requires two distinct hashes.
  assert.notEqual(records[0].record.responseHash, records[1].record.responseHash);
  // A hash-chained access log actually accrued entries.
  assert.ok(receipt.custodyAccessLogEntryCount > 1);
});

test('the sealed assignment is DRAWN, not derivable from this source', () => {
  // The defect this pins: the assignment used to be
  // `certifiedRoutes[i % certifiedRoutes.length]` in the frozen public route
  // order, which made the "sealed" mapping a deterministic function of tracked
  // source plus the receipt's own distinctRouteCount — recoverable by any
  // reader, with the salt doing no work at all. A salted commitment only hides
  // what the reader cannot otherwise derive.
  const routeIds = ['sovereign-route-one', 'sovereign-route-two'];
  const draws = new Set();
  for (let index = 0; index < 200; index += 1) {
    const assignment = drawAliasRouteAssignment(routeIds);
    // Closed key set, every value a certified route.
    assert.deepEqual(Object.keys(assignment).sort(), ['adapter_a', 'adapter_b', 'adapter_c']);
    for (const value of Object.values(assignment)) assert.ok(routeIds.includes(value));
    // Surjection: every certified route is used, so distinctRouteCount stays
    // truthful and equal to the certified-route count.
    assert.equal(new Set(Object.values(assignment)).size, routeIds.length);
    draws.add(canonicalJson(assignment));
  }
  // All six surjections from three aliases onto two routes are reachable; a
  // deterministic rule (or a broken shuffle) would produce exactly one.
  assert.equal(draws.size, 6, `draw is not uniform over the surjections: ${draws.size}`);

  // Single-route degenerate case still returns a total, valid assignment.
  const single = drawAliasRouteAssignment(['sovereign-route-one']);
  assert.deepEqual(Object.values(single), Array(3).fill('sovereign-route-one'));

  // Refusals: no routes at all, and more routes than aliases (the surjection
  // is impossible and the choice is not this checker's to make).
  assert.throws(() => drawAliasRouteAssignment([]));
  assert.throws(() => drawAliasRouteAssignment(['a', 'b', 'c', 'd']));
});

test('the drop-in verifier ran, and its result is reported honestly', () => {
  const dropIn = receipt.dropInEligibility;
  assert.equal(dropIn.attempted, true);
  // Every one of the six frozen constraints is a NAMED check that actually ran.
  const names = dropIn.checks.map((check) => check.name);
  for (const expected of [
    'record-pair-arity',
    'fixture-forms-resolved',
    'record-receipts-verify',
    'fixture-form-exact-keys',
    'fixture-type-pinned',
    'response-text-strict-json',
    'response-text-canonical-byte-equal',
    'parsed-proposal-matches-expected',
    'resident-order-exact',
    'response-hash-source-digest',
    'response-hashes-distinct',
    'plan-hydration-binding-shape',
  ]) {
    assert.ok(names.includes(expected), `missing drop-in check ${expected}`);
  }
  // Honesty coupling: eligible/outcome/failedCheckNames cannot disagree with
  // the checks. This is what stops a not-eligible pair being massaged.
  const observedFailed = dropIn.checks.filter((c) => !c.ok).map((c) => c.name);
  assert.deepEqual(dropIn.failedCheckNames, observedFailed);
  assert.equal(dropIn.eligible, dropIn.checks.every((c) => c.ok));
  assert.equal(dropIn.outcome, dropIn.eligible ? 'eligible' : 'not-eligible-checks-failed');
  // The offline lane is deterministic (the stub IS the model), so it must pass.
  assert.equal(dropIn.eligible, true, canonicalJson(observedFailed));

  // Proving eligibility is NOT admitting a swap.
  assert.equal(receipt.claimBoundary.frozenPlanSwapPerformed, false);
  assert.equal(receipt.claimBoundary.dropInSwapAdmitted, false);
  assert.equal(receipt.claimBoundary.dropInEligibilityProven, true);
});

test('all four unblinding drills are present with the correct failNeutral verdict', () => {
  const drills = receipt.unblindingDrills;
  assert.equal(drills.length, 4);
  assert.deepEqual(drills.map((d) => d.drill), [
    'missing-terminal-commitment',
    'mismatched-terminal-commitment',
    'incomplete-authorization',
    'authorized-reveal',
  ]);
  assert.deepEqual(drills.map((d) => d.receipt.failNeutral), [true, true, true, false]);
  assert.deepEqual(drills.map((d) => d.expectedFailNeutral), [true, true, true, false]);

  for (const drill of drills) {
    const check = verifyUnblindingReceipt(drill.receipt);
    assert.equal(check.ok, true, `${drill.drill}: ${check.failureReason ?? ''}`);
    assert.equal(drill.receiptVerified, true);
    assert.equal(drill.receiptCarriesNoMapping, true);
    // The mapping NEVER rides the receipt, refusal or success alike.
    assert.equal(drill.receipt.revealedInReceipt, false);
    // Declared chain: unblinding receipt chains from the terminal commitment.
    assert.equal(drill.receipt.priorReceiptHash, drill.receipt.terminalCommitmentHash);
  }

  const [missing, mismatched, incomplete, success] = drills;
  // Refusals disclose nothing and claim nothing.
  for (const refusal of [missing, mismatched, incomplete]) {
    assert.equal(refusal.revealedMatchesSealed, null);
    assert.equal(refusal.receipt.aliasCommitmentsVerified, false);
  }
  // A refusal populates a field only after that field's own check passed:
  // the absent terminal commitment leaves the terminal fields null.
  assert.equal(missing.receipt.terminalCommitmentHash, null);
  assert.equal(missing.receipt.runId, null);
  // Refusal receipts carry no free-text reason field at all.
  assert.equal('reason' in missing.receipt, false);
  assert.equal('failureReason' in missing.receipt, false);

  // The authorized reveal proves the revealed mapping equals the sealed one,
  // names two DIFFERENT authorizers, and binds this run's commitment.
  assert.equal(success.revealedMatchesSealed, true);
  assert.equal(success.receipt.aliasCommitmentsVerified, true);
  assert.notEqual(
    success.receipt.authorizedBy.protocolLead,
    success.receipt.authorizedBy.dataCustodian,
  );
  assert.equal(success.receipt.runId, 'mv-b3-block1');
  assert.equal(
    success.receipt.commitmentId,
    receipt.aliasAssignmentCommitment.receiptHash,
  );
});

test('the claim boundary is exact and every never-claim flag is pinned', () => {
  const boundary = receipt.claimBoundary;
  assert.deepEqual(Object.keys(boundary).sort(), [
    'blindedEvaluationClaimed',
    'dropInEligibilityProven',
    'dropInSwapAdmitted',
    'familyToModelAttributionClaimed',
    'frozenPlanSwapPerformed',
    'frozenSourceRederivedFromCanonicalSource',
    'liveSovereignRouteExercised',
    'liveStudyRunClaimed',
    'notObserved',
    'observed',
    'phase1AdmissionClaimed',
    'postLockPresentationExecuted',
    'productionValidatorCustodyClaimed',
  ]);
  assert.equal(boundary.liveStudyRunClaimed, false);
  assert.equal(boundary.phase1AdmissionClaimed, false);
  assert.equal(boundary.frozenPlanSwapPerformed, false);
  assert.equal(boundary.dropInSwapAdmitted, false);
  assert.equal(boundary.postLockPresentationExecuted, false);
  assert.equal(boundary.familyToModelAttributionClaimed, false);
  assert.equal(boundary.blindedEvaluationClaimed, false);
  assert.equal(boundary.productionValidatorCustodyClaimed, false);
  assert.equal(boundary.dropInEligibilityProven, true);
  assert.equal(boundary.frozenSourceRederivedFromCanonicalSource, true);
  // This run used stubs, and the receipt says so on its face.
  assert.equal(boundary.liveSovereignRouteExercised, false);
  assert.ok(boundary.observed.length > 0 && boundary.notObserved.length > 0);
  // The presentation lane's execution stays disclaimed in prose too.
  assert.ok(boundary.notObserved.some((item) => /post-lock presentation/i.test(item)));
  // The two-person limit is stated, not implied.
  assert.ok(boundary.notObserved.some((item) => /two-person control/i.test(item)));
});

test('a pinned claim flag cannot be flipped, even with a recomputed hash', () => {
  for (const flag of [
    'liveStudyRunClaimed',
    'phase1AdmissionClaimed',
    'frozenPlanSwapPerformed',
    'dropInSwapAdmitted',
    'postLockPresentationExecuted',
    'familyToModelAttributionClaimed',
    'blindedEvaluationClaimed',
    'productionValidatorCustodyClaimed',
  ]) {
    const unsigned = { ...receipt };
    delete unsigned.receiptHash;
    unsigned.claimBoundary = { ...unsigned.claimBoundary, [flag]: true };
    const forged = { ...unsigned, receiptHash: canonicalDigest(unsigned) };
    const check = verifyAliasCustodyReceipt(forged, { hololandRoot: repoRoot });
    assert.equal(check.ok, false, `${flag} was allowed to flip to true`);
    assert.match(check.failureReason, /pinned claim flag/);
  }
});

test('self-hash verification rejects tampering', () => {
  // (a) Field edited WITHOUT recomputing the hash.
  const edited = { ...receipt, generatedAt: '2000-01-01T00:00:00.000Z' };
  const editedCheck = verifyAliasCustodyReceipt(edited, { hololandRoot: repoRoot });
  assert.equal(editedCheck.ok, false);
  assert.match(editedCheck.failureReason, /receiptHash does not recompute/);

  // (b) A record swapped out breaks the nested record verification.
  {
    const unsigned = { ...receipt };
    delete unsigned.receiptHash;
    const broken = structuredClone(unsigned);
    broken.capturedResponseRecords[0].record.responseHash = '0'.repeat(64);
    const forged = { ...broken, receiptHash: canonicalDigest(broken) };
    const check = verifyAliasCustodyReceipt(forged, { hololandRoot: repoRoot });
    assert.equal(check.ok, false);
  }

  // (c) A drill verdict flipped to claim a reveal it never made.
  {
    const unsigned = { ...receipt };
    delete unsigned.receiptHash;
    const broken = structuredClone(unsigned);
    broken.unblindingDrills[0].revealedMatchesSealed = true;
    const forged = { ...broken, receiptHash: canonicalDigest(broken) };
    const check = verifyAliasCustodyReceipt(forged, { hololandRoot: repoRoot });
    assert.equal(check.ok, false);
    assert.match(check.failureReason, /must not claim a reveal/);
  }

  // (d) A route string smuggled into a free-form field is caught as a
  //     BLINDING failure, reported as such rather than as a hash mismatch.
  //     The drop-in check `detail` is the highest-risk real field: it is the
  //     one place another module's free-form text lands in this receipt.
  {
    const unsigned = { ...receipt };
    delete unsigned.receiptHash;
    const broken = structuredClone(unsigned);
    broken.dropInEligibility.checks[0].detail =
      'resolved via sovereign-holoserve-laptop';
    const forged = { ...broken, receiptHash: canonicalDigest(broken) };
    const check = verifyAliasCustodyReceipt(forged, { hololandRoot: repoRoot });
    assert.equal(check.ok, false);
    assert.match(check.failureReason, /route-shaped string/);
    // The failure names the PATH, never the offending value — reporting the
    // leaked string would re-leak it.
    assert.ok(!check.failureReason.includes('holoserve'));
  }

  // (e) A CONCATENATED leak — the case an anchored `^sovereign-` rule would
  //     miss. Injected into both the entry and its record so the binding
  //     cross-check passes and the anti-leak audit is provably the layer that
  //     catches it.
  {
    const unsigned = { ...receipt };
    delete unsigned.receiptHash;
    const broken = structuredClone(unsigned);
    const smuggled = 'mv-b3-sealed-by-sovereign-holoserve-laptop';
    broken.capturedResponseRecords[0].responseId = smuggled;
    // Fully RE-SIGN the record, not just edit it: an adversary who can re-hash
    // produces an internally perfect record, so the anti-leak audit — not a
    // hash mismatch — has to be the layer that refuses it.
    const recordBody = { ...broken.capturedResponseRecords[0].record };
    delete recordBody.receiptHash;
    recordBody.responseId = smuggled;
    broken.capturedResponseRecords[0].record = {
      ...recordBody,
      receiptHash: canonicalDigest(recordBody),
    };
    const forged = { ...broken, receiptHash: canonicalDigest(broken) };
    const check = verifyAliasCustodyReceipt(forged, { hololandRoot: repoRoot });
    assert.equal(check.ok, false);
    assert.match(check.failureReason, /route-shaped string/);
  }
});

test('frozen-source drift is caught ONLY by the binding, proving the binding is load-bearing', () => {
  // block3's hash has no internal cross-reference in the receipt, so an
  // internally-perfect forgery of it is invisible to self-consistency alone.
  const unsigned = { ...receipt };
    delete unsigned.receiptHash;
  const drifted = structuredClone(unsigned);
  drifted.assignmentManifestHashes.block3 = '0'.repeat(64);
  const forged = { ...drifted, receiptHash: canonicalDigest(drifted) };

  // Without the root the receipt looks perfect — this is the weaker claim the
  // verifier makes when it cannot read the world, and it is stated, not hidden.
  assert.equal(verifyAliasCustodyReceipt(forged).ok, true);

  // With the root, the drift is named.
  const bound = verifyAliasCustodyReceipt(forged, { hololandRoot: repoRoot });
  assert.equal(bound.ok, false);
  assert.match(bound.failureReason, /frozen-source-drift/);
  assert.match(bound.failureReason, /block3/);

  // Same for the kernel hash itself.
  const kernelDrift = structuredClone(unsigned);
  kernelDrift.kernelSourceHash = '0'.repeat(64);
  kernelDrift.aliasAssignmentCommitment = {
    ...kernelDrift.aliasAssignmentCommitment,
    kernelSourceHash: '0'.repeat(64),
  };
  const kernelForged = { ...kernelDrift, receiptHash: canonicalDigest(kernelDrift) };
  const kernelBound = verifyAliasCustodyReceipt(kernelForged, { hololandRoot: repoRoot });
  assert.equal(kernelBound.ok, false);
});
