import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TRAINING_PIPELINE_CONFIG,
  buildTrainingPipelineConfig,
  computeTotalSteps,
} from '../TrainingPipelineConfig';
import type { TrainingPipelineConfig } from '../TrainingPipelineConfig';
import { DEFAULT_SOFTDEDUP_CONFIG } from '../SoftDedup';
import { DEFAULT_LR_SCHEDULER_CONFIG } from '../LRScheduler';

// =============================================================================
// TESTS
// =============================================================================

describe('TrainingPipelineConfig', () => {
  // ---------------------------------------------------------------------------
  // DEFAULT CONFIG
  // ---------------------------------------------------------------------------

  describe('DEFAULT_TRAINING_PIPELINE_CONFIG', () => {
    it('has correct hyperparameters per W.006', () => {
      const { hyperparameters } = DEFAULT_TRAINING_PIPELINE_CONFIG;

      expect(hyperparameters.learningRate).toBe(2e-4); // NOT 2e-5
      expect(hyperparameters.epochs).toBe(2); // NOT 3
      expect(hyperparameters.optimizer).toBe('paged_adamw_8bit'); // NOT adamw_torch
    });

    it('has correct batch settings per W.007', () => {
      const { hyperparameters } = DEFAULT_TRAINING_PIPELINE_CONFIG;

      expect(hyperparameters.microBatchSize).toBe(8);
      expect(hyperparameters.gradientAccumulationSteps).toBe(4);
      // Effective batch = 8 * 4 = 32 (in range 32-512)
      const effectiveBatch =
        hyperparameters.microBatchSize * hyperparameters.gradientAccumulationSteps;
      expect(effectiveBatch).toBeGreaterThanOrEqual(32);
      expect(effectiveBatch).toBeLessThanOrEqual(512);
    });

    it('includes SoftDedup defaults (W.008)', () => {
      expect(DEFAULT_TRAINING_PIPELINE_CONFIG.softDedup).toEqual(DEFAULT_SOFTDEDUP_CONFIG);
    });

    it('includes LR schedule defaults (W.009)', () => {
      expect(DEFAULT_TRAINING_PIPELINE_CONFIG.lrSchedule).toEqual(DEFAULT_LR_SCHEDULER_CONFIG);
    });

    it('enables all pipeline stages by default', () => {
      const { pipeline } = DEFAULT_TRAINING_PIPELINE_CONFIG;

      expect(pipeline.enableQualityFilter).toBe(true);
      expect(pipeline.enableSoftDedup).toBe(true);
      expect(pipeline.enableLRSchedule).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // BUILD CONFIG
  // ---------------------------------------------------------------------------

  describe('buildTrainingPipelineConfig', () => {
    it('returns defaults with no overrides', () => {
      const config = buildTrainingPipelineConfig();
      expect(config.hyperparameters.learningRate).toBe(
        DEFAULT_TRAINING_PIPELINE_CONFIG.hyperparameters.learningRate
      );
    });

    it('allows overriding hyperparameters', () => {
      const config = buildTrainingPipelineConfig({
        hyperparameters: { learningRate: 1e-4, epochs: 3 },
      });

      expect(config.hyperparameters.learningRate).toBe(1e-4);
      expect(config.hyperparameters.epochs).toBe(3);
      expect(config.hyperparameters.optimizer).toBe('paged_adamw_8bit'); // preserved
    });

    it('allows overriding softDedup settings', () => {
      const config = buildTrainingPipelineConfig({
        softDedup: { temperature: 0.5, wordLevel: true },
      });

      expect(config.softDedup.temperature).toBe(0.5);
      expect(config.softDedup.wordLevel).toBe(true);
      expect(config.softDedup.minWeight).toBe(DEFAULT_SOFTDEDUP_CONFIG.minWeight); // preserved
    });

    it('allows overriding lrSchedule settings', () => {
      const config = buildTrainingPipelineConfig({
        lrSchedule: { totalSteps: 5000, warmupRatio: 0.05 },
      });

      expect(config.lrSchedule.totalSteps).toBe(5000);
      expect(config.lrSchedule.warmupRatio).toBe(0.05);
      expect(config.lrSchedule.baseLR).toBe(DEFAULT_LR_SCHEDULER_CONFIG.baseLR); // preserved
    });

    it('allows disabling pipeline stages', () => {
      const config = buildTrainingPipelineConfig({
        pipeline: {
          enableQualityFilter: false,
          enableSoftDedup: false,
          enableLRSchedule: false,
        },
      });

      expect(config.pipeline.enableQualityFilter).toBe(false);
      expect(config.pipeline.enableSoftDedup).toBe(false);
      expect(config.pipeline.enableLRSchedule).toBe(false);
    });

    it('does not mutate the default config', () => {
      const originalLR = DEFAULT_TRAINING_PIPELINE_CONFIG.hyperparameters.learningRate;
      buildTrainingPipelineConfig({
        hyperparameters: { learningRate: 999 },
      });
      expect(DEFAULT_TRAINING_PIPELINE_CONFIG.hyperparameters.learningRate).toBe(originalLR);
    });
  });

  // ---------------------------------------------------------------------------
  // COMPUTE TOTAL STEPS
  // ---------------------------------------------------------------------------

  describe('computeTotalSteps', () => {
    it('computes correct steps for standard config', () => {
      const config = buildTrainingPipelineConfig();
      // Dataset: 920K, microBatch: 8, gradAccum: 4, epochs: 2
      // effectiveBatch = 32
      // stepsPerEpoch = ceil(920000 / 32) = 28750
      // totalSteps = 28750 * 2 = 57500
      const steps = computeTotalSteps(920000, config);
      expect(steps).toBe(57500);
    });

    it('handles small datasets', () => {
      const config = buildTrainingPipelineConfig({
        hyperparameters: {
          microBatchSize: 4,
          gradientAccumulationSteps: 2,
          epochs: 1,
        },
      });
      // effectiveBatch = 8
      // stepsPerEpoch = ceil(10 / 8) = 2
      // totalSteps = 2 * 1 = 2
      const steps = computeTotalSteps(10, config);
      expect(steps).toBe(2);
    });

    it('handles dataset size of 1', () => {
      const config = buildTrainingPipelineConfig({
        hyperparameters: {
          microBatchSize: 8,
          gradientAccumulationSteps: 4,
          epochs: 2,
        },
      });
      // effectiveBatch = 32
      // stepsPerEpoch = ceil(1 / 32) = 1
      // totalSteps = 1 * 2 = 2
      const steps = computeTotalSteps(1, config);
      expect(steps).toBe(2);
    });

    it('handles dataset size of 0', () => {
      const config = buildTrainingPipelineConfig();
      const steps = computeTotalSteps(0, config);
      expect(steps).toBe(0);
    });

    it('rounds up partial batches', () => {
      const config = buildTrainingPipelineConfig({
        hyperparameters: {
          microBatchSize: 10,
          gradientAccumulationSteps: 1,
          epochs: 1,
        },
      });
      // effectiveBatch = 10
      // stepsPerEpoch = ceil(15 / 10) = 2
      const steps = computeTotalSteps(15, config);
      expect(steps).toBe(2);
    });

    it('scales linearly with epochs', () => {
      const config1 = buildTrainingPipelineConfig({
        hyperparameters: { epochs: 1 },
      });
      const config2 = buildTrainingPipelineConfig({
        hyperparameters: { epochs: 2 },
      });

      const steps1 = computeTotalSteps(1000, config1);
      const steps2 = computeTotalSteps(1000, config2);

      expect(steps2).toBe(steps1 * 2);
    });
  });
});
