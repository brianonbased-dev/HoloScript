#!/usr/bin/env node
/* global Buffer, URL, fetch, process, structuredClone */

// MV-B1 adapter + custody integration checker tests. Fully offline: the run
// uses --skip-live semantics, so every route is served by the checker's
// in-process loopback stub (ephemeral port) — the same offline convention as
// model-village-adapter-runtime.test.mjs. Nothing here claims a live study
// run, Phase 1 admission, six-resident live turns, or blinded alias
// assignment; the manifest-declared sovereign endpoints are asserted as
// frozen data (compared against the loaded manifest), not contacted.

import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { canonicalDigest } from '../model-village-phase0b-runtime.mjs';
import {
  ADAPTER_CUSTODY_RECEIPT_SCHEMA,
  OBSERVER_LOOPBACK_HOST,
  TRANSPORT_VERDICTS,
  buildTransportObservation,
  calibrateTransportObserver,
  createTransportObserver,
  deriveTransportVerdict,
  runAdapterCustodyDrill,
  verifyAdapterCustodyReceipt,
} from '../check-hololand-model-village-adapter-custody.mjs';
import {
  loadAdapterCustodyDrillManifest,
} from '../model-village-adapter-runtime.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');

// Snapshot the DEFAULT output/store locations before the isolated run so the
// isolation test can prove the run wrote nothing outside its scratch dir.
const defaultOutputPath = path.join(
  repoRoot, '.tmp', 'hololand', 'model-village', 'adapter-custody-receipt.json',
);
const defaultStoreParent = path.join(
  repoRoot, '.tmp', 'hololand', 'model-village', 'adapter-custody',
);
function snapshotPath(target) {
  if (!existsSync(target)) return { exists: false, mtimeMs: null };
  return { exists: true, mtimeMs: statSync(target).mtimeMs };
}
function listDir(target) {
  if (!existsSync(target)) return null;
  return readdirSync(target).sort();
}

const defaultOutputBefore = snapshotPath(defaultOutputPath);
const defaultStoreListingBefore = listDir(defaultStoreParent);

const scratchDir = mkdtempSync(path.join(os.tmpdir(), 'mv-b1-adapter-custody-'));
const storeParent = path.join(scratchDir, 'stores');
const outputPath = path.join(scratchDir, 'receipt.json');

// The frozen drill manifest is the endpoint authority for every assertion.
const bundle = await loadAdapterCustodyDrillManifest({ hololandRoot: repoRoot });

// One shared offline run; the tests below assert against its receipt.
const { receipt, output } = await runAdapterCustodyDrill({
  root: repoRoot,
  output: outputPath,
  storeRoot: storeParent,
  skipLive: true,
});

test('receipt schema, identity, and manifest binding', () => {
  assert.equal(receipt.schema, ADAPTER_CUSTODY_RECEIPT_SCHEMA);
  assert.equal(receipt.schema, 'hololand.model-village-adapter-custody.v1');
  assert.equal(receipt.drillId, 'mv-b1-adapter-custody-v1');
  assert.match(receipt.manifestHash, /^[a-f0-9]{64}$/);
  assert.match(receipt.storeManifestHash, /^[a-f0-9]{64}$/);
  assert.ok(Number.isInteger(receipt.accessLogEntryCount));
  assert.ok(receipt.accessLogEntryCount >= 10);
  assert.equal(receipt.manifestHash, bundle.manifestHash);
  assert.equal(output, outputPath);
  const onDisk = JSON.parse(readFileSync(outputPath, 'utf8'));
  assert.deepEqual(onDisk, JSON.parse(JSON.stringify(receipt)));
});

test('required route certified with a completed evaluated turn', () => {
  assert.equal(receipt.routes.length, 2);
  const required = receipt.routes.find((entry) => entry.required);
  assert.ok(required, 'a required route entry must exist');
  assert.equal(required.routeId, bundle.routes[0].routeId);
  assert.equal(required.routeId, 'sovereign-holoserve-laptop');
  // Declared endpoint is the frozen manifest value; the endpoint actually
  // used under --skip-live is the ephemeral stub, never the declared one.
  assert.equal(required.declaredEndpoint, bundle.routes[0].endpoint);
  assert.notEqual(required.endpointUsed, required.declaredEndpoint);
  assert.equal(required.certification.certified, true);
  assert.equal(required.certification.priorReceiptHash, receipt.manifestHash);
  assert.equal(required.turn.turnCompleted, true);
  assert.equal(required.turn.retries, 0);
  assert.equal(required.turn.priorReceiptHash, required.certification.receiptHash);
  assert.equal(required.turn.proposalDecision, 'valid_proposal');
  assert.notEqual(required.turn.proposalDecision, 'not_evaluated');
  // Public form only: bounded proposal, no raw reason text anywhere.
  assert.match(required.turn.parsedProposal.reasonSha256, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(receipt).includes('stub drill contribution'));

  const optional = receipt.routes.find((entry) => !entry.required);
  assert.equal(optional.routeId, bundle.routes[1].routeId);
  assert.equal(optional.declaredEndpoint, bundle.routes[1].endpoint);
  assert.equal(optional.certification.certified, true);
  assert.equal(optional.turn.turnCompleted, true);
});

test('all custody drills pass', () => {
  const drills = receipt.custodyDrills;
  assert.equal(drills.allOk, true);
  assert.equal(drills.readBackReplay.ok, true);
  assert.equal(drills.readBackReplay.requestByteHashMatches, true);
  assert.equal(drills.readBackReplay.responseByteHashMatches, true);
  assert.equal(drills.readBackReplay.responseHashMatches, true);
  assert.equal(drills.integrity.ok, true);
  assert.equal(drills.integrity.mode, 'plaintext-decrypt');
  assert.deepEqual(drills.integrity.failedChecks, []);
  assert.equal(drills.backup.ok, true);
  assert.ok(drills.backup.fileCount >= 3);
  assert.equal(drills.backupVerify.ok, true);
  assert.deepEqual(drills.backupVerify.failedChecks, []);
  assert.equal(drills.deletion.ok, true);
  assert.equal(drills.deletion.readFailsAfterKeyDestruction, true);
  assert.equal(drills.deletion.readFailureName, 'CustodyKeyDestroyedError');
  assert.equal(drills.deletion.tombstoneWritten, true);
  assert.equal(drills.deletion.checksumOnlyVerifyMode, 'ciphertext-checksum-only');
  assert.equal(drills.deletion.checksumOnlyVerifyOk, true);
  assert.equal(drills.deletion.primaryStoreKeyIntact, true);
});

test('claim-boundary flags are exactly the pinned never-claim set', () => {
  const boundary = receipt.claimBoundary;
  assert.equal(boundary.liveStudyRunClaimed, false);
  assert.equal(boundary.phase1AdmissionClaimed, false);
  assert.equal(boundary.sixResidentLiveTurnsClaimed, false);
  assert.equal(boundary.blindedAliasAssignmentClaimed, false);
  assert.equal(boundary.productionValidatorCustodyClaimed, false);
  assert.equal(boundary.processCrashDurabilityClaimed, false);
  assert.equal(boundary.providerSamplingDeterminismClaimed, false);
  assert.equal(boundary.canonicalLaneProviderCallsIntroduced, 0);
  assert.equal(boundary.sealedAdapterAliasRouteAssignmentIncluded, false);
  assert.ok(Array.isArray(boundary.observed) && boundary.observed.length > 0);
  assert.ok(Array.isArray(boundary.notObserved) && boundary.notObserved.length > 0);
  assert.ok(
    boundary.notObserved.some((item) => item.includes('out of scope')),
    'alias-assignment exclusion must be stated',
  );
  assert.ok(
    boundary.notObserved.some((item) => item.includes('not a determinism receipt')),
    'temperature-zero boundary must be stated',
  );
});

// ---------------------------------------------------------------------------
// DEFECT B regression suite. `liveSovereignRouteExercised: skipLive === false`
// was an assertion about intent: an injected fetchImpl produced certified:true
// and liveSovereignRouteExercised:true with zero network calls. The tests
// below hold the replacement to the standard that broke the old field —
// the receipt must be wrong-able, and absent evidence must block.
// ---------------------------------------------------------------------------

// A fabricated provider. `forwardNonRoute` models the smarter adversary who
// forwards the observer's calibration probe to the real platform fetch to
// defeat the positive control, and fabricates only the sovereign routes.
function makeFakeFetch({ forwardNonRoute = false } = {}) {
  const realFetch = globalThis.fetch;
  const state = { calls: 0 };
  const json = (payload) => {
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    return {
      arrayBuffer: async () => body.buffer.slice(
        body.byteOffset, body.byteOffset + body.byteLength,
      ),
      body: null,
      ok: true,
      status: 200,
    };
  };
  const fetchImpl = async (url, init) => {
    const target = String(url);
    const isDeclaredRoute = target.includes(':8099') || target.includes(':18080');
    if (forwardNonRoute && !isDeclaredRoute) return realFetch(target, init);
    state.calls += 1;
    const parsed = new URL(target);
    if (parsed.pathname.endsWith('/models')) {
      return json({
        data: [{ id: 'TOTALLY-NOT-A-REAL-MODEL', object: 'model' }],
        object: 'list',
      });
    }
    if (parsed.pathname.includes('chat')) {
      return json({
        choices: [{
          finish_reason: 'stop',
          index: 0,
          message: {
            content: JSON.stringify({
              action: 'contribute_water',
              amount: 1,
              reason: 'fabricated by an adversary, never sent over a socket',
              target: 'commons_cistern',
            }),
            role: 'assistant',
          },
        }],
        id: 'chatcmpl-fabricated',
        model: 'TOTALLY-NOT-A-REAL-MODEL',
        object: 'chat.completion',
        usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
      });
    }
    return json({
      process_instance_id: 'fabricated-instance',
      status: 'ok',
      version: '99.99.99-fabricated',
    });
  };
  return { fetchImpl, state };
}

async function runFabricatedProviderAttack(label, options) {
  const attackDir = mkdtempSync(path.join(os.tmpdir(), `mv-b1-attack-${label}-`));
  const attackOutput = path.join(attackDir, 'receipt.json');
  const { fetchImpl, state } = makeFakeFetch(options);
  let threw = null;
  try {
    await runAdapterCustodyDrill({
      fetchImpl,
      output: attackOutput,
      root: repoRoot,
      skipLive: false,
      storeRoot: path.join(attackDir, 'stores'),
    });
  } catch (error) {
    threw = error;
  }
  const emitted = existsSync(attackOutput)
    ? JSON.parse(readFileSync(attackOutput, 'utf8'))
    : null;
  rmSync(attackDir, { force: true, recursive: true });
  return { emitted, fabricatedCalls: state.calls, threw };
}

test('injected fetchImpl cannot buy a live-route claim', async () => {
  const attack = await runFabricatedProviderAttack('naive');
  assert.ok(attack.fabricatedCalls > 0, 'the fabricated provider must have been used');
  assert.ok(attack.threw, 'a fabricated provider must fail the drill, not pass it');
  assert.match(attack.threw.message, /UNMEASURED/);

  // The receipt is written before the throw, so the durable artifact itself
  // must not claim liveness — a reader who only has the file is not misled.
  assert.ok(attack.emitted, 'a receipt must still be emitted for the audit trail');
  const transport = attack.emitted.claimBoundary.sovereignRouteTransport;
  assert.equal(transport.verdict, TRANSPORT_VERDICTS.unmeasured);
  assert.notEqual(transport.verdict, TRANSPORT_VERDICTS.live);
  assert.equal(transport.conjuncts.observerCalibrated, false);
  assert.equal(transport.observed.requestsToDeclaredOrigin, 0);
  // The old field is gone: no boolean anywhere can be read as "live happened".
  assert.equal(
    Object.hasOwn(attack.emitted.claimBoundary, 'liveSovereignRouteExercised'),
    false,
  );
  // STRENGTHENED 2026-07-27. This used to be a blunt substring scan over the
  // whole JSON. That scan cannot tell a resurrected FIELD from a residual that
  // names the removed field in prose — and the residual list now has to name it,
  // because a sibling gate still publishes it from its own skipLive input
  // (check-hololand-model-village-turn-scheduler.mjs:1059). So the guard is
  // split into the two things it was conflating, and BOTH are stricter than the
  // scan was: (1) no KEY by that name may exist ANYWHERE in the receipt, at any
  // depth — the original only checked claimBoundary's own keys; (2) the string
  // may appear in exactly one place, the pinned residual list, and nowhere else.
  const keyPaths = [];
  const stringHits = [];
  const walk = (node, at) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${at}[${index}]`));
      return;
    }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (key === 'liveSovereignRouteExercised') keyPaths.push(`${at}.${key}`);
        walk(value, `${at}.${key}`);
      }
      return;
    }
    if (typeof node === 'string' && node.includes('liveSovereignRouteExercised')) {
      stringHits.push(at);
    }
  };
  walk(attack.emitted, '$');
  assert.deepEqual(keyPaths, [], 'the removed boolean must not reappear as a key');
  assert.ok(
    stringHits.every((at) => at.startsWith('$.claimBoundary.sovereignRouteTransport.residuals[')),
    `the removed field may only be NAMED in the residual list; found at ${stringHits.join(', ')}`,
  );
});

test('an adversary who forwards the calibration probe still cannot claim live', async () => {
  const attack = await runFabricatedProviderAttack('forwarding', {
    forwardNonRoute: true,
  });
  assert.ok(attack.fabricatedCalls > 0);
  assert.ok(attack.threw, 'forwarding the positive control must not rescue the attack');
  assert.match(attack.threw.message, /UNMEASURED/);
  const transport = attack.emitted.claimBoundary.sovereignRouteTransport;
  // Layer 1 was defeated on purpose; layer 2 is what holds here.
  assert.equal(transport.conjuncts.observerCalibrated, true);
  assert.equal(transport.conjuncts.observerAccountConsistentWithDrill, false);
  assert.equal(transport.observed.drillWindowRequestCount, 0);
  assert.equal(transport.verdict, TRANSPORT_VERDICTS.unmeasured);
});

test('--skip-live measures a NEGATIVE, it does not assert one', () => {
  const transport = receipt.claimBoundary.sovereignRouteTransport;
  assert.equal(transport.verdict, TRANSPORT_VERDICTS.notLive);
  assert.equal(transport.declared.skipLiveRequested, true);
  assert.equal(transport.declared.requiredRouteAuthority, '127.0.0.1:8099');
  // Non-vacuity: the negative is backed by real sockets that were observed and
  // demonstrably went somewhere else. "Zero requests seen" over zero observed
  // transport would be UNMEASURED, not a pass.
  assert.ok(
    transport.observed.drillWindowRequestCount > 0,
    'the stub lane must still produce observable real transport',
  );
  assert.equal(transport.observed.requestsToDeclaredOrigin, 0);
  assert.equal(transport.observed.chatPathRequestsToDeclaredAuthority, 0);
  assert.deepEqual(transport.observed.responseStatusesFromDeclaredOrigin, []);
  assert.equal(transport.conjuncts.observerCalibrated, true);
  assert.equal(transport.conjuncts.endpointUsedMatchesDeclared, false);
  // The stub authorities are recorded, so reaching one can never read as live.
  assert.ok(transport.observed.inProcessListenerAuthorities.length >= 2);
  assert.ok(
    transport.observed.socketAuthoritiesObserved.every(
      (authority) => authority !== transport.declared.requiredRouteAuthority,
    ),
  );
  assert.ok(Array.isArray(transport.residuals) && transport.residuals.length > 0);
  assert.ok(transport.claimScope.includes('NOT CLAIMED'));
});

test('the verdict is DERIVED: every live conjunct is load-bearing', () => {
  const allTrue = {
    chatPathSentToDeclaredAuthority: true,
    declaredAuthorityIsNotAnInProcessListener: true,
    endpointUsedMatchesDeclared: true,
    everySendToDeclaredOriginHitDeclaredSocket: true,
    observerAccountConsistentWithDrill: true,
    observerCalibrated: true,
    requestSentToDeclaredSocketAddress: true,
    requiredRouteTurnCompleted: true,
    responseObservedFromDeclaredOrigin: true,
  };
  assert.equal(deriveTransportVerdict(allTrue), TRANSPORT_VERDICTS.live);
  // Absent evidence blocks: these two produce UNMEASURED specifically, never a
  // negative, because a blind or self-contradicting observer proves nothing.
  for (const key of ['observerCalibrated', 'observerAccountConsistentWithDrill']) {
    assert.equal(
      deriveTransportVerdict({ ...allTrue, [key]: false }),
      TRANSPORT_VERDICTS.unmeasured,
      `${key} false must yield UNMEASURED, not a measured negative`,
    );
  }
  // Every remaining conjunct must independently be able to break the claim; a
  // conjunct that cannot change the verdict is decoration, not evidence.
  for (const key of Object.keys(allTrue)) {
    if (key === 'observerCalibrated' || key === 'observerAccountConsistentWithDrill') {
      continue;
    }
    assert.equal(
      deriveTransportVerdict({ ...allTrue, [key]: false }),
      TRANSPORT_VERDICTS.notLive,
      `${key} false must move the verdict off MEASURED_LIVE_TRANSPORT`,
    );
  }
  assert.equal(deriveTransportVerdict({}), TRANSPORT_VERDICTS.unmeasured);
  assert.equal(deriveTransportVerdict(null), TRANSPORT_VERDICTS.unmeasured);
});

test('a live-route claim cannot be forged into an emitted receipt', () => {
  const transportOf = (clone) => clone.claimBoundary.sovereignRouteTransport;
  const reseal = (clone) => {
    const unsigned = { ...clone };
    delete unsigned.receiptHash;
    clone.receiptHash = canonicalDigest(unsigned);
    return clone;
  };
  // Each forgery below is re-signed, so the self-hash check cannot be what
  // catches it: the transport cross-checks have to do the work.
  const forgeries = [
    ['verdict flipped to live', (clone) => {
      transportOf(clone).verdict = TRANSPORT_VERDICTS.live;
    }],
    ['verdict flipped to a measured negative', (clone) => {
      transportOf(clone).verdict = TRANSPORT_VERDICTS.unmeasured;
    }],
    ['all conjuncts asserted true', (clone) => {
      const transport = transportOf(clone);
      for (const key of Object.keys(transport.conjuncts)) {
        transport.conjuncts[key] = true;
      }
      transport.verdict = TRANSPORT_VERDICTS.live;
    }],
    ['socket send claimed over zero observed requests', (clone) => {
      transportOf(clone).conjuncts.requestSentToDeclaredSocketAddress = true;
    }],
    ['chat-path send claimed over zero observed chat requests', (clone) => {
      transportOf(clone).conjuncts.chatPathSentToDeclaredAuthority = true;
    }],
    ['response claimed with no observed statuses', (clone) => {
      transportOf(clone).conjuncts.responseObservedFromDeclaredOrigin = true;
    }],
    ['endpoint match contradicting the routes region', (clone) => {
      transportOf(clone).conjuncts.endpointUsedMatchesDeclared = true;
    }],
    ['turn completion contradicting the routes region', (clone) => {
      transportOf(clone).conjuncts.requiredRouteTurnCompleted = false;
    }],
    ['declared authority rebound to another route', (clone) => {
      transportOf(clone).declared.requiredRouteAuthority = '127.0.0.1:9999';
    }],
    ['skip-live relabelled as a live lane', (clone) => {
      transportOf(clone).declared.skipLiveRequested = false;
    }],
    ['in-process listener set emptied to hide the stubs', (clone) => {
      transportOf(clone).observed.inProcessListenerAuthorities = [];
    }],
    ['claim scope softened', (clone) => {
      transportOf(clone).claimScope = 'a live sovereign route was exercised';
    }],
    ['residuals deleted', (clone) => {
      transportOf(clone).residuals = [];
    }],
    ['observer calibration desynced from its conjunct', (clone) => {
      transportOf(clone).observed.observerCalibrated = false;
    }],
    ['whole transport subtree removed', (clone) => {
      delete clone.claimBoundary.sovereignRouteTransport;
    }],
  ];
  for (const [name, mutate] of forgeries) {
    const forged = structuredClone(receipt);
    mutate(forged);
    reseal(forged);
    const result = verifyAdapterCustodyReceipt(forged);
    assert.equal(result.ok, false, `forgery must not verify: ${name}`);
    assert.ok(result.failureReason, `forgery must explain itself: ${name}`);
  }
  // And the honest receipt still verifies, so the checks above are not just
  // rejecting everything.
  assert.equal(verifyAdapterCustodyReceipt(receipt).ok, true);
});

test('receipt self-hash verifies and recomputes', () => {
  assert.deepEqual(verifyAdapterCustodyReceipt(receipt), {
    failureReason: null,
    ok: true,
    // Re-derived by the verifier from the receipt's own conjuncts so the
    // --verify lane can refuse to bless an UNMEASURED receipt.
    transportVerdict: TRANSPORT_VERDICTS.notLive,
  });
  const { receiptHash, ...unsigned } = receipt;
  assert.equal(canonicalDigest(unsigned), receiptHash);
});

test('tampering any receipt field fails verification', () => {
  const perturb = (value) => {
    if (typeof value === 'string') return `${value}x`;
    if (typeof value === 'number') return value + 1;
    if (typeof value === 'boolean') return !value;
    if (Array.isArray(value)) return [...value, 'tampered'];
    if (value === null) return 'tampered';
    return { ...value, injected: true };
  };
  for (const key of Object.keys(receipt)) {
    const tampered = structuredClone(receipt);
    tampered[key] = perturb(tampered[key]);
    assert.equal(
      verifyAdapterCustodyReceipt(tampered).ok,
      false,
      `tampering top-level '${key}' must fail verification`,
    );
  }
  // Deep tampers across every receipt region.
  const deepTampers = [
    (clone) => { clone.routes[0].certification.certified = false; },
    (clone) => { clone.routes[0].certification.endpoint = 'tampered.invalid'; },
    (clone) => { clone.routes[0].turn.proposalDecision = 'deny'; },
    (clone) => { clone.routes[0].turn.retries = 1; },
    (clone) => { clone.routes[1].turn.priorReceiptHash = '0'.repeat(64); },
    (clone) => { clone.custodyDrills.deletion.ok = false; },
    (clone) => { clone.custodyDrills.readBackReplay.requestByteHashMatches = false; },
    (clone) => { clone.claimBoundary.liveStudyRunClaimed = true; },
    (clone) => {
      clone.claimBoundary.sovereignRouteTransport.verdict = TRANSPORT_VERDICTS.live;
    },
    (clone) => {
      clone.claimBoundary.sovereignRouteTransport.observed
        .requestsToDeclaredOrigin = 3;
    },
    (clone) => { clone.claimBoundary.canonicalLaneProviderCallsIntroduced = 1; },
    (clone) => { clone.accessLogEntryCount += 1; },
    (clone) => { clone.receiptHash = '0'.repeat(64); },
    (clone) => { delete clone.custodyDrills; },
  ];
  deepTampers.forEach((mutate, index) => {
    const tampered = structuredClone(receipt);
    mutate(tampered);
    assert.equal(
      verifyAdapterCustodyReceipt(tampered).ok,
      false,
      `deep tamper #${index} must fail verification`,
    );
  });
  assert.equal(verifyAdapterCustodyReceipt(null).ok, false);
  assert.equal(verifyAdapterCustodyReceipt({}).ok, false);
});

test('store root is isolated under the given scratch dir', () => {
  // Everything the run wrote lives under the scratch dir.
  const primaryStoreRoot = path.join(storeParent, 'store');
  const deletionRoot = path.join(storeParent, 'deletion-drill');
  assert.ok(existsSync(path.join(primaryStoreRoot, 'store-manifest.json')));
  assert.ok(existsSync(path.join(primaryStoreRoot, 'access-log.jsonl')));
  assert.ok(existsSync(path.join(primaryStoreRoot, 'backup', 'checksums.json')));
  assert.ok(existsSync(path.join(deletionRoot, 'tombstones.jsonl')));
  assert.ok(!existsSync(path.join(deletionRoot, 'key', 'content-key.bin')));
  assert.ok(existsSync(path.join(primaryStoreRoot, 'key', 'content-key.bin')));
  assert.ok(existsSync(outputPath));
  // The recorded store root resolves back to the scratch store root.
  assert.equal(
    path.resolve(repoRoot, receipt.custodyDrills.storeRoot),
    path.resolve(primaryStoreRoot),
  );
  // And nothing was written to the DEFAULT locations by this isolated run.
  assert.deepEqual(snapshotPath(defaultOutputPath), defaultOutputBefore);
  assert.deepEqual(listDir(defaultStoreParent), defaultStoreListingBefore);
  // The access-log count in the receipt matches the isolated store's log.
  const logLines = readFileSync(
    path.join(primaryStoreRoot, 'access-log.jsonl'),
    'utf8',
  ).split('\n').filter((line) => line.length > 0);
  assert.equal(receipt.accessLogEntryCount, logLines.length);
});

// ---------------------------------------------------------------------------
// Mutation coverage for the CONSTRUCTION of the conjuncts from raw observer
// events. The pre-existing tests covered the channel NAME and the DERIVATION
// (min() over conjuncts); an adversarial review then showed that three separate
// predicates could be gutted with the whole suite still green. Each test below
// was written against a specific executed mutation and was confirmed to FAIL
// when that mutation is applied, so none of them is a green checker.
// ---------------------------------------------------------------------------

// MUTATION KILLED (calibration predicate, check-...-adapter-custody.mjs:~410):
//   -  const observedSend = seen.sent.some((e) => e.socketAuthority === authority
//                                            && e.path === CALIBRATION_PATH);
//   +  const observedSend = seen.sent.length > 0;
// Under the mutant, ANY unrelated in-process request inside the calibration
// window calibrates the observer. The fetch function below performs REAL
// transport (so `seen.sent.length > 0` holds and the mutant passes) but to a
// different authority and path than the one calibration aimed at.
test('calibration is not satisfied by unrelated in-window transport', async () => {
  const { createServer } = await import('node:http');
  const decoyPath = '/not-the-calibration-path';
  const decoy = createServer((req, res) => {
    const body = Buffer.from('{"decoy":true}', 'utf8');
    res.writeHead(200, { 'content-length': body.length, 'content-type': 'application/json' });
    res.end(body);
  });
  await new Promise((resolve, reject) => {
    decoy.once('error', reject);
    decoy.listen(0, OBSERVER_LOOPBACK_HOST, resolve);
  });
  const decoyOrigin = `http://${OBSERVER_LOOPBACK_HOST}:${decoy.address().port}`;
  const observer = createTransportObserver();
  try {
    // Real platform fetch, real socket, real bytes — just not the calibration
    // target. The honest predicate must reject it; `sent.length > 0` accepts it.
    const wrongTarget = async (_url, init) => fetch(`${decoyOrigin}${decoyPath}`, init);
    const result = await calibrateTransportObserver(observer, wrongTarget);
    assert.equal(result.ok, false, 'unrelated transport must not calibrate the observer');
    assert.match(result.detail, /never saw on a socket|not the platform fetch/);
    // Non-vacuity for THIS test: the decoy really did produce observable
    // transport, so the rejection above rejects the WRONG traffic rather than
    // merely recording a run in which nothing happened at all.
    const seen = observer.since({ responses: 0, sent: 0 });
    assert.ok(
      seen.sent.some((entry) => entry.path === decoyPath),
      'the decoy request must have been observed, or this test proves nothing',
    );
    // And the honest path still calibrates, so the predicate is not just
    // rejecting everything.
    const honest = await calibrateTransportObserver(observer, fetch);
    assert.equal(honest.ok, true);
  } finally {
    observer.stop();
    await new Promise((resolve) => decoy.close(resolve));
  }
});

/** Minimal inputs for buildTransportObservation with one declared route. */
const FIXTURE_ORIGIN = 'http://10.0.0.9:8099';
const FIXTURE_AUTHORITY = '10.0.0.9:8099';
const FIXTURE_CHAT_PATH = '/v1/chat/completions';
function transportFixture(sent, { responses = [], turnCompleted = true } = {}) {
  return buildTransportObservation({
    calibration: { authority: 'fixture', detail: 'calibrated', ok: true },
    drillWindow: { responses, sent },
    inProcessListenerAuthorities: new Set(),
    requiredEntry: {
      declaredEndpoint: FIXTURE_ORIGIN,
      endpointUsed: FIXTURE_ORIGIN,
      turn: { turnCompleted },
    },
    requiredRoute: {
      chatPath: FIXTURE_CHAT_PATH,
      endpoint: FIXTURE_ORIGIN,
      routeId: 'fixture-route',
    },
    skipLive: false,
  });
}
const FIXTURE_RESPONSE = [{ origin: FIXTURE_ORIGIN, path: FIXTURE_CHAT_PATH, statusCode: 200 }];

// MUTATION KILLED (check-...-adapter-custody.mjs:~475):
//   -  sentToDeclaredOrigin.length > 0 && sentToDeclaredSocket.length === sentToDeclaredOrigin.length,
//   +  sentToDeclaredOrigin.length > 0,
// i.e. every -> any. The partial-redirect case: two sends to the declared
// ORIGIN, only one of which landed on the declared socket address.
test('a partial socket hit is not a hit: every, not any', () => {
  const goodSend = {
    method: 'POST',
    origin: FIXTURE_ORIGIN,
    path: FIXTURE_CHAT_PATH,
    socketAuthority: FIXTURE_AUTHORITY,
  };
  const partial = transportFixture([
    goodSend,
    {
      // Same origin, different socket — a hosts-file/DNS redirect fingerprint.
      method: 'GET',
      origin: FIXTURE_ORIGIN,
      path: '/v1/models',
      socketAuthority: '203.0.113.7:8099',
    },
  ], { responses: FIXTURE_RESPONSE });
  assert.equal(partial.conjuncts.everySendToDeclaredOriginHitDeclaredSocket, false);
  assert.equal(partial.verdict, TRANSPORT_VERDICTS.notLive);
  // Non-vacuity: with the stray send removed the same fixture DOES go live, so
  // the false above is caused by the redirect and not by the fixture shape.
  const clean = transportFixture([goodSend], { responses: FIXTURE_RESPONSE });
  assert.equal(clean.conjuncts.everySendToDeclaredOriginHitDeclaredSocket, true);
  assert.equal(clean.verdict, TRANSPORT_VERDICTS.live);
});

// MUTATION KILLED (check-...-adapter-custody.mjs:~440):
//   -  (entry) => entry.path === chatPath && entry.method === 'POST',
//   +  (entry) => entry.path === chatPath,
// A completion request is a POST; a GET to the same path is not a turn.
test('a GET to the chat path does not satisfy the chat-path conjunct', () => {
  const getOnly = transportFixture([
    {
      method: 'GET',
      origin: FIXTURE_ORIGIN,
      path: FIXTURE_CHAT_PATH,
      socketAuthority: FIXTURE_AUTHORITY,
    },
  ], { responses: FIXTURE_RESPONSE });
  assert.equal(getOnly.conjuncts.chatPathSentToDeclaredAuthority, false);
  assert.equal(getOnly.observed.chatPathRequestsToDeclaredAuthority, 0);
  assert.equal(getOnly.verdict, TRANSPORT_VERDICTS.notLive);
  // Non-vacuity: the identical entry as a POST satisfies it.
  const postSame = transportFixture([
    {
      method: 'POST',
      origin: FIXTURE_ORIGIN,
      path: FIXTURE_CHAT_PATH,
      socketAuthority: FIXTURE_AUTHORITY,
    },
  ], { responses: FIXTURE_RESPONSE });
  assert.equal(postSame.conjuncts.chatPathSentToDeclaredAuthority, true);
  assert.equal(postSame.verdict, TRANSPORT_VERDICTS.live);
});

// The --verify lane must not be quieter than the drill lane about absent
// evidence: an UNMEASURED receipt is internally consistent, and used to verify
// OK and exit 0 without ever printing the verdict.
test('--verify surfaces the transport verdict and refuses an UNMEASURED receipt', async () => {
  const { spawnSync } = await import('node:child_process');
  const { writeFileSync } = await import('node:fs');
  const checker = path.join(repoRoot, 'scripts', 'check-hololand-model-village-adapter-custody.mjs');

  const honestPath = path.join(scratchDir, 'verify-honest.json');
  writeFileSync(honestPath, JSON.stringify(receipt), 'utf8');
  const honest = spawnSync(process.execPath, [checker, "--verify", honestPath], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(honest.status, 0, honest.stderr);
  assert.match(honest.stdout, /sovereign-route transport: MEASURED_NO_LIVE_TRANSPORT/);
  assert.match(honest.stdout, /verify ok/);

  // Same receipt, moved into UNMEASURED by breaking the one conjunct that
  // dominates the derivation, then re-sealed so it is a VALID receipt.
  const unmeasured = structuredClone(receipt);
  const transport = unmeasured.claimBoundary.sovereignRouteTransport;
  transport.conjuncts.observerCalibrated = false;
  transport.observed.observerCalibrated = false;
  transport.verdict = deriveTransportVerdict(transport.conjuncts);
  assert.equal(transport.verdict, TRANSPORT_VERDICTS.unmeasured);
  const unsigned = { ...unmeasured };
  delete unsigned.receiptHash;
  unmeasured.receiptHash = canonicalDigest(unsigned);
  // It is structurally valid...
  assert.equal(verifyAdapterCustodyReceipt(unmeasured).ok, true);
  assert.equal(
    verifyAdapterCustodyReceipt(unmeasured).transportVerdict,
    TRANSPORT_VERDICTS.unmeasured,
  );
  // ...and the CLI must still refuse it rather than print "verify ok".
  const unmeasuredPath = path.join(scratchDir, 'verify-unmeasured.json');
  writeFileSync(unmeasuredPath, JSON.stringify(unmeasured), 'utf8');
  const refused = spawnSync(process.execPath, [checker, "--verify", unmeasuredPath], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(refused.status, 1, 'an UNMEASURED receipt must not verify green');
  assert.match(refused.stdout, /sovereign-route transport: UNMEASURED/);
  assert.doesNotMatch(refused.stdout, /verify ok/);
  assert.match(refused.stderr, /UNMEASURED/);
});

test.after(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});
