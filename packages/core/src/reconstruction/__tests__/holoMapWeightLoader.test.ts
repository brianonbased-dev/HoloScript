import { createHash } from 'node:crypto';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  assertWeightCid,
  loadHoloMapWeightBlob,
  normalizeWeightCidDigest,
  type LoadResult,
} from '../holoMapWeightLoader';
import { getCachedWeightBlob, putCachedWeightBlob } from '../holoMapWeightCache';

vi.mock('../holoMapWeightCache', () => ({
  getCachedWeightBlob: vi.fn(),
  putCachedWeightBlob: vi.fn(),
}));

describe('holoMapWeightLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('cache hit returns cached bytes without fetch', async () => {
    const payload = new TextEncoder().encode('cached-bytes');
    const hex = createHash('sha256').update(payload).digest('hex');
    vi.mocked(getCachedWeightBlob).mockResolvedValue(payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength));

    const result = await loadHoloMapWeightBlob({
      weightUrl: 'https://example.invalid/holomap.bin',
      weightCid: hex,
    });

    expect(result.source).toBe('cache');
    expect(result.verified).toBe(true);
    expect(new Uint8Array(result.bytes)).toEqual(payload);
  });

  it('network fetch succeeds and caches verified blob', async () => {
    const payload = new TextEncoder().encode('wg');
    const hex = createHash('sha256').update(payload).digest('hex');
    const fetchImpl: typeof fetch = async () => new Response(payload, { status: 200 });
    vi.mocked(getCachedWeightBlob).mockResolvedValue(undefined);
    vi.mocked(putCachedWeightBlob).mockResolvedValue(undefined);

    const result = await loadHoloMapWeightBlob({
      weightUrl: 'https://example.invalid/holomap.bin',
      weightCid: hex,
      fetchImpl,
    });

    expect(result.source).toBe('network');
    expect(result.verified).toBe(true);
    expect(new Uint8Array(result.bytes)).toEqual(payload);
    expect(putCachedWeightBlob).toHaveBeenCalledWith(hex, expect.any(ArrayBuffer));
  });

  it('falls back to second URL when primary fails', async () => {
    const payload = new TextEncoder().encode('fallback');
    const hex = createHash('sha256').update(payload).digest('hex');
    const fetchImpl: typeof fetch = async (url) => {
      if (String(url).includes('primary')) {
        return new Response(null, { status: 500 });
      }
      return new Response(payload, { status: 200 });
    };
    vi.mocked(getCachedWeightBlob).mockResolvedValue(undefined);
    vi.mocked(putCachedWeightBlob).mockResolvedValue(undefined);

    const result = await loadHoloMapWeightBlob({
      weightUrl: 'https://primary.invalid/holomap.bin',
      weightUrls: ['https://fallback.invalid/holomap.bin'],
      weightCid: hex,
      fetchImpl,
    });

    expect(result.source).toBe('network');
    expect(new Uint8Array(result.bytes)).toEqual(payload);
  });

  it('retries transient failures then succeeds', async () => {
    const payload = new TextEncoder().encode('retry-ok');
    const hex = createHash('sha256').update(payload).digest('hex');
    let attempts = 0;
    const fetchImpl: typeof fetch = async () => {
      attempts += 1;
      if (attempts < 3) {
        return new Response(null, { status: 503 });
      }
      return new Response(payload, { status: 200 });
    };
    vi.mocked(getCachedWeightBlob).mockResolvedValue(undefined);
    vi.mocked(putCachedWeightBlob).mockResolvedValue(undefined);

    const result = await loadHoloMapWeightBlob({
      weightUrl: 'https://example.invalid/holomap.bin',
      weightCid: hex,
      fetchImpl,
    });

    expect(attempts).toBe(3);
    expect(result.source).toBe('network');
  });

  it('throws when all sources exhausted', async () => {
    const fetchImpl: typeof fetch = async () => new Response(null, { status: 404 });
    vi.mocked(getCachedWeightBlob).mockResolvedValue(undefined);

    await expect(loadHoloMapWeightBlob({
      weightUrl: 'https://a.invalid/holomap.bin',
      weightUrls: ['https://b.invalid/holomap.bin'],
      weightCid: '0'.repeat(64),
      fetchImpl,
    })).rejects.toThrow(/all sources exhausted/);
  });

  it('file:// URL reads from disk (Node only)', async () => {
    const payload = new TextEncoder().encode('file-payload');
    const hex = createHash('sha256').update(payload).digest('hex');
    const { writeFile, mkdtemp } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'holomap-'));
    const path = join(dir, 'weights.bin');
    await writeFile(path, payload);

    vi.mocked(getCachedWeightBlob).mockResolvedValue(undefined);
    vi.mocked(putCachedWeightBlob).mockResolvedValue(undefined);

    const result = await loadHoloMapWeightBlob({
      weightUrl: `file://${path}`,
      weightCid: hex,
    });

    expect(result.source).toBe('file');
    expect(new Uint8Array(result.bytes)).toEqual(payload);
  });

  it('localResolver is tried before cache and network', async () => {
    const payload = new TextEncoder().encode('mesh-local');
    const hex = createHash('sha256').update(payload).digest('hex');
    const localResolver = vi.fn().mockResolvedValue(payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength));
    vi.mocked(getCachedWeightBlob).mockResolvedValue(undefined);
    vi.mocked(putCachedWeightBlob).mockResolvedValue(undefined);

    const result = await loadHoloMapWeightBlob({
      weightUrl: 'https://example.invalid/holomap.bin',
      weightCid: hex,
      localResolver,
    });

    expect(localResolver).toHaveBeenCalledWith(hex);
    expect(getCachedWeightBlob).not.toHaveBeenCalled();
    expect(result.source).toBe('file');
    expect(result.verified).toBe(true);
    expect(new Uint8Array(result.bytes)).toEqual(payload);
    expect(putCachedWeightBlob).toHaveBeenCalledWith(hex, expect.any(ArrayBuffer));
  });

  it('localResolver returning undefined falls through to network', async () => {
    const payload = new TextEncoder().encode('fallback-net');
    const hex = createHash('sha256').update(payload).digest('hex');
    const localResolver = vi.fn().mockResolvedValue(undefined);
    const fetchImpl: typeof fetch = async () => new Response(payload, { status: 200 });
    vi.mocked(getCachedWeightBlob).mockResolvedValue(undefined);
    vi.mocked(putCachedWeightBlob).mockResolvedValue(undefined);

    const result = await loadHoloMapWeightBlob({
      weightUrl: 'https://example.invalid/holomap.bin',
      weightCid: hex,
      localResolver,
      fetchImpl,
    });

    expect(localResolver).toHaveBeenCalledWith(hex);
    expect(result.source).toBe('network');
  });
});
