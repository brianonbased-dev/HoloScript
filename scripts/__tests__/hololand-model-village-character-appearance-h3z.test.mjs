import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  deriveH3ZHarnessSource,
  validateH3ZCompilerRecords,
} from '../check-hololand-model-village-character-appearance-h3z.mjs';
import { deriveH3YHarnessSource } from '../check-hololand-model-village-character-appearance-h3y.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('H3Z HoloScript source keeps named residents and authors every material-depth profile', () => {
  const source = readFileSync(
    path.join(
      ROOT,
      'source/layers/vr/frontier/model-village/model-village-character-appearance-h3z-material-depth-room-response.holo'
    ),
    'utf8'
  );
  for (const resident of ['OpenAI', 'Claude', 'Gemini', 'Grok']) {
    assert.match(source, new RegExp(`displayLabel: "${resident}"`));
  }
  for (const profile of [
    'stormglass_structured_fieldcoat',
    'scalp_flow_breakup_v3',
    'anatomical_lid_blend_v3',
    'layered_ocular_tearfilm_v2',
    'stormglass_room_basis_v2',
  ]) {
    assert.equal((source.match(new RegExp(profile, 'g')) || []).length >= 5, true, profile);
  }
  assert.match(source, /photographicHdriClaimed: false/);
  assert.match(source, /photorealismClaimed: false/);
  assert.match(source, /freshRtxBenchmarkClaimed: false/);
});

test('H3Z harness derivation preserves admitted browser machinery with H3Z pins', () => {
  const base = readFileSync(
    path.join(ROOT, 'scripts/check-hololand-model-village-character-appearance-h3x.mjs'),
    'utf8'
  );
  const derived = deriveH3ZHarnessSource(deriveH3YHarnessSource(base));
  assert.match(derived, /export async function runCharacterAppearanceH3Z/);
  assert.match(derived, /3987bb2ba5e70a62c6c9b1aa65d4d55ad3fef989/);
  assert.match(derived, /model-village-character-appearance-h3z-material-depth-room-response/);
  assert.match(derived, /ocular: canonical\(built\.ocular\)/);
  assert.doesNotMatch(derived, /MV_CHARACTER_APPEARANCE_H3Z_CONSTRUCTED_SOFT_TISSUE_PROBE/);
});

test('H3Z compiler receipt validation fails closed and admits the intended profiles', () => {
  const record = {
    displayLabel: 'OpenAI',
    face: {
      orbitalProfile: 'anatomical-lid-blend-v3',
      ocularProfile: 'layered-ocular-tearfilm-v2',
      facialDetailProfile: 'portrait-soft-tissue-v4',
    },
    garment: {
      schemaVersion: 'holoscript.agent-avatar-garment-geometry.v3',
      style: 'stormglass_structured_fieldcoat',
      constructionProfile: 'structured-fieldcoat-shell-v2',
      constructedPanelCount: 4,
      shellThickness: 0.008902,
      closureCount: 5,
      cuffBandCount: 2,
      fabricSurfaceProfile: 'stormglass-crossweave-normal-v1',
    },
    groom: {
      schemaVersion: 'holoscript.agent-avatar-groom-geometry.v3',
      profile: 'scalp-flow-breakup-v3',
      containmentProfile: 'ellipsoidal-scalp-exterior-v1',
      breakupProfile: 'contained-flyaway-breakup-v1',
      flyawayGuideCount: 12,
      flyawayCardCount: 12,
      scalpPenetrationVertexCount: 0,
    },
    ocular: {
      schemaVersion: 'holoscript.agent-avatar-ocular-geometry.v2',
      profile: 'layered-ocular-tearfilm-v2',
      tearMeniscusProfile: 'lower-cornea-meniscus-v1',
      tearMeniscusIndexCount: 192,
    },
    environmentLight: {
      schemaVersion: 'holoscript.character-environment-light.v3',
      profile: 'stormglass-room-basis-v2',
      responseProfile: 'source-authored-room-basis-v2',
      photographicHdri: false,
    },
  };
  assert.equal(
    validateH3ZCompilerRecords(
      [
        ['OpenAI', 0.008902],
        ['Claude', 0.008928],
        ['Gemini', 0.00851],
        ['Grok', 0.009282],
      ].map(([displayLabel, shellThickness]) => ({
        ...record,
        displayLabel,
        garment: { ...record.garment, shellThickness },
      }))
    ).status,
    'pass'
  );
  assert.equal(
    validateH3ZCompilerRecords([
      { ...record, ocular: { ...record.ocular, tearMeniscusIndexCount: 0 } },
    ]).status,
    'fail'
  );
});
