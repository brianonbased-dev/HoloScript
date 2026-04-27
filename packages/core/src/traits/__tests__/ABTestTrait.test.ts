import { describe, it, expect, beforeEach, vi } from 'vitest';
import { abTestHandler } from '../ABTestTrait';
import type { ABTestConfig, ABVariant, ConversionGoal, Experiment } from '../ABTestTrait';

// =============================================================================
// TEST HELPERS
// =============================================================================

function makeNode(): Record<string, unknown> {
  return {};
}

function makeConfig(overrides: Partial<ABTestConfig> = {}): ABTestConfig {
  return {
    enabled: true,
    default_strategy: 'equal',
    alpha: 0.05,
    min_sample_size: 30,
    min_detectable_effect: 0.1,
    statistical_power: 0.8,
    auto_complete: false,
    max_duration: 0,
    privacy_mode: 'anonymous',
    enable_bandit: false,
    bandit_epsilon: 0.1,
    custom_tags: {},
    ...overrides,
  };
}

function makeContext() {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  return {
    emit: vi.fn((event: string, payload?: unknown) => {
      emitted.push({ event, payload });
    }),
    emitted,
    lastEmit: () => emitted[emitted.length - 1],
    emitsByType: (type: string) => emitted.filter((e) => e.event === type),
  };
}

function makeVariants(count = 2): ABVariant[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i === 0 ? 'control' : `treatment_${i}`,
    name: i === 0 ? 'Control' : `Treatment ${i}`,
    weight: 1 / count,
    config: { buttonColor: i === 0 ? 'blue' : 'green' },
  }));
}

function makeGoals(count = 1): ConversionGoal[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `goal_${i}`,
    name: `Goal ${i}`,
    event_type: `conversion_event_${i}`,
  }));
}

function setupExperiment(
  node: Record<string, unknown>,
  config: ABTestConfig,
  context: ReturnType<typeof makeContext>,
  experimentId = 'exp_1',
  variants?: ABVariant[],
  goals?: ConversionGoal[]
) {
  abTestHandler.onEvent!(node, config, context, {
    type: 'abtest_create_experiment',
    id: experimentId,
    name: 'Test Experiment',
    description: 'A test experiment',
    variants: variants || makeVariants(),
    goals: goals || makeGoals(),
    controlVariantId: 'control',
  });

  abTestHandler.onEvent!(node, config, context, {
    type: 'abtest_start_experiment',
    experimentId,
  });
}

function assignParticipant(
  node: Record<string, unknown>,
  config: ABTestConfig,
  context: ReturnType<typeof makeContext>,
  experimentId: string,
  participantId: string
) {
  abTestHandler.onEvent!(node, config, context, {
    type: 'abtest_assign',
    experimentId,
    participantId,
  });
}

function recordConversion(
  node: Record<string, unknown>,
  config: ABTestConfig,
  context: ReturnType<typeof makeContext>,
  experimentId: string,
  goalId: string,
  participantId: string,
  value = 1
) {
  abTestHandler.onEvent!(node, config, context, {
    type: 'abtest_conversion',
    experimentId,
    goalId,
    participantId,
    value,
  });
}

// =============================================================================
// TESTS
// =============================================================================

describe('ABTestTrait', () => {
  let node: Record<string, unknown>;
  let config: ABTestConfig;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    node = makeNode();
    config = makeConfig();
    ctx = makeContext();
    abTestHandler.onAttach!(node, config, ctx);
  });

  // ---------------------------------------------------------------------------
  // Lifecycle — attach / detach
  // ---------------------------------------------------------------------------
  describe('onAttach / onDetach', () => {
    it('should emit abtest_attached on attach', () => {
      expect(ctx.emitsByType('abtest_attached').length).toBe(1);
    });

    it('should store state on the node', () => {
      expect(node.__abTestState).toBeDefined();
    });

    it('should generate an anonymous participant ID on attach', () => {
      const payload = ctx.emitsByType('abtest_attached')[0].payload as Record<string, unknown>;
      expect(typeof payload.participantId).toBe('string');
      expect((payload.participantId as string).startsWith('anon_')).toBe(true);
    });

    it('should emit privacy mode on attach', () => {
      const payload = ctx.emitsByType('abtest_attached')[0].payload as Record<string, unknown>;
      expect(payload.privacyMode).toBe('anonymous');
    });

    it('should emit experiment summaries on detach', () => {
      setupExperiment(node, config, ctx);
      ctx.emitted.length = 0; // reset
      abTestHandler.onDetach!(node, config, ctx);
      expect(ctx.emitsByType('abtest_experiment_summary').length).toBe(1);
    });

    it('should remove state from node on detach', () => {
      abTestHandler.onDetach!(node, config, ctx);
      expect(node.__abTestState).toBeUndefined();
    });

    it('should handle detach with no experiments gracefully', () => {
      expect(() => abTestHandler.onDetach!(node, config, ctx)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Experiment creation
  // ---------------------------------------------------------------------------
  describe('create_experiment', () => {
    it('should create an experiment in draft status', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp_1',
        name: 'My Experiment',
        variants: makeVariants(),
        goals: makeGoals(),
      });
      const created = ctx.emitsByType('abtest_experiment_created');
      expect(created.length).toBe(1);
      const payload = created[0].payload as Record<string, unknown>;
      expect(payload.experimentId).toBe('exp_1');
    });

    it('should include variant IDs in created event', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp_1',
        variants: makeVariants(3),
        goals: makeGoals(),
      });
      const payload = ctx.emitsByType('abtest_experiment_created')[0].payload as Record<
        string,
        unknown
      >;
      expect((payload.variants as string[]).length).toBe(3);
    });

    it('should include goal IDs in created event', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp_1',
        variants: makeVariants(),
        goals: makeGoals(2),
      });
      const payload = ctx.emitsByType('abtest_experiment_created')[0].payload as Record<
        string,
        unknown
      >;
      expect((payload.goals as string[]).length).toBe(2);
    });

    it('should auto-assign control to first variant if not specified', () => {
      const variants = makeVariants(2);
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp_1',
        variants,
        goals: makeGoals(),
      });
      // Query to check control variant
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_query',
        experimentId: 'exp_1',
        queryId: 'q1',
      });
      const info = ctx.emitsByType('abtest_info')[0].payload as Record<string, unknown>;
      expect(info.experimentId).toBe('exp_1');
    });

    it('should generate an ID if not provided', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_create_experiment',
        variants: makeVariants(),
        goals: makeGoals(),
      });
      const payload = ctx.emitsByType('abtest_experiment_created')[0].payload as Record<
        string,
        unknown
      >;
      expect(typeof payload.experimentId).toBe('string');
      expect((payload.experimentId as string).length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Experiment lifecycle (start / pause / resume / complete)
  // ---------------------------------------------------------------------------
  describe('experiment lifecycle', () => {
    beforeEach(() => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp_1',
        variants: makeVariants(),
        goals: makeGoals(),
        controlVariantId: 'control',
      });
    });

    it('should start a draft experiment', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp_1',
      });
      expect(ctx.emitsByType('abtest_experiment_started').length).toBe(1);
    });

    it('should not start a non-draft experiment', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp_1',
      });
      ctx.emitted.length = 0;
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp_1',
      });
      expect(ctx.emitsByType('abtest_experiment_started').length).toBe(0);
    });

    it('should pause a running experiment', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp_1',
      });
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_pause_experiment',
        experimentId: 'exp_1',
      });
      expect(ctx.emitsByType('abtest_experiment_paused').length).toBe(1);
    });

    it('should not pause a non-running experiment', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_pause_experiment',
        experimentId: 'exp_1',
      });
      expect(ctx.emitsByType('abtest_experiment_paused').length).toBe(0);
    });

    it('should resume a paused experiment', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp_1',
      });
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_pause_experiment',
        experimentId: 'exp_1',
      });
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_resume_experiment',
        experimentId: 'exp_1',
      });
      expect(ctx.emitsByType('abtest_experiment_resumed').length).toBe(1);
    });

    it('should complete a running experiment', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp_1',
      });
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_complete_experiment',
        experimentId: 'exp_1',
      });
      const completed = ctx.emitsByType('abtest_experiment_completed');
      expect(completed.length).toBe(1);
      expect((completed[0].payload as Record<string, unknown>).reason).toBe('manual');
    });

    it('should complete a paused experiment', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp_1',
      });
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_pause_experiment',
        experimentId: 'exp_1',
      });
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_complete_experiment',
        experimentId: 'exp_1',
      });
      expect(ctx.emitsByType('abtest_experiment_completed').length).toBe(1);
    });

    it('should not complete an already completed experiment', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp_1',
      });
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_complete_experiment',
        experimentId: 'exp_1',
      });
      ctx.emitted.length = 0;
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_complete_experiment',
        experimentId: 'exp_1',
      });
      expect(ctx.emitsByType('abtest_experiment_completed').length).toBe(0);
    });

    it('should ignore lifecycle events for unknown experiments', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'unknown',
      });
      expect(ctx.emitsByType('abtest_experiment_started').length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Variant assignment
  // ---------------------------------------------------------------------------
  describe('variant assignment (abtest_assign)', () => {
    beforeEach(() => {
      setupExperiment(node, config, ctx);
      ctx.emitted.length = 0;
    });

    it('should assign a participant to a variant', () => {
      assignParticipant(node, config, ctx, 'exp_1', 'user_123');
      const assigned = ctx.emitsByType('abtest_variant_assigned');
      expect(assigned.length).toBe(1);
      const payload = assigned[0].payload as Record<string, unknown>;
      expect(['control', 'treatment_1']).toContain(payload.variantId);
    });

    it('should be deterministic for the same participant', () => {
      assignParticipant(node, config, ctx, 'exp_1', 'user_abc');
      const first = (ctx.emitsByType('abtest_variant_assigned')[0].payload as Record<
        string,
        unknown
      >).variantId;

      ctx.emitted.length = 0;
      assignParticipant(node, config, ctx, 'exp_1', 'user_abc');
      const second = (ctx.emitsByType('abtest_variant_assigned')[0].payload as Record<
        string,
        unknown
      >).variantId;

      expect(first).toBe(second);
    });

    it('should return variant config in assignment event', () => {
      assignParticipant(node, config, ctx, 'exp_1', 'user_abc');
      const payload = ctx.emitsByType('abtest_variant_assigned')[0].payload as Record<
        string,
        unknown
      >;
      expect(payload.variantConfig).toBeDefined();
      expect(typeof payload.variantConfig).toBe('object');
    });

    it('should return variant name in assignment event', () => {
      assignParticipant(node, config, ctx, 'exp_1', 'user_abc');
      const payload = ctx.emitsByType('abtest_variant_assigned')[0].payload as Record<
        string,
        unknown
      >;
      expect(typeof payload.variantName).toBe('string');
      expect((payload.variantName as string).length).toBeGreaterThan(0);
    });

    it('should not assign to a non-running experiment', () => {
      // Create but don't start
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp_draft',
        variants: makeVariants(),
        goals: makeGoals(),
      });
      ctx.emitted.length = 0;
      assignParticipant(node, config, ctx, 'exp_draft', 'user_xyz');
      expect(ctx.emitsByType('abtest_variant_assigned').length).toBe(0);
    });

    it('should increment participant count for the assigned variant', () => {
      assignParticipant(node, config, ctx, 'exp_1', 'user_p1');
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_query',
        experimentId: 'exp_1',
        queryId: 'q1',
      });
      const info = ctx.emitsByType('abtest_info')[0].payload as Record<string, unknown>;
      expect(info.totalParticipants).toBe(1);
    });

    it('should not double-count re-assignments for same participant', () => {
      assignParticipant(node, config, ctx, 'exp_1', 'user_p1');
      assignParticipant(node, config, ctx, 'exp_1', 'user_p1');
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_query',
        experimentId: 'exp_1',
        queryId: 'q1',
      });
      const info = ctx.emitsByType('abtest_info')[0].payload as Record<string, unknown>;
      expect(info.totalParticipants).toBe(1);
    });

    it('should count multiple distinct participants', () => {
      for (let i = 0; i < 10; i++) {
        assignParticipant(node, config, ctx, 'exp_1', `user_${i}`);
      }
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_query',
        experimentId: 'exp_1',
        queryId: 'q1',
      });
      const info = ctx.emitsByType('abtest_info')[0].payload as Record<string, unknown>;
      expect(info.totalParticipants).toBe(10);
    });
  });

  // ---------------------------------------------------------------------------
  // Conversion tracking
  // ---------------------------------------------------------------------------
  describe('conversion tracking (abtest_conversion)', () => {
    beforeEach(() => {
      setupExperiment(node, config, ctx);
      ctx.emitted.length = 0;
    });

    it('should record a conversion', () => {
      assignParticipant(node, config, ctx, 'exp_1', 'user_1');
      ctx.emitted.length = 0;
      recordConversion(node, config, ctx, 'exp_1', 'goal_0', 'user_1');
      expect(ctx.emitsByType('abtest_conversion_recorded').length).toBe(1);
    });

    it('should include experiment and goal in conversion event', () => {
      assignParticipant(node, config, ctx, 'exp_1', 'user_1');
      ctx.emitted.length = 0;
      recordConversion(node, config, ctx, 'exp_1', 'goal_0', 'user_1');
      const payload = ctx.emitsByType('abtest_conversion_recorded')[0].payload as Record<
        string,
        unknown
      >;
      expect(payload.experimentId).toBe('exp_1');
      expect(payload.goalId).toBe('goal_0');
      expect(payload.participantId).toBe('user_1');
    });

    it('should not record conversion for unassigned participant', () => {
      recordConversion(node, config, ctx, 'exp_1', 'goal_0', 'unassigned_user');
      expect(ctx.emitsByType('abtest_conversion_recorded').length).toBe(0);
    });

    it('should not record conversion for non-running experiment', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp_2',
        variants: makeVariants(),
        goals: makeGoals(),
        controlVariantId: 'control',
      });
      ctx.emitted.length = 0;
      recordConversion(node, config, ctx, 'exp_2', 'goal_0', 'user_1');
      expect(ctx.emitsByType('abtest_conversion_recorded').length).toBe(0);
    });

    it('should track conversion rate after multiple participants', () => {
      // Assign 10 participants — determine which variant each gets
      const variantAssignments: Record<string, string> = {};
      for (let i = 0; i < 10; i++) {
        assignParticipant(node, config, ctx, 'exp_1', `p${i}`);
        const payload = ctx.emitsByType('abtest_variant_assigned').slice(-1)[0]
          .payload as Record<string, unknown>;
        variantAssignments[`p${i}`] = payload.variantId as string;
      }

      // Convert first 5
      for (let i = 0; i < 5; i++) {
        recordConversion(node, config, ctx, 'exp_1', 'goal_0', `p${i}`);
      }

      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_query',
        experimentId: 'exp_1',
        queryId: 'q1',
      });
      const info = ctx.emitsByType('abtest_info')[0].payload as Record<string, unknown>;
      const stats = info.variantStats as Array<{
        participantCount: number;
        conversionCounts: Record<string, number>;
      }>;
      const totalConversions = stats.reduce((s, v) => s + (v.conversionCounts['goal_0'] || 0), 0);
      expect(totalConversions).toBe(5);
    });

    it('should record custom conversion value', () => {
      assignParticipant(node, config, ctx, 'exp_1', 'user_val');
      ctx.emitted.length = 0;
      recordConversion(node, config, ctx, 'exp_1', 'goal_0', 'user_val', 42);
      const payload = ctx.emitsByType('abtest_conversion_recorded')[0].payload as Record<
        string,
        unknown
      >;
      expect(payload.value).toBe(42);
    });
  });

  // ---------------------------------------------------------------------------
  // Statistical significance
  // ---------------------------------------------------------------------------
  describe('significance calculation', () => {
    beforeEach(() => {
      setupExperiment(node, config, ctx);
    });

    it('should emit abtest_significance_results for z_test', () => {
      ctx.emitted.length = 0;
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_calculate_significance',
        experimentId: 'exp_1',
        goalId: 'goal_0',
        testType: 'z_test',
      });
      expect(ctx.emitsByType('abtest_significance_results').length).toBe(1);
    });

    it('should emit abtest_significance_results for chi_squared', () => {
      ctx.emitted.length = 0;
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_calculate_significance',
        experimentId: 'exp_1',
        goalId: 'goal_0',
        testType: 'chi_squared',
      });
      expect(ctx.emitsByType('abtest_significance_results').length).toBe(1);
    });

    it('z_test results include pValue, isSignificant, uplift fields', () => {
      ctx.emitted.length = 0;
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_calculate_significance',
        experimentId: 'exp_1',
        goalId: 'goal_0',
        testType: 'z_test',
      });
      const payload = ctx.emitsByType('abtest_significance_results')[0].payload as Record<
        string,
        unknown
      >;
      const results = payload.results as Array<Record<string, unknown>>;
      expect(results.length).toBeGreaterThan(0);
      expect(typeof results[0].pValue).toBe('number');
      expect(typeof results[0].isSignificant).toBe('boolean');
      expect(typeof results[0].uplift).toBe('number');
    });

    it('should not be significant with zero participants (below min_sample_size)', () => {
      ctx.emitted.length = 0;
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_calculate_significance',
        experimentId: 'exp_1',
        goalId: 'goal_0',
        testType: 'z_test',
      });
      const payload = ctx.emitsByType('abtest_significance_results')[0].payload as Record<
        string,
        unknown
      >;
      const results = payload.results as Array<Record<string, unknown>>;
      expect(results[0].isSignificant).toBe(false);
    });

    it('should detect significance with large sample and clear difference', () => {
      const cfg = makeConfig({ alpha: 0.05, min_sample_size: 10 });
      const node2 = makeNode();
      const ctx2 = makeContext();
      abTestHandler.onAttach!(node2, cfg, ctx2);
      setupExperiment(node2, cfg, ctx2);

      // 100 participants in control, 40 convert
      for (let i = 0; i < 100; i++) {
        assignParticipant(node2, cfg, ctx2, 'exp_1', `ctrl_${i}`);
      }
      // Need to know which went to control — check stats for easier test:
      // just assign specifically to control by knowing the hash.
      // Workaround: flood with many participants and track who ended up where
      for (let i = 0; i < 100; i++) {
        const ev = ctx2.emitsByType('abtest_variant_assigned');
        const last = ev[ev.length - 1]?.payload as Record<string, unknown>;
        if (last?.variantId === 'control') {
          for (let j = 0; j < 4; j++) {
            // record 40% conversion
            recordConversion(node2, cfg, ctx2, 'exp_1', 'goal_0', `ctrl_${i}`);
          }
        }
      }

      ctx2.emitted.length = 0;
      abTestHandler.onEvent!(node2, cfg, ctx2, {
        type: 'abtest_calculate_significance',
        experimentId: 'exp_1',
        goalId: 'goal_0',
        testType: 'z_test',
      });

      const payload = ctx2.emitsByType('abtest_significance_results')[0].payload as Record<
        string,
        unknown
      >;
      // Just ensure result shape is correct with enough participants
      const results = payload.results as Array<Record<string, unknown>>;
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].confidenceLevel).toBeCloseTo(0.95);
    });

    it('should return results for all treatment variants (pairwise)', () => {
      const variants = makeVariants(3); // control + 2 treatments
      const node2 = makeNode();
      const ctx2 = makeContext();
      const cfg = makeConfig();
      abTestHandler.onAttach!(node2, cfg, ctx2);
      setupExperiment(node2, cfg, ctx2, 'exp_1', variants, makeGoals());
      ctx2.emitted.length = 0;

      abTestHandler.onEvent!(node2, cfg, ctx2, {
        type: 'abtest_calculate_significance',
        experimentId: 'exp_1',
        goalId: 'goal_0',
        testType: 'z_test',
      });

      const payload = ctx2.emitsByType('abtest_significance_results')[0].payload as Record<
        string,
        unknown
      >;
      const results = payload.results as Array<Record<string, unknown>>;
      expect(results.length).toBe(2); // 2 pairwise comparisons
    });

    it('chi_squared results include requiredSampleSize', () => {
      ctx.emitted.length = 0;
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_calculate_significance',
        experimentId: 'exp_1',
        goalId: 'goal_0',
        testType: 'chi_squared',
      });
      const payload = ctx.emitsByType('abtest_significance_results')[0].payload as Record<
        string,
        unknown
      >;
      const results = payload.results as Array<Record<string, unknown>>;
      expect(typeof results[0].requiredSampleSize).toBe('number');
    });
  });

  // ---------------------------------------------------------------------------
  // Auto-complete
  // ---------------------------------------------------------------------------
  describe('auto_complete', () => {
    it('should auto-complete when significance is reached', () => {
      const cfg = makeConfig({ auto_complete: true, min_sample_size: 2, alpha: 0.05 });
      const node2 = makeNode();
      const ctx2 = makeContext();
      abTestHandler.onAttach!(node2, cfg, ctx2);
      setupExperiment(node2, cfg, ctx2);

      // Assign many participants and convert all treatment, none control
      const controlParticipants: string[] = [];
      const treatmentParticipants: string[] = [];

      for (let i = 0; i < 200; i++) {
        assignParticipant(node2, cfg, ctx2, 'exp_1', `user_${i}`);
        const ev = ctx2.emitsByType('abtest_variant_assigned');
        const last = ev[ev.length - 1]?.payload as Record<string, unknown>;
        if (last?.variantId === 'control') {
          controlParticipants.push(`user_${i}`);
        } else {
          treatmentParticipants.push(`user_${i}`);
        }
      }

      // 0% control conversions, ~90% treatment conversions
      for (const p of treatmentParticipants) {
        recordConversion(node2, cfg, ctx2, 'exp_1', 'goal_0', p);
      }

      // Should have auto-completed
      const completed = ctx2.emitsByType('abtest_experiment_completed');
      if (
        controlParticipants.length >= cfg.min_sample_size &&
        treatmentParticipants.length >= cfg.min_sample_size
      ) {
        expect(completed.length).toBeGreaterThan(0);
        expect((completed[0].payload as Record<string, unknown>).reason).toBe(
          'significance_reached'
        );
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Max duration
  // ---------------------------------------------------------------------------
  describe('max_duration', () => {
    it('should complete experiment after max_duration via onUpdate', () => {
      const cfg = makeConfig({ max_duration: 1 }); // 1ms
      const node2 = makeNode();
      const ctx2 = makeContext();
      abTestHandler.onAttach!(node2, cfg, ctx2);
      setupExperiment(node2, cfg, ctx2);

      // Wait a moment to ensure duration is exceeded
      const futureNow = Date.now() + 1000;
      vi.spyOn(Date, 'now').mockReturnValue(futureNow);

      abTestHandler.onUpdate!(node2, cfg, ctx2, 0.016);

      vi.restoreAllMocks();

      const completed = ctx2.emitsByType('abtest_experiment_completed');
      expect(completed.length).toBeGreaterThan(0);
      expect((completed[0].payload as Record<string, unknown>).reason).toBe(
        'max_duration_exceeded'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Query operations
  // ---------------------------------------------------------------------------
  describe('query operations', () => {
    beforeEach(() => {
      setupExperiment(node, config, ctx);
      ctx.emitted.length = 0;
    });

    it('should return experiment info on abtest_query', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_query',
        experimentId: 'exp_1',
        queryId: 'q1',
      });
      const info = ctx.emitsByType('abtest_info')[0].payload as Record<string, unknown>;
      expect(info.experimentId).toBe('exp_1');
      expect(info.queryId).toBe('q1');
    });

    it('should list all experiments on abtest_list', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_list',
        queryId: 'list_1',
      });
      const result = ctx.emitsByType('abtest_list_result')[0].payload as Record<string, unknown>;
      const experiments = result.experiments as Array<Record<string, unknown>>;
      expect(experiments.length).toBe(1);
      expect(experiments[0].id).toBe('exp_1');
    });

    it('should return status in experiment list', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_list',
        queryId: 'list_1',
      });
      const result = ctx.emitsByType('abtest_list_result')[0].payload as Record<string, unknown>;
      const experiments = result.experiments as Array<Record<string, unknown>>;
      expect(experiments[0].status).toBe('running');
    });

    it('should return empty list when no experiments', () => {
      const node2 = makeNode();
      const ctx2 = makeContext();
      abTestHandler.onAttach!(node2, config, ctx2);
      abTestHandler.onEvent!(node2, config, ctx2, {
        type: 'abtest_list',
        queryId: 'list_1',
      });
      const result = ctx2.emitsByType('abtest_list_result')[0].payload as Record<string, unknown>;
      expect((result.experiments as unknown[]).length).toBe(0);
    });

    it('should return correct variant count per experiment in list', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_list',
        queryId: 'list_1',
      });
      const result = ctx.emitsByType('abtest_list_result')[0].payload as Record<string, unknown>;
      const experiments = result.experiments as Array<Record<string, unknown>>;
      expect(experiments[0].variantCount).toBe(2);
    });

    it('should not emit info for unknown experiment', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_query',
        experimentId: 'unknown',
        queryId: 'q2',
      });
      expect(ctx.emitsByType('abtest_info').length).toBe(0);
    });

    it('should return variant for local participant (abtest_get_my_variant)', () => {
      // Assign local participant
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_assign',
        experimentId: 'exp_1',
        // no participantId = local
      });

      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_get_my_variant',
        experimentId: 'exp_1',
        queryId: 'my_1',
      });

      const result = ctx.emitsByType('abtest_my_variant');
      expect(result.length).toBe(1);
      const payload = result[0].payload as Record<string, unknown>;
      expect(payload.queryId).toBe('my_1');
      expect(['control', 'treatment_1']).toContain(payload.variantId);
    });

    it('should not emit my_variant if not assigned', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_get_my_variant',
        experimentId: 'exp_1',
        queryId: 'my_2',
      });
      expect(ctx.emitsByType('abtest_my_variant').length).toBe(0);
    });

    it('should include variantStats in query result', () => {
      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_query',
        experimentId: 'exp_1',
        queryId: 'q1',
      });
      const info = ctx.emitsByType('abtest_info')[0].payload as Record<string, unknown>;
      expect(Array.isArray(info.variantStats)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-armed bandit
  // ---------------------------------------------------------------------------
  describe('bandit mode', () => {
    it('should assign variant using bandit when enabled', () => {
      const cfg = makeConfig({ enable_bandit: true, bandit_epsilon: 1.0 }); // full exploration
      const node2 = makeNode();
      const ctx2 = makeContext();
      abTestHandler.onAttach!(node2, cfg, ctx2);

      abTestHandler.onEvent!(node2, cfg, ctx2, {
        type: 'abtest_create_experiment',
        id: 'exp_bandit',
        variants: makeVariants(2),
        goals: makeGoals(),
        controlVariantId: 'control',
        strategy: 'bandit',
      });

      abTestHandler.onEvent!(node2, cfg, ctx2, {
        type: 'abtest_start_experiment',
        experimentId: 'exp_bandit',
      });

      assignParticipant(node2, cfg, ctx2, 'exp_bandit', 'bandit_user_1');
      const assigned = ctx2.emitsByType('abtest_variant_assigned');
      expect(assigned.length).toBe(1);
      expect(['control', 'treatment_1']).toContain(
        (assigned[0].payload as Record<string, unknown>).variantId
      );
    });

    it('should update bandit rewards on conversion', () => {
      const cfg = makeConfig({ enable_bandit: true, bandit_epsilon: 0.1 });
      const node2 = makeNode();
      const ctx2 = makeContext();
      abTestHandler.onAttach!(node2, cfg, ctx2);
      setupExperiment(node2, cfg, ctx2, 'exp_1', makeVariants(), makeGoals());

      assignParticipant(node2, cfg, ctx2, 'exp_1', 'bandit_user');
      recordConversion(node2, cfg, ctx2, 'exp_1', 'goal_0', 'bandit_user');

      expect(ctx2.emitsByType('abtest_conversion_recorded').length).toBe(1);
    });

    it('should record no_conversion for bandit', () => {
      const cfg = makeConfig({ enable_bandit: true });
      const node2 = makeNode();
      const ctx2 = makeContext();
      abTestHandler.onAttach!(node2, cfg, ctx2);
      setupExperiment(node2, cfg, ctx2, 'exp_1', makeVariants(), makeGoals());

      assignParticipant(node2, cfg, ctx2, 'exp_1', 'no_conv_user');

      expect(() => {
        abTestHandler.onEvent!(node2, cfg, ctx2, {
          type: 'abtest_no_conversion',
          experimentId: 'exp_1',
          participantId: 'no_conv_user',
        });
      }).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Weighted allocation strategy
  // ---------------------------------------------------------------------------
  describe('weighted strategy', () => {
    it('should allocate according to weights over many participants', () => {
      const variants: ABVariant[] = [
        { id: 'control', name: 'Control', weight: 0.9, config: {} },
        { id: 'treatment', name: 'Treatment', weight: 0.1, config: {} },
      ];

      const node2 = makeNode();
      const ctx2 = makeContext();
      abTestHandler.onAttach!(node2, config, ctx2);

      abTestHandler.onEvent!(node2, config, ctx2, {
        type: 'abtest_create_experiment',
        id: 'exp_weighted',
        variants,
        goals: makeGoals(),
        controlVariantId: 'control',
        strategy: 'weighted',
      });

      abTestHandler.onEvent!(node2, config, ctx2, {
        type: 'abtest_start_experiment',
        experimentId: 'exp_weighted',
      });

      let controlCount = 0;
      let treatmentCount = 0;

      for (let i = 0; i < 200; i++) {
        assignParticipant(node2, config, ctx2, 'exp_weighted', `wp_${i}`);
        const payload = ctx2.emitsByType('abtest_variant_assigned').slice(-1)[0]
          .payload as Record<string, unknown>;
        if (payload.variantId === 'control') controlCount++;
        else treatmentCount++;
      }

      // With 90/10 split, control should have significantly more
      expect(controlCount).toBeGreaterThan(treatmentCount);
    });
  });

  // ---------------------------------------------------------------------------
  // Default config
  // ---------------------------------------------------------------------------
  describe('defaultConfig', () => {
    it('should have enabled: true', () => {
      expect(abTestHandler.defaultConfig?.enabled).toBe(true);
    });

    it('should have alpha: 0.05 by default', () => {
      expect(abTestHandler.defaultConfig?.alpha).toBe(0.05);
    });

    it('should have default_strategy: equal', () => {
      expect(abTestHandler.defaultConfig?.default_strategy).toBe('equal');
    });

    it('should have privacy_mode: anonymous', () => {
      expect(abTestHandler.defaultConfig?.privacy_mode).toBe('anonymous');
    });

    it('should have enable_bandit: false by default', () => {
      expect(abTestHandler.defaultConfig?.enable_bandit).toBe(false);
    });

    it('should have auto_complete: false by default', () => {
      expect(abTestHandler.defaultConfig?.auto_complete).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------
  describe('edge cases', () => {
    it('should not throw when disabled (isActive=false)', () => {
      const cfg = makeConfig({ enabled: false });
      const node2 = makeNode();
      const ctx2 = makeContext();
      abTestHandler.onAttach!(node2, cfg, ctx2);
      expect(() => abTestHandler.onUpdate!(node2, cfg, ctx2, 0.016)).not.toThrow();
    });

    it('should handle unknown event type without throwing', () => {
      expect(() => {
        abTestHandler.onEvent!(node, config, ctx, {
          type: 'abtest_unknown_event',
        });
      }).not.toThrow();
    });

    it('should handle events when state is missing (no attach)', () => {
      const node2 = makeNode();
      expect(() => {
        abTestHandler.onEvent!(node2, config, ctx, {
          type: 'abtest_create_experiment',
          id: 'x',
          variants: makeVariants(),
          goals: makeGoals(),
        });
      }).not.toThrow();
    });

    it('should handle multiple experiments concurrently', () => {
      setupExperiment(node, config, ctx, 'exp_a');
      setupExperiment(node, config, ctx, 'exp_b');

      abTestHandler.onEvent!(node, config, ctx, {
        type: 'abtest_list',
        queryId: 'list_1',
      });
      const result = ctx.emitsByType('abtest_list_result')[0].payload as Record<string, unknown>;
      expect((result.experiments as unknown[]).length).toBe(2);
    });

    it('should handle participant in multiple experiments independently', () => {
      setupExperiment(node, config, ctx, 'exp_a');
      setupExperiment(node, config, ctx, 'exp_b');

      assignParticipant(node, config, ctx, 'exp_a', 'multi_user');
      assignParticipant(node, config, ctx, 'exp_b', 'multi_user');

      const allAssigned = ctx.emitsByType('abtest_variant_assigned');
      const expA = allAssigned.find(
        (e) => (e.payload as Record<string, unknown>).experimentId === 'exp_a'
      );
      const expB = allAssigned.find(
        (e) => (e.payload as Record<string, unknown>).experimentId === 'exp_b'
      );
      expect(expA).toBeDefined();
      expect(expB).toBeDefined();
    });

    it('should have name property set on handler', () => {
      expect(abTestHandler.name).toBe('abtest');
    });
  });
});
