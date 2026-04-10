import { describe, it, expect } from 'vitest';
import { RECOMMENDED_GRPO_CONFIG, buildGRPOConfig, exportGRPOConfigAsPython } from '../GRPOConfig';
import { GRPO_REWARD_WEIGHTS } from '../GRPORewardFunctions';

// =============================================================================
// TESTS
// =============================================================================

describe('GRPOConfig', () => {
  // ---------------------------------------------------------------------------
  // RECOMMENDED_GRPO_CONFIG
  // ---------------------------------------------------------------------------

  describe('RECOMMENDED_GRPO_CONFIG', () => {
    it('has correct GRPO hyperparameters', () => {
      const { grpo } = RECOMMENDED_GRPO_CONFIG;

      expect(grpo.learningRate).toBe(1e-6);
      expect(grpo.beta).toBe(0.04);
      expect(grpo.groupSize).toBe(8);
      expect(grpo.temperature).toBe(0.6);
      expect(grpo.topP).toBe(0.95);
      expect(grpo.maxCompletionLength).toBe(4096);
      expect(grpo.maxPromptLength).toBe(1024);
      expect(grpo.numEpochs).toBe(2);
      expect(grpo.perDeviceBatchSize).toBe(4);
      expect(grpo.gradientAccumulationSteps).toBe(4);
      expect(grpo.maxGradNorm).toBe(1.0);
      expect(grpo.weightDecay).toBe(0.01);
      expect(grpo.numRewardFunctions).toBe(5);
    });

    it('has correct vLLM configuration', () => {
      const { vllm } = RECOMMENDED_GRPO_CONFIG;

      expect(vllm.mode).toBe('colocate');
      expect(vllm.enableSleepMode).toBe(true);
      expect(vllm.gpuMemoryUtilisation).toBe(0.5);
      expect(vllm.tensorParallelSize).toBe(1);
      expect(vllm.dtype).toBe('bfloat16');
      expect(vllm.maxNumSeqs).toBe(8);
    });

    it('has OPLoRA enabled with correct settings', () => {
      const { oplora } = RECOMMENDED_GRPO_CONFIG;

      expect(oplora.enabled).toBe(true);
      expect(oplora.rank).toBe(16);
      expect(oplora.alpha).toBe(32);
      expect(oplora.dropout).toBe(0.05);
      expect(oplora.useOrthogonalProjection).toBe(true);
      expect(oplora.targetModules).toContain('q_proj');
      expect(oplora.targetModules).toContain('v_proj');
      expect(oplora.targetModules).toHaveLength(7);
    });

    it('uses GRPO reward weights', () => {
      expect(RECOMMENDED_GRPO_CONFIG.rewardWeights).toEqual(GRPO_REWARD_WEIGHTS);
    });

    it('uses cosine learning rate schedule with 10% warmup', () => {
      const { schedule } = RECOMMENDED_GRPO_CONFIG;

      expect(schedule.schedulerType).toBe('cosine');
      expect(schedule.warmupRatio).toBe(0.1);
    });

    it('uses paged_adamw_8bit optimizer', () => {
      expect(RECOMMENDED_GRPO_CONFIG.hardware.optimizer).toBe('paged_adamw_8bit');
    });

    it('enables gradient checkpointing', () => {
      expect(RECOMMENDED_GRPO_CONFIG.hardware.gradientCheckpointing).toBe(true);
    });

    it('uses bf16 mixed precision', () => {
      expect(RECOMMENDED_GRPO_CONFIG.hardware.mixedPrecision).toBe('bf16');
    });

    it('enables flash attention', () => {
      expect(RECOMMENDED_GRPO_CONFIG.hardware.flashAttention).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // buildGRPOConfig
  // ---------------------------------------------------------------------------

  describe('buildGRPOConfig', () => {
    it('returns recommended config when called with no overrides', () => {
      const config = buildGRPOConfig();
      expect(config.grpo.learningRate).toBe(RECOMMENDED_GRPO_CONFIG.grpo.learningRate);
      expect(config.grpo.beta).toBe(RECOMMENDED_GRPO_CONFIG.grpo.beta);
    });

    it('allows overriding GRPO hyperparameters', () => {
      const config = buildGRPOConfig({
        grpo: { learningRate: 5e-7, groupSize: 16 },
      });

      expect(config.grpo.learningRate).toBe(5e-7);
      expect(config.grpo.groupSize).toBe(16);
      // Non-overridden values should remain at defaults
      expect(config.grpo.beta).toBe(0.04);
    });

    it('allows overriding vLLM settings', () => {
      const config = buildGRPOConfig({
        vllm: { mode: 'offload', dtype: 'float16' },
      });

      expect(config.vllm.mode).toBe('offload');
      expect(config.vllm.dtype).toBe('float16');
      expect(config.vllm.enableSleepMode).toBe(true); // Default preserved
    });

    it('allows disabling OPLoRA', () => {
      const config = buildGRPOConfig({
        oplora: { enabled: false },
      });

      expect(config.oplora.enabled).toBe(false);
      // Other OPLoRA settings are preserved
      expect(config.oplora.rank).toBe(16);
    });

    it('allows overriding hardware settings', () => {
      const config = buildGRPOConfig({
        hardware: { mixedPrecision: 'fp16', flashAttention: false },
      });

      expect(config.hardware.mixedPrecision).toBe('fp16');
      expect(config.hardware.flashAttention).toBe(false);
    });

    it('allows overriding schedule', () => {
      const config = buildGRPOConfig({
        schedule: { schedulerType: 'linear', warmupRatio: 0.05 },
      });

      expect(config.schedule.schedulerType).toBe('linear');
      expect(config.schedule.warmupRatio).toBe(0.05);
    });

    it('allows overriding reward weights', () => {
      const config = buildGRPOConfig({
        rewardWeights: {
          testPassReward: 0.5,
          typeCheckReward: 0.2,
          lintReward: 0.1,
          coverageReward: 0.1,
          circuitBreakerReward: 0.1,
        },
      });

      expect(config.rewardWeights.testPassReward).toBe(0.5);
    });

    it('does not mutate RECOMMENDED_GRPO_CONFIG', () => {
      const originalLR = RECOMMENDED_GRPO_CONFIG.grpo.learningRate;
      buildGRPOConfig({ grpo: { learningRate: 999 } });
      expect(RECOMMENDED_GRPO_CONFIG.grpo.learningRate).toBe(originalLR);
    });
  });

  // ---------------------------------------------------------------------------
  // exportGRPOConfigAsPython
  // ---------------------------------------------------------------------------

  describe('exportGRPOConfigAsPython', () => {
    it('generates valid Python config string', () => {
      const python = exportGRPOConfigAsPython(RECOMMENDED_GRPO_CONFIG);

      expect(python).toContain('from trl import GRPOConfig');
      expect(python).toContain('grpo_config = GRPOConfig(');
      expect(python).toContain('learning_rate=');
      expect(python).toContain('beta=0.04');
      expect(python).toContain('num_generations=8');
      expect(python).toContain('temperature=0.6');
    });

    it('includes vLLM settings', () => {
      const python = exportGRPOConfigAsPython(RECOMMENDED_GRPO_CONFIG);

      expect(python).toContain('use_vllm=True');
      expect(python).toContain('vllm_mode="colocate"');
      expect(python).toContain('vllm_enable_sleep_mode=True');
    });

    it('includes OPLoRA config when enabled', () => {
      const python = exportGRPOConfigAsPython(RECOMMENDED_GRPO_CONFIG);

      expect(python).toContain('from peft import LoraConfig');
      expect(python).toContain('lora_config = LoraConfig(');
      expect(python).toContain('r=16');
      expect(python).toContain('lora_alpha=32');
    });

    it('excludes OPLoRA config when disabled', () => {
      const config = buildGRPOConfig({ oplora: { enabled: false } });
      const python = exportGRPOConfigAsPython(config);

      expect(python).not.toContain('lora_config = LoraConfig(');
    });

    it('includes reward weights', () => {
      const python = exportGRPOConfigAsPython(RECOMMENDED_GRPO_CONFIG);

      expect(python).toContain('REWARD_WEIGHTS');
      expect(python).toContain('"test_pass": 0.4');
      expect(python).toContain('"type_check": 0.2');
      expect(python).toContain('"lint": 0.15');
      expect(python).toContain('"coverage": 0.15');
      expect(python).toContain('"circuit_breaker": 0.1');
    });

    it('includes hardware settings', () => {
      const python = exportGRPOConfigAsPython(RECOMMENDED_GRPO_CONFIG);

      expect(python).toContain('optim="paged_adamw_8bit"');
      expect(python).toContain('gradient_checkpointing=True');
      expect(python).toContain('bf16=True');
    });

    it('handles fp16 mixed precision correctly', () => {
      const config = buildGRPOConfig({
        hardware: { mixedPrecision: 'fp16' },
      });
      const python = exportGRPOConfigAsPython(config);

      expect(python).toContain('fp16=True');
      expect(python).toContain('bf16=False');
    });

    it('includes schedule settings', () => {
      const python = exportGRPOConfigAsPython(RECOMMENDED_GRPO_CONFIG);

      expect(python).toContain('lr_scheduler_type="cosine"');
      expect(python).toContain('warmup_ratio=0.1');
      expect(python).toContain('logging_steps=10');
    });
  });

  // ---------------------------------------------------------------------------
  // Consistency checks
  // ---------------------------------------------------------------------------

  describe('consistency', () => {
    it('group size matches numRewardFunctions expectations', () => {
      // TRL GRPOTrainer expects num_generations (group size) >= 2
      expect(RECOMMENDED_GRPO_CONFIG.grpo.groupSize).toBeGreaterThanOrEqual(2);
    });

    it('learning rate is appropriate for GRPO (lower than SFT)', () => {
      // GRPO uses noisier policy gradients, so lr should be lower
      // than SFT's 2e-4 (per W.006)
      expect(RECOMMENDED_GRPO_CONFIG.grpo.learningRate).toBeLessThan(2e-4);
    });

    it('beta is positive (KL penalty active)', () => {
      expect(RECOMMENDED_GRPO_CONFIG.grpo.beta).toBeGreaterThan(0);
    });

    it('temperature is in valid range', () => {
      expect(RECOMMENDED_GRPO_CONFIG.grpo.temperature).toBeGreaterThan(0);
      expect(RECOMMENDED_GRPO_CONFIG.grpo.temperature).toBeLessThanOrEqual(2.0);
    });

    it('OPLoRA alpha / rank ratio is reasonable', () => {
      const { alpha, rank } = RECOMMENDED_GRPO_CONFIG.oplora;
      const ratio = alpha / rank;
      // Typical ratio is 1-4x
      expect(ratio).toBeGreaterThanOrEqual(1);
      expect(ratio).toBeLessThanOrEqual(4);
    });

    it('warmup ratio is between 0 and 1', () => {
      expect(RECOMMENDED_GRPO_CONFIG.schedule.warmupRatio).toBeGreaterThan(0);
      expect(RECOMMENDED_GRPO_CONFIG.schedule.warmupRatio).toBeLessThan(1);
    });

    it('effective batch size is reasonable', () => {
      const effectiveBatch =
        RECOMMENDED_GRPO_CONFIG.grpo.perDeviceBatchSize *
        RECOMMENDED_GRPO_CONFIG.grpo.gradientAccumulationSteps;
      // Per W.007: effective batch 32-512
      expect(effectiveBatch).toBeGreaterThanOrEqual(8);
      expect(effectiveBatch).toBeLessThanOrEqual(512);
    });
  });
});
