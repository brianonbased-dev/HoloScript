import { describe, expect, it } from 'vitest';
import {
  extractBotanicalMaterialFromPhotoFixtures,
  type BotanicalPhotoAnchor,
  type BotanicalPhotoFixture,
} from '../botanical-material-extractor.js';

const signedAnchors: BotanicalPhotoAnchor[] = [
  {
    id: 'lotus-reference-2026-05-06-01',
    role: 'material',
    status: 'wallet_signed',
    content_hash: 'sha256:material',
    wallet_signature: '0xsigned-material',
  },
  {
    id: 'lotus-reference-2026-05-06-02',
    role: 'silhouette',
    status: 'wallet_signed',
    content_hash: 'sha256:silhouette',
    wallet_signature: '0xsigned-silhouette',
  },
  {
    id: 'lotus-reference-2026-05-06-03',
    role: 'leaf_context',
    status: 'wallet_signed',
    content_hash: 'sha256:context',
    wallet_signature: '0xsigned-context',
  },
];

const lotusFixtures: BotanicalPhotoFixture[] = [
  {
    anchorId: 'lotus-reference-2026-05-06-01',
    role: 'material',
    regions: [
      { region: 'petal_base', pixels: ['#fff3f8', '#ffeef6', '#fff7fa'] },
      { region: 'petal_mid', pixels: ['#f476b5', '#ef70ad', '#fb86c2'] },
      { region: 'petal_inner', pixels: ['#ffa5d2', '#ff97ca', '#ffacd6'] },
      { region: 'petal_rim', pixels: ['#c42a86', '#be247e', '#d33696'] },
      { region: 'petal_shadow', pixels: ['#84205f', '#6f1a50', '#91306a'] },
      { region: 'vein', pixels: ['#fbc2dc', '#f2a8cd', '#ce5c9d'], weight: 2 },
      { region: 'stamen', pixels: ['#f59e0b', '#f8b22a'] },
      { region: 'stamen_tip', pixels: ['#fff4bd', '#ffee9a'] },
      { region: 'seed_pod', pixels: ['#f4d74a', '#e9cd42'] },
      { region: 'seed_pod_rim', pixels: ['#b7c66b', '#a9ba5d'] },
    ],
  },
  {
    anchorId: 'lotus-reference-2026-05-06-02',
    role: 'silhouette',
    regions: [{ region: 'silhouette_edge', pixels: ['#d14698', '#b8277d'] }],
  },
  {
    anchorId: 'lotus-reference-2026-05-06-03',
    role: 'leaf_context',
    regions: [
      { region: 'leaf', pixels: ['#235f4f', '#2d705d'] },
      { region: 'leaf_dark', pixels: ['#102f28', '#173a31'] },
      { region: 'water', pixels: ['#07140f', '#0a1b15'] },
    ],
  },
];

describe('botanical material extractor', () => {
  it('emits renderer-ready botanical material JSON from signed photo fixtures', () => {
    const result = extractBotanicalMaterialFromPhotoFixtures({
      anchors: signedAnchors,
      fixtures: lotusFixtures,
      capturedAt: '2026-05-06',
      generatedBy: 'vitest-fixture',
    });

    expect(result.schema).toBe('holoscript.botanical.material-extract.v1');
    expect(result.status).toBe('extracted-from-signed-anchors');
    expect(result.botanical_trait_target).toBe('@botanical_lotus');
    expect(result.source.signed_anchor_count).toBe(3);
    expect(result.material.subsurface_scattering).toBeGreaterThan(0.6);
    expect(result.material.translucency_gradient.base).toBeGreaterThan(
      result.material.translucency_gradient.edge
    );
    expect(result.material.roughness).toBeGreaterThanOrEqual(0.46);
    expect(result.material.ior).toBeGreaterThan(1.3);
    expect(result.material.vein_normals.method).toBe('region-luminance-contrast');
    expect(result.colors.petal_mid).toMatch(/^#[0-9a-f]{6}$/);
    expect(result.confidence.provenance).toBe(1);
    expect(result.confidence.overall).toBeGreaterThan(0.8);
    expect(result.provenance.anchor_receipts[0]).toMatchObject({
      id: 'lotus-reference-2026-05-06-01',
      wallet_signature_present: true,
    });
  });

  it('is deterministic for identical fixtures', () => {
    const first = extractBotanicalMaterialFromPhotoFixtures({
      anchors: signedAnchors,
      fixtures: lotusFixtures,
    });
    const second = extractBotanicalMaterialFromPhotoFixtures({
      anchors: signedAnchors,
      fixtures: lotusFixtures,
    });

    expect(second).toEqual(first);
  });

  it('keeps unsigned fixtures usable but lowers provenance confidence', () => {
    const unsignedAnchors = signedAnchors.map((anchor) => ({
      ...anchor,
      status: 'content_hashed',
      wallet_signature: null,
    }));

    const result = extractBotanicalMaterialFromPhotoFixtures({
      anchors: unsignedAnchors,
      fixtures: lotusFixtures,
    });

    expect(result.status).toBe('extracted-from-hashed-fixtures');
    expect(result.source.signed_anchor_count).toBe(0);
    expect(result.confidence.provenance).toBeLessThan(1);
    expect(result.confidence.overall).toBeLessThan(0.9);
    expect(result.provenance.anchor_receipts.every((receipt) => !receipt.wallet_signature_present)).toBe(
      true
    );
  });
});
