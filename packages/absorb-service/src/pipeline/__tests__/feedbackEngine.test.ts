import { describe, expect, it } from 'vitest';
import {
  generateFeedbackSignals,
  aggregateFeedback,
  countConsecutivePlateaus,
  PLATEAU_THRESHOLD,
} from '../feedbackEngine';
import type { LayerCycleResult, FeedbackSignal, L0Output } from '../types';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeCycleResult(overrides: Partial<LayerCycleResult> = {}): LayerCycleResult {
  return {
    layerId: 0,
    cycleId: 'test-cycle-1',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: 5000,
    costUSD: 0.5,
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
    ...overrides,
  };
}

function makeSignal(overrides: Partial<FeedbackSignal> = {}): FeedbackSignal {
  return {
    sourceLayer: 0,
    timestamp: new Date().toISOString(),
    signalType: 'quality_trend',
    data: { before: 0.85, after: 0.89, delta: 0.04 },
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('generateFeedbackSignals', () => {
  it('always emits quality_trend signal', () => {
    const signals = generateFeedbackSignals(makeCycleResult());
    const qualityTrend = signals.find((s) => s.signalType === 'quality_trend');
    expect(qualityTrend).toBeDefined();
    expect(qualityTrend!.data.delta).toBe(0.04);
  });

  it('emits cost_efficiency when cost > 0 and delta != 0', () => {
    const signals = generateFeedbackSignals(makeCycleResult({ costUSD: 1.0 }));
    const costSignal = signals.find((s) => s.signalType === 'cost_efficiency');
    expect(costSignal).toBeDefined();
    expect(costSignal!.data.costPerPoint).toBe(1.0 / 0.04);
  });

  it('does not emit cost_efficiency when delta is 0', () => {
    const signals = generateFeedbackSignals(
      makeCycleResult({
        qualityDelta: 0,
        costUSD: 1.0,
      })
    );
    const costSignal = signals.find((s) => s.signalType === 'cost_efficiency');
    expect(costSignal).toBeUndefined();
  });

  it('emits plateau_detected when delta below threshold', () => {
    const signals = generateFeedbackSignals(
      makeCycleResult({
        qualityDelta: 0.005,
      })
    );
    const plateau = signals.find((s) => s.signalType === 'plateau_detected');
    expect(plateau).toBeDefined();
  });

  it('does not emit plateau when delta above threshold', () => {
    const signals = generateFeedbackSignals(
      makeCycleResult({
        qualityDelta: 0.05,
      })
    );
    const plateau = signals.find((s) => s.signalType === 'plateau_detected');
    expect(plateau).toBeUndefined();
  });

  it('emits focus_effectiveness for L0 code_patches', () => {
    const signals = generateFeedbackSignals(makeCycleResult());
    const focus = signals.find((s) => s.signalType === 'focus_effectiveness');
    expect(focus).toBeDefined();
    expect(focus!.data.focus).toBe('typefix');
  });

  it('does not emit focus_effectiveness for non-L0 layers', () => {
    const signals = generateFeedbackSignals(
      makeCycleResult({
        layerId: 1,
        output: {
          kind: 'strategy_adjustment',
          focusRotationChange: null,
          profileChange: null,
          passesChange: null,
          budgetAdjustment: null,
          rationale: 'test',
        },
      })
    );
    const focus = signals.find((s) => s.signalType === 'focus_effectiveness');
    expect(focus).toBeUndefined();
  });

  it('emits failure_pattern on failure status', () => {
    const signals = generateFeedbackSignals(makeCycleResult({ status: 'failure' }));
    const failure = signals.find((s) => s.signalType === 'failure_pattern');
    expect(failure).toBeDefined();
  });
});

describe('aggregateFeedback', () => {
  it('returns improving trajectory for positive deltas', () => {
    const signals = [
      makeSignal({ data: { delta: 0.03 } }),
      makeSignal({ data: { delta: 0.05 } }),
      makeSignal({ data: { delta: 0.02 } }),
    ];
    const summary = aggregateFeedback(signals);
    expect(summary.qualityTrajectory).toBe('improving');
  });

  it('returns declining trajectory for negative deltas', () => {
    const signals = [
      makeSignal({ data: { delta: -0.03 } }),
      makeSignal({ data: { delta: -0.02 } }),
    ];
    const summary = aggregateFeedback(signals);
    expect(summary.qualityTrajectory).toBe('declining');
  });

  it('returns stagnant trajectory for near-zero deltas', () => {
    const signals = [
      makeSignal({ data: { delta: 0.001 } }),
      makeSignal({ data: { delta: -0.002 } }),
    ];
    const summary = aggregateFeedback(signals);
    expect(summary.qualityTrajectory).toBe('stagnant');
  });

  it('ranks focuses by effectiveness', () => {
    const signals = [
      makeSignal({ signalType: 'focus_effectiveness', data: { focus: 'typefix', delta: 0.05 } }),
      makeSignal({ signalType: 'focus_effectiveness', data: { focus: 'lint', delta: 0.01 } }),
      makeSignal({ signalType: 'focus_effectiveness', data: { focus: 'typefix', delta: 0.03 } }),
    ];
    const summary = aggregateFeedback(signals);
    expect(summary.bestFocus[0].focus).toBe('typefix');
    expect(summary.bestFocus[0].avgDelta).toBe(0.04);
    expect(summary.bestFocus[1].focus).toBe('lint');
  });

  it('counts plateaus', () => {
    const signals = [
      makeSignal({ signalType: 'plateau_detected' }),
      makeSignal({ signalType: 'plateau_detected' }),
      makeSignal({ signalType: 'quality_trend', data: { delta: 0.05 } }),
    ];
    const summary = aggregateFeedback(signals);
    expect(summary.plateauCount).toBe(2);
  });

  it('handles empty signals', () => {
    const summary = aggregateFeedback([]);
    expect(summary.qualityTrajectory).toBe('stagnant');
    expect(summary.bestFocus).toEqual([]);
    expect(summary.avgCostPerPoint).toBe(0);
    expect(summary.plateauCount).toBe(0);
    expect(summary.totalSignals).toBe(0);
  });
});

describe('countConsecutivePlateaus', () => {
  it('counts trailing plateaus', () => {
    const history = [
      makeCycleResult({ qualityDelta: 0.05 }),
      makeCycleResult({ qualityDelta: 0.003 }),
      makeCycleResult({ qualityDelta: 0.001 }),
    ];
    expect(countConsecutivePlateaus(history)).toBe(2);
  });

  it('returns 0 when no plateaus', () => {
    const history = [
      makeCycleResult({ qualityDelta: 0.05 }),
      makeCycleResult({ qualityDelta: 0.03 }),
    ];
    expect(countConsecutivePlateaus(history)).toBe(0);
  });

  it('returns full count when all plateaus', () => {
    const history = [
      makeCycleResult({ qualityDelta: 0.002 }),
      makeCycleResult({ qualityDelta: 0.001 }),
    ];
    expect(countConsecutivePlateaus(history)).toBe(2);
  });

  it('handles empty history', () => {
    expect(countConsecutivePlateaus([])).toBe(0);
  });
});

describe('PLATEAU_THRESHOLD', () => {
  it('is 0.01 matching daemon-actions.ts', () => {
    expect(PLATEAU_THRESHOLD).toBe(0.01);
  });
});
