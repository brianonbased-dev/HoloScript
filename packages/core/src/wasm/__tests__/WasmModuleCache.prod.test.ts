/**
 * WasmModuleCache Production Tests
 *
 * Tests memory-only cache mode (no IndexedDB in Node),
 * config defaults, and stats.
 */

import { describe, it, expect } from 'vitest';
import { WasmModuleCache } from '../WasmModuleCache';

describe('WasmModuleCache — Production', () => {
  it('constructor defaults', () => {
    const cache = new WasmModuleCache();
    const stats = cache.getStats();
    expect(stats.memoryEntries).toBe(0);
    expect(stats.dbAvailable).toBe(false);
  });

  it('custom config merges', () => {
    const cache = new WasmModuleCache({ maxModules: 5, ttlMs: 1000 });
    expect(cache.getStats().memoryEntries).toBe(0);
  });

  it('init resolves (no IndexedDB)', async () => {
    const cache = new WasmModuleCache();
    await cache.init(); // should resolve without error
    expect(cache.getStats().dbAvailable).toBe(false);
  });

  it('get returns null without DB', async () => {
    const cache = new WasmModuleCache();
    await cache.init();
    const result = await cache.get('parser', '1.0.0');
    expect(result).toBeNull();
  });

  it('clear resolves without error', async () => {
    const cache = new WasmModuleCache();
    await cache.init();
    await cache.clear();
    expect(cache.getStats().memoryEntries).toBe(0);
  });

  it('init is idempotent', async () => {
    const cache = new WasmModuleCache();
    await cache.init();
    await cache.init();
    expect(cache.getStats().dbAvailable).toBe(false);
  });
});
