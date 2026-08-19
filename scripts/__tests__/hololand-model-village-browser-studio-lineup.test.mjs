import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { sha256 } from '../check-hololand-model-village-resident-rig.mjs';
import { FAMILY_MANTLES } from '../check-hololand-model-village-family-mantles.mjs';
import {
  buildBrowserStudioAdmission,
  validateBrowserStudioLineupSource,
} from '../check-hololand-model-village-browser-studio-lineup.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT ?? 'C:/Users/josep/Documents/GitHub/HoloScript';
const core = await import(
  pathToFileURL(path.join(HOLOSCRIPT_ROOT, 'packages/core/dist/index.js')).href
);
const sourcePath = path.join(
  REPO_ROOT,
  'source/layers/vr/frontier/model-village/model-village-browser-studio-lineup.holo'
);
const catalogPath = path.join(
  REPO_ROOT,
  'source/layers/vr/frontier/model-village/model-village-family-mantle-catalog.holo'
);
const sourceText = fs.readFileSync(sourcePath, 'utf8');
const catalogText = fs.readFileSync(catalogPath, 'utf8');
const source = core.parseHolo(sourceText);

const bundleHashes = FAMILY_MANTLES.map((family) =>
  sha256(
    fs.readFileSync(
      path.join(
        REPO_ROOT,
        `assets/model-village/residents/stormglass-${family.slug}-mantle-lod0.character.json`
      )
    )
  )
);

test('MV-V6 HoloScript source admits only the public story gallery', () => {
  assert.equal(source.success, true);
  assert.equal(source.errors.length, 0);
  const policy = validateBrowserStudioLineupSource(source.ast);
  assert.equal(policy.metadata.presentationProfile, 'village_story_unblinded');
  assert.equal(policy.metadata.deniedPresentationProfile, 'research_live_blinded');
  assert.equal(policy.state.browserConsumerBuilt, true);
  assert.equal(policy.state.completeMvP2Claimed, false);
  assert.deepEqual(policy.state.sealedPhysicsPhaseSeconds, [0, 0.6, 1.2]);
});

test('MV-V6 exact admission binds source, catalog, bundles, profile, and disclosure', () => {
  const admission = buildBrowserStudioAdmission({
    sourceSha256: sha256(sourceText),
    catalogSha256: sha256(catalogText),
    bundleSha256: bundleHashes,
  });
  assert.equal(
    admission.sha256,
    'c4ccf05a3d730d9cfe26f2a7b35ecb588074816f2e3e437ff270003b34fb9e6e'
  );
  assert.equal(
    admission.canonical.presentationProfile,
    'village_story_unblinded'
  );
  assert.equal(admission.canonical.researchLiveBlindedAllowed, false);
  assert.equal(admission.canonical.canonicalWriteAuthority, false);
  assert.deepEqual(admission.canonical.familyBundleSha256, bundleHashes);
});

test('MV-V6 source has no static research identity or adapter join', () => {
  for (const forbidden of [
    'researchResidentBinding: "Seat',
    'researchSeatBinding: "Seat',
    'researchPersonaBinding: "persona',
    'adapterAssignmentBinding: "claude',
    'adapterAssignmentBinding: "openai',
    'adapterAssignmentBinding: "gemini',
    'adapterAssignmentBinding: "grok',
    'exactModelRevisionBinding: "gpt',
  ]) {
    assert.equal(sourceText.includes(forbidden), false, forbidden);
  }
  assert.match(sourceText, /researchLiveBlindedAllowed:\s*false/u);
  assert.match(sourceText, /storyGalleryOrderDefinesResearchSeat:\s*false/u);
  assert.match(sourceText, /missingAdmissionBehavior:\s*"fail_neutral"/u);
});

test('browser bridge is self-contained and renders through native HoloScript WebGPU', () => {
  const bridge = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/check-hololand-model-village-browser-studio-lineup.mjs'),
    'utf8'
  );
  assert.match(bridge, /navigator\.gpu\.requestAdapter/u);
  assert.match(bridge, /adapter\.requestDevice/u);
  assert.match(bridge, /__HOLOSCRIPT_CHARACTER_RENDER__/u);
  assert.match(bridge, /renderCharacter/u);
  assert.match(bridge, /externalNetworkRequests\.length === 0/u);
  assert.doesNotMatch(bridge, /from ['"]three['"]/u);
  assert.doesNotMatch(bridge, /@react-three/u);
});
