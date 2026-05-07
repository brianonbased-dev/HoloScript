import { describe, expect, it } from 'vitest';

import {
  extractBotanicalLotusMaterial,
  toBotanicalLotusTrait,
  type BotanicalImageSample,
} from '../material-extraction/botanical-lotus.js';

describe('botanical material extraction', () => {
  it('extracts lotus PBR parameters from reference pixels', () => {
    const result = extractBotanicalLotusMaterial([createSyntheticLotusSample()], {
      capturedAt: '2026-05-06',
      referenceManifest: 'examples/lotus-flower/reference.anchors.json',
      sourceKind: 'synthetic_test_reference',
    });

    expect(result.schema).toBe('holoscript.botanical.material-extract.v1');
    expect(result.status).toBe('extracted_pending_cael_anchor');
    expect(result.botanical_trait_target).toBe('@botanical_lotus');
    expect(result.source.content_hash_status).toBe('missing');
    expect(result.source.wallet_signature_status).toBe('missing');
    expect(result.diagnostics.petal_pixel_count).toBeGreaterThan(900);
    expect(result.diagnostics.leaf_pixel_count).toBeGreaterThan(500);
    expect(result.diagnostics.stamen_pixel_count).toBeGreaterThan(60);
    expect(result.diagnostics.confidence).toBeGreaterThan(0.75);
    expect(result.material.subsurface_scattering).toBeGreaterThanOrEqual(0.55);
    expect(result.material.subsurface_scattering).toBeLessThanOrEqual(0.82);
    expect(result.material.petal_translucency_base).toBeGreaterThan(result.material.petal_translucency_edge);
    expect(result.material.vein_normal_intensity).toBeGreaterThan(0.02);
    expect(result.geometry.petal_rings.map((ring) => ring.count)).toEqual([8, 13, 21]);
    expect(result.colors.petal_mid).toMatch(/^#[0-9a-f]{6}$/);
    expect(result.colors.leaf).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('marks extraction signed only when every reference has hash and wallet signature', () => {
    const sample = createSyntheticLotusSample({
      contentHash: 'sha256:abc123',
      walletSignature: 'wallet:signature',
    });

    const result = extractBotanicalLotusMaterial([sample]);

    expect(result.status).toBe('extracted_from_signed_references');
    expect(result.source.content_hash_status).toBe('complete');
    expect(result.source.wallet_signature_status).toBe('complete');
    expect(result.diagnostics.provenance_hash_count).toBe(1);
    expect(result.diagnostics.provenance_signature_count).toBe(1);
  });

  it('renders a botanical trait declaration for compiler handoff', () => {
    const extraction = extractBotanicalLotusMaterial([createSyntheticLotusSample()]);
    const trait = toBotanicalLotusTrait(extraction);

    expect(trait).toContain('trait @botanical_lotus');
    expect(trait).toContain('subsurface_scattering:');
    expect(trait).toContain('petal_translucency_base:');
    expect(trait).toContain('gravity_sag_outer:');
    expect(trait).toContain('stamen_color:');
  });

  it('rejects malformed RGBA buffers before deriving material values', () => {
    expect(() =>
      extractBotanicalLotusMaterial([
        {
          id: 'bad-buffer',
          width: 2,
          height: 2,
          data: [255, 0, 0, 255],
        },
      ])
    ).toThrow(/expected 16/);
  });
});

function createSyntheticLotusSample(
  provenance?: NonNullable<BotanicalImageSample['provenance']>
): BotanicalImageSample {
  const width = 72;
  const height = 72;
  const data = new Uint8ClampedArray(width * height * 4);
  const centerX = width / 2;
  const centerY = height / 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - centerX) / 30;
      const dy = (y - centerY) / 24;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const offset = (y * width + x) * 4;

      if (radius < 0.22) {
        writePixel(data, offset, 245, 205 + Math.round(30 * (1 - radius)), 34, 255);
      } else if (radius < 0.92 && Math.abs(dy) < 0.82) {
        const vein = Math.abs(Math.sin((x - centerX) * 0.9)) * 28;
        const light = Math.round((1 - radius) * 62);
        writePixel(data, offset, 232 + light, 86 + light + vein, 158 + light, 255);
      } else if (y > 8 && y < 60 && (x < 20 || x > 52 || y < 18)) {
        const darken = Math.round((Math.abs(x - centerX) / centerX) * 42);
        writePixel(data, offset, 24, 96 - darken, 70 - Math.round(darken * 0.6), 255);
      } else {
        writePixel(data, offset, 5, 18, 14, 255);
      }
    }
  }

  return {
    id: 'synthetic-lotus-reference',
    width,
    height,
    data,
    role: 'material',
    ...(provenance ? { provenance } : {}),
  };
}

function writePixel(
  data: Uint8ClampedArray,
  offset: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  data[offset] = r;
  data[offset + 1] = g;
  data[offset + 2] = b;
  data[offset + 3] = a;
}
