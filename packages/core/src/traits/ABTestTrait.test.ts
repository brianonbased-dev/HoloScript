import { describe, it, expect, vi, beforeEach } from 'vitest';
import { abTestHandler } from './ABTestTrait';
import type { ABTestConfig, ABVariant, ConversionGoal } from './ABTestTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './__tests__/traitTestHelpers';

describe('ABTestTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const defaultOverrides: Partial<ABTestConfig> = {
    enabled: true,
    default_strategy: 'equal',
    alpha: 0.05,
    min_sample_size: 30,
  };

  const testVariants: ABVariant[] = [
    { id: 'control', name: 'Control', weight: 0.5, config: { color: 'blue' } },
    { id: 'treatment', name: 'Treatment A', weight: 0.5, config: { color: 'red' } },
  ];

  const testGoals: ConversionGoal[] = [
    { id: 'click', name: 'Click Goal', event_type: 'click' },
    { id: 'purchase', name: 'Purchase Goal', event_type: 'purchase', value_key: 'amount' },
  ];

  beforeEach(() => {
    node = createMockNode('abtest-node');
    ctx = createMockContext();
  });

  describe('Lifecycle', () => {
    it('should attach and emit abtest_attached event', () => {
      attachTrait(abTestHandler, node, defaultOverrides, ctx);

      expect(getEventCount(ctx, 'abtest_attached')).toBe(1);
      const data = getLastEvent(ctx, 'abtest_attached') as any;
      expect(data.participantId).toBeDefined();
      expect(data.privacyMode).toBe('anonymous');
    });

    it('should store state on node', () => {
      attachTrait(abTestHandler, node, defaultOverrides, ctx);
      expect((node as any).__abTestState).toBeDefined();
      expect((node as any).__abTestState.isActive).toBe(true);
    });

    it('should clean up on detach', () => {
      attachTrait(abTestHandler, node, defaultOverrides, ctx);

      const fullConfig = { ...abTestHandler.defaultConfig, ...defaultOverrides };
      abTestHandler.onDetach!(node as any, fullConfig, ctx as any);

      expect((node as any).__abTestState).toBeUndefined();
    });

    it('should generate anonymous participant ID by default', () => {
      attachTrait(abTestHandler, node, defaultOverrides, ctx);

      const state = (node as any).__abTestState;
      expect(state.localParticipantId).toMatch(/^anon_[0-9a-f]{12}$/);
    });
  });

  describe('Experiment Management', () => {
    it('should create an experiment', () => {
      attachTrait(abTestHandler, node, defaultOverrides, ctx);

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp-1',
        name: 'Button Color Test',
        description: 'Testing button colors',
        variants: testVariants,
        goals: testGoals,
        controlVariantId: 'control',
      });

      expect(getEventCount(ctx, 'abtest_experiment_created')).toBe(1);
      const data = getLastEvent(ctx, 'abtest_experiment_created') as any;
      expect(data.experimentId).toBe('exp-1');
      expect(data.variants).toEqual(['control', 'treatment']);
      expect(data.goals).toEqual(['click', 'purchase']);
    });

    it('should start an experiment', () => {
      attachTrait(abTestHandler, node, defaultOverrides, ctx);

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp-1',
        name: 'Test',
        variants: testVariants,
        goals: testGoals,
      });

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp-1',
      });

      expect(getEventCount(ctx, 'abtest_experiment_started')).toBe(1);
    });

    it('should pause and resume experiments', () => {
      attachTrait(abTestHandler, node, defaultOverrides, ctx);

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp-1',
        variants: testVariants,
        goals: testGoals,
      });
      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp-1',
      });

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_pause_experiment',
        experimentId: 'exp-1',
      });
      expect(getEventCount(ctx, 'abtest_experiment_paused')).toBe(1);

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_resume_experiment',
        experimentId: 'exp-1',
      });
      expect(getEventCount(ctx, 'abtest_experiment_resumed')).toBe(1);
    });

    it('should complete experiments', () => {
      attachTrait(abTestHandler, node, defaultOverrides, ctx);

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp-1',
        variants: testVariants,
        goals: testGoals,
      });
      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp-1',
      });
      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_complete_experiment',
        experimentId: 'exp-1',
      });

      expect(getEventCount(ctx, 'abtest_experiment_completed')).toBe(1);
      const data = getLastEvent(ctx, 'abtest_experiment_completed') as any;
      expect(data.reason).toBe('manual');
    });

    it('should list experiments', () => {
      attachTrait(abTestHandler, node, defaultOverrides, ctx);

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp-1',
        name: 'Test 1',
        variants: testVariants,
        goals: testGoals,
      });
      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp-2',
        name: 'Test 2',
        variants: testVariants,
        goals: testGoals,
      });

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_list',
        queryId: 'q1',
      });

      const data = getLastEvent(ctx, 'abtest_list_result') as any;
      expect(data.experiments.length).toBe(2);
    });
  });

  describe('Variant Assignment', () => {
    it('should assign variant deterministically', () => {
      attachTrait(abTestHandler, node, defaultOverrides, ctx);

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp-1',
        variants: testVariants,
        goals: testGoals,
      });
      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp-1',
      });

      // First assignment
      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_assign',
        experimentId: 'exp-1',
        participantId: 'user-42',
      });

      const data1 = getLastEvent(ctx, 'abtest_variant_assigned') as any;
      const assignedVariant = data1.variantId;

      // Same participant should get same variant
      ctx.clearEvents();
      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_assign',
        experimentId: 'exp-1',
        participantId: 'user-42',
      });

      const data2 = getLastEvent(ctx, 'abtest_variant_assigned') as any;
      expect(data2.variantId).toBe(assignedVariant);
    });

    it('should return variant config with assignment', () => {
      attachTrait(abTestHandler, node, defaultOverrides, ctx);

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp-1',
        variants: testVariants,
        goals: testGoals,
      });
      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp-1',
      });

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_assign',
        experimentId: 'exp-1',
        participantId: 'user-42',
      });

      const data = getLastEvent(ctx, 'abtest_variant_assigned') as any;
      expect(data.variantConfig).toBeDefined();
      // Should have 'color' from our test variant configs
      expect(data.variantConfig.color).toBeDefined();
    });

    it('should distribute across variants for many participants', () => {
      attachTrait(abTestHandler, node, defaultOverrides, ctx);

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp-1',
        variants: testVariants,
        goals: testGoals,
        strategy: 'equal',
      });
      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp-1',
      });

      const counts: Record<string, number> = { control: 0, treatment: 0 };

      for (let i = 0; i < 100; i++) {
        sendEvent(abTestHandler, node, defaultOverrides, ctx, {
          type: 'abtest_assign',
          experimentId: 'exp-1',
          participantId: `user-${i}`,
        });
        const data = getLastEvent(ctx, 'abtest_variant_assigned') as any;
        counts[data.variantId]++;
      }

      // With equal distribution, each variant should get roughly 50%
      expect(counts.control).toBeGreaterThan(20);
      expect(counts.treatment).toBeGreaterThan(20);
    });

    it('should not assign variant for non-running experiment', () => {
      attachTrait(abTestHandler, node, defaultOverrides, ctx);

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp-1',
        variants: testVariants,
        goals: testGoals,
      });

      // Experiment is still in 'draft' status (not started)
      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_assign',
        experimentId: 'exp-1',
        participantId: 'user-1',
      });

      expect(getEventCount(ctx, 'abtest_variant_assigned')).toBe(0);
    });

    it('should track participant count per variant', () => {
      attachTrait(abTestHandler, node, defaultOverrides, ctx);

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp-1',
        variants: testVariants,
        goals: testGoals,
      });
      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp-1',
      });

      for (let i = 0; i < 10; i++) {
        sendEvent(abTestHandler, node, defaultOverrides, ctx, {
          type: 'abtest_assign',
          experimentId: 'exp-1',
          participantId: `user-${i}`,
        });
      }

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_query',
        experimentId: 'exp-1',
        queryId: 'q1',
      });

      const info = getLastEvent(ctx, 'abtest_info') as any;
      expect(info.totalParticipants).toBe(10);
    });
  });

  describe('Conversion Tracking', () => {
    function setupRunningExperiment() {
      attachTrait(abTestHandler, node, defaultOverrides, ctx);

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp-1',
        variants: testVariants,
        goals: testGoals,
        controlVariantId: 'control',
      });
      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp-1',
      });
    }

    it('should record conversions', () => {
      setupRunningExperiment();

      // Assign participant
      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_assign',
        experimentId: 'exp-1',
        participantId: 'user-1',
      });
      const assignData = getLastEvent(ctx, 'abtest_variant_assigned') as any;

      // Record conversion
      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_conversion',
        experimentId: 'exp-1',
        goalId: 'click',
        participantId: 'user-1',
      });

      expect(getEventCount(ctx, 'abtest_conversion_recorded')).toBe(1);
      const convData = getLastEvent(ctx, 'abtest_conversion_recorded') as any;
      expect(convData.experimentId).toBe('exp-1');
      expect(convData.goalId).toBe('click');
      expect(convData.variantId).toBe(assignData.variantId);
    });

    it('should not record conversion for unassigned participant', () => {
      setupRunningExperiment();

      // Try to record conversion without assignment
      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_conversion',
        experimentId: 'exp-1',
        goalId: 'click',
        participantId: 'unknown-user',
      });

      expect(getEventCount(ctx, 'abtest_conversion_recorded')).toBe(0);
    });

    it('should track conversion rates per variant', () => {
      setupRunningExperiment();

      // Assign and convert some participants
      for (let i = 0; i < 20; i++) {
        const pid = `user-${i}`;
        sendEvent(abTestHandler, node, defaultOverrides, ctx, {
          type: 'abtest_assign',
          experimentId: 'exp-1',
          participantId: pid,
        });

        // Convert every other user
        if (i % 2 === 0) {
          sendEvent(abTestHandler, node, defaultOverrides, ctx, {
            type: 'abtest_conversion',
            experimentId: 'exp-1',
            goalId: 'click',
            participantId: pid,
          });
        }
      }

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_query',
        experimentId: 'exp-1',
        queryId: 'q1',
      });

      const info = getLastEvent(ctx, 'abtest_info') as any;
      expect(info.totalParticipants).toBe(20);

      // Check that variant stats exist
      const allStats = info.variantStats as any[];
      for (const stats of allStats) {
        if (stats.participantCount > 0) {
          expect(stats.conversionRates.click).toBeDefined();
          expect(stats.conversionRates.click).toBeGreaterThanOrEqual(0);
          expect(stats.conversionRates.click).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('Statistical Significance', () => {
    function setupExperimentWithData(
      controlConversions: number,
      controlTotal: number,
      treatmentConversions: number,
      treatmentTotal: number
    ) {
      attachTrait(abTestHandler, node, { ...defaultOverrides, min_sample_size: 10 }, ctx);

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp-1',
        variants: testVariants,
        goals: testGoals,
        controlVariantId: 'control',
      });
      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp-1',
      });

      // We need to assign participants and conversions.
      // To get deterministic assignment, we'll manually manipulate state.
      const state = (node as any).__abTestState;
      const statsMap = state.variantStats.get('exp-1')!;

      const controlStats = statsMap.get('control')!;
      controlStats.participantCount = controlTotal;
      controlStats.conversionCounts.click = controlConversions;
      controlStats.conversionRates.click = controlTotal > 0 ? controlConversions / controlTotal : 0;

      const treatmentStats = statsMap.get('treatment')!;
      treatmentStats.participantCount = treatmentTotal;
      treatmentStats.conversionCounts.click = treatmentConversions;
      treatmentStats.conversionRates.click = treatmentTotal > 0 ? treatmentConversions / treatmentTotal : 0;
    }

    it('should calculate z-test significance with clear difference', () => {
      // Control: 10% conversion (10/100), Treatment: 30% conversion (30/100)
      setupExperimentWithData(10, 100, 30, 100);

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_calculate_significance',
        experimentId: 'exp-1',
        goalId: 'click',
        testType: 'z_test',
      });

      const data = getLastEvent(ctx, 'abtest_significance_results') as any;
      expect(data.results.length).toBe(1);

      const result = data.results[0];
      expect(result.testType).toBe('z_test');
      expect(result.controlRate).toBeCloseTo(0.1, 2);
      expect(result.treatmentRate).toBeCloseTo(0.3, 2);
      expect(result.pValue).toBeLessThan(0.05);
      expect(result.isSignificant).toBe(true);
      expect(result.uplift).toBeCloseTo(2.0, 1); // 200% uplift
    });

    it('should not be significant with similar rates', () => {
      // Control: 20% (20/100), Treatment: 21% (21/100) - very similar
      setupExperimentWithData(20, 100, 21, 100);

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_calculate_significance',
        experimentId: 'exp-1',
        goalId: 'click',
        testType: 'z_test',
      });

      const data = getLastEvent(ctx, 'abtest_significance_results') as any;
      const result = data.results[0];
      expect(result.pValue).toBeGreaterThan(0.05);
      expect(result.isSignificant).toBe(false);
    });

    it('should calculate chi-squared test', () => {
      setupExperimentWithData(10, 100, 30, 100);

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_calculate_significance',
        experimentId: 'exp-1',
        goalId: 'click',
        testType: 'chi_squared',
      });

      const data = getLastEvent(ctx, 'abtest_significance_results') as any;
      expect(data.results.length).toBe(1);
      expect(data.results[0].testType).toBe('chi_squared');
      expect(data.results[0].testStatistic).toBeGreaterThan(0);
    });

    it('should estimate required sample size', () => {
      setupExperimentWithData(10, 100, 30, 100);

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_calculate_significance',
        experimentId: 'exp-1',
        goalId: 'click',
        testType: 'z_test',
      });

      const data = getLastEvent(ctx, 'abtest_significance_results') as any;
      const result = data.results[0];
      expect(result.requiredSampleSize).toBeGreaterThan(0);
    });

    it('should report confidence level', () => {
      setupExperimentWithData(10, 100, 30, 100);

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_calculate_significance',
        experimentId: 'exp-1',
        goalId: 'click',
        testType: 'z_test',
      });

      const data = getLastEvent(ctx, 'abtest_significance_results') as any;
      expect(data.results[0].confidenceLevel).toBeCloseTo(0.95, 2);
    });
  });

  describe('Auto-Complete', () => {
    it('should auto-complete when significance is reached', () => {
      const config = {
        ...defaultOverrides,
        auto_complete: true,
        min_sample_size: 10,
      };
      attachTrait(abTestHandler, node, config, ctx);

      sendEvent(abTestHandler, node, config, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp-1',
        variants: testVariants,
        goals: testGoals,
        controlVariantId: 'control',
      });
      sendEvent(abTestHandler, node, config, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp-1',
      });

      // Manually set stats to trigger significance
      const state = (node as any).__abTestState;
      const statsMap = state.variantStats.get('exp-1')!;

      const controlStats = statsMap.get('control')!;
      controlStats.participantCount = 100;
      controlStats.conversionCounts.click = 5;

      const treatmentStats = statsMap.get('treatment')!;
      treatmentStats.participantCount = 100;
      treatmentStats.conversionCounts.click = 50;

      // Assign and convert to trigger auto-complete check
      state.participantAssignments.set('trigger-user', new Map([['exp-1', 'treatment']]));
      state.participantExposures.set('trigger-user', new Map([['exp-1', Date.now()]]));

      sendEvent(abTestHandler, node, config, ctx, {
        type: 'abtest_conversion',
        experimentId: 'exp-1',
        goalId: 'click',
        participantId: 'trigger-user',
      });

      // Should have been auto-completed
      const completedEvents = ctx.emittedEvents.filter(
        (e) => e.event === 'abtest_experiment_completed'
      );
      expect(completedEvents.length).toBe(1);
      const data = completedEvents[0].data as any;
      expect(data.reason).toBe('significance_reached');
    });
  });

  describe('Multi-Armed Bandit', () => {
    it('should use bandit selection when enabled', () => {
      const config: Partial<ABTestConfig> = {
        ...defaultOverrides,
        enable_bandit: true,
        bandit_epsilon: 0.1,
        default_strategy: 'bandit',
      };
      attachTrait(abTestHandler, node, config, ctx);

      sendEvent(abTestHandler, node, config, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp-1',
        variants: testVariants,
        goals: testGoals,
        strategy: 'bandit',
      });
      sendEvent(abTestHandler, node, config, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp-1',
      });

      // Assign many participants - should still work
      for (let i = 0; i < 20; i++) {
        sendEvent(abTestHandler, node, config, ctx, {
          type: 'abtest_assign',
          experimentId: 'exp-1',
          participantId: `user-${i}`,
        });
      }

      expect(getEventCount(ctx, 'abtest_variant_assigned')).toBe(20);
    });

    it('should update bandit rewards on conversion', () => {
      const config: Partial<ABTestConfig> = {
        ...defaultOverrides,
        enable_bandit: true,
        bandit_epsilon: 0.1,
        default_strategy: 'bandit',
      };
      attachTrait(abTestHandler, node, config, ctx);

      sendEvent(abTestHandler, node, config, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp-1',
        variants: testVariants,
        goals: testGoals,
        strategy: 'bandit',
      });
      sendEvent(abTestHandler, node, config, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp-1',
      });

      // Assign
      sendEvent(abTestHandler, node, config, ctx, {
        type: 'abtest_assign',
        experimentId: 'exp-1',
        participantId: 'user-1',
      });
      const assignData = getLastEvent(ctx, 'abtest_variant_assigned') as any;

      // Convert
      sendEvent(abTestHandler, node, config, ctx, {
        type: 'abtest_conversion',
        experimentId: 'exp-1',
        goalId: 'click',
        participantId: 'user-1',
      });

      const state = (node as any).__abTestState;
      const rewards = state.banditRewards.get('exp-1');
      const variantRewards = rewards?.get(assignData.variantId);
      expect(variantRewards?.successes).toBeGreaterThan(1); // Prior + 1 conversion
    });
  });

  describe('Max Duration', () => {
    it('should auto-expire experiments past max duration', () => {
      const config: Partial<ABTestConfig> = {
        ...defaultOverrides,
        max_duration: 1000, // 1 second
      };
      attachTrait(abTestHandler, node, config, ctx);

      sendEvent(abTestHandler, node, config, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp-1',
        variants: testVariants,
        goals: testGoals,
      });
      sendEvent(abTestHandler, node, config, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp-1',
      });

      // Manipulate start time to be in the past
      const state = (node as any).__abTestState;
      const exp = state.experiments.get('exp-1')!;
      exp.start_time = Date.now() - 2000; // 2 seconds ago

      // Trigger update
      updateTrait(abTestHandler, node, config, ctx, 0.016);

      expect(getEventCount(ctx, 'abtest_experiment_completed')).toBe(1);
      const data = getLastEvent(ctx, 'abtest_experiment_completed') as any;
      expect(data.reason).toBe('max_duration_exceeded');
    });
  });

  describe('Privacy', () => {
    it('should default to anonymous privacy mode', () => {
      expect(abTestHandler.defaultConfig.privacy_mode).toBe('anonymous');
    });

    it('should generate anonymous IDs without PII', () => {
      attachTrait(abTestHandler, node, defaultOverrides, ctx);

      const state = (node as any).__abTestState;
      expect(state.localParticipantId).toMatch(/^anon_/);
      // Should only contain hex chars after prefix
      expect(state.localParticipantId.slice(5)).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('Query Interface', () => {
    it('should respond to experiment query', () => {
      attachTrait(abTestHandler, node, defaultOverrides, ctx);

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp-1',
        name: 'Test Experiment',
        variants: testVariants,
        goals: testGoals,
      });

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_query',
        experimentId: 'exp-1',
        queryId: 'q1',
      });

      const info = getLastEvent(ctx, 'abtest_info') as any;
      expect(info.queryId).toBe('q1');
      expect(info.experimentId).toBe('exp-1');
      expect(info.name).toBe('Test Experiment');
      expect(info.status).toBe('draft');
      expect(info.variants).toEqual(['control', 'treatment']);
    });

    it('should get local participant variant', () => {
      attachTrait(abTestHandler, node, defaultOverrides, ctx);

      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_create_experiment',
        id: 'exp-1',
        variants: testVariants,
        goals: testGoals,
      });
      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_start_experiment',
        experimentId: 'exp-1',
      });

      // Assign local participant
      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_assign',
        experimentId: 'exp-1',
      });

      // Query local variant
      sendEvent(abTestHandler, node, defaultOverrides, ctx, {
        type: 'abtest_get_my_variant',
        experimentId: 'exp-1',
        queryId: 'q1',
      });

      const data = getLastEvent(ctx, 'abtest_my_variant') as any;
      expect(data.queryId).toBe('q1');
      expect(data.variantId).toBeDefined();
      expect(data.variantConfig).toBeDefined();
    });
  });
});
