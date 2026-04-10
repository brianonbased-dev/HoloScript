import { describe, it, expect } from 'vitest';
import {
  DEFAULT_OPLORA_CONFIG,
  validateOPLoRAConfig,
  buildOPLoRAConfig,
  exportOPLoRAConfigAsPython,
  type ExtendedOPLoRAConfig,
} from '../OPLoRAConfig';

// =============================================================================
// TESTS
// =============================================================================

describe('OPLoRAConfig', () => {
  // ---------------------------------------------------------------------------
  // DEFAULT_OPLORA_CONFIG
  // ---------------------------------------------------------------------------

  describe('DEFAULT_OPLORA_CONFIG', () => {
    it('has correct default rank', () => {
      expect(DEFAULT_OPLORA_CONFIG.rank).toBe(16);
    });

    it('has correct default alpha', () => {
      expect(DEFAULT_OPLORA_CONFIG.alpha).toBe(32);
    });

    it('has projectionRank = rank * 2', () => {
      expect(DEFAULT_OPLORA_CONFIG.projectionRank).toBe(DEFAULT_OPLORA_CONFIG.rank * 2);
    });

    it('targets all 7 LLaMA projection modules', () => {
      expect(DEFAULT_OPLORA_CONFIG.targetModules).toHaveLength(7);
      expect(DEFAULT_OPLORA_CONFIG.targetModules).toContain('q_proj');
      expect(DEFAULT_OPLORA_CONFIG.targetModules).toContain('k_proj');
      expect(DEFAULT_OPLORA_CONFIG.targetModules).toContain('v_proj');
      expect(DEFAULT_OPLORA_CONFIG.targetModules).toContain('o_proj');
      expect(DEFAULT_OPLORA_CONFIG.targetModules).toContain('gate_proj');
      expect(DEFAULT_OPLORA_CONFIG.targetModules).toContain('up_proj');
      expect(DEFAULT_OPLORA_CONFIG.targetModules).toContain('down_proj');
    });

    it('has correct default loraDropout', () => {
      expect(DEFAULT_OPLORA_CONFIG.loraDropout).toBe(0.05);
    });

    it('has correct default orthogonalWeight', () => {
      expect(DEFAULT_OPLORA_CONFIG.orthogonalWeight).toBe(1.0);
    });

    it('has correct default svdRecomputeInterval', () => {
      expect(DEFAULT_OPLORA_CONFIG.svdRecomputeInterval).toBe(100);
    });
  });

  // ---------------------------------------------------------------------------
  // validateOPLoRAConfig
  // ---------------------------------------------------------------------------

  describe('validateOPLoRAConfig', () => {
    it('validates a correct config with no errors', () => {
      const errors = validateOPLoRAConfig(DEFAULT_OPLORA_CONFIG);
      expect(errors).toHaveLength(0);
    });

    it('validates a minimal correct partial config', () => {
      const errors = validateOPLoRAConfig({ rank: 8, alpha: 16 });
      expect(errors).toHaveLength(0);
    });

    it('validates an empty config (all fields optional)', () => {
      const errors = validateOPLoRAConfig({});
      expect(errors).toHaveLength(0);
    });

    // rank
    it('rejects non-integer rank', () => {
      const errors = validateOPLoRAConfig({ rank: 16.5 });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('rank');
    });

    it('rejects zero rank', () => {
      const errors = validateOPLoRAConfig({ rank: 0 });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('rank');
    });

    it('rejects negative rank', () => {
      const errors = validateOPLoRAConfig({ rank: -4 });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('rank');
    });

    it('rejects rank > 256', () => {
      const errors = validateOPLoRAConfig({ rank: 512 });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('rank');
    });

    it('accepts rank = 1 (minimum)', () => {
      const errors = validateOPLoRAConfig({ rank: 1 });
      expect(errors).toHaveLength(0);
    });

    it('accepts rank = 256 (maximum)', () => {
      const errors = validateOPLoRAConfig({ rank: 256 });
      expect(errors).toHaveLength(0);
    });

    // alpha
    it('rejects zero alpha', () => {
      const errors = validateOPLoRAConfig({ alpha: 0 });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('alpha');
    });

    it('rejects negative alpha', () => {
      const errors = validateOPLoRAConfig({ alpha: -1 });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('alpha');
    });

    it('accepts fractional alpha', () => {
      const errors = validateOPLoRAConfig({ alpha: 0.5 });
      expect(errors).toHaveLength(0);
    });

    // projectionRank
    it('rejects non-integer projectionRank', () => {
      const errors = validateOPLoRAConfig({ projectionRank: 32.5 });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('projectionRank');
    });

    it('rejects zero projectionRank', () => {
      const errors = validateOPLoRAConfig({ projectionRank: 0 });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('projectionRank');
    });

    it('warns when projectionRank < rank', () => {
      const errors = validateOPLoRAConfig({ rank: 16, projectionRank: 8 });
      expect(errors.length).toBeGreaterThan(0);
      const crossFieldError = errors.find(
        (e) => e.field === 'projectionRank' && e.message.includes('>=')
      );
      expect(crossFieldError).toBeDefined();
    });

    it('accepts projectionRank == rank', () => {
      const errors = validateOPLoRAConfig({ rank: 16, projectionRank: 16 });
      expect(errors).toHaveLength(0);
    });

    // targetModules
    it('rejects empty targetModules array', () => {
      const errors = validateOPLoRAConfig({ targetModules: [] });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('targetModules');
    });

    it('rejects targetModules with empty strings', () => {
      const errors = validateOPLoRAConfig({
        targetModules: ['q_proj', ''],
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('targetModules[1]');
    });

    it('accepts custom targetModules', () => {
      const errors = validateOPLoRAConfig({
        targetModules: ['q_proj', 'custom_layer'],
      });
      expect(errors).toHaveLength(0);
    });

    // loraDropout
    it('rejects negative loraDropout', () => {
      const errors = validateOPLoRAConfig({ loraDropout: -0.1 });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('loraDropout');
    });

    it('rejects loraDropout >= 1', () => {
      const errors = validateOPLoRAConfig({ loraDropout: 1.0 });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('loraDropout');
    });

    it('accepts loraDropout = 0', () => {
      const errors = validateOPLoRAConfig({ loraDropout: 0 });
      expect(errors).toHaveLength(0);
    });

    it('accepts loraDropout = 0.5', () => {
      const errors = validateOPLoRAConfig({ loraDropout: 0.5 });
      expect(errors).toHaveLength(0);
    });

    // orthogonalWeight
    it('rejects negative orthogonalWeight', () => {
      const errors = validateOPLoRAConfig({ orthogonalWeight: -0.5 });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('orthogonalWeight');
    });

    it('accepts orthogonalWeight = 0 (disables constraint)', () => {
      const errors = validateOPLoRAConfig({ orthogonalWeight: 0 });
      expect(errors).toHaveLength(0);
    });

    it('accepts large orthogonalWeight', () => {
      const errors = validateOPLoRAConfig({ orthogonalWeight: 10.0 });
      expect(errors).toHaveLength(0);
    });

    // svdRecomputeInterval
    it('rejects negative svdRecomputeInterval', () => {
      const errors = validateOPLoRAConfig({ svdRecomputeInterval: -1 });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('svdRecomputeInterval');
    });

    it('rejects non-integer svdRecomputeInterval', () => {
      const errors = validateOPLoRAConfig({ svdRecomputeInterval: 50.5 });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('svdRecomputeInterval');
    });

    it('accepts svdRecomputeInterval = 0 (compute once)', () => {
      const errors = validateOPLoRAConfig({ svdRecomputeInterval: 0 });
      expect(errors).toHaveLength(0);
    });

    // multiple errors
    it('returns multiple errors for multiple invalid fields', () => {
      const errors = validateOPLoRAConfig({
        rank: -1,
        alpha: 0,
        loraDropout: 2.0,
        orthogonalWeight: -5,
      });
      expect(errors.length).toBeGreaterThanOrEqual(4);
    });
  });

  // ---------------------------------------------------------------------------
  // buildOPLoRAConfig
  // ---------------------------------------------------------------------------

  describe('buildOPLoRAConfig', () => {
    it('returns defaults when called with no overrides', () => {
      const config = buildOPLoRAConfig();
      expect(config.rank).toBe(DEFAULT_OPLORA_CONFIG.rank);
      expect(config.alpha).toBe(DEFAULT_OPLORA_CONFIG.alpha);
      expect(config.projectionRank).toBe(DEFAULT_OPLORA_CONFIG.projectionRank);
      expect(config.loraDropout).toBe(DEFAULT_OPLORA_CONFIG.loraDropout);
      expect(config.orthogonalWeight).toBe(DEFAULT_OPLORA_CONFIG.orthogonalWeight);
      expect(config.svdRecomputeInterval).toBe(DEFAULT_OPLORA_CONFIG.svdRecomputeInterval);
    });

    it('allows overriding individual fields', () => {
      const config = buildOPLoRAConfig({ rank: 8, alpha: 16 });
      expect(config.rank).toBe(8);
      expect(config.alpha).toBe(16);
      // Non-overridden fields should remain at defaults
      expect(config.loraDropout).toBe(DEFAULT_OPLORA_CONFIG.loraDropout);
    });

    it('allows overriding targetModules', () => {
      const config = buildOPLoRAConfig({
        targetModules: ['q_proj', 'k_proj'],
      });
      expect(config.targetModules).toEqual(['q_proj', 'k_proj']);
    });

    it('deep-copies targetModules to prevent mutation', () => {
      const modules = ['q_proj', 'k_proj'];
      const config = buildOPLoRAConfig({ targetModules: modules });
      modules.push('v_proj');
      expect(config.targetModules).toEqual(['q_proj', 'k_proj']);
    });

    it('marks the result as validated', () => {
      const config = buildOPLoRAConfig();
      expect(config.__validated).toBe(true);
    });

    it('throws on invalid configuration', () => {
      expect(() => buildOPLoRAConfig({ rank: -1 })).toThrow('Invalid OPLoRA configuration');
    });

    it('throws with descriptive error messages', () => {
      try {
        buildOPLoRAConfig({ rank: 0, alpha: -1 });
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        const msg = (e as Error).message;
        expect(msg).toContain('rank');
        expect(msg).toContain('alpha');
      }
    });

    it('does not mutate DEFAULT_OPLORA_CONFIG', () => {
      const originalRank = DEFAULT_OPLORA_CONFIG.rank;
      buildOPLoRAConfig({ rank: 64, projectionRank: 128 });
      expect(DEFAULT_OPLORA_CONFIG.rank).toBe(originalRank);
    });
  });

  // ---------------------------------------------------------------------------
  // exportOPLoRAConfigAsPython
  // ---------------------------------------------------------------------------

  describe('exportOPLoRAConfigAsPython', () => {
    it('generates Python import statement', () => {
      const python = exportOPLoRAConfigAsPython(DEFAULT_OPLORA_CONFIG);
      expect(python).toContain('from peft import LoraConfig');
    });

    it('generates LoraConfig with correct rank', () => {
      const python = exportOPLoRAConfigAsPython(DEFAULT_OPLORA_CONFIG);
      expect(python).toContain('r=16');
    });

    it('generates LoraConfig with correct alpha', () => {
      const python = exportOPLoRAConfigAsPython(DEFAULT_OPLORA_CONFIG);
      expect(python).toContain('lora_alpha=32');
    });

    it('generates LoraConfig with correct dropout', () => {
      const python = exportOPLoRAConfigAsPython(DEFAULT_OPLORA_CONFIG);
      expect(python).toContain('lora_dropout=0.05');
    });

    it('includes target modules', () => {
      const python = exportOPLoRAConfigAsPython(DEFAULT_OPLORA_CONFIG);
      expect(python).toContain('target_modules=');
      expect(python).toContain('q_proj');
      expect(python).toContain('down_proj');
    });

    it('includes oplora_params dict', () => {
      const python = exportOPLoRAConfigAsPython(DEFAULT_OPLORA_CONFIG);
      expect(python).toContain('oplora_params');
      expect(python).toContain('"projection_rank": 32');
      expect(python).toContain('"orthogonal_weight": 1');
      expect(python).toContain('"svd_recompute_interval": 100');
    });

    it('generates valid Python assignment syntax', () => {
      const python = exportOPLoRAConfigAsPython(DEFAULT_OPLORA_CONFIG);
      expect(python).toContain('lora_config = LoraConfig(');
      expect(python).toContain('oplora_params = {');
    });

    it('includes task_type and bias settings', () => {
      const python = exportOPLoRAConfigAsPython(DEFAULT_OPLORA_CONFIG);
      expect(python).toContain('task_type="CAUSAL_LM"');
      expect(python).toContain('bias="none"');
    });

    it('uses custom values when provided', () => {
      const config: ExtendedOPLoRAConfig = {
        ...DEFAULT_OPLORA_CONFIG,
        rank: 8,
        alpha: 16,
        projectionRank: 24,
        orthogonalWeight: 2.5,
        svdRecomputeInterval: 50,
      };
      const python = exportOPLoRAConfigAsPython(config);
      expect(python).toContain('r=8');
      expect(python).toContain('lora_alpha=16');
      expect(python).toContain('"projection_rank": 24');
      expect(python).toContain('"orthogonal_weight": 2.5');
      expect(python).toContain('"svd_recompute_interval": 50');
    });
  });

  // ---------------------------------------------------------------------------
  // Consistency checks
  // ---------------------------------------------------------------------------

  describe('consistency', () => {
    it('alpha / rank ratio is 2 (standard scaling)', () => {
      const ratio = DEFAULT_OPLORA_CONFIG.alpha / DEFAULT_OPLORA_CONFIG.rank;
      expect(ratio).toBe(2);
    });

    it('projectionRank is 2x the LoRA rank', () => {
      expect(DEFAULT_OPLORA_CONFIG.projectionRank).toBe(DEFAULT_OPLORA_CONFIG.rank * 2);
    });

    it('loraDropout is within standard range', () => {
      expect(DEFAULT_OPLORA_CONFIG.loraDropout).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_OPLORA_CONFIG.loraDropout).toBeLessThanOrEqual(0.2);
    });

    it('svdRecomputeInterval is a reasonable step count', () => {
      expect(DEFAULT_OPLORA_CONFIG.svdRecomputeInterval).toBeGreaterThanOrEqual(10);
      expect(DEFAULT_OPLORA_CONFIG.svdRecomputeInterval).toBeLessThanOrEqual(1000);
    });

    it('targetModules includes all standard LLaMA attention projections', () => {
      const attentionModules = ['q_proj', 'k_proj', 'v_proj', 'o_proj'];
      for (const mod of attentionModules) {
        expect(DEFAULT_OPLORA_CONFIG.targetModules).toContain(mod);
      }
    });

    it('targetModules includes MLP projections', () => {
      const mlpModules = ['gate_proj', 'up_proj', 'down_proj'];
      for (const mod of mlpModules) {
        expect(DEFAULT_OPLORA_CONFIG.targetModules).toContain(mod);
      }
    });
  });
});
