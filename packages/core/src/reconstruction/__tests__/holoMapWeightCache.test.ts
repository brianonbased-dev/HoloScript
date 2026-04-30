import { describe, expect, it, vi } from 'vitest';
import { getCachedWeightBlob, putCachedWeightBlob } from '../holoMapWeightCache';

describe('holoMapWeightCache', () => {
  it('round-trips a blob through IndexedDB in browser', async () => {
    const blob = new TextEncoder().encode('indexed-db-blob').buffer;
    await putCachedWeightBlob('aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233', blob);
    const cached = await getCachedWeightBlob('aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233');
    expect(cached).toBeDefined();
    expect(new Uint8Array(cached!)).toEqual(new Uint8Array(blob));
  });

  it('returns undefined for unknown CID', async () => {
    const randomCid = '0000000000000000000000000000000000000000000000000000000000000001';
    const result = await getCachedWeightBlob(randomCid);
    expect(result).toBeUndefined();
  });

  it('normalizes CID case before lookup', async () => {
    const blob = new TextEncoder().encode('case-normalize').buffer;
    const lowerCid = 'deadbeef00112233deadbeef00112233deadbeef00112233deadbeef00112233';
    const upperCid = 'DEADBEEF00112233DEADBEEF00112233DEADBEEF00112233DEADBEEF00112233';
    await putCachedWeightBlob(lowerCid, blob);
    const cached = await getCachedWeightBlob(upperCid);
    expect(cached).toBeDefined();
    expect(new Uint8Array(cached!)).toEqual(new Uint8Array(blob));
  });
});
