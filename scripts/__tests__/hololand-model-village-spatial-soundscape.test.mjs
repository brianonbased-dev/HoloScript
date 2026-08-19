#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildSpatialSoundscapeAdmission,
  validateSpatialSoundscapeManifest,
  validateSpatialSoundscapeSource,
} from '../check-hololand-model-village-spatial-soundscape.mjs';
import {
  materializeSoundscape,
} from '../lib/model-village-deterministic-audio.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..', '..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT ?? 'C:/Users/josep/Documents/GitHub/HoloScript';
const SOURCE_PATH =
  'source/layers/vr/frontier/model-village/model-village-spatial-soundscape.holo';
const MANIFEST_PATH =
  'source/layers/vr/frontier/model-village/model-village-spatial-soundscape-manifest.holo';
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

test('MV-S2 source owns six first-class HoloScript audio blocks and 52 seconds', () => {
  const soundscape = validateSpatialSoundscapeSource(parse(SOURCE_PATH));
  assert.equal(soundscape.sources.length, 6);
  assert.equal(soundscape.state.sequenceDurationMs, 52000);
  assert.equal(soundscape.state.sampleRateHz, 24000);
  assert.equal(soundscape.state.channelCount, 2);
  assert.deepEqual(
    soundscape.sources.map((source) => source.id),
    [
      'RainOnStormglass',
      'CommonsCistern',
      'HearthResonance',
      'BoundaryWardAir',
      'GravityWitnessChimes',
      'ProofResolve',
    ]
  );
  assert.equal(soundscape.sources.filter((source) => source.spatial).length, 5);
  assert.match(soundscape.contractSha256, /^[a-f0-9]{64}$/);
});

test('MV-S2 deterministic materializer reproduces every stem and the stereo master', () => {
  const soundscape = validateSpatialSoundscapeSource(parse(SOURCE_PATH));
  const first = materializeSoundscape(soundscape);
  const second = materializeSoundscape(soundscape);
  assert.equal(first.sourceAssets.length, 6);
  assert.equal(first.master.durationMs, 52000);
  assert.equal(first.master.sampleRateHz, 24000);
  assert.equal(first.master.channels, 2);
  assert.equal(first.master.pcmSha256, second.master.pcmSha256);
  assert.equal(first.master.wavSha256, second.master.wavSha256);
  assert.deepEqual(
    first.sourceAssets.map((asset) => asset.wavSha256),
    second.sourceAssets.map((asset) => asset.wavSha256)
  );
  assert.ok(first.sourceAssets.every((asset) => asset.wav.subarray(0, 4).toString() === 'RIFF'));
  assert.equal(first.master.wav.subarray(8, 12).toString(), 'WAVE');
});

test('MV-S2 defaults muted and exposes caption-parity and text description controls', () => {
  const soundscape = validateSpatialSoundscapeSource(parse(SOURCE_PATH));
  assert.equal(soundscape.state.autoplayDefault, false);
  assert.equal(soundscape.state.mutedDefault, true);
  assert.equal(soundscape.state.userGestureRequired, true);
  assert.equal(soundscape.state.captionsAlwaysVisible, true);
  assert.equal(soundscape.state.captionMuteParityRequired, true);
  assert.equal(soundscape.state.audioDescriptionTextAvailable, true);
  assert.equal(soundscape.state.audioDescriptionSpeechClaimed, false);
});

test('MV-S2 admissions bind source, parent show, assets, both locks, and profile', () => {
  const shared = {
    soundscapeSourceSha256: '1'.repeat(64),
    soundscapeContractSha256: '2'.repeat(64),
    parentShowSourceSha256: '3'.repeat(64),
    parentShowContractSha256: '4'.repeat(64),
    audioAssetManifestSha256: '5'.repeat(64),
  };
  const story = buildSpatialSoundscapeAdmission({
    ...shared,
    presentationProfile: 'village_story_unblinded',
  });
  const postlock = buildSpatialSoundscapeAdmission({
    ...shared,
    presentationProfile: 'research_replay_postlock',
  });
  assert.match(story.sha256, /^[a-f0-9]{64}$/);
  assert.match(postlock.sha256, /^[a-f0-9]{64}$/);
  assert.notEqual(story.sha256, postlock.sha256);
  assert.equal(
    story.canonical.soundscapeProductionLock,
    '638827424736e4bebc088cea62aac7d6f9026b7a5f41088419ef63a5ef565e27'
  );
  assert.equal(
    story.canonical.parentProductionLock,
    'a1c8c9ad6142ba4795385dac6551a4131befa809'
  );
  assert.equal(story.canonical.canonicalWriteAuthority, false);
  assert.equal(story.canonical.crossLaneCausalityAllowed, false);
});

test('MV-S2 preserves the silent research lane and zero-feedback edge', () => {
  const soundscape = validateSpatialSoundscapeSource(parse(SOURCE_PATH));
  assert.deepEqual(
    soundscape.state.admittedPresentationProfiles,
    ['village_story_unblinded', 'research_replay_postlock']
  );
  assert.deepEqual(soundscape.state.deniedPresentationProfiles, ['research_live_blinded']);
  assert.equal(soundscape.admission.deniedProfileMayConstructAudioGraph, false);
  assert.equal(soundscape.admission.invalidAdmissionMayConstructAudioGraph, false);
  assert.equal(soundscape.noFeedback.browserMayCallModel, false);
  assert.equal(soundscape.noFeedback.browserMayWriteCanonicalWorld, false);
  assert.equal(soundscape.noFeedback.browserMayWriteResidentObservation, false);
  assert.equal(soundscape.noFeedback.residentCanHearPresentation, false);
  assert.equal(soundscape.noFeedback.presentationCanAffectOutcome, false);
});

test('MV-S2 Godot lowering contains five spatial players and one resolve player', () => {
  const ast = parse(SOURCE_PATH);
  validateSpatialSoundscapeSource(ast);
  const godot = new core.GodotCompiler().compile(ast);
  assert.equal((godot.match(/AudioStreamPlayer3D\.new\(\)/g) ?? []).length, 5);
  assert.equal((godot.match(/AudioStreamPlayer\.new\(\)/g) ?? []).length, 1);
  assert.equal((godot.match(/\.play\(\)/g) ?? []).length, 10);
  assert.match(godot, /stormglass-rain-on-glass\.wav/);
  assert.match(godot, /stormglass-proof-resolve\.wav/);
});

test('MV-S2 manifest refuses human listening and mix-approval overclaims', () => {
  const ast = parse(MANIFEST_PATH);
  const manifest = validateSpatialSoundscapeManifest(
    ast,
    {},
    { requireAnchors: false }
  );
  assert.equal(manifest.state.humanListenHandoffObserved, true);
  assert.equal(manifest.state.humanListenCompleted, false);
  assert.equal(manifest.state.audibleOutputHumanVerified, false);
  assert.equal(manifest.state.humanMixApproved, false);
  assert.equal(manifest.state.externalNetworkFetchesObserved, 0);
  assert.equal(manifest.state.modelCallsObserved, 0);
  assert.equal(manifest.state.browserWritesObserved, 0);
});

test('MV-S2 source states the bridge-only authorship and unproved perceptual boundary', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, SOURCE_PATH), 'utf8');
  assert.match(source, /pcmMaterializationBridgeOnly: true/);
  assert.match(source, /humanListenCompleted: false/);
  assert.match(source, /humanMixApproved: false/);
  assert.match(source, /"binaural_hrtf_perceptual_accuracy"/);
  assert.match(source, /"spoken_narration_voice_or_tts"/);
  assert.match(source, /"resident_hearing_or_behavioral_response"/);
});
