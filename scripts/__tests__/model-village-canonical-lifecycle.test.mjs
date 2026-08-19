/* global structuredClone */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  MODEL_VILLAGE_CANONICAL_LIFECYCLE_ACTIONS,
  MODEL_VILLAGE_CANONICAL_LIFECYCLE_SCHEMA,
  MODEL_VILLAGE_CANONICAL_LIFECYCLE_SOURCES,
  MODEL_VILLAGE_CANONICAL_OBJECT_IDS,
  MODEL_VILLAGE_PRODUCTION_LOCK_COMMIT,
  buildCanonicalLifecycleArtifacts,
  runCanonicalModelVillageLifecycle,
  verifyCanonicalLifecycleReceipt,
  verifyCanonicalLifecycleReceiptHash,
} from '../model-village-canonical-lifecycle.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

function readSources() {
  return Object.fromEntries(
    Object.entries(MODEL_VILLAGE_CANONICAL_LIFECYCLE_SOURCES)
      .map(([key, relativePath]) => [
        key,
        readFileSync(path.resolve(root, relativePath), 'utf8')
          .replace(/\r\n?/g, '\n'),
      ]),
  );
}

test('builds exact source-derived twelve-object lifecycle artifacts', () => {
  const artifacts = buildCanonicalLifecycleArtifacts(readSources());
  assert.deepEqual(
    artifacts.worldManifest.map((entry) => entry.id),
    MODEL_VILLAGE_CANONICAL_OBJECT_IDS,
  );
  assert.equal(artifacts.worldManifest.length, 12);
  assert.deepEqual(
    artifacts.matrix.personasAndSeats,
    [
      'persona-01@seat-01',
      'persona-02@seat-02',
      'persona-03@seat-03',
      'persona-04@seat-04',
      'persona-05@seat-05',
      'persona-06@seat-06',
    ],
  );
  assert.equal(artifacts.blockPlans.length, 3);
  assert.equal(artifacts.projection.emitCallsProjectedToReceiptLedger, 6);
  for (const action of MODEL_VILLAGE_CANONICAL_LIFECYCLE_ACTIONS) {
    assert.match(artifacts.behaviorProjection, new RegExp(`action ${action}\\b`));
  }
});

test('rejects canonical transform and frozen matrix drift', () => {
  const sources = readSources();
  assert.throws(
    () => buildCanonicalLifecycleArtifacts({
      ...sources,
      world: sources.world.replace(
        'position: [-3.0, 1.0, 1.8]',
        'position: [-3.1, 1.0, 1.8]',
      ),
    }),
    /ResidentSeat01 canonical transform drifted/,
  );
  assert.throws(
    () => buildCanonicalLifecycleArtifacts({
      ...sources,
      kernel: sources.kernel.replace(
        'block2: ["adapter_b", "adapter_b", "adapter_c", "adapter_c", "adapter_a", "adapter_a"]',
        'block2: ["adapter_a", "adapter_a", "adapter_b", "adapter_b", "adapter_c", "adapter_c"]',
      ),
    }),
    /block2 adapter assignment drifted/,
  );
  assert.throws(
    () => buildCanonicalLifecycleArtifacts({
      ...sources,
      policy: sources.policy.replace(
        'action close_run(summaryReceipt)',
        'action close_run_drifted(summaryReceipt)',
      ),
    }),
    /canonical action close_run block is missing/,
  );
});

test('executes and re-verifies all canonical lifecycle blocks', async () => {
  const receipt = await runCanonicalModelVillageLifecycle({ root });
  assert.equal(receipt.schema, MODEL_VILLAGE_CANONICAL_LIFECYCLE_SCHEMA);
  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.productionLock.productionLockCommit, MODEL_VILLAGE_PRODUCTION_LOCK_COMMIT);
  assert.equal(receipt.productionLock.productionLockIsAncestor, true);
  assert.equal(receipt.world.objectCount, 12);
  assert.equal(receipt.blocks.length, 3);
  assert.equal(receipt.assertions.providerCallsMade, 0);
  assert.equal(receipt.claimBoundary.worldRuntimeLifecycleExecuted, true);
  assert.equal(receipt.claimBoundary.adapterPermutationExecutionClaimed, true);
  assert.equal(receipt.claimBoundary.fullHoloWorldExecutionClaimed, false);
  assert.equal(receipt.claimBoundary.productionValidatorTrustClaimed, false);
  assert.equal(receipt.claimBoundary.scientificOutcomeClaimed, false);
  for (const block of receipt.blocks) {
    assert.deepEqual(
      block.lifecycleSequence,
      [
        'register_run',
        'stage_resident_x6',
        'start_run',
        'freeze_run',
        'close_run',
      ],
    );
    assert.equal(block.bindings.length, 6);
    assert.equal(block.counts.schedule, 10);
    assert.equal(block.counts.actions, 10);
    assert.equal(block.counts.observations, 0);
    assert.equal(block.counts.publicStateSnapshots, 11);
    assert.equal(block.counts.finalPublicState.phase, 'closed');
    assert.equal(block.counts.finalPublicState.emergencyStopState, 'triggered');
    assert.equal(block.counts.finalPublicState.worldMutationAllowed, false);
    assert.equal(block.replay.match, true);
    assert.equal(block.observerProof.equivalent, true);
  }
  assert.equal(verifyCanonicalLifecycleReceiptHash(receipt), true);
  assert.deepEqual(
    await verifyCanonicalLifecycleReceipt(receipt, { root }),
    { errors: [], valid: true },
  );

  const tampered = structuredClone(receipt);
  tampered.blocks[0].bindings[0].adapter_alias = 'adapter_c';
  assert.equal(verifyCanonicalLifecycleReceiptHash(tampered), false);
  assert.equal(
    (await verifyCanonicalLifecycleReceipt(tampered, { root })).valid,
    false,
  );
});
