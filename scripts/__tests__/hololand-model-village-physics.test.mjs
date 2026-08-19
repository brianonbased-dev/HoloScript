#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalJson,
  evaluateRouteContactPairs,
  evaluateReceiptFixtures,
  runPhysicsCheck,
} from '../check-hololand-model-village-physics.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');
const holoScriptRoot = path.resolve(repoRoot, '..', 'HoloScript');
const outputDir = path.join(repoRoot, '.tmp', 'hololand', 'model-village', 'test');
mkdirSync(outputDir, { recursive: true });
const output = path.join(
  outputDir,
  `physics-receipt-${process.pid}-${randomUUID()}.json`,
);

const { receipt } = await runPhysicsCheck({
  root: repoRoot,
  holoScriptRoot,
  output,
  canonicalBoundary: false,
});

assert.equal(receipt.schema, 'hololand.model-village.physics-witness.v0.3.0');
assert.equal(receipt.status, 'pass');
assert.ok(Object.values(receipt.assertions).every(Boolean));
assert.ok(Object.values(receipt.sourceBoundary).every(Boolean));
assert.equal(receipt.physics.fixedTimestepSeconds, 1 / 60);
assert.equal(receipt.physics.fixedSteps, 600);
assert.equal(receipt.physics.replayRuns, 3);
assert.equal(new Set(receipt.physics.replayRoots).size, 1);
assert.equal(receipt.physics.firstRun.registeredBodyIds.length, 4);
assert.equal(receipt.physics.firstRun.staticBodyCount, 2);
assert.equal(receipt.physics.firstRun.dynamicBodyCount, 2);
assert.equal(receipt.physics.firstRun.duplicateRegistrationCount, 0);
assert.equal(receipt.physics.firstRun.contactCount, 2);
const expectedRouteContactPairs = [
  {
    route: 'admitted',
    floorBodyId: 'admitted-catch-floor',
    tokenBodyId: 'token-mv-p10-admitted-001',
    bodyPair: ['admitted-catch-floor', 'token-mv-p10-admitted-001'],
  },
  {
    route: 'blocked',
    floorBodyId: 'blocked-catch-floor',
    tokenBodyId: 'token-mv-p10-blocked-001',
    bodyPair: ['blocked-catch-floor', 'token-mv-p10-blocked-001'],
  },
];
assert.deepEqual(
  receipt.physics.firstRun.expectedRouteContactPairs,
  expectedRouteContactPairs,
);
assert.deepEqual(
  receipt.physics.firstRun.observedRouteContactPairs,
  expectedRouteContactPairs,
);
assert.equal(receipt.physics.firstRun.routeContactPairsMatch, true);
assert.deepEqual(
  receipt.physics.firstRun.orderedContactProjection.map((contact) => ({
    eventType: contact.eventType,
    bodyA: contact.bodyA,
    bodyB: contact.bodyB,
  })),
  [
    {
      eventType: 'collision-start',
      bodyA: 'admitted-catch-floor',
      bodyB: 'token-mv-p10-admitted-001',
    },
    {
      eventType: 'collision-start',
      bodyA: 'blocked-catch-floor',
      bodyB: 'token-mv-p10-blocked-001',
    },
  ],
);
assert.ok(receipt.physics.firstRun.orderedContactProjection.every((contact) => (
  Number.isInteger(contact.step)
  && contact.step >= 0
  && Number.isInteger(contact.ordinal)
  && contact.ordinal >= 0
  && Array.isArray(contact.point)
  && Array.isArray(contact.normal)
  && Number.isFinite(contact.impulse)
)));
assert.equal(
  createHash('sha256')
    .update(Buffer.from(
      canonicalJson(receipt.physics.firstRun.orderedContactProjection),
      'utf8',
    ))
    .digest('hex'),
  receipt.physics.firstRun.digests.orderedContact,
);
assert.equal(receipt.physics.firstRun.frames.length, 600);
assert.ok(
  Object.values(receipt.physics.firstRun.firstSleepSteps)
    .every((step) => Number.isInteger(step) && step >= 0 && step < 600),
);
assert.equal(receipt.policy.decisions.filter((decision) => decision.allowed).length, 2);
assert.deepEqual(
  receipt.policy.decisions
    .filter((decision) => !decision.allowed)
    .map((decision) => decision.fixtureId),
  ['missing-receipt', 'tampered-receipt', 'duplicate-admitted-receipt'],
);
assert.equal(receipt.canonicalBoundary.enabled, false);
assert.equal(receipt.canonicalBoundary.observedBoundaryMatch, null);
assert.equal(receipt.canonicalBoundary.projectionToggleExecuted, false);
assert.equal(receipt.canonicalBoundary.fullMvP0ProjectionToggleClaimed, false);
assert.equal(receipt.canonicalBoundary.observerBoundaryComparison, null);
assert.equal(receipt.canonicalBoundary.fixtureBridgeFieldsAvailable.length, 3);
assert.equal(receipt.canonicalBoundary.nativeHeadlessFieldsStillUnavailable.length, 3);
assert.ok(receipt.toolchain.artifactHashes.runtime);
assert.ok(receipt.toolchain.artifactHashes.engineSource);
assert.equal(
  receipt.claimBoundary.allowedPhrase,
  'Deterministic CPU sphere-collider receipt tracer on the named local HoloScript build.',
);
assert.ok(receipt.claimBoundary.notObserved.includes('box token colliders'));
assert.ok(receipt.claimBoundary.notObserved.includes('GPU or WebGPU physics'));
assert.ok(receipt.claimBoundary.notObserved.includes('native .hsplus action execution'));

const crossLaneContactEvaluation = evaluateRouteContactPairs(
  [
    {
      eventType: 'collision-start',
      bodyA: 'admitted-catch-floor',
      bodyB: 'token-mv-p10-blocked-001',
    },
    {
      eventType: 'collision-start',
      bodyA: 'blocked-catch-floor',
      bodyB: 'token-mv-p10-admitted-001',
    },
  ],
  expectedRouteContactPairs,
);
assert.equal(crossLaneContactEvaluation.match, false);
assert.ok(crossLaneContactEvaluation.observed.every((pair) => pair.route === null));

const duplicateDecisions = evaluateReceiptFixtures(
  [
    {
      fixtureId: 'first-valid',
      receiptId: 'duplicate-id',
      receiptPresent: true,
      signatureVerified: true,
      sourceActionHashMatches: true,
      decision: 'admitted',
      expectedRelease: true,
      expectedRoute: 'admitted',
    },
    {
      fixtureId: 'second-valid-same-id',
      receiptId: 'duplicate-id',
      receiptPresent: true,
      signatureVerified: true,
      sourceActionHashMatches: true,
      decision: 'admitted',
      expectedRelease: false,
      expectedRoute: 'dark',
    },
  ],
  receipt.policy.admission,
  receipt.sourceHashes,
);
assert.equal(duplicateDecisions[0].allowed, true);
assert.equal(duplicateDecisions[1].allowed, false);
assert.equal(duplicateDecisions[1].reason, 'duplicate_receipt');
assert.ok(duplicateDecisions.every((decision) => decision.expectationMatched));

const hashMismatch = evaluateReceiptFixtures(
  [
    {
      fixtureId: 'tampered-receipt',
      receiptId: 'hash-mismatch',
      receiptPresent: true,
      signatureVerified: true,
      sourceActionHashMatches: true,
      decision: 'blocked',
      tamperField: 'projectionSourceHash',
      expectedRelease: false,
      expectedRoute: 'dark',
    },
  ],
  receipt.policy.admission,
  receipt.sourceHashes,
);
assert.equal(hashMismatch[0].allowed, false);
assert.equal(hashMismatch[0].reason, 'source_hash_mismatch:projectionSourceHash');
assert.equal(hashMismatch[0].expectationMatched, true);

const negativeRoot = mkdtempSync(path.join(tmpdir(), 'hololand-model-village-physics-negative-'));
const sourcePaths = [
  'source/layers/vr/frontier/model-village/model-village.holo',
  'source/layers/vr/frontier/model-village/model-village-observer-projection.holo',
  'source/layers/vr/frontier/model-village/model-village-render-calibration.holo',
  'source/domains/agents/model-village-observer-witness.hsplus',
  'source/proofs/model-village-receipt-loom-physics.hs',
];

try {
  for (const relativePath of sourcePaths) {
    const destination = path.join(negativeRoot, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(repoRoot, relativePath), destination);
  }

  const projectionPath = path.join(
    negativeRoot,
    'source/layers/vr/frontier/model-village/model-village-observer-projection.holo',
  );
  writeFileSync(
    projectionPath,
    readFileSync(projectionPath, 'utf8').replace(
      'scale: [0.64, 0.64, 0.64]',
      'scale: [0.63, 0.63, 0.63]',
    ),
    'utf8',
  );
  const negativeOutput = path.join(negativeRoot, '.tmp', 'physics-receipt.json');
  await assert.rejects(
    runPhysicsCheck({
      root: negativeRoot,
      holoScriptRoot,
      output: negativeOutput,
      canonicalBoundary: false,
    }),
    /sourceBoundaryPasses/,
  );
  const negativeReceipt = JSON.parse(readFileSync(negativeOutput, 'utf8'));
  assert.equal(negativeReceipt.status, 'fail');
  assert.equal(negativeReceipt.sourceBoundary.projectionAndManifestBodiesAgree, false);

  const originalProjection = readFileSync(
    path.join(repoRoot, sourcePaths[1]),
    'utf8',
  );
  writeFileSync(
    projectionPath,
    originalProjection.replace(
      /\n}\s*$/,
      '\n  action write_canonical_state() {\n'
        + '    emit("canonical_state_write")\n'
        + '  }\n'
        + '}\n',
    ),
    'utf8',
  );
  const capabilityNegativeOutput = path.join(
    negativeRoot,
    '.tmp',
    'physics-capability-receipt.json',
  );
  await assert.rejects(
    runPhysicsCheck({
      root: negativeRoot,
      holoScriptRoot,
      output: capabilityNegativeOutput,
      canonicalBoundary: false,
    }),
    /sourceBoundaryPasses/,
  );
  const capabilityNegativeReceipt = JSON.parse(
    readFileSync(capabilityNegativeOutput, 'utf8'),
  );
  assert.equal(
    capabilityNegativeReceipt.sourceBoundary
      .parsedProjectionHasNoExecutableCapabilityOrDependencySurface,
    false,
  );
  assert.equal(
    capabilityNegativeReceipt.sourceBoundary.projectionCapabilityInspection.passed,
    false,
  );
  assert.ok(
    capabilityNegativeReceipt.sourceBoundary.projectionCapabilityInspection
      .findings.length > 0,
  );
} finally {
  rmSync(negativeRoot, { recursive: true, force: true });
  rmSync(output, { force: true });
}

console.log('PASS HoloLand Model Village physics witness');
