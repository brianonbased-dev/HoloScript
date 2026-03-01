import { describe, it, expect, beforeEach } from 'vitest';
import {
  BloomEffect,
  ToneMapEffect,
  FXAAEffect,
  VignetteEffect,
  SharpenEffect,
  ChromaticAberrationEffect,
  FilmGrainEffect,
  CausticsEffect,
  SSREffect,
  SSAOEffect,
  SSGIEffect,
} from '../PostProcessEffect';

describe('PostProcessEffect subclasses', () => {

  // ===========================================================================
  // BloomEffect
  // ===========================================================================
  describe('BloomEffect', () => {
    let effect: BloomEffect;

    beforeEach(() => {
      effect = new BloomEffect();
    });

    it('creates with default params', () => {
      expect(effect).toBeDefined();
      expect(effect.type).toBe('bloom');
    });

    it('accepts custom params', () => {
      const e = new BloomEffect({ threshold: 0.5, intensity: 2.0 });
      expect(e.getParams().threshold).toBe(0.5);
    });

    it('enabled getter/setter', () => {
      expect(effect.enabled).toBe(true);
      effect.enabled = false;
      expect(effect.enabled).toBe(false);
    });

    it('intensity getter/setter', () => {
      effect.intensity = 0.75;
      expect(effect.intensity).toBe(0.75);
    });

    it('setParams updates params', () => {
      effect.setParams({ threshold: 0.8 });
      expect(effect.getParams().threshold).toBe(0.8);
    });

    it('initialized returns false before init', () => {
      expect(effect.initialized).toBe(false);
    });
  });

  // ===========================================================================
  // ToneMapEffect
  // ===========================================================================
  describe('ToneMapEffect', () => {
    it('creates with type tonemap', () => {
      const effect = new ToneMapEffect();
      expect(effect.type).toBe('tonemap');
    });

    it('accepts custom params', () => {
      const effect = new ToneMapEffect({ exposure: 2.0 });
      expect(effect.getParams().exposure).toBe(2.0);
    });

    it('enabled defaults to true', () => {
      expect(new ToneMapEffect().enabled).toBe(true);
    });
  });

  // ===========================================================================
  // FXAAEffect
  // ===========================================================================
  describe('FXAAEffect', () => {
    it('creates with type fxaa', () => {
      const effect = new FXAAEffect();
      expect(effect.type).toBe('fxaa');
    });

    it('getParams returns params', () => {
      const effect = new FXAAEffect();
      expect(effect.getParams()).toBeDefined();
    });
  });

  // ===========================================================================
  // VignetteEffect
  // ===========================================================================
  describe('VignetteEffect', () => {
    it('creates with type vignette', () => {
      const effect = new VignetteEffect();
      expect(effect.type).toBe('vignette');
    });

    it('accepts custom strength', () => {
      const effect = new VignetteEffect({ intensity: 0.8 });
      expect(effect.getParams().intensity).toBe(0.8);
    });
  });

  // ===========================================================================
  // SharpenEffect
  // ===========================================================================
  describe('SharpenEffect', () => {
    it('creates with type sharpen', () => {
      const effect = new SharpenEffect();
      expect(effect.type).toBe('sharpen');
    });
  });

  // ===========================================================================
  // ChromaticAberrationEffect
  // ===========================================================================
  describe('ChromaticAberrationEffect', () => {
    it('creates with type chromaticAberration', () => {
      const effect = new ChromaticAberrationEffect();
      expect(effect.type).toBe('chromaticAberration');
    });

    it('enabled toggle works', () => {
      const effect = new ChromaticAberrationEffect();
      effect.enabled = false;
      expect(effect.enabled).toBe(false);
    });
  });

  // ===========================================================================
  // FilmGrainEffect
  // ===========================================================================
  describe('FilmGrainEffect', () => {
    it('creates with type filmGrain', () => {
      const effect = new FilmGrainEffect();
      expect(effect.type).toBe('filmGrain');
    });
  });

  // ===========================================================================
  // CausticsEffect
  // ===========================================================================
  describe('CausticsEffect', () => {
    it('creates with type caustics', () => {
      const effect = new CausticsEffect();
      expect(effect.type).toBe('caustics');
    });
  });

  // ===========================================================================
  // SSREffect
  // ===========================================================================
  describe('SSREffect', () => {
    it('creates with type ssr', () => {
      const effect = new SSREffect();
      expect(effect.type).toBe('ssr');
    });
  });

  // ===========================================================================
  // SSAOEffect
  // ===========================================================================
  describe('SSAOEffect', () => {
    it('creates with type ssao', () => {
      const effect = new SSAOEffect();
      expect(effect.type).toBe('ssao');
    });
  });

  // ===========================================================================
  // SSGIEffect
  // ===========================================================================
  describe('SSGIEffect', () => {
    it('creates with type ssgi', () => {
      const effect = new SSGIEffect();
      expect(effect.type).toBe('ssgi');
    });
  });

  // ===========================================================================
  // Shared Behavior
  // ===========================================================================
  describe('shared PostProcessEffect behavior', () => {
    const effects = [
      { name: 'BloomEffect', factory: () => new BloomEffect() },
      { name: 'ToneMapEffect', factory: () => new ToneMapEffect() },
      { name: 'FXAAEffect', factory: () => new FXAAEffect() },
      { name: 'VignetteEffect', factory: () => new VignetteEffect() },
      { name: 'SharpenEffect', factory: () => new SharpenEffect() },
      { name: 'ChromaticAberrationEffect', factory: () => new ChromaticAberrationEffect() },
      { name: 'FilmGrainEffect', factory: () => new FilmGrainEffect() },
      { name: 'CausticsEffect', factory: () => new CausticsEffect() },
      { name: 'SSREffect', factory: () => new SSREffect() },
      { name: 'SSAOEffect', factory: () => new SSAOEffect() },
      { name: 'SSGIEffect', factory: () => new SSGIEffect() },
    ];

    effects.forEach(({ name, factory }) => {
      it(`${name} has name property`, () => {
        const e = factory();
        expect(typeof e.name).toBe('string');
        expect(e.name.length).toBeGreaterThan(0);
      });

      it(`${name} has type property`, () => {
        const e = factory();
        expect(typeof e.type).toBe('string');
      });

      it(`${name} getParams returns object`, () => {
        const e = factory();
        expect(typeof e.getParams()).toBe('object');
      });

      it(`${name} dispose does not throw`, () => {
        const e = factory();
        expect(() => e.dispose()).not.toThrow();
      });
    });
  });
});
