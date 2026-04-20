import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

import { computeBundleHash, type HologramMeta } from '@holoscript/engine/hologram';

const { requireAuthMock } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  requireAuth: requireAuthMock,
}));

import { GET as getAsset } from './[hash]/[asset]/route';
import { POST as postUpload } from './upload/route';
import { __resetHologramStoreForTests } from './_lib/store';

function makeMeta(overrides: Partial<HologramMeta> = {}): HologramMeta {
  return {
    sourceKind: 'image',
    width: 2,
    height: 2,
    frames: 1,
    modelId: 'test-model',
    backend: 'cpu',
    inferenceMs: 1,
    createdAt: '2026-04-20T00:00:00.000Z',
    schemaVersion: 1,
    ...overrides,
  };
}

async function minimalBundleBuffers(meta: HologramMeta) {
  const depth = new Float32Array(meta.width * meta.height * meta.frames);
  const normal = new Float32Array(meta.width * meta.height * meta.frames * 3);
  depth.fill(0.25);
  normal.fill(0.5);
  const depthBin = new Uint8Array(depth.buffer, depth.byteOffset, depth.byteLength);
  const normalBin = new Uint8Array(normal.buffer, normal.byteOffset, normal.byteLength);
  const hash = await computeBundleHash(meta, depthBin, normalBin);
  return { depthBin, normalBin, hash };
}

describe('HoloGram API routes', () => {
  let workDir: string;

  beforeEach(async () => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    __resetHologramStoreForTests();
    workDir = await mkdtemp(join(tmpdir(), 'hologram-api-'));
    vi.stubEnv('HOLOGRAM_STORE_ROOT', workDir);
    vi.stubEnv('HOLOGRAM_WORKER_TOKEN', 'worker-test-token');
    requireAuthMock.mockResolvedValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    );
  });

  afterEach(async () => {
    __resetHologramStoreForTests();
    await rm(workDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('POST /api/hologram/upload returns 401 without worker token or session', async () => {
    vi.stubEnv('HOLOGRAM_WORKER_TOKEN', '');
    const meta = makeMeta();
    const { depthBin, normalBin } = await minimalBundleBuffers(meta);
    const fd = new FormData();
    fd.append('meta', JSON.stringify(meta));
    fd.append('depth.bin', new Blob([depthBin]), 'depth.bin');
    fd.append('normal.bin', new Blob([normalBin]), 'normal.bin');

    const req = new NextRequest('http://localhost/api/hologram/upload', {
      method: 'POST',
      body: fd,
    });
    const res = await postUpload(req);
    expect(res.status).toBe(401);
  });

  it('POST /api/hologram/upload rejects Content-Length over cap with 413', async () => {
    const meta = makeMeta();
    const { depthBin, normalBin } = await minimalBundleBuffers(meta);
    const fd = new FormData();
    fd.append('meta', JSON.stringify(meta));
    fd.append('depth.bin', new Blob([depthBin]), 'depth.bin');
    fd.append('normal.bin', new Blob([normalBin]), 'normal.bin');

    const req = new NextRequest('http://localhost/api/hologram/upload', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer worker-test-token',
        'Content-Length': String(200 * 1024 * 1024),
      },
      body: fd,
    });
    const res = await postUpload(req);
    expect(res.status).toBe(413);
  });

  it('POST upload + GET asset round-trip (worker bearer)', async () => {
    const meta = makeMeta();
    const { depthBin, normalBin, hash } = await minimalBundleBuffers(meta);
    const fd = new FormData();
    fd.append('meta', JSON.stringify(meta));
    fd.append('depth.bin', new Blob([depthBin]), 'depth.bin');
    fd.append('normal.bin', new Blob([normalBin]), 'normal.bin');

    const postReq = new NextRequest('http://localhost/api/hologram/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer worker-test-token' },
      body: fd,
    });
    const postRes = await postUpload(postReq);
    expect(postRes.status).toBe(200);
    const body = (await postRes.json()) as { hash: string; written: boolean };
    expect(body.hash).toBe(hash);
    expect(body.written).toBe(true);

    const getRes = await getAsset(new Request('http://localhost/'), {
      params: Promise.resolve({ hash, asset: 'depth.bin' }),
    });
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get('Cache-Control')).toContain('immutable');
    expect(getRes.headers.get('Content-Type')).toBe('application/octet-stream');

    const out = new Uint8Array(await getRes.arrayBuffer());
    expect(out).toEqual(depthBin);

    const diskPath = join(workDir, hash.slice(0, 2), hash, 'depth.bin');
    const onDisk = await readFile(diskPath);
    expect(new Uint8Array(onDisk)).toEqual(depthBin);
  });

  it('GET returns 404 for missing bundle asset', async () => {
    const hash = 'ab'.repeat(32);
    const res = await getAsset(new Request('http://localhost/'), {
      params: Promise.resolve({ hash, asset: 'depth.bin' }),
    });
    expect(res.status).toBe(404);
  });

  it('GET returns 400 for invalid hash', async () => {
    const res = await getAsset(new Request('http://localhost/'), {
      params: Promise.resolve({ hash: 'not-a-hash', asset: 'depth.bin' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET returns 400 for invalid asset name', async () => {
    const hash = 'ab'.repeat(32);
    const res = await getAsset(new Request('http://localhost/'), {
      params: Promise.resolve({ hash, asset: 'evil.bin' }),
    });
    expect(res.status).toBe(400);
  });
});
