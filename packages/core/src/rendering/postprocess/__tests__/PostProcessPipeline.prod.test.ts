/**
 * PostProcessPipeline Production Tests
 *
 * Pipeline construction, config defaults, presets (static), effect queries,
 * stats, dispose.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PostProcessPipeline,
  DEFAULT_PIPELINE_CONFIG,
  createPostProcessPipeline,
  createHDRPipeline,
} from '../PostProcessPipeline';

describe('PostProcessPipeline — Production', () => {
  let pipeline: PostProcessPipeline;

  beforeEach(() => {
    pipeline = new PostProcessPipeline();
  });

  describe('construction', () => {
    it('creates with default config', () => {
      const config = pipeline.getConfig();
      expect(config.hdrEnabled).toBe(true);
      expect(config.hdrFormat).toBe('rgba16float');
      expect(config.msaaSamples).toBe(1);
      expect(config.autoResize).toBe(true);
    });

    it('creates with custom config', () => {
      const p = new PostProcessPipeline({ hdrEnabled: false, msaaSamples: 4 });
      expect(p.getConfig().hdrEnabled).toBe(false);
      expect(p.getConfig().msaaSamples).toBe(4);
    });
  });

  describe('initialized (getter)', () => {
    it('starts uninitialized', () => {
      expect(pipeline.initialized).toBe(false);
    });
  });

  describe('effects', () => {
    it('starts with no effects', () => {
      expect(pipeline.getEffects()).toEqual([]);
    });

    it('getEffect returns undefined for missing', () => {
      expect(pipeline.getEffect('bloom')).toBeUndefined();
    });

    it('getEffectByType returns undefined for missing', () => {
      expect(pipeline.getEffectByType('bloom')).toBeUndefined();
    });
  });

  describe('createPreset (static)', () => {
    it('minimal preset has effects', () => {
      const preset = PostProcessPipeline.createPreset('minimal');
      expect(preset.effects).toBeDefined();
      expect(preset.effects!.length).toBeGreaterThan(0);
    });

    it('standard preset has effects', () => {
      const preset = PostProcessPipeline.createPreset('standard');
      expect(preset.effects!.length).toBeGreaterThan(0);
    });

    it('cinematic preset has more effects than minimal', () => {
      const minimal = PostProcessPipeline.createPreset('minimal');
      const cinematic = PostProcessPipeline.createPreset('cinematic');
      expect(cinematic.effects!.length).toBeGreaterThan(minimal.effects!.length);
    });

    it('performance preset exists', () => {
      const preset = PostProcessPipeline.createPreset('performance');
      expect(preset.effects).toBeDefined();
    });
  });

  describe('stats', () => {
    it('reports zero effects when empty', () => {
      const stats = pipeline.getStats();
      expect(stats.effectCount).toBe(0);
    });
  });

  describe('dispose', () => {
    it('disposes without error', () => {
      pipeline.dispose();
      expect(pipeline.initialized).toBe(false);
    });
  });

  describe('DEFAULT_PIPELINE_CONFIG', () => {
    it('has expected defaults', () => {
      expect(DEFAULT_PIPELINE_CONFIG.hdrEnabled).toBe(true);
      expect(DEFAULT_PIPELINE_CONFIG.effects).toEqual([]);
    });
  });

  describe('factory functions', () => {
    it('createPostProcessPipeline returns pipeline', () => {
      const p = createPostProcessPipeline();
      expect(p).toBeInstanceOf(PostProcessPipeline);
    });

    it('createPostProcessPipeline with preset', () => {
      const p = createPostProcessPipeline('cinematic');
      expect(p.getConfig().effects!.length).toBeGreaterThan(0);
    });

    it('createHDRPipeline returns pipeline', () => {
      const p = createHDRPipeline();
      expect(p).toBeInstanceOf(PostProcessPipeline);
    });
  });
});
