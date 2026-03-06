/**
 * @fileoverview Tests for @platform() Conditional Compilation
 */

import { describe, it, expect } from 'vitest';
import {
  resolvePlatforms, matchesPlatform, selectBlock, eliminateDeadCode,
  embodimentFor, agentBudgetFor, hasCapability, platformCategory,
  PLATFORM_CATEGORIES, ALL_PLATFORMS, PLATFORM_CAPABILITIES,
  PlatformBlock,
} from '../PlatformConditional';

describe('PlatformConditional', () => {
  // ── Platform Categories ──────────────────────────────────────────────────

  describe('Platform Categories', () => {
    it('defines 6 categories', () => {
      expect(Object.keys(PLATFORM_CATEGORIES)).toHaveLength(6);
    });

    it('has 17+ platform targets across all categories', () => {
      expect(ALL_PLATFORMS.length).toBeGreaterThanOrEqual(17);
    });

    it('VR includes quest3, pcvr, visionos, android-xr', () => {
      expect(PLATFORM_CATEGORIES.vr).toContain('quest3');
      expect(PLATFORM_CATEGORIES.vr).toContain('visionos');
      expect(PLATFORM_CATEGORIES.vr).toContain('android-xr');
    });

    it('automotive includes android-auto, carplay', () => {
      expect(PLATFORM_CATEGORIES.automotive).toContain('android-auto');
      expect(PLATFORM_CATEGORIES.automotive).toContain('carplay');
    });

    it('platformCategory returns correct category', () => {
      expect(platformCategory('quest3')).toBe('vr');
      expect(platformCategory('ios')).toBe('mobile');
      expect(platformCategory('android-auto')).toBe('automotive');
      expect(platformCategory('watchos')).toBe('wearable');
    });
  });

  // ── Capabilities ─────────────────────────────────────────────────────────

  describe('Capabilities', () => {
    it('quest3 has spatial tracking and hand tracking', () => {
      expect(hasCapability('quest3', 'spatialTracking')).toBe(true);
      expect(hasCapability('quest3', 'handTracking')).toBe(true);
    });

    it('phone does not have spatial tracking', () => {
      expect(hasCapability('ios', 'spatialTracking')).toBe(false);
      expect(hasCapability('android', 'spatialTracking')).toBe(false);
    });

    it('automotive has safety-critical compute model', () => {
      expect(PLATFORM_CAPABILITIES['android-auto'].computeModel).toBe('safety-critical');
      expect(PLATFORM_CAPABILITIES['carplay'].computeModel).toBe('safety-critical');
    });

    it('VR has 11.1ms frame budget (90Hz)', () => {
      expect(PLATFORM_CAPABILITIES['quest3'].frameBudgetMs).toBe(11.1);
      expect(PLATFORM_CAPABILITIES['pcvr'].frameBudgetMs).toBe(11.1);
    });

    it('latency budgets span 20x (5ms VR to 200ms desktop)', () => {
      const min = PLATFORM_CAPABILITIES['quest3'].agentBudgetMs;
      const max = PLATFORM_CAPABILITIES['windows'].agentBudgetMs;
      expect(max / min).toBe(40); // Actually 40x with these values
    });
  });

  // ── Condition Resolution ─────────────────────────────────────────────────

  describe('resolvePlatforms', () => {
    it('includes specific platforms', () => {
      const result = resolvePlatforms({ include: ['quest3', 'ios'] });
      expect(result).toEqual(['quest3', 'ios']);
    });

    it('includes entire categories', () => {
      const result = resolvePlatforms({ includeCategories: ['vr'] });
      expect(result).toEqual(expect.arrayContaining(['quest3', 'pcvr', 'visionos', 'android-xr']));
      expect(result).toHaveLength(4);
    });

    it('excludes specific platforms', () => {
      const result = resolvePlatforms({ includeCategories: ['vr'], exclude: ['visionos'] });
      expect(result).not.toContain('visionos');
      expect(result).toHaveLength(3);
    });

    it('filters by required capability', () => {
      const result = resolvePlatforms({ requireCapabilities: ['handTracking'] });
      expect(result).toContain('quest3');
      expect(result).toContain('visionos');
      expect(result).not.toContain('ios');
      expect(result).not.toContain('windows');
    });

    it('empty condition matches all platforms', () => {
      const result = resolvePlatforms({});
      expect(result.length).toBe(ALL_PLATFORMS.length);
    });

    it('GPS-capable platforms include mobile and automotive', () => {
      const result = resolvePlatforms({ requireCapabilities: ['gps'] });
      expect(result).toContain('android');
      expect(result).toContain('ios');
      expect(result).toContain('android-auto');
    });
  });

  // ── matchesPlatform ──────────────────────────────────────────────────────

  describe('matchesPlatform', () => {
    it('quest3 matches VR category', () => {
      expect(matchesPlatform('quest3', { includeCategories: ['vr'] })).toBe(true);
    });

    it('ios does not match VR category', () => {
      expect(matchesPlatform('ios', { includeCategories: ['vr'] })).toBe(false);
    });

    it('excluded platform does not match', () => {
      expect(matchesPlatform('visionos', { includeCategories: ['vr'], exclude: ['visionos'] })).toBe(false);
    });
  });

  // ── Block Selection ──────────────────────────────────────────────────────

  describe('selectBlock', () => {
    it('selects first matching block', () => {
      const blocks: PlatformBlock<string>[] = [
        { condition: { includeCategories: ['vr'] }, body: 'Avatar3D' },
        { condition: { includeCategories: ['ar'] }, body: 'SpatialPersona' },
        { condition: { includeCategories: ['mobile'] }, body: 'UI2D' },
      ];
      expect(selectBlock('quest3', blocks)).toBe('Avatar3D');
      expect(selectBlock('ios', blocks)).toBe('UI2D');
      expect(selectBlock('webxr', blocks)).toBe('SpatialPersona');
    });

    it('returns undefined when no match', () => {
      const blocks: PlatformBlock<string>[] = [
        { condition: { include: ['quest3'] }, body: 'only-quest' },
      ];
      expect(selectBlock('ios', blocks)).toBeUndefined();
    });
  });

  // ── Dead Code Elimination ────────────────────────────────────────────────

  describe('eliminateDeadCode', () => {
    it('keeps only matching blocks', () => {
      const blocks: PlatformBlock<string>[] = [
        { condition: { includeCategories: ['vr'] }, body: 'VR code' },
        { condition: { includeCategories: ['mobile'] }, body: 'Mobile code' },
        { condition: { includeCategories: ['desktop'] }, body: 'Desktop code' },
      ];
      const result = eliminateDeadCode('quest3', blocks);
      expect(result).toEqual(['VR code']);
    });
  });

  // ── Embodiment ───────────────────────────────────────────────────────────

  describe('embodimentFor', () => {
    it('VR gets Avatar3D', () => {
      expect(embodimentFor('quest3')).toBe('Avatar3D');
      expect(embodimentFor('pcvr')).toBe('Avatar3D');
    });

    it('AR gets SpatialPersona', () => {
      expect(embodimentFor('webxr')).toBe('SpatialPersona');
    });

    it('automotive gets VoiceHUD', () => {
      expect(embodimentFor('android-auto')).toBe('VoiceHUD');
    });

    it('desktop gets FullGUI', () => {
      expect(embodimentFor('windows')).toBe('FullGUI');
    });
  });

  // ── Agent Budget ─────────────────────────────────────────────────────────

  describe('agentBudgetFor', () => {
    it('VR has 5ms budget', () => {
      expect(agentBudgetFor('quest3')).toBe(5);
    });

    it('desktop has 200ms budget', () => {
      expect(agentBudgetFor('windows')).toBe(200);
    });

    it('automotive has 15ms budget', () => {
      expect(agentBudgetFor('android-auto')).toBe(15);
    });
  });
});
