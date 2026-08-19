#!/usr/bin/env node
/* global console, process */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runModelVillageArtDirectionCheck,
  verifyModelVillageArtDirectionReceipt,
} from '../check-hololand-model-village-art-direction.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');
const outputDir = path.join(
  repoRoot,
  '.tmp',
  'hololand',
  'model-village',
  'art-direction-test',
);
mkdirSync(outputDir, { recursive: true });
const output = path.join(
  outputDir,
  `receipt-${process.pid}-${randomUUID()}.json`,
);

try {
  const { receipt } = await runModelVillageArtDirectionCheck({
    root: repoRoot,
    output,
  });

  assert.equal(receipt.schemaVersion, 'hololand.model-village-art-direction.v2');
  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.world.name, 'Stormglass Commons');
  assert.equal(receipt.world.artStyle, 'hearthlight_biorealism');
  assert.equal(receipt.world.residentDesignSystem, 'stormglass_craftfolk');
  assert.equal(
    receipt.world.publicEmbodimentSystem,
    'stormglass_family_craftfolk',
  );
  const publicEmbodiments = Object.values(receipt.publicEmbodiments);
  assert.equal(Array.isArray(receipt.publicEmbodiments), false);
  assert.deepEqual(
    new Set(Object.keys(receipt.publicEmbodiments)),
    new Set([
      'public-embodiment-anthropic',
      'public-embodiment-google',
      'public-embodiment-ollama',
      'public-embodiment-openai',
      'public-embodiment-sovereign',
      'public-embodiment-xai',
    ]),
  );
  assert.equal(receipt.residents.length, 6);
  assert.deepEqual(
    receipt.residents.map((resident) => resident.researchAlias),
    [
      'Resident 01',
      'Resident 02',
      'Resident 03',
      'Resident 04',
      'Resident 05',
      'Resident 06',
    ],
  );
  assert.deepEqual(
    new Set(publicEmbodiments.map(
      (embodiment) => embodiment.publicDisplayName,
    )),
    new Set([
      'Claude',
      'OpenAI',
      'Gemini',
      'Grok',
      'GLM',
      'Brittney',
    ]),
  );
  assert.deepEqual(
    new Set(publicEmbodiments.map((embodiment) => embodiment.familyId)),
    new Set([
      'anthropic',
      'openai',
      'google',
      'xai',
      'ollama',
      'sovereign',
    ]),
  );
  assert.equal(
    new Set(receipt.residents.map((resident) => resident.silhouetteId)).size,
    6,
  );
  assert.equal(
    new Set(receipt.residents.map((resident) => resident.glyphId)).size,
    6,
  );
  assert.equal(
    new Set(receipt.residents.map((resident) => resident.accentColor)).size,
    6,
  );
  assert.equal(
    receipt.residents.every(
      (resident) => (
        /^[a-f0-9]{64}$/.test(resident.researchAppearanceDigest)
        && !Object.hasOwn(resident, 'publicEmbodimentDigest')
        && !Object.hasOwn(resident, 'publicDisplayName')
        && !Object.hasOwn(resident, 'familyId')
      ),
    ),
    true,
  );
  assert.equal(publicEmbodiments.length, 6);
  assert.equal(
    publicEmbodiments.every(
      (embodiment) => (
        /^[a-f0-9]{64}$/.test(embodiment.publicEmbodimentDigest)
        && embodiment.researchResidentBinding === 'none'
        && embodiment.researchSeatBinding === 'none'
        && embodiment.researchPersonaBinding === 'none'
        && embodiment.researchRoleBinding === 'none'
        && embodiment.adapterAssignmentBinding === 'none'
        && !Object.hasOwn(embodiment, 'residentId')
        && !Object.hasOwn(embodiment, 'seatId')
        && !Object.hasOwn(embodiment, 'villageRole')
        && !Object.hasOwn(embodiment, 'roleProp')
        && !Object.hasOwn(embodiment, 'ordinal')
        && !Object.hasOwn(embodiment, 'publicStoryOrdinal')
      ),
    ),
    true,
  );
  assert.equal(
    publicEmbodiments.every((embodiment) => {
      const semanticIds = [
        embodiment.familyMantlePatternId,
        embodiment.familyMantleGlyphId,
      ].join('_').toLowerCase();
      return receipt.identityContract.forbiddenPublicMantleRoleTokens.every(
        (token) => !semanticIds.includes(token),
      );
    }),
    true,
  );
  const researchAccentColors = new Set(
    receipt.residents.map((resident) => resident.accentColor),
  );
  assert.equal(
    publicEmbodiments.every(
      (embodiment) => (
        !researchAccentColors.has(embodiment.familyMantleAccentColor)
      ),
    ),
    true,
  );
  assert.equal(receipt.imageEvidence.length, 3);
  assert.equal(
    receipt.imageEvidence.every(
      (entry) => (
        entry.dimensions.aspectRatioClass === 'wide_landscape'
        && entry.evidenceClass === 'concept_target_not_runtime_proof'
      ),
    ),
    true,
  );
  assert.equal(
    receipt.identityContract.defaultResearchProfile,
    'research_live_blinded',
  );
  assert.deepEqual(
    receipt.residentAssetTruth,
    {
      manifestSource:
        'source/layers/vr/frontier/model-village/model-village-resident-asset-manifest.holo',
      manifestSourceObserved: true,
      manifestSchema:
        'hololand.model-village.neutral-resident-asset-candidate.v1',
      manifestSourceSha256:
        receipt.sourceEvidence[
          'source/layers/vr/frontier/model-village/model-village-resident-asset-manifest.holo'
        ].sha256,
      manifestScope: 'neutral_research_seat_01_lod0',
      assetPurpose:
        'technical_loader_fixture_not_complete_stormglass_production_art',
      residentId: 'resident-01',
      seatId: 'seat-01',
      lod: 'lod0',
      presentationProfile: 'research_live_blinded',
      sourceAdmissionStatus: 'manifest_source_observed',
      runtimeAttachmentStatus: 'target_until_rendering_truth_receipt',
      runtimeAttachmentObservedByArtDirectionGate: false,
      productionArtObserved: false,
      completeStormglassKitObserved: false,
      completeLodSetObserved: false,
      authoredHumanoidRigObserved: false,
      neutralClipSetObserved: false,
      productionTextureSetObserved: false,
      publicFamilyMantleBinding: 'none',
      photorealismObserved: false,
    },
  );
  assert.equal(
    /^[a-f0-9]{64}$/.test(receipt.residentAssetTruth.manifestSourceSha256),
    true,
  );
  assert.equal(
    receipt.claimBoundary.observed.includes(
      'neutral_seat_01_lod0_asset_source_manifest',
    ),
    true,
  );
  assert.equal(
    [
      'renderer_observed_neutral_seat_01_lod0_attachment',
      'complete_six_resident_stormglass_asset_kit',
      'complete_resident_lod0_lod1_lod2_set',
      'authored_humanoid_rig',
      'neutral_resident_clip_set',
      'production_resident_texture_set',
      'photorealism',
    ].every(
      (claim) => receipt.claimBoundary.targetNotObserved.includes(claim),
    ),
    true,
  );
  assert.deepEqual(
    new Set(Object.values(receipt.identityContract.publicFamilyCatalog)),
    new Set(['Claude', 'OpenAI', 'Gemini', 'Grok', 'GLM', 'Brittney']),
  );
  assert.equal(
    receipt.identityContract.forbiddenResearchIdentityFields.includes(
      'familyMantleId',
    ),
    true,
  );
  assert.equal(
    receipt.identityContract.independentProjectDisclosure,
    'HoloLand-authored visual interpretation; not affiliated with or endorsed by the named providers.',
  );
  assert.equal(
    receipt.identityContract.independentProjectDisclosureHash,
    '143ba2f892ea8259b0fbdfe4041aab632ced32225f57d7ffee03e67b4e6a7494',
  );
  assert.equal(
    Object.values(receipt.assertions).every((passed) => passed === true),
    true,
  );
  assert.deepEqual(receipt.failures, []);
  assert.equal(verifyModelVillageArtDirectionReceipt(receipt), true);
  const publicIdentityMutated = structuredClone(receipt);
  publicIdentityMutated.publicEmbodiments[
    'public-embodiment-anthropic'
  ].publicDisplayName = 'tampered-public-display-name';
  assert.equal(
    verifyModelVillageArtDirectionReceipt(publicIdentityMutated),
    false,
  );
  const researchIdentityMutated = structuredClone(receipt);
  researchIdentityMutated.residents[0].researchAlias =
    'tampered-research-alias';
  assert.equal(
    verifyModelVillageArtDirectionReceipt(researchIdentityMutated),
    false,
  );

  console.log(
    `PASS hololand-model-village-art-direction (${receipt.receiptHash})`,
  );
} finally {
  rmSync(output, { force: true });
}
