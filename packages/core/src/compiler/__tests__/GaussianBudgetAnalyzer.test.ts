/**
 * GaussianBudgetAnalyzer Test Suite
 *
 * Tests for the Gaussian primitive budget analyzer that checks compositions
 * against platform-specific budgets (W.034):
 *   - Quest 3:    180,000 Gaussians
 *   - Desktop VR: 2,000,000 Gaussians
 *   - WebGPU:     500,000 Gaussians
 *   - Mobile AR:  100,000 Gaussians
 *   - visionOS:   1,000,000 Gaussians
 *
 * Also tests ExportManager integration (warnings populated in ExportResult).
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  GaussianBudgetAnalyzer,
  GAUSSIAN_PLATFORM_BUDGETS,
  analyzeGaussianBudget,
  type GaussianPlatform,
  type GaussianBudgetAnalysis,
  type GaussianBudgetWarning,
} from '../GaussianBudgetAnalyzer';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

// =============================================================================
// HELPERS
// =============================================================================

/** Create a minimal HoloComposition with no gaussian_splat traits */
function createEmptyComposition(name = 'EmptyScene'): HoloComposition {
  return {
    type: 'Composition',
    name,
    templates: [],
    objects: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
  };
}

/** Create an object with a gaussian_splat trait */
function createGaussianSplatObject(
  name: string,
  maxSplats: number,
  source = 'scene.ply'
): HoloObjectDecl {
  return {
    type: 'ObjectDecl',
    name,
    objectType: 'object',
    properties: [],
    traits: [
      {
        type: 'Trait',
        name: 'gaussian_splat',
        config: {
          src: source,
          max_splats: maxSplats,
        } as any,
      },
    ],
    children: [],
    handlers: [],
  };
}

/** Create a composition with gaussian_splat objects */
function createGaussianComposition(
  name: string,
  splatObjects: Array<{ name: string; maxSplats: number; source?: string }>
): HoloComposition {
  const comp = createEmptyComposition(name);
  comp.objects = splatObjects.map((o) => createGaussianSplatObject(o.name, o.maxSplats, o.source));
  return comp;
}

// =============================================================================
// TESTS
// =============================================================================

describe('GaussianBudgetAnalyzer', () => {
  // ---------------------------------------------------------------------------
  // Platform Budget Constants
  // ---------------------------------------------------------------------------

  describe('Platform Budget Constants', () => {
    it('should define Quest 3 budget at 180,000 Gaussians', () => {
      expect(GAUSSIAN_PLATFORM_BUDGETS.quest3.maxGaussians).toBe(180_000);
      expect(GAUSSIAN_PLATFORM_BUDGETS.quest3.targetFps).toBe(72);
    });

    it('should define Desktop VR budget at 2,000,000 Gaussians', () => {
      expect(GAUSSIAN_PLATFORM_BUDGETS.desktop_vr.maxGaussians).toBe(2_000_000);
      expect(GAUSSIAN_PLATFORM_BUDGETS.desktop_vr.targetFps).toBe(90);
    });

    it('should define WebGPU budget at 500,000 Gaussians', () => {
      expect(GAUSSIAN_PLATFORM_BUDGETS.webgpu.maxGaussians).toBe(500_000);
      expect(GAUSSIAN_PLATFORM_BUDGETS.webgpu.targetFps).toBe(60);
    });

    it('should define Mobile AR budget at 100,000 Gaussians', () => {
      expect(GAUSSIAN_PLATFORM_BUDGETS.mobile_ar.maxGaussians).toBe(100_000);
      expect(GAUSSIAN_PLATFORM_BUDGETS.mobile_ar.targetFps).toBe(30);
    });

    it('should define visionOS budget at 1,000,000 Gaussians', () => {
      expect(GAUSSIAN_PLATFORM_BUDGETS.visionos.maxGaussians).toBe(1_000_000);
      expect(GAUSSIAN_PLATFORM_BUDGETS.visionos.targetFps).toBe(90);
    });

    it('should set warning threshold to 80% for all platforms', () => {
      for (const platform of Object.keys(GAUSSIAN_PLATFORM_BUDGETS) as GaussianPlatform[]) {
        expect(GAUSSIAN_PLATFORM_BUDGETS[platform].warningThreshold).toBe(0.8);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Empty / No Gaussians
  // ---------------------------------------------------------------------------

  describe('Empty Composition (no gaussian_splat traits)', () => {
    it('should report zero Gaussians and no warnings', () => {
      const analyzer = new GaussianBudgetAnalyzer();
      const result = analyzer.analyze(createEmptyComposition());

      expect(result.totalGaussians).toBe(0);
      expect(result.sources).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.withinBudget).toBe(true);
    });

    it('should report zero utilization for all platforms', () => {
      const analyzer = new GaussianBudgetAnalyzer();
      const result = analyzer.analyze(createEmptyComposition());

      for (const platform of Object.keys(result.platformUtilization) as GaussianPlatform[]) {
        expect(result.platformUtilization[platform]).toBe(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Under Budget (no warnings)
  // ---------------------------------------------------------------------------

  describe('Under Budget (well within limits)', () => {
    it('should report no warnings for 50K Gaussians on all platforms', () => {
      const comp = createGaussianComposition('SmallScene', [{ name: 'avatar', maxSplats: 50_000 }]);
      const analyzer = new GaussianBudgetAnalyzer();
      const result = analyzer.analyze(comp);

      expect(result.totalGaussians).toBe(50_000);
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].objectName).toBe('avatar');
      expect(result.sources[0].maxSplats).toBe(50_000);
      expect(result.withinBudget).toBe(true);

      // No warning/critical for any platform since 50K is well under 80% of smallest (100K)
      const nonInfoWarnings = result.warnings.filter((w) => w.severity !== 'info');
      expect(nonInfoWarnings).toHaveLength(0);
    });

    it('should track multiple Gaussian sources correctly', () => {
      const comp = createGaussianComposition('MultiObject', [
        { name: 'avatar1', maxSplats: 20_000, source: 'avatar1.ply' },
        { name: 'avatar2', maxSplats: 30_000, source: 'avatar2.ply' },
      ]);
      const analyzer = new GaussianBudgetAnalyzer();
      const result = analyzer.analyze(comp);

      expect(result.totalGaussians).toBe(50_000);
      expect(result.sources).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Warning Threshold (approaching budget, 80%+)
  // ---------------------------------------------------------------------------

  describe('Warning Threshold (80%+ utilization)', () => {
    it('should emit warning for Quest 3 at 150K Gaussians (83% of 180K)', () => {
      const comp = createGaussianComposition('NearBudgetScene', [
        { name: 'scene', maxSplats: 150_000 },
      ]);
      const analyzer = new GaussianBudgetAnalyzer({ platforms: ['quest3'] });
      const result = analyzer.analyze(comp);

      expect(result.totalGaussians).toBe(150_000);
      expect(result.warnings).toHaveLength(1);

      const warning = result.warnings[0];
      expect(warning.severity).toBe('warning');
      expect(warning.platform).toBe('quest3');
      expect(warning.utilizationPercent).toBeGreaterThanOrEqual(80);
      expect(warning.overage).toBe(0);
      expect(warning.budgetLimit).toBe(180_000);
    });

    it('should emit warning for WebGPU at 420K Gaussians (84% of 500K)', () => {
      const comp = createGaussianComposition('WebScene', [
        { name: 'environment', maxSplats: 420_000 },
      ]);
      const analyzer = new GaussianBudgetAnalyzer({ platforms: ['webgpu'] });
      const result = analyzer.analyze(comp);

      const warning = result.warnings[0];
      expect(warning.severity).toBe('warning');
      expect(warning.platform).toBe('webgpu');
      expect(warning.utilizationPercent).toBeGreaterThanOrEqual(80);
    });

    it('should NOT emit warning at 79% utilization', () => {
      // 79% of 180K = 142,200
      const comp = createGaussianComposition('JustUnder', [{ name: 'scene', maxSplats: 142_000 }]);
      const analyzer = new GaussianBudgetAnalyzer({ platforms: ['quest3'] });
      const result = analyzer.analyze(comp);

      // Should have no warnings (below 80%)
      const warnings = result.warnings.filter(
        (w) => w.severity === 'warning' || w.severity === 'critical'
      );
      expect(warnings).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Critical (over budget)
  // ---------------------------------------------------------------------------

  describe('Critical (over budget)', () => {
    it('should emit critical warning for Quest 3 at 250K Gaussians', () => {
      const comp = createGaussianComposition('OverBudgetScene', [
        { name: 'heavy_scene', maxSplats: 250_000 },
      ]);
      const analyzer = new GaussianBudgetAnalyzer({ platforms: ['quest3'] });
      const result = analyzer.analyze(comp);

      expect(result.withinBudget).toBe(false);
      expect(result.warnings).toHaveLength(1);

      const warning = result.warnings[0];
      expect(warning.severity).toBe('critical');
      expect(warning.platform).toBe('quest3');
      expect(warning.totalGaussians).toBe(250_000);
      expect(warning.budgetLimit).toBe(180_000);
      expect(warning.overage).toBe(70_000);
      expect(warning.utilizationPercent).toBeGreaterThan(100);
      expect(warning.message).toContain('exceeds');
      expect(warning.suggestion).toBeTruthy();
    });

    it('should emit critical for Mobile AR at 150K (budget is 100K)', () => {
      const comp = createGaussianComposition('ARScene', [{ name: 'ar_model', maxSplats: 150_000 }]);
      const analyzer = new GaussianBudgetAnalyzer({ platforms: ['mobile_ar'] });
      const result = analyzer.analyze(comp);

      expect(result.withinBudget).toBe(false);
      const warning = result.warnings[0];
      expect(warning.severity).toBe('critical');
      expect(warning.overage).toBe(50_000);
    });

    it('should be within budget for Desktop VR at 1.5M (budget is 2M)', () => {
      const comp = createGaussianComposition('DesktopScene', [
        { name: 'world', maxSplats: 1_500_000 },
      ]);
      const analyzer = new GaussianBudgetAnalyzer({ platforms: ['desktop_vr'] });
      const result = analyzer.analyze(comp);

      expect(result.withinBudget).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-platform warnings
  // ---------------------------------------------------------------------------

  describe('Multi-platform analysis', () => {
    it('should emit warnings for Quest 3 and Mobile AR but not Desktop VR for 200K Gaussians', () => {
      const comp = createGaussianComposition('CrossPlatform', [
        { name: 'scene', maxSplats: 200_000 },
      ]);
      const analyzer = new GaussianBudgetAnalyzer({
        platforms: ['quest3', 'desktop_vr', 'mobile_ar'],
      });
      const result = analyzer.analyze(comp);

      // Quest 3: 200K > 180K = critical
      // Desktop VR: 200K / 2M = 10% = no warning
      // Mobile AR: 200K > 100K = critical
      const criticals = result.warnings.filter((w) => w.severity === 'critical');
      expect(criticals.length).toBe(2);
      expect(criticals.map((w) => w.platform)).toContain('quest3');
      expect(criticals.map((w) => w.platform)).toContain('mobile_ar');
    });

    it('should check all 5 platforms by default', () => {
      const comp = createGaussianComposition('AllPlatforms', [
        { name: 'scene', maxSplats: 50_000 },
      ]);
      const analyzer = new GaussianBudgetAnalyzer();
      const result = analyzer.analyze(comp);

      // All 5 platforms should have utilization entries
      expect(Object.keys(result.platformUtilization)).toHaveLength(5);
      expect(result.platformUtilization.quest3).toBeDefined();
      expect(result.platformUtilization.desktop_vr).toBeDefined();
      expect(result.platformUtilization.webgpu).toBeDefined();
      expect(result.platformUtilization.mobile_ar).toBeDefined();
      expect(result.platformUtilization.visionos).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Budget Overrides
  // ---------------------------------------------------------------------------

  describe('Budget Overrides', () => {
    it('should use custom budget override instead of default', () => {
      const comp = createGaussianComposition('CustomBudget', [
        { name: 'scene', maxSplats: 100_000 },
      ]);
      // Override Quest 3 budget to 50K (much stricter)
      const analyzer = new GaussianBudgetAnalyzer({
        platforms: ['quest3'],
        budgetOverrides: { quest3: 50_000 },
      });
      const result = analyzer.analyze(comp);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].severity).toBe('critical');
      expect(result.warnings[0].budgetLimit).toBe(50_000);
      expect(result.warnings[0].overage).toBe(50_000);
    });

    it('should only override specified platform, not others', () => {
      const comp = createGaussianComposition('PartialOverride', [
        { name: 'scene', maxSplats: 160_000 },
      ]);
      const analyzer = new GaussianBudgetAnalyzer({
        platforms: ['quest3', 'webgpu'],
        budgetOverrides: { quest3: 200_000 }, // More lenient Quest 3
      });
      const result = analyzer.analyze(comp);

      // Quest 3 with override: 160K / 200K = 80% => warning threshold
      // WebGPU: 160K / 500K = 32% => no warning
      const quest3Warning = result.warnings.find((w) => w.platform === 'quest3');
      const webgpuWarning = result.warnings.find((w) => w.platform === 'webgpu');
      expect(quest3Warning?.severity).toBe('warning');
      expect(quest3Warning?.budgetLimit).toBe(200_000);
      expect(webgpuWarning).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // isWithinBudget convenience method
  // ---------------------------------------------------------------------------

  describe('isWithinBudget()', () => {
    it('should return true when under budget', () => {
      const comp = createGaussianComposition('Small', [{ name: 'obj', maxSplats: 100_000 }]);
      const analyzer = new GaussianBudgetAnalyzer();
      expect(analyzer.isWithinBudget(comp, 'desktop_vr')).toBe(true);
    });

    it('should return false when over budget', () => {
      const comp = createGaussianComposition('Big', [{ name: 'obj', maxSplats: 200_000 }]);
      const analyzer = new GaussianBudgetAnalyzer();
      expect(analyzer.isWithinBudget(comp, 'quest3')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Standalone function
  // ---------------------------------------------------------------------------

  describe('analyzeGaussianBudget() standalone function', () => {
    it('should analyze without requiring class instantiation', () => {
      const comp = createGaussianComposition('Standalone', [{ name: 'scene', maxSplats: 300_000 }]);
      const result = analyzeGaussianBudget(comp, ['quest3']);

      expect(result.totalGaussians).toBe(300_000);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].severity).toBe('critical');
    });

    it('should check all platforms when none specified', () => {
      const comp = createGaussianComposition('AllPlatforms', [
        { name: 'scene', maxSplats: 50_000 },
      ]);
      const result = analyzeGaussianBudget(comp);
      expect(Object.keys(result.platformUtilization)).toHaveLength(5);
    });
  });

  // ---------------------------------------------------------------------------
  // formatAsComments
  // ---------------------------------------------------------------------------

  describe('formatAsComments()', () => {
    it('should format warnings as code comments', () => {
      const comp = createGaussianComposition('CommentTest', [
        { name: 'scene', maxSplats: 250_000 },
      ]);
      const analyzer = new GaussianBudgetAnalyzer({ platforms: ['quest3'] });
      const analysis = analyzer.analyze(comp);
      const comments = analyzer.formatAsComments(analysis);

      expect(comments.length).toBeGreaterThan(0);
      expect(comments[0]).toContain('//');
      expect(comments.some((c) => c.includes('GAUSSIAN SPLAT BUDGET ANALYSIS'))).toBe(true);
      expect(comments.some((c) => c.includes('ERROR'))).toBe(true);
    });

    it('should support custom comment prefix', () => {
      const comp = createGaussianComposition('HashComments', [
        { name: 'scene', maxSplats: 250_000 },
      ]);
      const analyzer = new GaussianBudgetAnalyzer({ platforms: ['quest3'] });
      const analysis = analyzer.analyze(comp);
      const comments = analyzer.formatAsComments(analysis, '#');

      expect(comments[0]).toContain('#');
    });

    it('should return empty array when no warnings', () => {
      const comp = createGaussianComposition('NoWarnings', [{ name: 'scene', maxSplats: 10_000 }]);
      const analyzer = new GaussianBudgetAnalyzer({ platforms: ['desktop_vr'] });
      const analysis = analyzer.analyze(comp);
      const comments = analyzer.formatAsComments(analysis);

      expect(comments).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Include Info Messages
  // ---------------------------------------------------------------------------

  describe('includeInfoMessages', () => {
    it('should include info-level messages when enabled', () => {
      const comp = createGaussianComposition('InfoScene', [{ name: 'obj', maxSplats: 10_000 }]);
      const analyzer = new GaussianBudgetAnalyzer({
        platforms: ['desktop_vr'],
        includeInfoMessages: true,
      });
      const result = analyzer.analyze(comp);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].severity).toBe('info');
      expect(result.warnings[0].message).toContain('within');
    });

    it('should not include info messages by default', () => {
      const comp = createGaussianComposition('NoInfoScene', [{ name: 'obj', maxSplats: 10_000 }]);
      const analyzer = new GaussianBudgetAnalyzer({
        platforms: ['desktop_vr'],
      });
      const result = analyzer.analyze(comp);

      expect(result.warnings).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // AST Walking: Spatial Groups, Children, Conditionals, Iterators
  // ---------------------------------------------------------------------------

  describe('AST Walking (nested structures)', () => {
    it('should find gaussian_splat traits in spatial groups', () => {
      const comp = createEmptyComposition('GroupScene');
      comp.spatialGroups = [
        {
          type: 'SpatialGroup',
          name: 'room',
          properties: [],
          objects: [createGaussianSplatObject('wall_splats', 100_000)],
        },
      ];
      const analyzer = new GaussianBudgetAnalyzer({ platforms: ['quest3'] });
      const result = analyzer.analyze(comp);

      expect(result.totalGaussians).toBe(100_000);
      expect(result.sources).toHaveLength(1);
    });

    it('should find gaussian_splat traits in child objects', () => {
      const comp = createEmptyComposition('ChildScene');
      const parentObj = createGaussianSplatObject('parent', 50_000);
      parentObj.children = [createGaussianSplatObject('child', 30_000)];
      comp.objects = [parentObj];

      const analyzer = new GaussianBudgetAnalyzer({ platforms: ['quest3'] });
      const result = analyzer.analyze(comp);

      expect(result.totalGaussians).toBe(80_000);
      expect(result.sources).toHaveLength(2);
    });

    it('should find gaussian_splat traits in conditional blocks', () => {
      const comp = createEmptyComposition('ConditionalScene');
      comp.conditionals = [
        {
          type: 'ConditionalBlock',
          condition: 'true',
          objects: [createGaussianSplatObject('if_branch', 120_000)],
          elseObjects: [createGaussianSplatObject('else_branch', 80_000)],
        } as any,
      ];

      const analyzer = new GaussianBudgetAnalyzer({ platforms: ['quest3'] });
      const result = analyzer.analyze(comp);

      // Both branches counted (worst case)
      expect(result.totalGaussians).toBe(200_000);
    });

    it('should find gaussian_splat traits in iterator blocks', () => {
      const comp = createEmptyComposition('IteratorScene');
      comp.iterators = [
        {
          type: 'ForEachBlock',
          iterator: 'items',
          variable: 'item',
          objects: [createGaussianSplatObject('iterated_splat', 60_000)],
        } as any,
      ];

      const analyzer = new GaussianBudgetAnalyzer({ platforms: ['quest3'] });
      const result = analyzer.analyze(comp);

      expect(result.totalGaussians).toBe(60_000);
    });
  });

  // ---------------------------------------------------------------------------
  // Default max_splats
  // ---------------------------------------------------------------------------

  describe('Default max_splats', () => {
    it('should use 1,000,000 default when max_splats not specified', () => {
      const comp = createEmptyComposition('DefaultSplats');
      comp.objects = [
        {
          type: 'ObjectDecl',
          name: 'no_max_specified',
          objectType: 'object',
          properties: [],
          traits: [
            {
              type: 'Trait',
              name: 'gaussian_splat',
              config: {
                src: 'scene.ply',
                // no max_splats specified
              } as any,
            },
          ],
          children: [],
          handlers: [],
        },
      ];

      const analyzer = new GaussianBudgetAnalyzer({ platforms: ['quest3'] });
      const result = analyzer.analyze(comp);

      // Default max_splats is 1,000,000
      expect(result.totalGaussians).toBe(1_000_000);
      expect(result.warnings[0].severity).toBe('critical');
    });
  });

  // ---------------------------------------------------------------------------
  // Suggestion Content
  // ---------------------------------------------------------------------------

  describe('Suggestions', () => {
    it('should include SqueezeMe advice for Quest 3 overages', () => {
      const comp = createGaussianComposition('Quest3Suggestion', [
        { name: 'scene', maxSplats: 250_000 },
      ]);
      const analyzer = new GaussianBudgetAnalyzer({ platforms: ['quest3'] });
      const result = analyzer.analyze(comp);

      expect(result.warnings[0].suggestion).toContain('SqueezeMe');
    });

    it('should include octree LOD advice for WebGPU overages', () => {
      const comp = createGaussianComposition('WebGPUSuggestion', [
        { name: 'scene', maxSplats: 600_000 },
      ]);
      const analyzer = new GaussianBudgetAnalyzer({ platforms: ['webgpu'] });
      const result = analyzer.analyze(comp);

      expect(result.warnings[0].suggestion).toContain('octree');
    });

    it('should include pruning advice for Mobile AR overages', () => {
      const comp = createGaussianComposition('MobileARSuggestion', [
        { name: 'scene', maxSplats: 150_000 },
      ]);
      const analyzer = new GaussianBudgetAnalyzer({ platforms: ['mobile_ar'] });
      const result = analyzer.analyze(comp);

      expect(result.warnings[0].suggestion).toContain('pruning');
    });
  });
});
