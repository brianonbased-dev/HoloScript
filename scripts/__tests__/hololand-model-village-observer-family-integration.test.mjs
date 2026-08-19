#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildObserverIntegrationAdmission,
  validateObserverFamilyIntegrationSource,
  validatePlacementManifestSource,
} from '../check-hololand-model-village-observer-family-integration.mjs';

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

test('MV-V7 integration source preserves the read-only research boundary', () => {
  const ast = parse(
    'source/layers/vr/frontier/model-village/model-village-observer-family-integration.holo'
  );
  const policy = validateObserverFamilyIntegrationSource(ast);
  assert.deepEqual(
    policy.state.admittedPresentationProfiles,
    ['village_story_unblinded', 'research_replay_postlock']
  );
  assert.equal(policy.state.defaultPresentationProfile, 'research_live_blinded');
  assert.equal(policy.state.researchResidentBinding, 'none');
  assert.equal(policy.state.canonicalWriteAuthority, false);
  assert.equal(policy.state.residentObservationWriteAuthority, false);
  assert.equal(policy.state.causalEffect, false);
});

test('MV-V7 placement manifest is family-ID keyed and contains no research join', () => {
  const ast = parse(
    'source/layers/vr/frontier/model-village/model-village-observer-family-placement-manifest.holo'
  );
  const policy = validatePlacementManifestSource(ast, { requireAnchors: false });
  assert.equal(policy.placements.length, 6);
  assert.deepEqual(
    policy.placements.map((placement) => placement.familyId),
    ['anthropic', 'google', 'ollama', 'openai', 'sovereign', 'xai']
  );
  assert.equal(policy.placements.every((placement) => placement.researchBinding === 'none'), true);
  assert.match(policy.placementContractSha256, /^[a-f0-9]{64}$/);
});

test('MV-V7 admission is exact, profile-bound, and research-join free', () => {
  const shared = {
    integrationSourceSha256: '1'.repeat(64),
    placementContractSha256: '2'.repeat(64),
    observerProjectionSourceSha256: '3'.repeat(64),
    lineupSourceSha256: '4'.repeat(64),
    lineupManifestSourceSha256: '5'.repeat(64),
    observerCanonicalFieldsSha256: '6'.repeat(64),
  };
  const story = buildObserverIntegrationAdmission({
    ...shared,
    presentationProfile: 'village_story_unblinded',
  });
  const postlock = buildObserverIntegrationAdmission({
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
