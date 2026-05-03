import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { decodeHolomapPointCloudPayload } from '../components/HolomapPointCloudViewer';

function positionsB64(values: number[]): string {
  const floats = new Float32Array(values);
  return Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength).toString('base64');
}

function colorsB64(values: number[]): string {
  return Buffer.from(new Uint8Array(values)).toString('base64');
}

describe('HolomapPointCloudViewer payload decoding', () => {
  it('decodes little-endian xyz positions and normalized colors', () => {
    const decoded = decodeHolomapPointCloudPayload({
      positionsB64: positionsB64([1, 2, 3, -1, 0.5, 4]),
      colorsB64: colorsB64([255, 128, 0, 0, 64, 255]),
      pointCount: 2,
    });

    expect(decoded.count).toBe(2);
    expect(Array.from(decoded.positions)).toEqual([1, 2, 3, -1, 0.5, 4]);
    expect(decoded.colors[0]).toBe(1);
    expect(decoded.colors[1]).toBeCloseTo(128 / 255);
    expect(decoded.colors[2]).toBe(0);
    expect(decoded.colors[5]).toBe(1);
  });

  it('caps point count to the available payload and maxPoints', () => {
    const decoded = decodeHolomapPointCloudPayload({
      positionsB64: positionsB64([0, 0, 0, 1, 1, 1, 2, 2, 2]),
      colorsB64: colorsB64([10, 20, 30, 40, 50, 60, 70, 80, 90]),
      pointCount: 99,
      maxPoints: 2,
    });

    expect(decoded.count).toBe(2);
    expect(Array.from(decoded.positions)).toEqual([0, 0, 0, 1, 1, 1]);
  });

  it('returns an empty cloud for missing payloads', () => {
    const decoded = decodeHolomapPointCloudPayload({
      positionsB64: '',
      colorsB64: '',
      pointCount: 10,
    });

    expect(decoded.count).toBe(0);
    expect(decoded.positions.length).toBe(0);
    expect(decoded.colors.length).toBe(0);
  });

  it('does not read beyond incomplete color buffers', () => {
    const decoded = decodeHolomapPointCloudPayload({
      positionsB64: positionsB64([0, 0, 0, 1, 1, 1]),
      colorsB64: colorsB64([255, 255, 255]),
      pointCount: 2,
    });

    expect(decoded.count).toBe(1);
  });
});
