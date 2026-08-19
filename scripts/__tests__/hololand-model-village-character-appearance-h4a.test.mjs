import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  deriveH4AHarnessSource,
  validateH4ACompilerRecords,
} from '../check-hololand-model-village-character-appearance-h4a.mjs';
import { deriveH3YHarnessSource } from '../check-hololand-model-village-character-appearance-h3y.mjs';
import { deriveH3ZHarnessSource } from '../check-hololand-model-village-character-appearance-h3z.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('H4A HoloScript source owns all four residents and the promoted geometry profiles', () => {
  const source = readFileSync(
    path.join(
      ROOT,
      'source/layers/vr/frontier/model-village/model-village-character-appearance-h4a-facial-volume-garment-framing.holo'
    ),
    'utf8'
  );
  for (const resident of ['OpenAI', 'Claude', 'Gemini', 'Grok']) {
    assert.match(source, new RegExp(`displayLabel: "${resident}"`));
  }
  for (const profile of [
    'portrait_facial_volume_v5',
    'stormglass_portrait_fieldcoat',
    'scalp_flow_portrait_v4',
    'layered_ocular_calibrated_v3',
    'stormglass_room_basis_v2',
  ]) {
    assert.equal((source.match(new RegExp(profile, 'g')) || []).length >= 5, true, profile);
  }
  assert.match(source, /expectedClosureCount: 7/);
  assert.match(source, /expectedBrowRibbonCount: 2/);
  assert.match(source, /expectedLashRibbonCount: 4/);
  assert.match(source, /taaConvergenceMeasured: false/);
  assert.match(source, /freshRtxBenchmarkClaimed: false/);
  assert.match(source, /photorealismClaimed: false/);
});

test('H4A harness derivation keeps the admitted browser path and adds a second source-derived frame', () => {
  const base = readFileSync(
    path.join(ROOT, 'scripts/check-hololand-model-village-character-appearance-h3x.mjs'),
    'utf8'
  );
  const derived = deriveH4AHarnessSource(
    deriveH3ZHarnessSource(deriveH3YHarnessSource(base))
  );
  assert.match(derived, /export async function runCharacterAppearanceH4A/);
  assert.match(derived, /0e5b0a3b7745f4113ee8b9dd62f70be9fc63d8d2/);
  assert.match(derived, /model-village-character-appearance-h4a-facial-volume-garment-framing/);
  assert.match(derived, /garmentViewProj: typedArray\(garmentFrame\.matrix\)/);
  assert.match(derived, /data-garment-resident=/);
  assert.match(derived, /garmentMetrics\.nonBackgroundPixelCount < 3000/);
  assert.doesNotMatch(derived, /MV_CHARACTER_APPEARANCE_H4A_MATERIAL_DEPTH_ROOM_RESPONSE/);
});

test('H4A compiler admission fails closed over facial, ocular, groom, coat, and frame receipts', () => {
  const record = {
    displayLabel: 'OpenAI',
    vertexCount: 12800,
    face: {
      facialDetailProfile: 'portrait-facial-volume-v5',
      ocularProfile: 'layered-ocular-calibrated-v3',
      irisScale: 0.46,
      pupilScale: 0.34,
    },
    facialLandmarks: {
      schemaVersion: 'holoscript.agent-avatar-facial-landmarks.v5',
      profile: 'portrait-facial-volume-v5',
      facialVolumeProfile: 'nasal-malar-mandibular-volume-v1',
      noseBridgeVertexCount: 220,
      philtrumVertexCount: 92,
      browArcSegments: 22,
    },
    garment: {
      schemaVersion: 'holoscript.agent-avatar-garment-geometry.v4',
      style: 'stormglass_portrait_fieldcoat',
      constructionProfile: 'portrait-full-fieldcoat-v3',
      closureCount: 7,
      cuffBandCount: 2,
      coatLength: 1.4,
      frontHemSplitDepth: 0.63,
      portraitFramingProfile: 'full-coat-closures-cuffs-v1',
      clothVertexCount: 664,
    },
    groom: {
      schemaVersion: 'holoscript.agent-avatar-groom-geometry.v4',
      profile: 'scalp-flow-portrait-v4',
      facialFramingProfile: 'portrait-brow-lash-ribbons-v1',
      browCardCount: 2,
      lashCardCount: 4,
      facialFramingVertexCount: 240,
      scalpPenetrationVertexCount: 0,
    },
    ocular: {
      schemaVersion: 'holoscript.agent-avatar-ocular-geometry.v3',
      profile: 'layered-ocular-calibrated-v3',
      calibrationProfile: 'portrait-ocular-balance-v1',
      tearMeniscusProfile: 'lower-cornea-meniscus-v1',
      irisScale: 0.46,
      pupilScale: 0.34,
    },
    portraitFrame: { selectedVertexCount: 432 },
    garmentFrame: { selectedVertexCount: 664 },
  };
  assert.equal(
    validateH4ACompilerRecords(
      ['OpenAI', 'Claude', 'Gemini', 'Grok'].map((displayLabel) => ({
        ...record,
        displayLabel,
      }))
    ).status,
    'pass'
  );
  assert.equal(
    validateH4ACompilerRecords([
      { ...record, garment: { ...record.garment, closureCount: 5 } },
    ]).status,
    'fail'
  );
});

test('H4A typed policy and flat seed state the no-timing and no-photoreal boundary', () => {
  const policy = readFileSync(
    path.join(
      ROOT,
      'source/proofs/model-village-character-appearance-h4a-facial-volume-garment-framing-policy.hsplus'
    ),
    'utf8'
  );
  const seed = readFileSync(
    path.join(
      ROOT,
      'source/proofs/model-village-character-appearance-h4a-facial-volume-garment-framing-seed.hs'
    ),
    'utf8'
  );
  assert.match(policy, /nativeHsplusActionExecutionClaimed: false/);
  assert.match(policy, /dual_frame_coverage_missing/);
  assert.match(seed, /dualFramePortraitAndGarmentMeasured: true/);
  assert.match(seed, /gpuTimestampMeasured: false/);
  assert.match(seed, /freshRtxBenchmarkClaimed: false/);
  assert.match(seed, /photorealismClaimed: false/);
});
