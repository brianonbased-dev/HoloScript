/**
 * FeedbackLoopTrait — v5.0
 *
 * Self-improving quality metrics, user feedback collection,
 * and automated optimization signals for HoloScript scenes.
 *
 * Architecture:
 *   Metrics (FPS, engagement, errors) → Targets → Drift Detection → Signals
 *   User Feedback (ratings, text) → Aggregation → Trend Analysis → Signals
 *   Signals → Agent reactions (degrade quality, boost LOD, alert creator)
 *
 * Events:
 *  feedback:metric_updated     { name, value, target, trend }
 *  feedback:metric_alert       { name, value, target, severity }
 *  feedback:user_submitted     { userId, rating, text }
 *  feedback:optimization_signal { metric, direction, magnitude, suggestedAction }
 *  feedback:report             { metrics, averageRating, trendSummary }
 *
 * @version 5.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type MetricTrend = 'improving' | 'declining' | 'stable';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface QualityMetric {
  name: string;
  value: number;
  target: number;
  min: number;
  max: number;
  trend: MetricTrend;
  history: number[]; // Rolling window of recent values
  historyMaxLength: number;
  lastUpdated: number;
}

export interface FeedbackEntry {
  id: string;
  userId: string;
  rating: number; // 1-5
  message: string;
  context: Record<string, unknown>;
  timestamp: number;
}

export interface OptimizationSignal {
  id: string;
  metric: string;
  direction: 'increase' | 'decrease';
  magnitude: number; // 0-1 urgency
  suggestedAction: string;
  timestamp: number;
  acknowledged: boolean;
}

// =============================================================================
// CONFIG & STATE
// =============================================================================

export interface FeedbackConfig {
  /** Metric definitions: name → target */
  metrics: Record<string, { target: number; min: number; max: number }>;
  /** Rolling window size for trend detection */
  history_window: number;
  /** Threshold for triggering optimization signal (% off target) */
  alert_threshold: number;
  /** Critical threshold (% off target) */
  critical_threshold: number;
  /** Max feedback entries stored */
  max_feedback_entries: number;
  /** Max optimization signals stored */
  max_signals: number;
  /** Auto-emit signals when metrics drift */
  auto_signal: boolean;
  /** Minimum samples before trend detection starts */
  min_samples_for_trend: number;
}

export interface FeedbackState {
  metrics: Map<string, QualityMetric>;
  feedback: FeedbackEntry[];
  signals: OptimizationSignal[];
  feedbackCounter: number;
  signalCounter: number;
  totalFeedback: number;
  ratingSum: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function computeTrend(history: number[], minSamples: number): MetricTrend {
  if (history.length < minSamples) return 'stable';

  // Linear regression slope over recent window
  const n = history.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += history[i];
    sumXY += i * history[i];
    sumXX += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

  const avg = sumY / n;
  const threshold = Math.abs(avg) * 0.01; // 1% of average

  if (slope > threshold) return 'improving';
  if (slope < -threshold) return 'declining';
  return 'stable';
}

function driftPercent(value: number, target: number): number {
  if (target === 0) return value === 0 ? 0 : 100;
  return (Math.abs(value - target) / Math.abs(target)) * 100;
}

function suggestAction(name: string, value: number, target: number): string {
  if (name === 'fps' && value < target) return 'reduce_gaussian_quality';
  if (name === 'fps' && value > target * 1.5) return 'increase_gaussian_quality';
  if (name === 'error_rate' && value > target) return 'enable_fallback_mode';
  if (name === 'engagement_time' && value < target) return 'enhance_content';
  if (name === 'agent_response_time' && value > target) return 'reduce_context_window';
  if (name === 'memory_usage' && value > target) return 'trigger_gc';
  return value < target ? `increase_${name}` : `decrease_${name}`;
}

// =============================================================================
// HANDLER
// =============================================================================

export const feedbackLoopHandler: TraitHandler<FeedbackConfig> = {
  name: 'feedback_loop' as any,

  defaultConfig: {
    metrics: {
      fps: { target: 60, min: 0, max: 144 },
      engagement_time: { target: 120, min: 0, max: 3600 },
      error_rate: { target: 0, min: 0, max: 100 },
      agent_response_time: { target: 500, min: 0, max: 10000 },
      memory_usage: { target: 512, min: 0, max: 8192 },
    },
    history_window: 60,
    alert_threshold: 20,
    critical_threshold: 50,
    max_feedback_entries: 500,
    max_signals: 100,
    auto_signal: true,
    min_samples_for_trend: 5,
  },

  // ===========================================================================
  // onAttach
  // ===========================================================================
  onAttach(node: any, config: FeedbackConfig, context: any): void {
    const state: FeedbackState = {
      metrics: new Map(),
      feedback: [],
      signals: [],
      feedbackCounter: 0,
      signalCounter: 0,
      totalFeedback: 0,
      ratingSum: 0,
    };

    // Initialize metrics from config
    for (const [name, def] of Object.entries(config.metrics)) {
      state.metrics.set(name, {
        name,
        value: def.target,
        target: def.target,
        min: def.min,
        max: def.max,
        trend: 'stable',
        history: [],
        historyMaxLength: config.history_window,
        lastUpdated: Date.now(),
      });
    }

    node.__feedbackState = state;
    context.emit?.('feedback:ready', {
      metrics: Object.keys(config.metrics),
      timestamp: Date.now(),
    });
  },

  // ===========================================================================
  // onDetach
  // ===========================================================================
  onDetach(node: any, _config: FeedbackConfig, context: any): void {
    const state: FeedbackState | undefined = node.__feedbackState;
    if (state) {
      context.emit?.('feedback:shutdown', {
        totalFeedback: state.totalFeedback,
        averageRating: state.totalFeedback > 0 ? state.ratingSum / state.totalFeedback : 0,
        signalsEmitted: state.signalCounter,
      });
    }
    delete node.__feedbackState;
  },

  // ===========================================================================
  // onUpdate — no per-frame work needed (event-driven)
  // ===========================================================================
  onUpdate(_node: any, _config: FeedbackConfig, _context: any, _delta: number): void {
    /* Metric collection and signal emission are event-driven */
  },

  // ===========================================================================
  // onEvent
  // ===========================================================================
  onEvent(node: any, config: FeedbackConfig, context: any, event: any): void {
    const state: FeedbackState | undefined = node.__feedbackState;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;
    const payload = (event as any)?.payload ?? event;

    switch (eventType) {
      // ─── Metric update ──────────────────────────────────────────────
      case 'feedback:update_metric': {
        const name = payload.name as string;
        const value = Number(payload.value);
        const metric = state.metrics.get(name);
        if (!metric) break;

        metric.value = Math.max(metric.min, Math.min(metric.max, value));
        metric.history.push(metric.value);
        if (metric.history.length > metric.historyMaxLength) {
          metric.history.shift();
        }
        metric.trend = computeTrend(metric.history, config.min_samples_for_trend);
        metric.lastUpdated = Date.now();

        context.emit?.('feedback:metric_updated', {
          name,
          value: metric.value,
          target: metric.target,
          trend: metric.trend,
        });

        // Auto-signal on drift
        if (config.auto_signal) {
          const drift = driftPercent(metric.value, metric.target);
          if (drift >= config.critical_threshold) {
            const signalId = `sig_${state.signalCounter++}`;
            const signal: OptimizationSignal = {
              id: signalId,
              metric: name,
              direction: metric.value < metric.target ? 'increase' : 'decrease',
              magnitude: Math.min(1, drift / 100),
              suggestedAction: suggestAction(name, metric.value, metric.target),
              timestamp: Date.now(),
              acknowledged: false,
            };
            state.signals.push(signal);
            if (state.signals.length > config.max_signals) {
              state.signals.shift();
            }

            context.emit?.('feedback:metric_alert', {
              name,
              value: metric.value,
              target: metric.target,
              severity: 'critical' as AlertSeverity,
            });
            context.emit?.('feedback:optimization_signal', signal);
          } else if (drift >= config.alert_threshold) {
            context.emit?.('feedback:metric_alert', {
              name,
              value: metric.value,
              target: metric.target,
              severity: 'warning' as AlertSeverity,
            });
          }
        }
        break;
      }

      // ─── User feedback ──────────────────────────────────────────────
      case 'feedback:submit': {
        const entry: FeedbackEntry = {
          id: `fb_${state.feedbackCounter++}`,
          userId: payload.userId ?? 'anonymous',
          rating: Math.max(1, Math.min(5, Number(payload.rating) || 3)),
          message: payload.message ?? '',
          context: payload.context ?? {},
          timestamp: Date.now(),
        };

        state.feedback.push(entry);
        if (state.feedback.length > config.max_feedback_entries) {
          state.feedback.shift();
        }
        state.totalFeedback++;
        state.ratingSum += entry.rating;

        context.emit?.('feedback:user_submitted', {
          userId: entry.userId,
          rating: entry.rating,
          text: entry.message,
        });
        break;
      }

      // ─── Acknowledge signal ─────────────────────────────────────────
      case 'feedback:acknowledge_signal': {
        const sig = state.signals.find((s) => s.id === payload.signalId);
        if (sig) sig.acknowledged = true;
        break;
      }

      // ─── Report generation ──────────────────────────────────────────
      case 'feedback:get_report': {
        const metricsReport: Record<string, { value: number; target: number; trend: MetricTrend }> =
          {};
        for (const [name, m] of state.metrics) {
          metricsReport[name] = { value: m.value, target: m.target, trend: m.trend };
        }

        context.emit?.('feedback:report', {
          metrics: metricsReport,
          averageRating: state.totalFeedback > 0 ? state.ratingSum / state.totalFeedback : 0,
          totalFeedback: state.totalFeedback,
          pendingSignals: state.signals.filter((s) => !s.acknowledged).length,
          trendSummary: Object.fromEntries(
            Array.from(state.metrics.entries()).map(([k, v]) => [k, v.trend])
          ),
        });
        break;
      }
    }
  },
};

export default feedbackLoopHandler;
