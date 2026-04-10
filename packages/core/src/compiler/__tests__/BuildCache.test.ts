import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BuildCache, ContentAddressableStore, createBuildCache } from '../BuildCache';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TEST_DIR = join(tmpdir(), `holoscript-buildcache-test-${process.pid}`);

function ensureTestDir(): string {
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
  return TEST_DIR;
}

function createTestFile(name: string, content: string): string {
  const dir = ensureTestDir();
  const filePath = join(dir, name);
  writeFileSync(filePath, content);
  return filePath;
}

describe('BuildCache', () => {
  let cache: BuildCache;
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = join(ensureTestDir(), `cache-${Date.now()}`);
    cache = new BuildCache({ cacheDir, version: '1.0.0', debug: false });
  });

  afterEach(async () => {
    try {
      if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });
    } catch {}
  });

  // =========== Initialization ===========

  it('initializes and creates cache directories', async () => {
    await cache.initialize();
    expect(existsSync(cacheDir)).toBe(true);
    expect(existsSync(join(cacheDir, 'ast'))).toBe(true);
    expect(existsSync(join(cacheDir, 'compiled'))).toBe(true);
  });

  it('double initialize is no-op', async () => {
    await cache.initialize();
    await cache.initialize(); // safe
  });

  // =========== get / set ===========

  it('get returns miss for unknown key', async () => {
    await cache.initialize();
    const result = await cache.get('/nonexistent.ts', 'ast');
    expect(result.hit).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  it('set then get returns hit', async () => {
    const src = createTestFile('module.ts', 'export const x = 1;');
    await cache.initialize();
    await cache.set(src, 'ast', { nodeCount: 42 });
    const result = await cache.get<{ nodeCount: number }>(src, 'ast');
    expect(result.hit).toBe(true);
    expect(result.entry!.data.nodeCount).toBe(42);
  });

  it('tracks hit/miss counts in stats', async () => {
    const src = createTestFile('trackable.ts', 'val');
    await cache.initialize();
    await cache.get(src, 'ast'); // miss
    await cache.set(src, 'ast', 'data');
    await cache.get(src, 'ast'); // hit
    const stats = cache.getStats();
    expect(stats.hitCount).toBe(1);
    expect(stats.missCount).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.5);
  });

  // =========== Invalidation ===========

  it('invalidate removes cache entry', async () => {
    const src = createTestFile('inv.ts', 'code');
    await cache.initialize();
    await cache.set(src, 'compiled', 'output');
    const count = await cache.invalidate(src, ['compiled']);
    expect(count).toBe(1);
    const result = await cache.get(src, 'compiled');
    expect(result.hit).toBe(false);
  });

  // =========== Clear ===========

  it('clear removes all entries', async () => {
    const src = createTestFile('clearme.ts', 'hi');
    await cache.initialize();
    await cache.set(src, 'ast', { a: 1 });
    await cache.clear();
    const stats = cache.getStats();
    expect(stats.totalEntries).toBe(0);
    expect(stats.hitCount).toBe(0);
  });

  // =========== Stats ===========

  it('getStats returns initial zeroed state', async () => {
    await cache.initialize();
    const stats = cache.getStats();
    expect(stats.totalEntries).toBe(0);
    expect(stats.totalSize).toBe(0);
    expect(stats.hitRate).toBe(0);
  });

  it('getStats counts entries by type', async () => {
    const src1 = createTestFile('s1.ts', 'a');
    const src2 = createTestFile('s2.ts', 'b');
    await cache.initialize();
    await cache.set(src1, 'ast', 'x');
    await cache.set(src2, 'compiled', 'y');
    const stats = cache.getStats();
    expect(stats.entriesByType.ast).toBe(1);
    expect(stats.entriesByType.compiled).toBe(1);
    expect(stats.totalEntries).toBe(2);
  });

  // =========== getCachedFiles ===========

  it('getCachedFiles lists source paths', async () => {
    const src = createTestFile('cached.ts', 'data');
    await cache.initialize();
    await cache.set(src, 'ast', 'val');
    const files = cache.getCachedFiles();
    expect(files).toContain(src);
  });

  // =========== createBuildCache factory ===========

  it('createBuildCache returns BuildCache instance', () => {
    const bc = createBuildCache({ cacheDir: join(ensureTestDir(), 'factory') });
    expect(bc).toBeInstanceOf(BuildCache);
  });
});

describe('ContentAddressableStore', () => {
  let store: ContentAddressableStore;
  let storeDir: string;

  beforeEach(() => {
    storeDir = join(ensureTestDir(), `cas-${Date.now()}`);
    store = new ContentAddressableStore(storeDir);
  });

  afterEach(() => {
    try {
      if (existsSync(storeDir)) rmSync(storeDir, { recursive: true, force: true });
    } catch {}
  });

  it('store returns a hash', () => {
    const hash = store.store('hello world');
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(16);
  });

  it('retrieve returns stored content', () => {
    const hash = store.store('test data');
    const content = store.retrieve(hash);
    expect(content).toBe('test data');
  });

  it('has returns true for stored content', () => {
    const hash = store.store('check');
    expect(store.has(hash)).toBe(true);
  });

  it('has returns false for missing hash', () => {
    expect(store.has('0000000000000000')).toBe(false);
  });

  it('retrieve returns null for missing hash', () => {
    expect(store.retrieve('nonexistent')).toBeNull();
  });

  it('remove deletes stored content', () => {
    const hash = store.store('remove me');
    expect(store.remove(hash)).toBe(true);
    expect(store.has(hash)).toBe(false);
  });

  it('remove returns false for missing hash', () => {
    expect(store.remove('missing')).toBe(false);
  });

  it('same content produces same hash (dedup)', () => {
    const h1 = store.store('identical');
    const h2 = store.store('identical');
    expect(h1).toBe(h2);
  });
});
