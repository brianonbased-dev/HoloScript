/**
 * BuildCache — Production Test Suite
 *
 * Covers: initialization, get/set/invalidate, content hashing,
 * compression, TTL, stats, eviction, warmCache, tag-based invalidation.
 * Uses temp directories to isolate each test.
 *
 * Key behavioural notes:
 * - set() calls hashFile(sourcePath) and getModTime(sourcePath). If the
 *   sourcePath does not exist, sourceHash='missing' and sourceModifiedTime=0.
 * - isEntryValid() checks existsSync(sourcePath). If the file does not
 *   exist, the entry is invalid/stale and get() returns { hit: false, reason: 'stale' }.
 * - Therefore tests that expect cache hits MUST create actual temp source files.
 * - getStats() is synchronous (not async).
 * - Version mismatch during initialize() clears the cache entirely, so a
 *   subsequent get() returns { hit:false, reason:'not_found' } (not version_mismatch).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BuildCache, hashContent } from '../BuildCache';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'buildcache-test-'));
}

function makeTempFile(dir: string, name: string, content = 'source content'): string {
  const p = join(dir, name);
  writeFileSync(p, content, 'utf-8');
  return p;
}

function makeCache(
  dir: string,
  opts: Partial<{ version: string; maxSize: number; enableCompression: boolean; ttl: number }> = {}
) {
  return new BuildCache({ cacheDir: dir, version: '1.0.0', ...opts });
}

describe('BuildCache — Production', () => {
  let tempDir: string;
  let cache: BuildCache;

  beforeEach(() => {
    tempDir = makeTempDir();
    cache = makeCache(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ─── Construction ────────────────────────────────────────────────────
  it('constructs with valid options', () => {
    expect(cache).toBeDefined();
  });

  // ─── initialize ───────────────────────────────────────────────────────
  it('initialize() resolves without error', async () => {
    await expect(cache.initialize()).resolves.toBeUndefined();
  });

  it('initialize() creates cache directory', async () => {
    const dir = makeTempDir();
    rmSync(dir, { recursive: true, force: true });
    const c = makeCache(dir);
    await c.initialize();
    const { existsSync } = await import('fs');
    expect(existsSync(dir)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  // ─── get/set ─────────────────────────────────────────────────────────
  it('get returns miss for unknown entry', async () => {
    await cache.initialize();
    const result = await cache.get<string>('nonexistent.ts', 'ast');
    expect(result.hit).toBe(false);
  });

  // set then get returns a hit — requires an actual file for isEntryValid()
  it('set then get returns a hit', async () => {
    await cache.initialize();
    const srcFile = makeTempFile(tempDir, 'foo.ts');
    await cache.set(srcFile, 'ast', { nodes: [1, 2, 3] });
    const result = await cache.get(srcFile, 'ast');
    expect(result.hit).toBe(true);
  });

  it('get returns the stored data', async () => {
    await cache.initialize();
    const srcFile = makeTempFile(tempDir, 'bar.ts');
    const data = { compiled: 'output', version: 3 };
    await cache.set(srcFile, 'compiled', data);
    const result = await cache.get<typeof data>(srcFile, 'compiled');
    expect(result.hit).toBe(true);
    expect(result.entry?.data).toEqual(data);
  });

  it('set stores metadata correctly', async () => {
    await cache.initialize();
    const srcFile = makeTempFile(tempDir, 'test.ts');
    await cache.set(srcFile, 'ast', 'hello');
    const result = await cache.get<string>(srcFile, 'ast');
    expect(result.entry?.meta.type).toBe('ast');
    expect(result.entry?.meta.sourcePath).toBe(srcFile);
  });

  // ─── Multiple types for same file ─────────────────────────────────────
  it('different types for same file are stored independently', async () => {
    await cache.initialize();
    const srcFile = makeTempFile(tempDir, 'shared.ts');
    await cache.set(srcFile, 'ast', 'ast-data');
    await cache.set(srcFile, 'compiled', 'compiled-data');
    const ast = await cache.get<string>(srcFile, 'ast');
    const compiled = await cache.get<string>(srcFile, 'compiled');
    expect(ast.entry?.data).toBe('ast-data');
    expect(compiled.entry?.data).toBe('compiled-data');
  });

  // ─── invalidate ───────────────────────────────────────────────────────
  it('invalidate removes cached entry', async () => {
    await cache.initialize();
    const srcFile = makeTempFile(tempDir, 'myfile.ts');
    await cache.set(srcFile, 'ast', { x: 1 });
    await cache.invalidate(srcFile);
    const result = await cache.get(srcFile, 'ast');
    expect(result.hit).toBe(false);
  });

  it('invalidate returns count of removed entries', async () => {
    await cache.initialize();
    const srcFile = makeTempFile(tempDir, 'x.ts');
    await cache.set(srcFile, 'ast', 1);
    await cache.set(srcFile, 'compiled', 2);
    const count = await cache.invalidate(srcFile);
    expect(count).toBe(2);
  });

  it('invalidate with specific type only removes that type', async () => {
    await cache.initialize();
    const srcFile = makeTempFile(tempDir, 'y.ts');
    await cache.set(srcFile, 'ast', 'a');
    await cache.set(srcFile, 'compiled', 'b');
    await cache.invalidate(srcFile, ['ast']);
    const ast = await cache.get(srcFile, 'ast');
    const compiled = await cache.get(srcFile, 'compiled');
    expect(ast.hit).toBe(false);
    expect(compiled.hit).toBe(true);
  });

  // ─── Tags ────────────────────────────────────────────────────────────
  it('set with tags stores tags in metadata', async () => {
    await cache.initialize();
    const srcFile = makeTempFile(tempDir, 'tagged.ts');
    await cache.set(srcFile, 'ast', 'data', { tags: ['generated', 'v2'] });
    const result = await cache.get<string>(srcFile, 'ast');
    expect(result.entry?.meta.tags).toContain('generated');
  });

  it('invalidateByTag removes entries with matching tag', async () => {
    await cache.initialize();
    const f1 = makeTempFile(tempDir, 'a.ts');
    const f2 = makeTempFile(tempDir, 'b.ts');
    const f3 = makeTempFile(tempDir, 'c.ts');
    await cache.set(f1, 'ast', 1, { tags: ['Sprint-10'] });
    await cache.set(f2, 'ast', 2, { tags: ['Sprint-10'] });
    await cache.set(f3, 'ast', 3, { tags: ['Sprint-11'] });
    const count = await cache.invalidateByTag('Sprint-10');
    expect(count).toBe(2);
    const c = await cache.get(f3, 'ast');
    expect(c.hit).toBe(true);
  });

  // ─── Stats (getStats is synchronous) ─────────────────────────────────
  it('getStats returns stats object', async () => {
    await cache.initialize();
    const stats = cache.getStats(); // synchronous
    expect(stats).toBeDefined();
    expect(typeof stats.totalEntries).toBe('number');
    expect(typeof stats.hitRate).toBe('number');
  });

  it('stats.totalEntries reflects stored entries', async () => {
    await cache.initialize();
    const f1 = makeTempFile(tempDir, 'f1.ts');
    const f2 = makeTempFile(tempDir, 'f2.ts');
    await cache.set(f1, 'ast', 'a');
    await cache.set(f2, 'ast', 'b');
    const stats = cache.getStats(); // synchronous
    expect(stats.totalEntries).toBeGreaterThanOrEqual(2);
  });

  // ─── Compression ─────────────────────────────────────────────────────
  it('enableCompression=true stores and retrieves data correctly', async () => {
    const dir = makeTempDir();
    const c = makeCache(dir, { enableCompression: true });
    await c.initialize();
    const srcFile = makeTempFile(dir, 'z.ts', 'bigfile');
    await c.set(srcFile, 'ast', { big: 'data'.repeat(100) });
    const result = await c.get<{ big: string }>(srcFile, 'ast');
    expect(result.hit).toBe(true);
    expect(result.entry?.data.big).toContain('data');
    rmSync(dir, { recursive: true, force: true });
  });

  // ─── Version mismatch ─────────────────────────────────────────────────
  // On version mismatch, initialize() clears the cache.
  // A subsequent get() returns { hit: false, reason: 'not_found' }
  it('version mismatch clears cache (get returns not_found)', async () => {
    const dir = makeTempDir();
    const srcFile = makeTempFile(dir, 'v.ts');
    const c1 = makeCache(dir, { version: '1.0.0' });
    await c1.initialize();
    await c1.set(srcFile, 'ast', 'old-data');

    const c2 = makeCache(dir, { version: '2.0.0' });
    await c2.initialize(); // clears cache due to version mismatch
    const result = await c2.get(srcFile, 'ast');
    expect(result.hit).toBe(false);
    // cache was cleared, so reason is not_found (not version_mismatch)
    expect(result.reason).toBe('not_found');
    rmSync(dir, { recursive: true, force: true });
  });

  // ─── Dependencies ────────────────────────────────────────────────────
  it('set with dependencies stores them in metadata', async () => {
    await cache.initialize();
    const srcFile = makeTempFile(tempDir, 'dep.ts');
    await cache.set(srcFile, 'ast', 'data', { dependencies: ['src/types.ts', 'src/utils.ts'] });
    const result = await cache.get<string>(srcFile, 'ast');
    expect(result.entry?.meta.dependencies).toContain('src/types.ts');
  });

  // ─── hashContent utility ─────────────────────────────────────────────
  it('hashContent returns consistent hash for same input', () => {
    const h1 = hashContent('hello world');
    const h2 = hashContent('hello world');
    expect(h1).toBe(h2);
    expect(typeof h1).toBe('string');
    expect(h1.length).toBeGreaterThan(0);
  });

  it('hashContent returns different hash for different input', () => {
    const h1 = hashContent('hello');
    const h2 = hashContent('world');
    expect(h1).not.toBe(h2);
  });
});
