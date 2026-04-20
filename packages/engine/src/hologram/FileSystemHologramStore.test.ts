/**
 * Tests for HologramStore + FileSystemHologramStore.
 *
 * Team mode SECURITY — test coverage prioritizes security invariants:
 *   - Hash is RECOMPUTED on put() (client-supplied hash ignored)
 *   - Path-traversal is blocked at the validator AND the resolver
 *   - Asset allowlist is enforced (no arbitrary filenames)
 *   - Size limit is enforced at write time
 *   - Writes are atomic (no partial reads)
 *   - Idempotency: duplicate put() does not rewrite
 */

import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { computeBundleHash, type HologramBundle, type HologramMeta } from './HologramBundle';
import { FileSystemHologramStore } from './FileSystemHologramStore';
import {
  ASSET_CONTENT_TYPES,
  ASSET_NAMES,
  assertValidAssetName,
  assertValidHash,
  bundleAssetRelPath,
  bundleRelDir,
  canonicalizeBundleForPut,
  HologramStoreError,
  isAssetName,
} from './HologramStore';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeMeta(overrides: Partial<HologramMeta> = {}): HologramMeta {
  return {
    sourceKind: 'image',
    width: 4,
    height: 4,
    frames: 1,
    modelId: 'depth-anything/Depth-Anything-V2-Small-hf',
    backend: 'webgpu',
    inferenceMs: 100,
    createdAt: '2026-04-20T00:00:00.000Z',
    schemaVersion: 1,
    ...overrides,
  };
}

async function makeBundle(
  seed = 0,
  overrides: Partial<HologramBundle> = {}
): Promise<HologramBundle> {
  const depth = new Float32Array(16);
  const normal = new Float32Array(48);
  for (let i = 0; i < 16; i++) depth[i] = ((i + seed) % 16) / 16;
  for (let i = 0; i < 48; i++) normal[i] = ((i + seed) % 48) / 48;
  const depthBin = new Uint8Array(depth.buffer, depth.byteOffset, depth.byteLength);
  const normalBin = new Uint8Array(normal.buffer, normal.byteOffset, normal.byteLength);
  const meta = makeMeta();
  const hash = await computeBundleHash(meta, depthBin, normalBin);
  return { hash, meta, depthBin, normalBin, ...overrides };
}

// ─────────────────────────────────────────────────────────────────────────────
// HologramStore helpers (pure)
// ─────────────────────────────────────────────────────────────────────────────

describe('ASSET_NAMES + isAssetName', () => {
  it('covers every asset type', () => {
    expect(ASSET_NAMES).toEqual([
      'meta.json',
      'depth.bin',
      'normal.bin',
      'quilt.png',
      'mvhevc.mp4',
      'parallax.webm',
    ]);
  });

  it('has a content-type entry for every asset', () => {
    for (const name of ASSET_NAMES) {
      expect(ASSET_CONTENT_TYPES[name]).toBeTruthy();
    }
  });

  it('isAssetName rejects arbitrary strings', () => {
    expect(isAssetName('meta.json')).toBe(true);
    expect(isAssetName('quilt.png')).toBe(true);
    expect(isAssetName('foo.bin')).toBe(false);
    expect(isAssetName('../etc/passwd')).toBe(false);
    expect(isAssetName('meta.json\0')).toBe(false);
  });
});

describe('assertValidHash (SECURITY)', () => {
  const good = 'a'.repeat(64);
  const goodMixed = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('accepts 64-char lowercase hex', () => {
    expect(() => assertValidHash(good)).not.toThrow();
    expect(() => assertValidHash(goodMixed)).not.toThrow();
  });

  it('rejects uppercase hex (strict lowercase canon)', () => {
    expect(() => assertValidHash('A'.repeat(64))).toThrowError(HologramStoreError);
  });

  it('rejects short strings', () => {
    expect(() => assertValidHash('a'.repeat(63))).toThrowError(/invalid hash/);
  });

  it('rejects long strings', () => {
    expect(() => assertValidHash('a'.repeat(65))).toThrowError(/invalid hash/);
  });

  it('rejects non-hex chars (including path-traversal attempts)', () => {
    expect(() => assertValidHash('../'.repeat(21) + 'a')).toThrowError(/invalid hash/);
    expect(() => assertValidHash('a'.repeat(63) + '/')).toThrowError(/invalid hash/);
    expect(() => assertValidHash('a'.repeat(63) + '\\')).toThrowError(/invalid hash/);
    expect(() => assertValidHash('a'.repeat(63) + '\0')).toThrowError(/invalid hash/);
  });

  it('rejects non-strings', () => {
    expect(() => assertValidHash(undefined)).toThrowError(HologramStoreError);
    expect(() => assertValidHash(null)).toThrowError(HologramStoreError);
    expect(() => assertValidHash(123)).toThrowError(HologramStoreError);
    expect(() => assertValidHash({})).toThrowError(HologramStoreError);
  });
});

describe('assertValidAssetName (SECURITY)', () => {
  it('accepts allowlisted assets', () => {
    for (const name of ASSET_NAMES) {
      expect(() => assertValidAssetName(name)).not.toThrow();
    }
  });

  it('rejects path-traversal attempts', () => {
    expect(() => assertValidAssetName('../meta.json')).toThrowError(/invalid asset/);
    expect(() => assertValidAssetName('meta.json/../foo')).toThrowError(/invalid asset/);
    expect(() => assertValidAssetName('/etc/passwd')).toThrowError(/invalid asset/);
  });

  it('rejects spelling variants and case', () => {
    expect(() => assertValidAssetName('META.JSON')).toThrowError(/invalid asset/);
    expect(() => assertValidAssetName('meta.jso')).toThrowError(/invalid asset/);
    expect(() => assertValidAssetName('')).toThrowError(/invalid asset/);
  });
});

describe('bundleRelDir / bundleAssetRelPath', () => {
  const h = 'abcdef0123456789'.repeat(4); // 64 chars

  it('produces sharded path', () => {
    expect(bundleRelDir(h)).toBe(`ab/${h}`);
    expect(bundleAssetRelPath(h, 'quilt.png')).toBe(`ab/${h}/quilt.png`);
  });

  it('refuses to produce paths for invalid hashes', () => {
    expect(() => bundleRelDir('short')).toThrowError(/invalid hash/);
    expect(() => bundleAssetRelPath(h, 'evil.txt' as never)).toThrowError(/invalid asset/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FileSystemHologramStore
// ─────────────────────────────────────────────────────────────────────────────

describe('FileSystemHologramStore', () => {
  let rootDir: string;
  let store: FileSystemHologramStore;

  beforeAll(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'hologram-store-test-'));
    store = new FileSystemHologramStore({ rootDir });
  });

  afterAll(async () => {
    if (rootDir) await rm(rootDir, { recursive: true, force: true });
  });

  // ── Constructor ──

  it('rejects empty rootDir', () => {
    expect(() => new FileSystemHologramStore({ rootDir: '' })).toThrowError(HologramStoreError);
  });

  it('exposes an absolute rootDir', () => {
    expect(store.getRootDir()).toBe(rootDir); // mkdtemp already returns absolute
  });

  // ── Put + Get round-trip ──

  it('writes a bundle and round-trips every asset', async () => {
    const b = await makeBundle(1);
    b.quiltPng = new Uint8Array([1, 2, 3, 4]);
    b.mvhevcMp4 = new Uint8Array([5, 6, 7, 8]);
    b.parallaxWebm = new Uint8Array([9, 10, 11]);
    const { hash, written } = await store.put(b);
    expect(written).toBe(true);
    expect(hash).toBe(b.hash);

    expect(await store.has(hash)).toBe(true);

    const metaBytes = await store.getAsset(hash, 'meta.json');
    expect(metaBytes).toBeDefined();
    const meta = JSON.parse(new TextDecoder().decode(metaBytes!));
    expect(meta.schemaVersion).toBe(1);
    expect(meta.sourceKind).toBe('image');

    expect(await store.getAsset(hash, 'depth.bin')).toEqual(b.depthBin);
    expect(await store.getAsset(hash, 'normal.bin')).toEqual(b.normalBin);
    expect(await store.getAsset(hash, 'quilt.png')).toEqual(b.quiltPng);
    expect(await store.getAsset(hash, 'mvhevc.mp4')).toEqual(b.mvhevcMp4);
    expect(await store.getAsset(hash, 'parallax.webm')).toEqual(b.parallaxWebm);
  });

  it('returns null for missing assets without throwing', async () => {
    const b = await makeBundle(2); // no quilt/mvhevc/parallax
    await store.put(b);
    expect(await store.getAsset(b.hash, 'quilt.png')).toBeNull();
    expect(await store.getAsset(b.hash, 'mvhevc.mp4')).toBeNull();
    expect(await store.getAsset(b.hash, 'parallax.webm')).toBeNull();
  });

  it('returns null for entirely missing bundle', async () => {
    const missing = 'b'.repeat(64);
    expect(await store.has(missing)).toBe(false);
    expect(await store.getAsset(missing, 'meta.json')).toBeNull();
    expect(await store.getMeta(missing)).toBeNull();
  });

  // ── SECURITY: hash is recomputed, not trusted ──

  it('RECOMPUTES hash on put, ignoring client-supplied value (squatting defense)', async () => {
    const b = await makeBundle(3);
    const fakeHash = 'f'.repeat(64);
    const tampered: HologramBundle = { ...b, hash: fakeHash };
    const { hash: authoritative, written } = await store.put(tampered);
    // Authoritative hash is the recomputed one, NOT the attacker's fakeHash
    expect(authoritative).not.toBe(fakeHash);
    expect(authoritative).toBe(b.hash);
    expect(written).toBe(true);
    // The fake hash never made it onto disk
    expect(await store.has(fakeHash)).toBe(false);
    expect(await store.has(authoritative)).toBe(true);
  });

  // ── SECURITY: path-traversal ──

  it('blocks path traversal at the hash validator', async () => {
    await expect(store.has('../' + 'a'.repeat(61))).rejects.toThrowError(/invalid hash/);
    await expect(store.getAsset('../' + 'a'.repeat(61), 'meta.json')).rejects.toThrowError(
      /invalid hash/
    );
  });

  it('blocks path traversal at the asset validator', async () => {
    const b = await makeBundle(4);
    await store.put(b);
    await expect(
      store.getAsset(b.hash, '../../etc/passwd' as never)
    ).rejects.toThrowError(/invalid asset/);
  });

  // ── SECURITY: size cap ──

  it('rejects bundles over the size limit', async () => {
    const smallStore = new FileSystemHologramStore({
      rootDir: await mkdtemp(join(tmpdir(), 'hologram-store-small-')),
      maxBundleBytes: 1024,
    });
    const b = await makeBundle(5);
    // Artificial huge quiltPng (2KB > 1KB limit)
    b.quiltPng = new Uint8Array(2048);
    await expect(smallStore.put(b)).rejects.toThrowError(/size_limit_exceeded|max is 1024/);
    // Nothing should have been written
    expect(await smallStore.has(b.hash)).toBe(false);
    await rm(smallStore.getRootDir(), { recursive: true, force: true });
  });

  // ── Idempotency ──

  it('is idempotent: second put() returns written:false and does not rewrite', async () => {
    const b = await makeBundle(6);
    const first = await store.put(b);
    expect(first.written).toBe(true);

    // Capture the file mtimes before the second put
    const metaPath = join(store.getRootDir(), bundleAssetRelPath(b.hash, 'meta.json'));
    const firstStat = await stat(metaPath);

    // Sleep briefly so any accidental rewrite would have a different mtime
    await new Promise((r) => setTimeout(r, 20));

    const second = await store.put(b);
    expect(second.written).toBe(false);
    expect(second.hash).toBe(b.hash);

    const secondStat = await stat(metaPath);
    expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);
  });

  // ── Atomicity ──

  it('leaves no orphan .tmp files on successful write', async () => {
    const b = await makeBundle(7);
    await store.put(b);
    const dir = join(store.getRootDir(), bundleRelDir(b.hash));
    const files = await readdir(dir);
    for (const f of files) {
      expect(f).not.toMatch(/\.tmp\./);
    }
  });

  // ── Meta parsing ──

  it('getMeta returns parsed meta', async () => {
    const b = await makeBundle(8);
    await store.put(b);
    const m = await store.getMeta(b.hash);
    expect(m).toBeDefined();
    expect(m!.schemaVersion).toBe(1);
    expect(m!.width).toBe(4);
    expect(m!.sourceKind).toBe('image');
  });

  it('getMeta throws on corrupt JSON (not 404)', async () => {
    const b = await makeBundle(9);
    await store.put(b);
    const metaPath = join(store.getRootDir(), bundleAssetRelPath(b.hash, 'meta.json'));
    await writeFile(metaPath, '{not valid json');
    await expect(store.getMeta(b.hash)).rejects.toThrowError(/corrupt meta/);
  });

  it('getMeta throws when schemaVersion is missing (hardening)', async () => {
    const b = await makeBundle(10);
    await store.put(b);
    const metaPath = join(store.getRootDir(), bundleAssetRelPath(b.hash, 'meta.json'));
    await writeFile(metaPath, JSON.stringify({ width: 4 }));
    await expect(store.getMeta(b.hash)).rejects.toThrowError(/missing schemaVersion/);
  });

  // ── Canonicalize helper ──

  it('canonicalizeBundleForPut rejects bundles with size mismatch', async () => {
    const b = await makeBundle(11);
    b.depthBin = new Uint8Array(8); // wrong size
    await expect(canonicalizeBundleForPut(b)).rejects.toThrowError(/depthBin is 8 bytes/);
  });
});
