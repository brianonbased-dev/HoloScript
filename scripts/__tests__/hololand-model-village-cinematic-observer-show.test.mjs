#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildCinematicObserverShowAdmission,
  validateCinematicObserverShowManifest,
  validateCinematicObserverShowSource,
} from '../check-hololand-model-village-cinematic-observer-show.mjs';
import { objectProperties } from '../check-hololand-model-village-resident-rig.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..', '..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT ?? 'C:/Users/josep/Documents/GitHub/HoloScript';
const SHOW_PATH =
  'source/layers/vr/frontier/model-village/model-village-cinematic-observer-show.holo';
const MANIFEST_PATH =
  'source/layers/vr/frontier/model-village/model-village-cinematic-observer-show-manifest.holo';
const core = await import(
  pathToFileURL(path.join(HOLOSCRIPT_ROOT, 'packages/core/dist/index.js')).href
);

function parse(relativePath) {
  const source = fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
  const parsed = core.parseHolo(source);
  assert.equal(parsed.success, true, JSON.stringify(parsed.errors));
  assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors));
  return parsed.ast;
}

test('MV-S1 source owns the exact 52-second six-beat show', () => {
  const policy = validateCinematicObserverShowSource(parse(SHOW_PATH));
  assert.equal(policy.beats.length, 6);
  assert.equal(
    policy.beats.reduce((sum, beat) => sum + beat.durationMs, 0),
    52000
  );
  assert.deepEqual(
    policy.beats.map((beat) => beat.beatId),
    [
      'stormglass_before_the_proof',
      'water_given',
      'the_hearth_answers',
      'the_boundary_holds',
      'separate_physics_witness',
      'proof_in_the_light',
    ]
  );
  assert.deepEqual(
    policy.beats.map((beat) => beat.physicsFrameStep),
    [42, 42, 42, 42, 599, 599]
  );
  assert.match(policy.showContractSha256, /^[a-f0-9]{64}$/);
});

test('MV-S1 visibly separates the V4 RUN and MV-P10 fixture lanes', () => {
  const policy = validateCinematicObserverShowSource(parse(SHOW_PATH));
  assert.deepEqual(
    policy.beats.map((beat) => beat.evidenceLane),
    [
      'v4_run',
      'v4_run',
      'v4_run',
      'v4_run',
      'mv_p10_physics_fixture',
      'exhibit_synthesis',
    ]
  );
  assert.equal(policy.laneBoundary.crossLaneCausalityAllowed, false);
  assert.equal(policy.laneBoundary.physicsFixtureMayExplainV4Receipts, false);
  assert.equal(policy.laneBoundary.v4ReceiptsMayClaimPhysicsFixtureExecution, false);
  assert.equal(policy.laneBoundary.synthesisMayMergeEvidence, false);
  assert.ok(
    policy.beats.every((beat) => beat.crossLaneCausalityAllowed === false)
  );
});

test('MV-S1 first executable cut is manual, reduced-motion, and silent', () => {
  const policy = validateCinematicObserverShowSource(parse(SHOW_PATH));
  assert.equal(policy.state.autoplayDefault, false);
  assert.equal(policy.state.manualPlaybackRequired, true);
  assert.equal(policy.state.pauseRequired, true);
  assert.equal(policy.state.replayRequired, true);
  assert.equal(policy.state.reducedMotionDefault, true);
  assert.equal(policy.state.continuousCameraMotion, false);
  assert.equal(policy.state.audioEnabled, false);
  assert.equal(policy.state.audioGraphAllowed, false);
  assert.equal(policy.silent.audioEnabled, false);
  assert.equal(policy.silent.audioGraphAllowed, false);
  assert.equal(policy.silent.audibleOutputVerified, false);
  assert.equal(policy.silent.humanMixApproved, false);
});

test('MV-S1 preserves research blindness and the no-feedback edge', () => {
  const policy = validateCinematicObserverShowSource(parse(SHOW_PATH));
  assert.deepEqual(
    policy.state.admittedPresentationProfiles,
    ['village_story_unblinded', 'research_replay_postlock']
  );
  assert.deepEqual(policy.state.deniedPresentationProfiles, ['research_live_blinded']);
  assert.equal(policy.state.researchResidentBinding, 'none');
  assert.equal(policy.state.canonicalWriteAuthority, false);
  assert.equal(policy.state.residentObservationWriteAuthority, false);
  assert.equal(policy.noFeedback.browserMayCallModel, false);
  assert.equal(policy.noFeedback.browserMayWriteCanonicalWorld, false);
  assert.equal(policy.noFeedback.browserMayWriteResidentObservation, false);
  assert.equal(policy.noFeedback.residentCanObservePresentation, false);
  assert.equal(policy.noFeedback.presentationCanAffectOutcome, false);
});

test('MV-S1 admissions bind source, contract, MV-V7, canonical state, lock, and profile', () => {
  const shared = {
    showSourceSha256: '1'.repeat(64),
    showContractSha256: '2'.repeat(64),
    mvV7AdmissionSha256: '3'.repeat(64),
    observerCanonicalFieldsSha256: '4'.repeat(64),
  };
  const story = buildCinematicObserverShowAdmission({
    ...shared,
    presentationProfile: 'village_story_unblinded',
  });
  const postlock = buildCinematicObserverShowAdmission({
    ...shared,
    presentationProfile: 'research_replay_postlock',
  });
  assert.match(story.sha256, /^[a-f0-9]{64}$/);
  assert.match(postlock.sha256, /^[a-f0-9]{64}$/);
  assert.notEqual(story.sha256, postlock.sha256);
  assert.equal(
    story.canonical.productionLock,
    'a1c8c9ad6142ba4795385dac6551a4131befa809'
  );
  assert.equal(story.canonical.researchResidentBinding, 'none');
  assert.equal(story.canonical.canonicalWriteAuthority, false);
  assert.equal(story.canonical.crossLaneCausalityAllowed, false);
  assert.equal(story.canonical.audioEnabled, false);
});

test('MV-S1 manifest claims only the silent first executable cut', () => {
  const ast = parse(MANIFEST_PATH);
  validateCinematicObserverShowManifest(ast, {}, { requireAnchors: false });
  const state = objectProperties(ast.state);
  assert.equal(state.beatCount, 6);
  assert.equal(state.sequenceDurationMs, 52000);
  assert.equal(state.mvS1FirstExecutableCutClaimed, true);
  assert.equal(state.crossLaneCausalityAllowed, false);
  assert.equal(state.audioEnabled, false);
  assert.equal(state.audioGraphObserved, false);
  assert.equal(state.audibleOutputVerified, false);
  assert.equal(state.humanMixApproved, false);
  assert.equal(state.modelCallsObserved, 0);
  assert.equal(state.browserWritesObserved, 0);
});

test('MV-S1 browser bridge contains no Web Audio constructor or audio asset request', () => {
  const source = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/check-hololand-model-village-cinematic-observer-show.mjs'),
    'utf8'
  );
  assert.doesNotMatch(source, /new\s+(?:window\.)?(?:AudioContext|webkitAudioContext)/);
  assert.doesNotMatch(source, /createOscillator|createMediaElementSource|decodeAudioData/);
  assert.doesNotMatch(source, /\.(?:mp3|wav|ogg|m4a)\b/i);
});
