import { describe, expect, it } from 'vitest';

import {
  extractBotanicalMaterialFromPhotoFixtures,
  type BotanicalPhotoAnchor,
  type BotanicalPhotoFixture,
} from '../botanical-material-extractor.js';
import { extractBotanicalLotusMaterial } from '../material-extraction/botanical-lotus.js';
import { normalizeBotanicalMaterialExtraction } from '../material-extraction/canonical.js';

describe('canonical botanical material extraction', () => {
  it('normalizes signed fixture extraction output', () => {
    const fixtureResult = extractBotanicalMaterialFromPhotoFixtures({
      anchors: signedAnchors,
      fixtures: lotusFixtures,
    });

    const normalized = normalizeBotanicalMaterialExtraction(fixtureResult);

    expect(normalized.schema).toBe('holoscript.botanical.material-extract.canonical.v1');
    expect(normalized.source_kind).toBe('photo-fixture');
    expect(normalized.status).toBe('signed');
    expect(normalized.anchor_ids).toEqual(['lotus-a']);
    expect(normalized.provenance.content_hash_status).toBe('complete');
    expect(normalized.provenance.wallet_signature_status).toBe('complete');
    expect(normalized.material.subsurface_scattering).toBe(fixtureResult.material.subsurface_scattering);
    expect(normalized.confidence).toBe(fixtureResult.confidence.overall);
  });

  it('normalizes pixel-buffer extraction output', () => {
    const pixelResult = extractBotanicalLotusMaterial([createPixelSample()], {
      capturedAt: '2026-05-06',
    });

    const normalized = normalizeBotanicalMaterialExtraction(pixelResult);

    expect(normalized.source_kind).toBe('pixel-buffer');
    expect(normalized.status).toBe('signed');
    expect(normalized.anchor_ids).toEqual(['lotus-pixel-a']);
    expect(normalized.provenance.content_hash_status).toBe('complete');
    expect(normalized.provenance.wallet_signature_status).toBe('complete');
    expect(normalized.material.gravity_sag_outer).toBe(pixelResult.material.gravity_sag_outer);
    expect(normalized.colors.petal_mid).toBe(pixelResult.colors.petal_mid);
  });

  it('preserves hashed-but-unsigned fixture status', () => {
    const fixtureResult = extractBotanicalMaterialFromPhotoFixtures({
      anchors: signedAnchors.map((anchor) => ({ ...anchor, wallet_signature: null })),
      fixtures: lotusFixtures,
    });

    const normalized = normalizeBotanicalMaterialExtraction(fixtureResult);

    expect(normalized.status).toBe('hashed');
    expect(normalized.provenance.content_hash_status).toBe('complete');
    expect(normalized.provenance.wallet_signature_status).toBe('missing');
  });
});

const signedAnchors: BotanicalPhotoAnchor[] = [
  {
    id: 'lotus-a',
    role: 'material',
    status: 'wallet_signed',
    content_hash: 'sha256:lotus',
    wallet_signature: 'wallet:signed',
  },
];

const lotusFixtures: BotanicalPhotoFixture[] = [
  {
    anchorId: 'lotus-a',
    role: 'material',
    regions: [
      { region: 'petal_base', pixels: ['#fff3f8'] },
      { region: 'petal_mid', pixels: ['#f476b5'] },
      { region: 'petal_inner', pixels: ['#ffa5d2'] },
      { region: 'petal_rim', pixels: ['#c42a86'] },
      { region: 'petal_shadow', pixels: ['#84205f'] },
      { region: 'vein', pixels: ['#fbc2dc'] },
      { region: 'leaf', pixels: ['#235f4f'] },
      { region: 'leaf_dark', pixels: ['#102f28'] },
      { region: 'water', pixels: ['#07140f'] },
      { region: 'stamen', pixels: ['#f59e0b'] },
      { region: 'stamen_tip', pixels: ['#fff4bd'] },
      { region: 'seed_pod', pixels: ['#f4d74a'] },
      { region: 'seed_pod_rim', pixels: ['#b7c66b'] },
      { region: 'silhouette_edge', pixels: ['#d14698'] },
    ],
  },
];

function createPixelSample() {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  const colors = [
    [246, 118, 181],
    [255, 165, 210],
    [196, 42, 134],
    [35, 95, 79],
    [245, 158, 11],
    [7, 20, 15],
  ];
  for (let index = 0; index < 16; index += 1) {
    const color = colors[index % colors.length] ?? colors[0];
    const offset = index * 4;
    data[offset] = color[0] ?? 0;
    data[offset + 1] = color[1] ?? 0;
    data[offset + 2] = color[2] ?? 0;
    data[offset + 3] = 255;
  }
  return {
    id: 'lotus-pixel-a',
    width: 4,
    height: 4,
    data,
    role: 'material' as const,
    provenance: {
      contentHash: 'sha256:pixel',
      walletSignature: 'wallet:signed',
    },
  };
}
