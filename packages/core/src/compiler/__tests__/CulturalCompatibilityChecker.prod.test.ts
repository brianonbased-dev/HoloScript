/**
 * CulturalCompatibilityChecker Production Tests
 *
 * Integration tests validating cultural_profile trait compatibility
 * with TraitComposer and TraitDependencyGraph.
 */

import { describe, it, expect } from 'vitest';
import { TraitComposer } from '../TraitComposer';
import { TraitDependencyGraph } from '../TraitDependencyGraph';
import type { TraitHandler } from '../../traits/TraitTypes';
import type { CulturalProfileTrait } from '../../traits/CultureTraits';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeCulturalHandler(profile: CulturalProfileTrait): TraitHandler<Record<string, unknown>> {
  return {
    name: 'cultural_profile' as any,
    defaultConfig: profile as unknown as Record<string, unknown>,
  };
}

function makeSimpleHandler(
  config: Record<string, unknown> = {}
): TraitHandler<Record<string, unknown>> {
  return {
    name: 'test' as any,
    defaultConfig: config,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CulturalCompatibilityChecker — Production Integration', () => {
  // ===========================================================================
  // TRAIT DEPENDENCY GRAPH INTEGRATION
  // ===========================================================================

  describe('TraitDependencyGraph integration', () => {
    it('cultural_profile is registered as a builtin trait', () => {
      const graph = new TraitDependencyGraph();
      graph.registerBuiltinTraits();

      // cultural_profile should be registered as a trait
      // Verify by checking that objects using it can be tracked
      graph.registerObject({
        objectName: 'agent1',
        sourceId: 'test.hs',
        traits: [{ name: 'cultural_profile', config: {}, configHash: 'h1' }],
      });

      const users = graph.getObjectsUsingTrait('cultural_profile');
      expect(users.has('agent1')).toBe(true);
    });

    it('norm_compliant depends on cultural_profile', () => {
      const graph = new TraitDependencyGraph();
      graph.registerBuiltinTraits();

      // norm_compliant requires cultural_profile
      const dependents = graph.getDependentTraits('cultural_profile');
      expect(dependents.has('norm_compliant')).toBe(true);
    });

    it('cultural_memory depends on cultural_profile', () => {
      const graph = new TraitDependencyGraph();
      graph.registerBuiltinTraits();

      const dependents = graph.getDependentTraits('cultural_profile');
      expect(dependents.has('cultural_memory')).toBe(true);
    });
  });

  // ===========================================================================
  // TRAIT COMPOSER INTEGRATION
  // ===========================================================================

  describe('TraitComposer integration', () => {
    it('compose detects cultural incompatibility in handler configs', () => {
      const graph = new TraitDependencyGraph();
      graph.registerBuiltinTraits();
      const composer = new TraitComposer(graph);

      const handlers = new Map<string, TraitHandler<Record<string, unknown>>>();
      handlers.set(
        'agent_alpha',
        makeCulturalHandler({
          cooperation_index: 0.9,
          cultural_family: 'cooperative',
          prompt_dialect: 'directive',
          norm_set: ['no_griefing'],
        })
      );
      handlers.set(
        'agent_beta',
        makeCulturalHandler({
          cooperation_index: 0.1,
          cultural_family: 'competitive',
          prompt_dialect: 'socratic',
          norm_set: ['no_griefing'],
        })
      );

      const result = composer.compose('team_mixed', handlers, ['agent_alpha', 'agent_beta']);

      // Should have cultural compatibility result
      expect(result.culturalCompatibility).toBeDefined();
      expect(result.culturalCompatibility!.compatible).toBe(false);

      // Conflicts should include cultural errors
      const culturalConflicts = result.conflicts.filter((c) => c.startsWith('Cultural:'));
      expect(culturalConflicts.length).toBeGreaterThan(0);
    });

    it('compose passes when cultural profiles are compatible', () => {
      const graph = new TraitDependencyGraph();
      graph.registerBuiltinTraits();
      const composer = new TraitComposer(graph);

      const handlers = new Map<string, TraitHandler<Record<string, unknown>>>();
      handlers.set(
        'agent_alpha',
        makeCulturalHandler({
          cooperation_index: 0.8,
          cultural_family: 'cooperative',
          prompt_dialect: 'consensus',
          norm_set: ['no_griefing', 'fair_trade'],
        })
      );
      handlers.set(
        'agent_beta',
        makeCulturalHandler({
          cooperation_index: 0.7,
          cultural_family: 'cooperative',
          prompt_dialect: 'consensus',
          norm_set: ['no_griefing', 'fair_trade'],
        })
      );

      const result = composer.compose('team_aligned', handlers, ['agent_alpha', 'agent_beta']);

      expect(result.culturalCompatibility).toBeDefined();
      expect(result.culturalCompatibility!.compatible).toBe(true);
      expect(result.culturalCompatibility!.errors).toHaveLength(0);
    });

    it('compose skips cultural check when no cultural_profile configs present', () => {
      const composer = new TraitComposer();

      const handlers = new Map<string, TraitHandler<Record<string, unknown>>>();
      handlers.set('physics', makeSimpleHandler({ mass: 10 }));
      handlers.set('collidable', makeSimpleHandler({ radius: 1 }));

      const result = composer.compose('basic_object', handlers, ['physics', 'collidable']);

      // No cultural_profile traits, so no cultural compatibility result
      expect(result.culturalCompatibility).toBeUndefined();
    });

    it('compose skips cultural check when only one cultural_profile present', () => {
      const composer = new TraitComposer();

      const handlers = new Map<string, TraitHandler<Record<string, unknown>>>();
      handlers.set(
        'agent_solo',
        makeCulturalHandler({
          cooperation_index: 0.5,
          cultural_family: 'isolationist',
          prompt_dialect: 'reactive',
          norm_set: [],
        })
      );
      handlers.set('physics', makeSimpleHandler({ mass: 10 }));

      const result = composer.compose('solo_agent', handlers, ['agent_solo', 'physics']);

      // Only one cultural_profile, no pairwise check needed
      expect(result.culturalCompatibility).toBeUndefined();
    });

    it('setCulturalCheckerConfig changes threshold', () => {
      const composer = new TraitComposer();
      composer.setCulturalCheckerConfig({ cooperationThreshold: 0.1 });

      const handlers = new Map<string, TraitHandler<Record<string, unknown>>>();
      handlers.set(
        'a',
        makeCulturalHandler({
          cooperation_index: 0.5,
          cultural_family: 'cooperative',
          prompt_dialect: 'directive',
          norm_set: [],
        })
      );
      handlers.set(
        'b',
        makeCulturalHandler({
          cooperation_index: 0.3,
          cultural_family: 'cooperative',
          prompt_dialect: 'directive',
          norm_set: [],
        })
      );

      const result = composer.compose('strict_team', handlers, ['a', 'b']);

      // delta = 0.2, exceeds strict 0.1 threshold
      expect(result.culturalCompatibility).toBeDefined();
      expect(result.culturalCompatibility!.compatible).toBe(false);
    });

    it('checkCulturalCompatibility can be called standalone', () => {
      const composer = new TraitComposer();

      const result = composer.checkCulturalCompatibility([
        {
          name: 'Alpha',
          profile: {
            cooperation_index: 0.8,
            cultural_family: 'cooperative',
            prompt_dialect: 'directive',
            norm_set: ['no_griefing'],
          },
        },
        {
          name: 'Beta',
          profile: {
            cooperation_index: 0.7,
            cultural_family: 'cooperative',
            prompt_dialect: 'directive',
            norm_set: ['no_griefing'],
          },
        },
      ]);

      expect(result.compatible).toBe(true);
    });
  });

  // ===========================================================================
  // CULTURAL WARNINGS IN COMPOSITION RESULT
  // ===========================================================================

  describe('warnings integration', () => {
    it('cultural dialect warnings appear in composition warnings', () => {
      const composer = new TraitComposer();

      const handlers = new Map<string, TraitHandler<Record<string, unknown>>>();
      handlers.set(
        'a',
        makeCulturalHandler({
          cooperation_index: 0.7,
          cultural_family: 'cooperative',
          prompt_dialect: 'directive',
          norm_set: ['no_griefing'],
        })
      );
      handlers.set(
        'b',
        makeCulturalHandler({
          cooperation_index: 0.7,
          cultural_family: 'cooperative',
          prompt_dialect: 'narrative',
          norm_set: ['no_griefing'],
        })
      );

      const result = composer.compose('mixed_dialect', handlers, ['a', 'b']);

      const culturalWarnings = result.warnings.filter((w) => w.startsWith('Cultural:'));
      expect(culturalWarnings.length).toBeGreaterThan(0);
      expect(culturalWarnings[0]).toContain('dialect');
    });
  });
});
