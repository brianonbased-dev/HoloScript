/**
 * SmartAssetLoader Configuration Layer Production Tests
 *
 * SmartAssetLoader.load() uses fetch(), AbortController, URL, and navigator,
 * all of which require network mocking. This file tests the pure-CPU
 * configuration API surface instead:
 *
 * Covers: constructor defaults (platform/quality/memoryBudget/retry/timeout),
 * getConfig (returns a copy), updateConfig (merges partial), setPlatform,
 * setQuality, setModelParser, getMemoryUsage (initial zero usage, budget
 * reflects config), releaseMemory (returns empty array, no-throw),
 * createSmartAssetLoader factory.
 */

import { describe, it, expect, vi } from 'vitest';
import { SmartAssetLoader, createSmartAssetLoader } from '../../assets/SmartAssetLoader';

// ── constructor defaults ──────────────────────────────────────────────────────

describe('SmartAssetLoader — constructor defaults', () => {

  it('default quality is medium', () => {
    const sal = new SmartAssetLoader();
    expect(sal.getConfig().quality).toBe('medium');
  });

  it('default memoryBudget is 512MB', () => {
    const sal = new SmartAssetLoader();
    expect(sal.getConfig().memoryBudget).toBe(512 * 1024 * 1024);
  });

  it('default retry.maxAttempts is 3', () => {
    expect(new SmartAssetLoader().getConfig().retry.maxAttempts).toBe(3);
  });

  it('default retry.backoffMultiplier is 2', () => {
    expect(new SmartAssetLoader().getConfig().retry.backoffMultiplier).toBe(2);
  });

  it('default timeout is 30000', () => {
    expect(new SmartAssetLoader().getConfig().timeout).toBe(30000);
  });

  it('default enableStreaming is true', () => {
    expect(new SmartAssetLoader().getConfig().enableStreaming).toBe(true);
  });

  it('default autoLOD is true', () => {
    expect(new SmartAssetLoader().getConfig().autoLOD).toBe(true);
  });

  it('constructor accepts partial config override', () => {
    const sal = new SmartAssetLoader({ quality: 'high', timeout: 5000 });
    expect(sal.getConfig().quality).toBe('high');
    expect(sal.getConfig().timeout).toBe(5000);
  });
});

// ── getConfig ─────────────────────────────────────────────────────────────────

describe('SmartAssetLoader — getConfig', () => {

  it('getConfig returns a copy (mutation does not affect internal state)', () => {
    const sal = new SmartAssetLoader({ quality: 'low' });
    const cfg = sal.getConfig();
    cfg.quality = 'ultra';
    expect(sal.getConfig().quality).toBe('low');
  });
});

// ── updateConfig ──────────────────────────────────────────────────────────────

describe('SmartAssetLoader — updateConfig', () => {

  it('updateConfig merges partial config', () => {
    const sal = new SmartAssetLoader();
    sal.updateConfig({ timeout: 9999 });
    expect(sal.getConfig().timeout).toBe(9999);
  });

  it('updateConfig does not reset unspecified fields', () => {
    const sal = new SmartAssetLoader({ quality: 'high' });
    sal.updateConfig({ timeout: 1000 });
    expect(sal.getConfig().quality).toBe('high');
  });

  it('updateConfig can override memoryBudget', () => {
    const sal = new SmartAssetLoader();
    sal.updateConfig({ memoryBudget: 256 * 1024 * 1024 });
    expect(sal.getConfig().memoryBudget).toBe(256 * 1024 * 1024);
  });
});

// ── setPlatform ───────────────────────────────────────────────────────────────

describe('SmartAssetLoader — setPlatform', () => {

  it('setPlatform updates the platform config', () => {
    const sal = new SmartAssetLoader({ platform: 'web' });
    sal.setPlatform('mobile');
    expect(sal.getConfig().platform).toBe('mobile');
  });

  it('setPlatform accepts all valid platforms', () => {
    const sal = new SmartAssetLoader();
    const platforms: Array<'web' | 'mobile' | 'vr' | 'ar' | 'desktop'> = ['web', 'mobile', 'vr', 'ar', 'desktop'];
    for (const p of platforms) {
      sal.setPlatform(p);
      expect(sal.getConfig().platform).toBe(p);
    }
  });
});

// ── setQuality ────────────────────────────────────────────────────────────────

describe('SmartAssetLoader — setQuality', () => {

  it('setQuality updates the quality config', () => {
    const sal = new SmartAssetLoader();
    sal.setQuality('ultra');
    expect(sal.getConfig().quality).toBe('ultra');
  });

  it('setQuality accepts all valid quality levels', () => {
    const sal = new SmartAssetLoader();
    const qualities: Array<'low' | 'medium' | 'high' | 'ultra'> = ['low', 'medium', 'high', 'ultra'];
    for (const q of qualities) {
      sal.setQuality(q);
      expect(sal.getConfig().quality).toBe(q);
    }
  });
});

// ── setModelParser ────────────────────────────────────────────────────────────

describe('SmartAssetLoader — setModelParser', () => {

  it('setModelParser stores the parser in config', () => {
    const sal = new SmartAssetLoader();
    const parser = async (_buf: ArrayBuffer) => ({ parsed: true });
    sal.setModelParser(parser as any);
    expect(sal.getConfig().modelParser).toBe(parser);
  });
});

// ── getMemoryUsage ────────────────────────────────────────────────────────────

describe('SmartAssetLoader — getMemoryUsage', () => {

  it('initial memory usage is 0', () => {
    const sal = new SmartAssetLoader();
    expect(sal.getMemoryUsage().current).toBe(0);
  });

  it('budget reflects config memoryBudget', () => {
    const sal = new SmartAssetLoader({ memoryBudget: 1024 });
    expect(sal.getMemoryUsage().budget).toBe(1024);
  });

  it('percent is 0 when current=0', () => {
    expect(new SmartAssetLoader().getMemoryUsage().percent).toBe(0);
  });
});

// ── releaseMemory ─────────────────────────────────────────────────────────────

describe('SmartAssetLoader — releaseMemory', () => {

  it('releaseMemory returns an array', () => {
    const result = new SmartAssetLoader().releaseMemory(1024);
    expect(Array.isArray(result)).toBe(true);
  });

  it('releaseMemory does not throw', () => {
    expect(() => new SmartAssetLoader().releaseMemory(0)).not.toThrow();
  });
});

// ── factory ───────────────────────────────────────────────────────────────────

describe('SmartAssetLoader — factory', () => {

  it('createSmartAssetLoader returns SmartAssetLoader instance', () => {
    const sal = createSmartAssetLoader({ quality: 'high' });
    expect(sal).toBeInstanceOf(SmartAssetLoader);
  });

  it('factory respects config overrides', () => {
    const sal = createSmartAssetLoader({ quality: 'low', timeout: 2000 });
    expect(sal.getConfig().quality).toBe('low');
    expect(sal.getConfig().timeout).toBe(2000);
  });
});
