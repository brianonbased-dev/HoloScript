import { describe, expect, it, beforeEach } from 'vitest';
import { usePipelineStore, DEFAULT_LAYER_CONFIGS } from '../pipelineStore';
import type { LayerCycleResult, L0Output } from '../../recursive/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCycleResult(layerId: 0 | 1 | 2 = 0): LayerCycleResult {
  return {
    layerId,
    cycleId: `test-${layerId}-${Date.now()}`,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: 5000,
    costUSD: 0.50,
    qualityBefore: 0.85,
    qualityAfter: 0.89,
    qualityDelta: 0.04,
    output: {
      kind: 'code_patches',
      patches: [],
      qualityDelta: 0.04,
      filesChanged: 3,
      focusUsed: 'typefix',
    } as L0Output,
    inputFromBelow: [],
    status: 'success',
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('pipelineStore', () => {
  beforeEach(() => {
    // Reset store between tests
    usePipelineStore.setState({
      activePipeline: null,
      pipelineHistory: [],
      layerConfigs: { ...DEFAULT_LAYER_CONFIGS },
      globalFeedback: [],
    });
  });

  it('initializes with correct defaults', () => {
    const state = usePipelineStore.getState();
    expect(state.activePipeline).toBeNull();
    expect(state.pipelineHistory).toEqual([]);
    expect(state.layerConfigs[0].name).toBe('Code Fixer');
    expect(state.layerConfigs[1].name).toBe('Strategy Optimizer');
    expect(state.layerConfigs[2].name).toBe('Meta-Strategist');
  });

  it('has correct default budgets', () => {
    const configs = usePipelineStore.getState().layerConfigs;
    expect(configs[0].budget.maxCostUSD).toBe(2.00);
    expect(configs[1].budget.maxCostUSD).toBe(1.00);
    expect(configs[2].budget.maxCostUSD).toBe(1.50);
  });

  it('has correct default review gates', () => {
    const configs = usePipelineStore.getState().layerConfigs;
    expect(configs[0].requiresHumanReview).toBe(false);
    expect(configs[1].requiresHumanReview).toBe(true);
    expect(configs[2].requiresHumanReview).toBe(true);
  });

  describe('startPipeline', () => {
    it('creates a pipeline run with correct structure', () => {
      const store = usePipelineStore.getState();
      const id = store.startPipeline('single', 'test-workspace');

      const pipeline = usePipelineStore.getState().activePipeline;
      expect(pipeline).not.toBeNull();
      expect(pipeline!.id).toBe(id);
      expect(pipeline!.mode).toBe('single');
      expect(pipeline!.targetProject).toBe('test-workspace');
      expect(pipeline!.status).toBe('running');
      expect(pipeline!.totalCostUSD).toBe(0);
      expect(pipeline!.humanReviewsPending).toBe(0);
    });

    it('initializes all 3 layers as idle', () => {
      usePipelineStore.getState().startPipeline('single', 'test');
      const pipeline = usePipelineStore.getState().activePipeline!;

      for (const layerId of [0, 1, 2] as const) {
        expect(pipeline.layers[layerId].status).toBe('idle');
        expect(pipeline.layers[layerId].cyclesCompleted).toBe(0);
        expect(pipeline.layers[layerId].history).toEqual([]);
        expect(pipeline.layers[layerId].feedbackBuffer).toEqual([]);
      }
    });
  });

  describe('recordCycleResult', () => {
    it('appends to layer history and updates metrics', () => {
      usePipelineStore.getState().startPipeline('single', 'test');
      const result = makeCycleResult(0);
      usePipelineStore.getState().recordCycleResult(result);

      const pipeline = usePipelineStore.getState().activePipeline!;
      expect(pipeline.layers[0].history).toHaveLength(1);
      expect(pipeline.layers[0].cyclesCompleted).toBe(1);
      expect(pipeline.layers[0].status).toBe('completed');
      expect(pipeline.totalCostUSD).toBe(0.50);
      expect(pipeline.totalDurationMs).toBe(5000);
    });

    it('accumulates cost across multiple cycles', () => {
      usePipelineStore.getState().startPipeline('single', 'test');
      usePipelineStore.getState().recordCycleResult(makeCycleResult(0));
      usePipelineStore.getState().recordCycleResult(makeCycleResult(0));

      const pipeline = usePipelineStore.getState().activePipeline!;
      expect(pipeline.totalCostUSD).toBe(1.00);
      expect(pipeline.layers[0].cyclesCompleted).toBe(2);
    });
  });

  describe('pushFeedback', () => {
    it('routes feedback to the layer above the source', () => {
      usePipelineStore.getState().startPipeline('single', 'test');
      usePipelineStore.getState().pushFeedback({
        sourceLayer: 0,
        timestamp: new Date().toISOString(),
        signalType: 'quality_trend',
        data: { delta: 0.03 },
      });

      const pipeline = usePipelineStore.getState().activePipeline!;
      // Signal from L0 should appear in L1's buffer
      expect(pipeline.layers[1].feedbackBuffer).toHaveLength(1);
      expect(pipeline.layers[0].feedbackBuffer).toHaveLength(0);
    });

    it('does not route feedback above L2', () => {
      usePipelineStore.getState().startPipeline('single', 'test');
      usePipelineStore.getState().pushFeedback({
        sourceLayer: 2,
        timestamp: new Date().toISOString(),
        signalType: 'quality_trend',
        data: { delta: 0.03 },
      });

      const pipeline = usePipelineStore.getState().activePipeline!;
      // No layer above L2, so nothing should change
      expect(pipeline.layers[0].feedbackBuffer).toHaveLength(0);
      expect(pipeline.layers[1].feedbackBuffer).toHaveLength(0);
      expect(pipeline.layers[2].feedbackBuffer).toHaveLength(0);
    });
  });

  describe('consumeFeedback', () => {
    it('returns and clears the feedback buffer', () => {
      usePipelineStore.getState().startPipeline('single', 'test');
      usePipelineStore.getState().pushFeedback({
        sourceLayer: 0,
        timestamp: new Date().toISOString(),
        signalType: 'quality_trend',
        data: { delta: 0.03 },
      });

      const consumed = usePipelineStore.getState().consumeFeedback(1);
      expect(consumed).toHaveLength(1);

      // Buffer should be cleared
      const pipeline = usePipelineStore.getState().activePipeline!;
      expect(pipeline.layers[1].feedbackBuffer).toHaveLength(0);
    });
  });

  describe('review gates', () => {
    it('approveReview changes status to scheduled', () => {
      usePipelineStore.getState().startPipeline('single', 'test');
      usePipelineStore.getState().updateLayerStatus(1, 'awaiting_review');
      usePipelineStore.getState().approveReview(1);

      const pipeline = usePipelineStore.getState().activePipeline!;
      expect(pipeline.layers[1].status).toBe('scheduled');
    });

    it('rejectReview changes status to idle', () => {
      usePipelineStore.getState().startPipeline('single', 'test');
      usePipelineStore.getState().updateLayerStatus(1, 'awaiting_review');
      usePipelineStore.getState().rejectReview(1);

      const pipeline = usePipelineStore.getState().activePipeline!;
      expect(pipeline.layers[1].status).toBe('idle');
    });

    it('tracks humanReviewsPending count', () => {
      usePipelineStore.getState().startPipeline('single', 'test');
      usePipelineStore.getState().updateLayerStatus(1, 'awaiting_review');
      usePipelineStore.getState().updateLayerStatus(2, 'awaiting_review');

      let pipeline = usePipelineStore.getState().activePipeline!;
      expect(pipeline.humanReviewsPending).toBe(2);

      usePipelineStore.getState().approveReview(1);
      pipeline = usePipelineStore.getState().activePipeline!;
      expect(pipeline.humanReviewsPending).toBe(1);
    });
  });

  describe('stopPipeline', () => {
    it('moves active pipeline to history', () => {
      usePipelineStore.getState().startPipeline('single', 'test');
      usePipelineStore.getState().stopPipeline();

      const state = usePipelineStore.getState();
      expect(state.activePipeline).toBeNull();
      expect(state.pipelineHistory).toHaveLength(1);
      expect(state.pipelineHistory[0].status).toBe('completed');
    });
  });

  describe('updateLayerConfig', () => {
    it('patches a specific layer config', () => {
      usePipelineStore.getState().updateLayerConfig(0, {
        budget: { maxCostUSD: 5.00, maxDurationMs: 600_000, maxCycles: 5, cooldownMs: 1_000 },
      });

      const configs = usePipelineStore.getState().layerConfigs;
      expect(configs[0].budget.maxCostUSD).toBe(5.00);
      // Other layers unchanged
      expect(configs[1].budget.maxCostUSD).toBe(1.00);
    });
  });

  describe('resetLayerConfigs', () => {
    it('restores default configurations', () => {
      usePipelineStore.getState().updateLayerConfig(0, { enabled: false });
      usePipelineStore.getState().resetLayerConfigs();

      const configs = usePipelineStore.getState().layerConfigs;
      expect(configs[0].enabled).toBe(true);
    });
  });
});
