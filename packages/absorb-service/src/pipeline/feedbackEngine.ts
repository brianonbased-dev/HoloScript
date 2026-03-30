/**
 * Feedback Engine — Transforms layer cycle results into structured signals
 * and aggregates them into trend summaries for higher layers.
 *
 * Feedback flows upward only: L0 → L1 → L2.
 * Plateau threshold (0.01) matches daemon-actions.ts quality scoring.
 */

import type {
  LayerCycleResult,
  FeedbackSignal,
  TrendSummary,
  QualityTrajectory,
  FocusRanking,
  LayerId,
} from './types';

// ─── Signal Generation ───────────────────────────────────────────────────────

/** Plateau detection threshold — matches daemon-actions.ts delta check */
const PLATEAU_THRESHOLD = 0.01;

/**
 * Generate feedback signals from a completed cycle result.
 * These signals are routed to the layer above for consumption.
 */
export function generateFeedbackSignals(result: LayerCycleResult): FeedbackSignal[] {
  const signals: FeedbackSignal[] = [];
  const now = new Date().toISOString();

  // Always emit quality trend
  signals.push({
    sourceLayer: result.layerId,
    timestamp: now,
    signalType: 'quality_trend',
    data: {
      before: result.qualityBefore,
      after: result.qualityAfter,
      delta: result.qualityDelta,
      cycleId: result.cycleId,
    },
  });

  // Cost efficiency (only when there's a meaningful delta)
  if (result.costUSD > 0 && result.qualityDelta !== 0) {
    signals.push({
      sourceLayer: result.layerId,
      timestamp: now,
      signalType: 'cost_efficiency',
      data: {
        costUSD: result.costUSD,
        qualityDelta: result.qualityDelta,
        costPerPoint: result.costUSD / Math.abs(result.qualityDelta),
      },
    });
  }

  // Plateau detection
  if (Math.abs(result.qualityDelta) < PLATEAU_THRESHOLD) {
    signals.push({
      sourceLayer: result.layerId,
      timestamp: now,
      signalType: 'plateau_detected',
      data: {
        delta: result.qualityDelta,
        cycleId: result.cycleId,
      },
    });
  }

  // Focus effectiveness (L0 only — other layers don't have a focus concept)
  if (result.layerId === 0 && result.output.kind === 'code_patches') {
    signals.push({
      sourceLayer: 0,
      timestamp: now,
      signalType: 'focus_effectiveness',
      data: {
        focus: result.output.focusUsed,
        delta: result.qualityDelta,
        patchCount: result.output.patches.length,
        filesChanged: result.output.filesChanged,
      },
    });
  }

  // Failure pattern (when cycle status indicates problems)
  if (result.status === 'failure') {
    signals.push({
      sourceLayer: result.layerId,
      timestamp: now,
      signalType: 'failure_pattern',
      data: {
        cycleId: result.cycleId,
        status: result.status,
      },
    });
  }

  return signals;
}

// ─── Trend Aggregation ───────────────────────────────────────────────────────

/**
 * Compute trajectory from a sequence of quality trend signals.
 * Uses simple linear regression on deltas.
 */
function computeTrajectory(qualitySignals: FeedbackSignal[]): QualityTrajectory {
  if (qualitySignals.length < 2) return 'stagnant';

  const deltas = qualitySignals.map((s) => (s.data.delta as number) ?? 0);
  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;

  if (avgDelta > PLATEAU_THRESHOLD) return 'improving';
  if (avgDelta < -PLATEAU_THRESHOLD) return 'declining';
  return 'stagnant';
}

/**
 * Rank focuses by average quality delta (best first).
 */
function rankFocusByEffectiveness(focusSignals: FeedbackSignal[]): FocusRanking[] {
  const focusMap = new Map<string, { totalDelta: number; count: number }>();

  for (const signal of focusSignals) {
    const focus = signal.data.focus as string;
    const delta = signal.data.delta as number;
    if (!focus) continue;

    const entry = focusMap.get(focus) ?? { totalDelta: 0, count: 0 };
    entry.totalDelta += delta;
    entry.count += 1;
    focusMap.set(focus, entry);
  }

  return Array.from(focusMap.entries())
    .map(([focus, { totalDelta, count }]) => ({
      focus,
      avgDelta: totalDelta / count,
      count,
    }))
    .sort((a, b) => b.avgDelta - a.avgDelta);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Aggregate multiple feedback signals into a trend summary.
 * Used by L1/L2 to understand what's happening in the layers below.
 */
export function aggregateFeedback(signals: FeedbackSignal[]): TrendSummary {
  const qualityTrends = signals.filter((s) => s.signalType === 'quality_trend');
  const costSignals = signals.filter((s) => s.signalType === 'cost_efficiency');
  const focusSignals = signals.filter((s) => s.signalType === 'focus_effectiveness');
  const plateauSignals = signals.filter((s) => s.signalType === 'plateau_detected');

  const costPerPoints = costSignals
    .map((s) => s.data.costPerPoint as number)
    .filter((v) => isFinite(v));

  return {
    qualityTrajectory: computeTrajectory(qualityTrends),
    bestFocus: rankFocusByEffectiveness(focusSignals),
    avgCostPerPoint: mean(costPerPoints),
    plateauCount: plateauSignals.length,
    totalSignals: signals.length,
  };
}

/**
 * Count consecutive plateau signals at the end of a layer's history.
 */
export function countConsecutivePlateaus(history: LayerCycleResult[]): number {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (Math.abs(history[i].qualityDelta) < PLATEAU_THRESHOLD) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

export { PLATEAU_THRESHOLD };
