import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  deriveH4IHarnessSource,
  deriveH4IRunnerSource,
  validateH4IPortraitAdmission,
} from '../check-hololand-model-village-character-realism-h4i.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-realism-h4i-portrait-realism-convergence.holo';
const EXPECTED = [
  ['OpenAI', 'openai', 0x2f2928, 0.64],
  ['Claude', 'anthropic', 0x6b4633, 0.58],
  ['Gemini', 'google', 0x303641, 0.62],
  ['Grok', 'xai', 0x171d22, 0.56],
];

function fixtures() {
  const records = EXPECTED.map(([displayLabel, modelFamilyId, hairColor, strength], index) => ({
    displayLabel,
    modelFamilyId,
    face: { facialDetailProfile: 'portrait-facial-volume-v5' },
    skinMaterial: {
      schemaVersion: 'holoscript.agent-avatar-skin-material.v4',
      complexionProfile: 'anatomical-complexion-v1',
      complexionStrength: strength,
    },
    groom: {
      schemaVersion: 'holoscript.agent-avatar-groom-geometry.v5',
      profile: 'scalp-flow-volume-v5',
      silhouetteProfile: 'massed-silhouette-clumps-v1',
      massGuideCount: 8 + index,
      massCardCount: (8 + index) * 2,
      scalpCapMaxLift: 0.014 + index * 0.001,
      scalpPenetrationVertexCount: 0,
      material: {
        schemaVersion: 'holoscript.agent-avatar-hair-material.v2',
        sourceColor: hairColor,
        sourceColorWeight: 0.55,
      },
    },
  }));
  const residents = EXPECTED.map(([, , hairColor, strength], index) => ({
    spec: {
      mesh: { positions: [index, 0, 0, index + 0.25, 1, 0] },
      materialGroups: [
        { materialRole: 'hair', material: { color: hairColor, sourceColorWeight: 0.55 } },
        {
          materialRole: 'skin',
          material: {
            complexionProfile: 'anatomical-complexion-v1',
            complexionStrength: strength,
          },
        },
      ],
    },
  }));
  return { records, payload: { residents } };
}

test('H4I source binds complexion and massed-groom profiles for four model families', () => {
  const source = readFileSync(path.join(ROOT, SOURCE_REL), 'utf8');
  for (const [displayLabel] of EXPECTED) {
    assert.match(source, new RegExp(`displayLabel: "${displayLabel}"`));
  }
  assert.equal((source.match(/complexion_profile: "anatomical_complexion_v1"/g) || []).length, 4);
  assert.equal((source.match(/groom_profile: "scalp_flow_volume_v5"/g) || []).length, 4);
  assert.match(source, /photorealismClaimed: false/);
});

test('H4I redirects the inherited H4A source after all overlay derivations', () => {
  const inherited = `const INHERITED_H4A_SOURCE_REL = 'source/layers/vr/frontier/model-village/model-village-character-appearance-h4a-facial-volume-garment-framing.holo';
  const pinReplacements = [
    ['old', 'new'],
  ];
  for (const [before, after] of pinReplacements) {
    assert(merged.includes(before), 'old pin missing');
    merged = merged.replaceAll(before, after);
  }
`;
  const derived = deriveH4IHarnessSource(inherited);
  assert.match(derived, /model-village-character-realism-h4i-portrait-realism-convergence\.holo/);
  assert.doesNotMatch(derived, /model-village-character-appearance-h4a-facial-volume-garment-framing\.holo/);
  assert.doesNotMatch(derived, /old pin missing/);
});

test('H4I derives the promoted shared runner with the final source redirect', () => {
  const h4g = readFileSync(
    path.join(ROOT, 'scripts/check-hololand-model-village-character-realism-h4g.mjs'),
    'utf8'
  );
  const derived = deriveH4IRunnerSource(h4g);
  assert.match(derived, /runCharacterRealismH4I/);
  assert.match(derived, /deriveH4IHarnessSource\(deriveH4DHarnessSource\(h4c\)\)/);
  assert.match(derived, /model-village-character-realism-h4i-portrait-realism-convergence/);
  assert.match(derived, /94594d173de8667c0d86ec0cf41f537ef623899b/);
});

test('H4I portrait admission accepts four operative complexion and groom bindings', () => {
  const { records, payload } = fixtures();
  const result = validateH4IPortraitAdmission(records, payload);
  assert.equal(result.status, 'pass');
  assert.deepEqual(result.errors, []);
  assert.equal(result.complexionResidentCount, 4);
  assert.equal(result.massedGroomResidentCount, 4);
  assert.equal(result.distinctSourceHairColorCount, 4);
  assert.equal(result.distinctGeometryPayloadCount, 4);
});

test('H4I portrait admission fails closed when complexion is metadata-only', () => {
  const { records, payload } = fixtures();
  payload.residents[1].spec.materialGroups[1].material.complexionProfile = undefined;
  const result = validateH4IPortraitAdmission(records, payload);
  assert.equal(result.status, 'fail');
  assert.match(result.errors.join('\n'), /Claude: draw-spec complexion binding drifted/);
});

test('H4I policy and seed retain the shared-frame and claim boundaries', () => {
  const policy = readFileSync(
    path.join(ROOT, 'source/proofs/model-village-character-realism-h4i-portrait-realism-convergence-policy.hsplus'),
    'utf8'
  );
  const seed = readFileSync(
    path.join(ROOT, 'source/proofs/model-village-character-realism-h4i-portrait-realism-convergence-seed.hs'),
    'utf8'
  );
  assert.match(policy, /anatomical_complexion_not_operative/);
  assert.match(policy, /massed_hair_silhouette_not_operative/);
  assert.match(policy, /shared_submission_contract_drifted/);
  assert.match(seed, /timestampQueryCount: 26/);
  assert.match(seed, /sharedQueueSubmissionCountRequired: 1/);
  assert.match(seed, /photorealismClaimed: false/);
});
