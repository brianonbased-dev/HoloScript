#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildObserverCinematicAdmission,
  validateObserverCinematicSequenceSource,
} from '../check-hololand-model-village-observer-cinematic-sequence.mjs';
import { objectProperties } from '../check-hololand-model-village-resident-rig.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..', '..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT ?? 'C:/Users/josep/Documents/GitHub/HoloScript';
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

test('MV-V8 source owns exactly two reduced-motion cinematic beats', () => {
  const ast = parse(
    'source/layers/vr/frontier/model-village/model-village-observer-cinematic-sequence.holo'
  );
  const policy = validateObserverCinematicSequenceSource(ast);
  assert.equal(policy.beats.length, 2);
  assert.deepEqual(
    policy.beats.map((beat) => beat.beatId),
    ['the_commons_wakes', 'proof_in_the_light']
  );
  assert.deepEqual(
    policy.beats.map((beat) => beat.sealedClothPhaseSeconds),
    [0.6, 1.2]
  );
  assert.equal(policy.state.autoplayDefault, false);
  assert.equal(policy.state.reducedMotionDefault, true);
  assert.equal(policy.state.observerCompositePixelEqualityClaimed, false);
  assert.match(policy.sequenceContractSha256, /^[a-f0-9]{64}$/);
});

test('MV-V8 preserves research blindness and the no-feedback edge', () => {
  const ast = parse(
    'source/layers/vr/frontier/model-village/model-village-observer-cinematic-sequence.holo'
  );
  const policy = validateObserverCinematicSequenceSource(ast);
  assert.deepEqual(
    policy.state.admittedPresentationProfiles,
    ['village_story_unblinded', 'research_replay_postlock']
  );
  assert.deepEqual(policy.state.deniedPresentationProfiles, ['research_live_blinded']);
  assert.equal(policy.state.researchResidentBinding, 'none');
  assert.equal(policy.state.canonicalWriteAuthority, false);
  assert.equal(policy.state.residentObservationWriteAuthority, false);
  assert.equal(policy.state.causalEffect, false);
  assert.equal(policy.noFeedback.residentCanObservePresentation, false);
  assert.equal(policy.noFeedback.presentationCanAffectOutcome, false);
});

test('MV-V8 optional local audio is muted, asset-free, and claim-bounded', () => {
  const ast = parse(
    'source/layers/vr/frontier/model-village/model-village-observer-cinematic-sequence.holo'
  );
  const policy = validateObserverCinematicSequenceSource(ast);
  assert.equal(policy.state.audioDefaultMuted, true);
  assert.equal(policy.state.audioExternalAssets, false);
  assert.equal(policy.state.audioWorldCausalEffect, false);
  assert.equal(policy.audio.requiresUserAction, true);
  assert.equal(policy.audio.audibleOutputVerified, false);
  assert.equal(policy.audio.humanMixApproved, false);
});

test('MV-V8 admissions bind the exact source, contract, MV-V7, canonical state, and profile', () => {
  const shared = {
    sequenceSourceSha256: '1'.repeat(64),
    sequenceContractSha256: '2'.repeat(64),
    mvV7AdmissionSha256: '3'.repeat(64),
    observerCanonicalFieldsSha256: '4'.repeat(64),
  };
  const story = buildObserverCinematicAdmission({
    ...shared,
    presentationProfile: 'village_story_unblinded',
  });
  const postlock = buildObserverCinematicAdmission({
    ...shared,
    presentationProfile: 'research_replay_postlock',
  });
  assert.match(story.sha256, /^[a-f0-9]{64}$/);
  assert.match(postlock.sha256, /^[a-f0-9]{64}$/);
  assert.notEqual(story.sha256, postlock.sha256);
  assert.equal(story.canonical.researchResidentBinding, 'none');
  assert.equal(story.canonical.researchSeatBinding, 'none');
  assert.equal(story.canonical.postlockResearchJoinExecuted, false);
  assert.equal(story.canonical.canonicalWriteAuthority, false);
  assert.equal(story.canonical.residentObservationWriteAuthority, false);
});

test('MV-V8 manifest stays explicitly narrower than MV-S1', () => {
  const ast = parse(
    'source/layers/vr/frontier/model-village/model-village-observer-cinematic-sequence-manifest.holo'
  );
  const state = objectProperties(ast.state);
  assert.equal(state.beatCount, 2);
  assert.equal(state.mvS1FullShowClaimed, false);
  assert.equal(state.audibleOutputVerified, false);
  assert.equal(state.humanMixApproved, false);
  assert.equal(state.researchLiveBlindedAllowed, false);
  assert.equal(state.namedRendererInstantiatedForResearch, false);
});
