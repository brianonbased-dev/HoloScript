/**
 * SmartAssetLoader Production Tests
 *
 * Construction with defaults, config merging, setPlatform/setQuality,
 * setModelParser, getConfig, and memory tracking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SmartAssetLoader } from '../SmartAssetLoader';

describe('SmartAssetLoader — Production', () => {
  let loader: SmartAssetLoader;

  beforeEach(() => {
    loader = new SmartAssetLoader({
      platform: 'desktop',
      quality: 'high',
    });
  });

  describe('construction', () => {
    it('creates with defaults', () => {
      const defaultLoader = new SmartAssetLoader();
      const config = defaultLoader.getConfig();
      expect(config.quality).toBe('medium');
      expect(config.memoryBudget).toBe(512 * 1024 * 1024);
      expect(config.enableStreaming).toBe(true);
      expect(config.autoLOD).toBe(true);
    });

    it('merges custom config', () => {
      const config = loader.getConfig();
      expect(config.platform).toBe('desktop');
      expect(config.quality).toBe('high');
    });

    it('retry defaults', () => {
      const config = loader.getConfig();
      expect(config.retry.maxAttempts).toBe(3);
      expect(config.retry.delayMs).toBe(1000);
      expect(config.retry.backoffMultiplier).toBe(2);
    });
  });

  describe('setPlatform', () => {
    it('changes platform in config', () => {
      loader.setPlatform('mobile');
      expect(loader.getConfig().platform).toBe('mobile');
    });
  });

  describe('setQuality', () => {
    it('changes quality in config', () => {
      loader.setQuality('low');
      expect(loader.getConfig().quality).toBe('low');
    });
  });

  describe('setModelParser', () => {
    it('sets custom model parser', () => {
      const parser = async (buffer: ArrayBuffer) => ({ parsed: true });
      loader.setModelParser(parser as any);
      // No crash, config should store it
      expect(loader.getConfig().modelParser).toBeDefined();
    });
  });

  describe('getMemoryUsage', () => {
    it('starts at 0 current', () => {
      const usage = loader.getMemoryUsage();
      expect(usage.current).toBe(0);
      expect(usage.budget).toBe(512 * 1024 * 1024);
      expect(usage.percent).toBe(0);
    });
  });
});
