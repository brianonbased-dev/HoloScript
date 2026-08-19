import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  deriveH4HRunnerSource,
  validateH4HIdentityAdmission,
} from '../check-hololand-model-village-character-realism-h4h.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-realism-h4h-material-model-family-identity-convergence.holo';
const EXPECTED = [
  ['OpenAI', 'openai', 0x2f2928],
  ['Claude', 'anthropic', 0x6b4633],
  ['Gemini', 'google', 0x303641],
  ['Grok', 'xai', 0x171d22],
];

function fixtures() {
  const records = EXPECTED.map(([displayLabel, modelFamilyId, hairColor], index) => ({
    displayLabel,
    modelFamilyId,
    face: { facialDetailProfile: 'portrait-facial-volume-v5' },
    groom: {
      profile: 'scalp-flow-portrait-v4',
      material: {
        schemaVersion: 'holoscript.agent-avatar-hair-material.v2',
        sourceColor: hairColor,
        sourceColorWeight: 0.55,
      },
    },
    outputSha256: String(index).repeat(64),
  }));
  const residents = EXPECTED.map(([, , hairColor], index) => ({
    spec: {
      mesh: { positions: [index, 0, 0, index + 0.25, 1, 0] },
      materialGroups: [
        {
          materialRole: 'hair',
          material: { color: hairColor, sourceColorWeight: 0.55 },
        },
      ],
    },
  }));
  return { records, payload: { residents } };
}

test('H4H source binds the exact four model-family material identities', () => {
  const source = readFileSync(path.join(ROOT, SOURCE_REL), 'utf8');
  for (const [displayLabel, , hairColor] of EXPECTED) {
    const hex = `#${hairColor.toString(16).padStart(6, '0').toUpperCase()}`;
    assert.match(source, new RegExp(`displayLabel: "${displayLabel}"`));
    assert.match(source, new RegExp(`sourceHairColor: "${hex}"`));
  }
  assert.match(source, /sourceColorWeightRequired: 0.55/);
  assert.match(source, /photorealismClaimed: false/);
});

test('H4H derives the promoted shared runner without mutating the H4G checker', () => {
  const h4g = readFileSync(
    path.join(ROOT, 'scripts/check-hololand-model-village-character-realism-h4g.mjs'),
    'utf8'
  );
  const derived = deriveH4HRunnerSource(h4g);
  assert.match(derived, /runCharacterRealismH4H/);
  assert.match(derived, /712698cf465b15c8552c3c5e545800543b929c78/);
  assert.match(derived, /material-model-family-identity-convergence/);
  assert.match(
    derived,
    /import \{ CharacterWorldFrameGraph \} from '\.\/packages\/engine\/src\/rendering\/webgpu\/CharacterWorldFrameGraph\.ts'/
  );
  assert.doesNotMatch(derived, /7a09fa27ba78694ad0751eabf9befea08aa973e3/);
});

test('H4H identity admission accepts four exact v2 material bindings', () => {
  const { records, payload } = fixtures();
  const result = validateH4HIdentityAdmission(records, payload);
  assert.equal(result.status, 'pass');
  assert.deepEqual(result.errors, []);
  assert.equal(result.distinctSourceHairColorCount, 4);
  assert.equal(result.distinctGeometryPayloadCount, 4);
  assert.ok(result.residents.every((resident) => resident.sourceColorRetained));
});

test('H4H identity admission fails closed when draw-spec chroma is collapsed', () => {
  const { records, payload } = fixtures();
  payload.residents[2].spec.materialGroups[0].material.color = 0xffffff;
  const result = validateH4HIdentityAdmission(records, payload);
  assert.equal(result.status, 'fail');
  assert.match(result.errors.join('\n'), /Gemini: draw-spec source color drifted/);
});

test('H4H policy and seed preserve the shared-frame and claim boundaries', () => {
  const policy = readFileSync(
    path.join(
      ROOT,
      'source/proofs/model-village-character-realism-h4h-material-model-family-identity-convergence-policy.hsplus'
    ),
    'utf8'
  );
  const seed = readFileSync(
    path.join(
      ROOT,
      'source/proofs/model-village-character-realism-h4h-material-model-family-identity-convergence-seed.hs'
    ),
    'utf8'
  );
  assert.match(policy, /source_hair_chroma_not_operative/);
  assert.match(policy, /shared_submission_contract_drifted/);
  assert.match(policy, /h4h_scope_overclaimed/);
  assert.match(seed, /timestampQueryCount: 26/);
  assert.match(seed, /sharedQueueSubmissionCountRequired: 1/);
  assert.match(seed, /photorealismClaimed: false/);
});
