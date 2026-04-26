// @vitest-environment node
/**
 * /g/[hash] — server-side load tests.
 *
 * Uses a tmp-dir-backed FileSystemHologramStore (the same stack as the
 * production route) to verify:
 *   - valid hash + persisted bundle => loadBundle returns the meta
 *   - invalid hash => returns null (route will 404)
 *   - missing bundle => returns null
 *   - asset existence flags (hasQuilt etc.) reflect what's in the store
 *
 * We don't render the page (Next.js server-component invocation requires
 * the full Next runtime); we test the load function and metadata
 * generator directly.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type HologramBundle,
  type HologramMeta,
  computeBundleHash,
} from '@holoscript/engine/hologram';
import { FileSystemHologramStore } from '@holoscript/engine/hologram/FileSystemHologramStore';

import { __resetHologramStoreForTests } from '@/app/api/hologram/_lib/store';

import { __test__, generateMetadata } from './page';

const { loadBundle } = __test__;

function makeMeta(over: Partial<HologramMeta> = {}): HologramMeta {
  return {
    sourceKind: 'image',
    width: 4,
    height: 4,
    frames: 1,
    modelId: 'test-model',
    backend: 'cpu',
    inferenceMs: 1,
    createdAt: '2026-04-25T00:00:00.000Z',
    schemaVersion: 1,
    ...over,
  };
}

async function persistBundle(
  store: FileSystemHologramStore,
  meta: HologramMeta,
  withQuilt: boolean = true,
  withMvhevc: boolean = false,
  withParallax: boolean = false
): Promise<string> {
  const depth = new Float32Array(meta.width * meta.height * meta.frames);
  const normal = new Float32Array(meta.width * meta.height * meta.frames * 3);
  depth.fill(0.1);
  normal.fill(0.5);
  const depthBin = new Uint8Array(depth.buffer, depth.byteOffset, depth.byteLength);
  const normalBin = new Uint8Array(normal.buffer, normal.byteOffset, normal.byteLength);
  const hash = await computeBundleHash(meta, depthBin, normalBin);

  const bundle: HologramBundle = {
    hash,
    meta,
    depthBin,
    normalBin,
    ...(withQuilt ? { quiltPng: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) } : {}),
    ...(withMvhevc ? { mvhevcMp4: new Uint8Array([0, 0, 0, 0x20]) } : {}),
    ...(withParallax ? { parallaxWebm: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]) } : {}),
  };

  const result = await store.put(bundle);
  return result.hash;
}

describe('/g/[hash] — loadBundle', () => {
  let workDir: string;
  let store: FileSystemHologramStore;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'g-hash-page-'));
    vi.stubEnv('HOLOGRAM_STORE_ROOT', workDir);
    __resetHologramStoreForTests();
    store = new FileSystemHologramStore({ rootDir: workDir });
  });

  afterEach(async () => {
    __resetHologramStoreForTests();
    await rm(workDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('returns null for non-string hash', async () => {
    expect(await loadBundle(undefined)).toBeNull();
    expect(await loadBundle(null)).toBeNull();
    expect(await loadBundle(123)).toBeNull();
  });

  it('returns null for an invalid hash shape', async () => {
    expect(await loadBundle('not-a-hash')).toBeNull();
    expect(await loadBundle('A'.repeat(64))).toBeNull(); // uppercase
    expect(await loadBundle('a'.repeat(63))).toBeNull(); // too short
    expect(await loadBundle('../etc/passwd')).toBeNull();
  });

  it('returns null for a valid-shape hash that is not in the store', async () => {
    expect(await loadBundle('a'.repeat(64))).toBeNull();
    expect(await loadBundle('0123456789abcdef'.repeat(4))).toBeNull();
  });

  it('returns bundle info for a persisted bundle (quilt only)', async () => {
    const meta = makeMeta();
    const hash = await persistBundle(store, meta, true, false, false);
    const loaded = await loadBundle(hash);
    expect(loaded).not.toBeNull();
    expect(loaded?.hash).toBe(hash);
    expect(loaded?.meta.sourceKind).toBe('image');
    expect(loaded?.hasQuilt).toBe(true);
    expect(loaded?.hasMvhevc).toBe(false);
    expect(loaded?.hasParallax).toBe(false);
  });

  it('reflects all three asset flags', async () => {
    const meta = makeMeta();
    const hash = await persistBundle(store, meta, true, true, true);
    const loaded = await loadBundle(hash);
    expect(loaded?.hasQuilt).toBe(true);
    expect(loaded?.hasMvhevc).toBe(true);
    expect(loaded?.hasParallax).toBe(true);
  });

  it('reflects no asset flags when only depth/normal exist', async () => {
    const meta = makeMeta();
    const hash = await persistBundle(store, meta, false, false, false);
    const loaded = await loadBundle(hash);
    expect(loaded?.hasQuilt).toBe(false);
    expect(loaded?.hasMvhevc).toBe(false);
    expect(loaded?.hasParallax).toBe(false);
  });
});

describe('/g/[hash] — generateMetadata', () => {
  let workDir: string;
  let store: FileSystemHologramStore;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'g-hash-meta-'));
    vi.stubEnv('HOLOGRAM_STORE_ROOT', workDir);
    __resetHologramStoreForTests();
    store = new FileSystemHologramStore({ rootDir: workDir });
  });

  afterEach(async () => {
    __resetHologramStoreForTests();
    await rm(workDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('falls back to "not found" title for missing bundle', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ hash: 'a'.repeat(64) }),
    });
    expect(meta.title).toBe('HoloGram — not found');
  });

  it('falls back to "not found" for invalid hash shape', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ hash: 'NOT_A_VALID_HASH' }),
    });
    expect(meta.title).toBe('HoloGram — not found');
  });

  it('produces a sanitized title for a valid bundle', async () => {
    const hash = await persistBundle(store, makeMeta({ width: 1024, height: 768 }));
    const meta = await generateMetadata({
      params: Promise.resolve({ hash }),
    });
    expect(meta.title).toContain('image');
    expect(meta.title).toContain('1024x768');
  });

  it('omits OG image when no quilt asset', async () => {
    const hash = await persistBundle(store, makeMeta(), false, false, false);
    const meta = await generateMetadata({
      params: Promise.resolve({ hash }),
    });
    expect(meta.openGraph?.images).toBeUndefined();
  });

  it('includes OG image referencing the asset URL when quilt exists', async () => {
    const hash = await persistBundle(store, makeMeta(), true);
    const meta = await generateMetadata({
      params: Promise.resolve({ hash }),
    });
    const og = meta.openGraph;
    expect(og).toBeDefined();
    expect(Array.isArray(og?.images)).toBe(true);
    const imgs = og?.images as Array<{ url: string }> | undefined;
    expect(imgs?.[0]?.url).toBe(`/api/hologram/${hash}/quilt.png`);
  });
});
