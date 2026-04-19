import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assertWeightCid,
  loadHoloMapWeightBlob,
  normalizeWeightCidDigest,
} from '../holoMapWeightLoader';

describe('holoMapWeightLoader', () => {
  it('normalizes sha256: prefix', () => {
    expect(normalizeWeightCidDigest('sha256:ab')).toBe('ab');
    expect(normalizeWeightCidDigest('  DEADbeef  ')).toBe('deadbeef');
  });

  it('assertWeightCid accepts matching bytes', async () => {
    const bytes = new TextEncoder().encode('holomap-weight-fixture');
    const hex = createHash('sha256').update(bytes).digest('hex');
    await expect(assertWeightCid(bytes, hex)).resolves.toBeUndefined();
    await expect(assertWeightCid(bytes, `sha256:${hex}`)).resolves.toBeUndefined();
  });

  it('assertWeightCid rejects mismatch', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const bad = '0'.repeat(64);
    await expect(assertWeightCid(bytes, bad)).rejects.toThrow(/digest mismatch/);
  });

  it('loadHoloMapWeightBlob uses fetchImpl', async () => {
    const payload = new TextEncoder().encode('wg');
    const hex = createHash('sha256').update(payload).digest('hex');
    const fetchImpl: typeof fetch = async () => new Response(payload, { status: 200 });

    const buf = await loadHoloMapWeightBlob({
      weightUrl: 'https://example.invalid/holomap.bin',
      weightCid: hex,
      fetchImpl,
    });
    expect(new Uint8Array(buf)).toEqual(payload);
  });
});
