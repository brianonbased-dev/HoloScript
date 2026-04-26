/**
 * pngEncoder — determinism + spec compliance tests.
 *
 * Coverage targets:
 *   - Output starts with the PNG signature
 *   - Output bytes are byte-identical for identical inputs (determinism)
 *   - Output bytes change when even one pixel differs (sensitivity)
 *   - Input validation throws on size mismatch + invalid dimensions
 *   - IHDR encodes width/height/colorType correctly
 */

import { describe, expect, it } from 'vitest';
import { encodePngRgba } from './pngEncoder';

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function makeRgba(width: number, height: number, fillRgb: [number, number, number]): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = fillRgb[0];
    out[i * 4 + 1] = fillRgb[1];
    out[i * 4 + 2] = fillRgb[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

describe('encodePngRgba — signature + structure', () => {
  it('begins with the canonical PNG 8-byte signature', () => {
    const out = encodePngRgba(makeRgba(2, 2, [255, 0, 0]), 2, 2);
    for (let i = 0; i < PNG_SIG.length; i++) {
      expect(out[i]).toBe(PNG_SIG[i]);
    }
  });

  it('encodes width/height correctly in IHDR', () => {
    const out = encodePngRgba(makeRgba(13, 7, [128, 128, 128]), 13, 7);
    // IHDR data starts at offset 16: 8 sig + 4 length + 4 type
    // First 4 bytes = width, next 4 = height (big-endian)
    const w = (out[16] << 24) | (out[17] << 16) | (out[18] << 8) | out[19];
    const h = (out[20] << 24) | (out[21] << 16) | (out[22] << 8) | out[23];
    expect(w).toBe(13);
    expect(h).toBe(7);
    expect(out[24]).toBe(8); // bit depth
    expect(out[25]).toBe(6); // color type RGBA
  });
});

describe('encodePngRgba — determinism', () => {
  it('produces byte-identical output for identical inputs', () => {
    const a = encodePngRgba(makeRgba(8, 8, [42, 100, 200]), 8, 8);
    const b = encodePngRgba(makeRgba(8, 8, [42, 100, 200]), 8, 8);
    expect(a.byteLength).toBe(b.byteLength);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('changes output when a single pixel differs', () => {
    const px = makeRgba(8, 8, [42, 100, 200]);
    const a = encodePngRgba(px, 8, 8);
    const px2 = px.slice();
    px2[16] = 99; // touch pixel (4,0).R
    const b = encodePngRgba(px2, 8, 8);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('handles a single-pixel image', () => {
    const out = encodePngRgba(new Uint8Array([10, 20, 30, 40]), 1, 1);
    expect(out[0]).toBe(0x89);
    expect(out.byteLength).toBeGreaterThan(20);
  });

  it('handles inputs that span multiple stored DEFLATE blocks (>64KB)', () => {
    // 200x200 RGBA = 160000 bytes raw + filter bytes ⇒ requires >1 stored block
    const w = 200;
    const h = 200;
    const a = encodePngRgba(makeRgba(w, h, [50, 60, 70]), w, h);
    const b = encodePngRgba(makeRgba(w, h, [50, 60, 70]), w, h);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

describe('encodePngRgba — input validation', () => {
  it('throws on byte-length mismatch', () => {
    expect(() => encodePngRgba(new Uint8Array(16), 4, 4)).toThrowError(
      /16 bytes, expected 64/
    );
  });

  it('throws on zero width', () => {
    expect(() => encodePngRgba(new Uint8Array(0), 0, 4)).toThrowError(
      /width must be a positive integer/
    );
  });

  it('throws on negative height', () => {
    expect(() => encodePngRgba(new Uint8Array(0), 4, -1)).toThrowError(
      /height must be a positive integer/
    );
  });
});
