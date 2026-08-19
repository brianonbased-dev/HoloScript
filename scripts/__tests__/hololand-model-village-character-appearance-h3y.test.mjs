import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  deriveH3YHarnessSource,
  validateH3YCompilerRecords,
} from '../check-hololand-model-village-character-appearance-h3y.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('H3Y HoloScript source keeps named residents and authors every realism profile', () => {
  const source = readFileSync(
    path.join(
      ROOT,
      'source/layers/vr/frontier/model-village/model-village-character-appearance-h3y-constructed-soft-tissue-probe.holo'
    ),
    'utf8'
  );
  for (const resident of ['OpenAI', 'Claude', 'Gemini', 'Grok']) {
    assert.match(source, new RegExp(`displayLabel: "${resident}"`));
  }
  assert.equal((source.match(/stormglass_tailored_fieldcoat/g) || []).length >= 5, true);
  assert.equal((source.match(/portrait_soft_tissue_v4/g) || []).length >= 5, true);
  assert.equal((source.match(/anatomical_lid_fold_v2/g) || []).length >= 5, true);
  assert.equal((source.match(/scalp_flow_containment_v2/g) || []).length >= 5, true);
  assert.equal((source.match(/directional_reflection_probe_v1/g) || []).length >= 5, true);
  assert.match(source, /photographicHdriClaimed: false/);
  assert.match(source, /freshRtxBenchmarkClaimed: false/);
});

test('H3Y harness derivation preserves the admitted browser machinery with new pins', () => {
  const base = readFileSync(
    path.join(ROOT, 'scripts/check-hololand-model-village-character-appearance-h3x.mjs'),
    'utf8'
  );
  const derived = deriveH3YHarnessSource(base);
  assert.match(derived, /export async function runCharacterAppearanceH3Y/);
  assert.match(derived, /293bd5f8e1b6bd4a4e4e8d9c970bbee545b0c898/);
  assert.match(derived, /portrait-soft-tissue-v4/);
  assert.match(derived, /directional-reflection-probe-v1/);
  assert.match(derived, /garment: canonical\(built\.garment\)/);
  assert.doesNotMatch(derived, /MV_CHARACTER_APPEARANCE_H3Y_CRANIAL_EXPRESSION_NORMALS/);
});

test('H3Y compiler receipt validation fails closed and admits the intended profiles', () => {
  const record = {
    displayLabel: 'OpenAI',
    face: {
      orbitalProfile: 'anatomical-lid-fold-v2',
      facialDetailProfile: 'portrait-soft-tissue-v4',
    },
    facialLandmarks: {
      schemaVersion: 'holoscript.agent-avatar-facial-landmarks.v4',
      lipTopology: 'connected-cupid-bow-ribbon-v1',
      lipSurfaceTriangleCount: 24,
    },
    garment: {
      schemaVersion: 'holoscript.agent-avatar-garment-geometry.v2',
      constructionProfile: 'four-panel-fieldcoat-v1',
      constructedPanelCount: 4,
      constructionSeamCount: 8,
      shoulderYokeCount: 2,
    },
    groom: {
      schemaVersion: 'holoscript.agent-avatar-groom-geometry.v2',
      profile: 'scalp-flow-containment-v2',
      containmentProfile: 'ellipsoidal-scalp-exterior-v1',
      scalpPenetrationVertexCount: 0,
    },
    environmentLight: {
      schemaVersion: 'holoscript.character-environment-light.v2',
      profile: 'directional-reflection-probe-v1',
      responseProfile: 'three-lobe-diffuse-specular-probe-v1',
    },
  };
  assert.equal(
    validateH3YCompilerRecords(
      ['OpenAI', 'Claude', 'Gemini', 'Grok'].map((displayLabel) => ({
        ...record,
        displayLabel,
      }))
    ).status,
    'pass'
  );
  assert.equal(
    validateH3YCompilerRecords([
      { ...record, garment: { ...record.garment, constructedPanelCount: 1 } },
    ]).status,
    'fail'
  );
});
