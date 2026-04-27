/**
 * Smoke tests for the platforms public barrel.
 * These verify re-exported symbols are present and callable —
 * the heavy logic is tested in compiler/platform/* tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock RBAC (required by compiler internals)
vi.mock('../../security/rbac.js', () => ({
  checkPermission: vi.fn().mockResolvedValue(true),
}));

// Mock heavy compiler internals to avoid loading full parser chain
vi.mock('../../compiler/HoloScriptCompiler.js', () => ({
  HoloScriptCompiler: vi.fn().mockImplementation(() => ({})),
}));

describe('platforms barrel re-exports', () => {
  describe('conditional-modality symbols', () => {
    it('exports PLATFORM_CATEGORIES', async () => {
      const { PLATFORM_CATEGORIES } = await import('../conditional-modality.js');
      expect(PLATFORM_CATEGORIES).toBeDefined();
      expect(typeof PLATFORM_CATEGORIES).toBe('object');
    });

    it('exports ALL_PLATFORMS', async () => {
      const { ALL_PLATFORMS } = await import('../conditional-modality.js');
      expect(ALL_PLATFORMS).toBeDefined();
      expect(Array.isArray(ALL_PLATFORMS)).toBe(true);
    });

    it('exports platformCategory as a function', async () => {
      const { platformCategory } = await import('../conditional-modality.js');
      expect(typeof platformCategory).toBe('function');
    });

    it('exports embodimentFor as a function', async () => {
      const { embodimentFor } = await import('../conditional-modality.js');
      expect(typeof embodimentFor).toBe('function');
    });

    it('exports hasCapability as a function', async () => {
      const { hasCapability } = await import('../conditional-modality.js');
      expect(typeof hasCapability).toBe('function');
    });

    it('exports resolvePlatforms as a function', async () => {
      const { resolvePlatforms } = await import('../conditional-modality.js');
      expect(typeof resolvePlatforms).toBe('function');
    });

    it('exports matchesPlatform as a function', async () => {
      const { matchesPlatform } = await import('../conditional-modality.js');
      expect(typeof matchesPlatform).toBe('function');
    });

    it('exports selectBlock as a function', async () => {
      const { selectBlock } = await import('../conditional-modality.js');
      expect(typeof selectBlock).toBe('function');
    });

    it('exports selectModality as a function', async () => {
      const { selectModality } = await import('../conditional-modality.js');
      expect(typeof selectModality).toBe('function');
    });

    it('exports selectModalityForAll as a function', async () => {
      const { selectModalityForAll } = await import('../conditional-modality.js');
      expect(typeof selectModalityForAll).toBe('function');
    });

    it('exports bestCategoryForTraits as a function', async () => {
      const { bestCategoryForTraits } = await import('../conditional-modality.js');
      expect(typeof bestCategoryForTraits).toBe('function');
    });

    it('exports PlatformConditionalCompilerMixin as a function', async () => {
      const { PlatformConditionalCompilerMixin } = await import('../conditional-modality.js');
      expect(typeof PlatformConditionalCompilerMixin).toBe('function');
    });

    it('exports matchesPlatformConstraint as a function', async () => {
      const { matchesPlatformConstraint } = await import('../conditional-modality.js');
      expect(typeof matchesPlatformConstraint).toBe('function');
    });

    it('exports createPlatformTarget as a function', async () => {
      const { createPlatformTarget } = await import('../conditional-modality.js');
      expect(typeof createPlatformTarget).toBe('function');
    });

    it('exports PlatformConditionalCompiler as a function/class', async () => {
      const { PlatformConditionalCompiler } = await import('../conditional-modality.js');
      expect(typeof PlatformConditionalCompiler).toBe('function');
    });

    it('exports createPlatformConditionalCompiler as a function', async () => {
      const { createPlatformConditionalCompiler } = await import('../conditional-modality.js');
      expect(typeof createPlatformConditionalCompiler).toBe('function');
    });
  });

  describe('cross-reality symbols', () => {
    it('exports CrossRealityTraitRegistry as a function/class', async () => {
      const { CrossRealityTraitRegistry } = await import('../cross-reality.js');
      expect(typeof CrossRealityTraitRegistry).toBe('function');
    });

    it('exports getCrossRealityTraitRegistry as a function', async () => {
      const { getCrossRealityTraitRegistry } = await import('../cross-reality.js');
      expect(typeof getCrossRealityTraitRegistry).toBe('function');
    });

    it('exports resetCrossRealityTraitRegistry as a function', async () => {
      const { resetCrossRealityTraitRegistry } = await import('../cross-reality.js');
      expect(typeof resetCrossRealityTraitRegistry).toBe('function');
    });

    it('exports createCrossRealityTraitRegistry as a function', async () => {
      const { createCrossRealityTraitRegistry } = await import('../cross-reality.js');
      expect(typeof createCrossRealityTraitRegistry).toBe('function');
    });

    it('exports CATEGORY_DEFAULT_EMBODIMENT as an object', async () => {
      const { CATEGORY_DEFAULT_EMBODIMENT } = await import('../cross-reality.js');
      expect(CATEGORY_DEFAULT_EMBODIMENT).toBeDefined();
      expect(typeof CATEGORY_DEFAULT_EMBODIMENT).toBe('object');
    });

    it('exports PLATFORM_EMBODIMENT_OVERRIDES as an object', async () => {
      const { PLATFORM_EMBODIMENT_OVERRIDES } = await import('../cross-reality.js');
      expect(PLATFORM_EMBODIMENT_OVERRIDES).toBeDefined();
      expect(typeof PLATFORM_EMBODIMENT_OVERRIDES).toBe('object');
    });

    it('exports HANDOFF_PATH_RULES as an object', async () => {
      const { HANDOFF_PATH_RULES } = await import('../cross-reality.js');
      expect(HANDOFF_PATH_RULES).toBeDefined();
      expect(typeof HANDOFF_PATH_RULES).toBe('object');
    });

    it('exports MVC_BUDGET_CONSTRAINTS as an object', async () => {
      const { MVC_BUDGET_CONSTRAINTS } = await import('../cross-reality.js');
      expect(MVC_BUDGET_CONSTRAINTS).toBeDefined();
      expect(typeof MVC_BUDGET_CONSTRAINTS).toBe('object');
    });
  });

  describe('platforms/index.ts re-exports all symbols', () => {
    it('platforms index includes platformCategory', async () => {
      const platforms = await import('../index.js');
      expect(typeof platforms.platformCategory).toBe('function');
    });

    it('platforms index includes getCrossRealityTraitRegistry', async () => {
      const platforms = await import('../index.js');
      expect(typeof platforms.getCrossRealityTraitRegistry).toBe('function');
    });

    it('platforms index includes ALL_PLATFORMS', async () => {
      const platforms = await import('../index.js');
      expect(Array.isArray(platforms.ALL_PLATFORMS)).toBe(true);
    });

    it('platforms index includes CrossRealityTraitRegistry', async () => {
      const platforms = await import('../index.js');
      expect(typeof platforms.CrossRealityTraitRegistry).toBe('function');
    });
  });
});
