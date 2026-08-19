import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BLINDED_PROFILE,
  STORY_PROFILE,
  applyObserverNavigation,
  buildProfileProjection,
  canonicalJson,
  createProtectedState,
  loadFoldContracts,
  runDeterministicMotionReplays,
  validateFoldManifest,
  verifyObserverIsolation,
} from '../lib/model-village-four-village-fold.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT ?? 'C:/Users/josep/Documents/GitHub/HoloScript';

test('MV-S4 parses all three HoloScript roles and preserves authored topology', async () => {
  const contracts = await loadFoldContracts({
    repoRoot: REPO_ROOT,
    holoScriptRoot: HOLOSCRIPT_ROOT,
  });
  assert.equal(contracts.world.metadata.milestone, 'MV-S4');
  assert.equal(contracts.world.folds.length, 4);
  assert.deepEqual(
    contracts.world.folds.map(({ label }) => label),
    ['FOLD 01', 'FOLD 02', 'FOLD 03', 'FOLD 04']
  );
  assert.equal(contracts.policy.fixedStep.steps, 720);
  assert.equal(contracts.policy.fixedStep.runs, 3);
  assert.equal(contracts.policy.config.nativeHsplusActionExecutionClaimed, false);
  assert.equal(contracts.policy.formatRoles.holoParser, 'HoloCompositionParser');
  assert.equal(contracts.policy.formatRoles.hsplusParser, 'HoloScriptPlusParser');
  assert.equal(contracts.policy.formatRoles.hsParser, 'HoloScriptCodeParser');
});

test('MV-S4 story and live-blinded projections are structurally separate', async () => {
  const contracts = await loadFoldContracts({
    repoRoot: REPO_ROOT,
    holoScriptRoot: HOLOSCRIPT_ROOT,
  });
  const story = buildProfileProjection(contracts, STORY_PROFILE);
  const blinded = buildProfileProjection(contracts, BLINDED_PROFILE);
  assert.equal(story.actors.length, 6);
  assert.equal(blinded.actors.length, 6);
  assert.deepEqual(
    story.actors.map(({ displayName }) => displayName),
    ['Brittney', 'Claude', 'OpenAI', 'Gemini', 'Grok', 'GLM']
  );
  assert.deepEqual(
    blinded.actors.map(({ displayName }) => displayName),
    ['Resident 01', 'Resident 02', 'Resident 03', 'Resident 04', 'Resident 05', 'Resident 06']
  );
  const blindedJson = canonicalJson(blinded);
  for (const publicName of ['Brittney', 'Claude', 'OpenAI', 'Gemini', 'Grok', 'GLM']) {
    assert.equal(blindedJson.includes(publicName), false);
  }
  for (const forbiddenField of [
    'publicEmbodimentId',
    'familyId',
    'agentSurfaceId',
    'modelFamily',
    'familyMantleId',
    'adapterIdentity',
  ]) {
    assert.equal(blindedJson.includes(`"${forbiddenField}"`), false);
  }
  assert.equal(blinded.publicCatalogLoaded, false);
  assert.equal(story.purpose, 'public_story_only_not_live_research');
});

test('MV-S4 resident motion replays exactly across three runs per profile', async () => {
  const contracts = await loadFoldContracts({
    repoRoot: REPO_ROOT,
    holoScriptRoot: HOLOSCRIPT_ROOT,
  });
  const replay = runDeterministicMotionReplays(contracts);
  for (const profile of [STORY_PROFILE, BLINDED_PROFILE]) {
    assert.equal(replay[profile].runCount, 3);
    assert.equal(replay[profile].sameInputSameState, true);
    assert.equal(replay[profile].samples.length, 6);
    assert.equal(replay[profile].finalState.step, 719);
    assert.deepEqual(
      replay[profile].finalState.routeMarks,
      ['fold-01', 'fold-02', 'fold-03', 'fold-04']
    );
    assert.equal(replay[profile].finalState.actors.every(({ visible }) => visible), true);
  }
  const storyIds = new Set(
    replay[STORY_PROFILE].projection.actors.map(({ actorId }) => actorId)
  );
  assert.equal(
    replay[BLINDED_PROFILE].projection.actors.some(({ actorId }) => storyIds.has(actorId)),
    false
  );
});

test('MV-S4 observer navigation cannot mutate protected research state', () => {
  const proof = verifyObserverIsolation();
  assert.equal(proof.mutationDelta, 0);
  assert.equal(proof.presentationCanAffectOutcome, false);
  assert.equal(proof.protectedFieldCount, 7);
  assert.deepEqual(proof.finalPresentationState.routeMarks, [
    'fold-01',
    'fold-02',
    'fold-03',
    'fold-04',
  ]);

  const protectedHashes = createProtectedState();
  const denied = applyObserverNavigation(
    { focusedFoldId: 'overview', routeMarks: [], protectedHashes },
    'condition-a'
  );
  assert.equal(denied.navigationAccepted, false);
  assert.deepEqual(denied.protectedHashes, protectedHashes);
});

test('MV-S4 immutable manifest seals sources, evidence, and replay roots', async () => {
  const contracts = await loadFoldContracts({
    repoRoot: REPO_ROOT,
    holoScriptRoot: HOLOSCRIPT_ROOT,
  });
  const motion = runDeterministicMotionReplays(contracts);
  const observerIsolation = verifyObserverIsolation();
  const sealed = validateFoldManifest(contracts, {
    repoRoot: REPO_ROOT,
    motion,
    observerIsolation,
  });
  assert.equal(sealed.status, 'PASS_BOUNDED');
  assert.equal(sealed.sealedFileCount, 10);
  assert.equal(sealed.combinedProfileReplaySha256, motion.combinedProfileDigest);
  assert.equal(sealed.heroFrameSha256.length, 64);
  assert.equal(sealed.reportSha256.length, 64);
});
