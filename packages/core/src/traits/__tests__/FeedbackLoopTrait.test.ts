/**
 * FeedbackLoopTrait — comprehensive test suite
 */
import { describe, it, expect } from 'vitest';
import {
  feedbackLoopHandler,
  type FeedbackConfig,
  type FeedbackState,
  type QualityMetric,
} from '../FeedbackLoopTrait';
import type { HSPlusNode, TraitContext } from '../TraitTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(): HSPlusNode {
  return {} as HSPlusNode;
}

function makeContext() {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  const context: TraitContext = {
    emit: (type: string, payload?: unknown) => {
      emitted.push({ type, payload });
    },
  };
  return { context, emitted };
}

const BASE_CONFIG = feedbackLoopHandler.defaultConfig as FeedbackConfig;

function setup(partial: Partial<FeedbackConfig> = {}) {
  const node = makeNode();
  const { context, emitted } = makeContext();
  const config: FeedbackConfig = { ...BASE_CONFIG, ...partial };
  feedbackLoopHandler.onAttach(node, config, context);
  emitted.length = 0;
  return { node, context, emitted, config };
}

function getState(node: HSPlusNode): FeedbackState {
  return (node as any).__feedbackState as FeedbackState;
}

function fire(
  node: HSPlusNode,
  config: FeedbackConfig,
  context: TraitContext,
  type: string,
  payload?: unknown
) {
  feedbackLoopHandler.onEvent(node, config, context, { type, payload });
}

// ---------------------------------------------------------------------------
// onAttach
// ---------------------------------------------------------------------------

describe('onAttach', () => {
  it('should initialize __feedbackState', () => {
    const { node } = setup();
    expect((node as any).__feedbackState).toBeDefined();
  });

  it('should create metrics from config', () => {
    const { node } = setup();
    expect(getState(node).metrics.size).toBeGreaterThan(0);
  });

  it('should create fps metric', () => {
    const { node } = setup();
    expect(getState(node).metrics.has('fps')).toBe(true);
  });

  it('should create error_rate metric', () => {
    const { node } = setup();
    expect(getState(node).metrics.has('error_rate')).toBe(true);
  });

  it('each metric starts at its target value', () => {
    const { node } = setup();
    const fps = getState(node).metrics.get('fps')!;
    expect(fps.value).toBe(fps.target);
  });

  it('should start with empty feedback array', () => {
    const { node } = setup();
    expect(getState(node).feedback.length).toBe(0);
  });

  it('should start with empty signals array', () => {
    const { node } = setup();
    expect(getState(node).signals.length).toBe(0);
  });

  it('should emit feedback:ready', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    feedbackLoopHandler.onAttach(node, BASE_CONFIG, context);
    expect(emitted.some(e => e.type === 'feedback:ready')).toBe(true);
  });

  it('feedback:ready includes metric names', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    feedbackLoopHandler.onAttach(node, BASE_CONFIG, context);
    const ev = emitted.find(e => e.type === 'feedback:ready');
    expect(Array.isArray((ev!.payload as any).metrics)).toBe(true);
  });

  it('should initialize ratingSum to 0', () => {
    const { node } = setup();
    expect(getState(node).ratingSum).toBe(0);
  });

  it('should initialize totalFeedback to 0', () => {
    const { node } = setup();
    expect(getState(node).totalFeedback).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// onDetach
// ---------------------------------------------------------------------------

describe('onDetach', () => {
  it('should remove __feedbackState', () => {
    const { node, config, context } = setup();
    feedbackLoopHandler.onDetach(node, config, context);
    expect((node as any).__feedbackState).toBeUndefined();
  });

  it('should emit feedback:shutdown', () => {
    const { node, config } = setup();
    const { context, emitted } = makeContext();
    feedbackLoopHandler.onDetach(node, config, context);
    expect(emitted.some(e => e.type === 'feedback:shutdown')).toBe(true);
  });

  it('feedback:shutdown should include totalFeedback', () => {
    const { node, config } = setup();
    const { context, emitted } = makeContext();
    feedbackLoopHandler.onDetach(node, config, context);
    const ev = emitted.find(e => e.type === 'feedback:shutdown');
    expect((ev!.payload as any)).toHaveProperty('totalFeedback');
  });

  it('should handle detach with no state gracefully', () => {
    const node = makeNode();
    const { context } = makeContext();
    expect(() => feedbackLoopHandler.onDetach(node, BASE_CONFIG, context)).not.toThrow();
  });

  it('feedback:shutdown averageRating is 0 if no submissions', () => {
    const { node, config } = setup();
    const { context, emitted } = makeContext();
    feedbackLoopHandler.onDetach(node, config, context);
    const ev = emitted.find(e => e.type === 'feedback:shutdown');
    expect((ev!.payload as any).averageRating).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// defaultConfig
// ---------------------------------------------------------------------------

describe('defaultConfig', () => {
  it('should have name "feedback_loop"', () => {
    expect(feedbackLoopHandler.name).toBe('feedback_loop');
  });

  it('should have history_window 60', () => {
    expect(BASE_CONFIG.history_window).toBe(60);
  });

  it('should have alert_threshold 20', () => {
    expect(BASE_CONFIG.alert_threshold).toBe(20);
  });

  it('should have critical_threshold 50', () => {
    expect(BASE_CONFIG.critical_threshold).toBe(50);
  });

  it('should have auto_signal true', () => {
    expect(BASE_CONFIG.auto_signal).toBe(true);
  });

  it('should have max_feedback_entries 500', () => {
    expect(BASE_CONFIG.max_feedback_entries).toBe(500);
  });

  it('should have max_signals 100', () => {
    expect(BASE_CONFIG.max_signals).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// feedback:update_metric
// ---------------------------------------------------------------------------

describe('feedback:update_metric', () => {
  it('should update metric value', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'feedback:update_metric', { name: 'fps', value: 45 });
    expect(getState(node).metrics.get('fps')!.value).toBe(45);
  });

  it('should emit feedback:metric_updated', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'feedback:update_metric', { name: 'fps', value: 45 });
    expect(emitted.some(e => e.type === 'feedback:metric_updated')).toBe(true);
  });

  it('metric_updated payload should include name, value, target, trend', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'feedback:update_metric', { name: 'fps', value: 45 });
    const ev = emitted.find(e => e.type === 'feedback:metric_updated');
    const p = ev!.payload as any;
    expect(p.name).toBe('fps');
    expect(p.value).toBe(45);
    expect(p.target).toBe(60);
    expect(['improving', 'declining', 'stable']).toContain(p.trend);
  });

  it('should clamp value to min', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'feedback:update_metric', { name: 'fps', value: -10 });
    expect(getState(node).metrics.get('fps')!.value).toBe(0); // min is 0
  });

  it('should clamp value to max', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'feedback:update_metric', { name: 'fps', value: 9999 });
    expect(getState(node).metrics.get('fps')!.value).toBe(144); // max is 144
  });

  it('should add value to history', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'feedback:update_metric', { name: 'fps', value: 55 });
    expect(getState(node).metrics.get('fps')!.history.length).toBe(1);
  });

  it('should trim history to window size', () => {
    const { node, config, context } = setup({ history_window: 3 });
    for (let i = 0; i < 5; i++) {
      fire(node, config, context, 'feedback:update_metric', { name: 'fps', value: 50 + i });
    }
    expect(getState(node).metrics.get('fps')!.history.length).toBe(3);
  });

  it('should ignore update for unknown metric', () => {
    const { node, config, context } = setup();
    expect(() =>
      fire(node, config, context, 'feedback:update_metric', { name: 'ghost', value: 99 })
    ).not.toThrow();
  });

  it('should emit warning alert when drift exceeds alert_threshold', () => {
    const { node, config, context, emitted } = setup({
      alert_threshold: 20,
      critical_threshold: 50,
      auto_signal: true,
    });
    // fps target 60; 30% drift → warning (20-50% range)
    fire(node, config, context, 'feedback:update_metric', { name: 'fps', value: 42 });
    const alerts = emitted.filter(e => e.type === 'feedback:metric_alert');
    const warning = alerts.find(e => (e.payload as any).severity === 'warning');
    expect(warning).toBeDefined();
  });

  it('should emit critical alert when drift exceeds critical_threshold', () => {
    const { node, config, context, emitted } = setup({
      alert_threshold: 20,
      critical_threshold: 50,
      auto_signal: true,
    });
    // fps target 60; 60% drop → critical
    fire(node, config, context, 'feedback:update_metric', { name: 'fps', value: 24 });
    const alerts = emitted.filter(e => e.type === 'feedback:metric_alert');
    const crit = alerts.find(e => (e.payload as any).severity === 'critical');
    expect(crit).toBeDefined();
  });

  it('should emit feedback:optimization_signal on critical drift', () => {
    const { node, config, context, emitted } = setup({
      critical_threshold: 50,
      auto_signal: true,
    });
    fire(node, config, context, 'feedback:update_metric', { name: 'fps', value: 1 });
    expect(emitted.some(e => e.type === 'feedback:optimization_signal')).toBe(true);
  });

  it('should not emit signal when auto_signal=false', () => {
    const { node, config, context, emitted } = setup({ auto_signal: false });
    fire(node, config, context, 'feedback:update_metric', { name: 'fps', value: 1 });
    expect(emitted.some(e => e.type === 'feedback:optimization_signal')).toBe(false);
  });

  it('signal should have correct direction when value below target', () => {
    const { node, config, context, emitted } = setup({ critical_threshold: 10 });
    fire(node, config, context, 'feedback:update_metric', { name: 'fps', value: 1 });
    const sig = emitted.find(e => e.type === 'feedback:optimization_signal');
    expect((sig!.payload as any).direction).toBe('increase');
  });

  it('signal should have correct direction when value above target', () => {
    const { node, config, context, emitted } = setup({ critical_threshold: 10 });
    // error_rate target=0; any value above is "decrease" direction
    fire(node, config, context, 'feedback:update_metric', { name: 'error_rate', value: 50 });
    const sig = emitted.find(e => e.type === 'feedback:optimization_signal');
    expect((sig!.payload as any).direction).toBe('decrease');
  });

  it('should evict oldest signal when max_signals exceeded', () => {
    const { node, config, context } = setup({ max_signals: 2, critical_threshold: 10 });
    for (let i = 0; i < 4; i++) {
      fire(node, config, context, 'feedback:update_metric', { name: 'fps', value: 1 });
    }
    expect(getState(node).signals.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// feedback:submit
// ---------------------------------------------------------------------------

describe('feedback:submit', () => {
  it('should add a feedback entry', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'feedback:submit', { userId: 'u1', rating: 4, message: 'good' });
    expect(getState(node).feedback.length).toBe(1);
  });

  it('should emit feedback:user_submitted', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'feedback:submit', { userId: 'u1', rating: 5 });
    expect(emitted.some(e => e.type === 'feedback:user_submitted')).toBe(true);
  });

  it('user_submitted payload includes userId, rating, text', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'feedback:submit', {
      userId: 'alice',
      rating: 3,
      message: 'okay',
    });
    const ev = emitted.find(e => e.type === 'feedback:user_submitted');
    const p = ev!.payload as any;
    expect(p.userId).toBe('alice');
    expect(p.rating).toBe(3);
    expect(p.text).toBe('okay');
  });

  it('should clamp rating to [1,5]', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'feedback:submit', { userId: 'u1', rating: 10 });
    expect(getState(node).feedback[0].rating).toBe(5);
    fire(node, config, context, 'feedback:submit', { userId: 'u1', rating: -1 });
    expect(getState(node).feedback[1].rating).toBe(1);
  });

  it('should default userId to "anonymous"', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'feedback:submit', { rating: 3 });
    expect(getState(node).feedback[0].userId).toBe('anonymous');
  });

  it('should increment totalFeedback', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'feedback:submit', { rating: 4 });
    expect(getState(node).totalFeedback).toBe(1);
  });

  it('should accumulate ratingSum', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'feedback:submit', { rating: 4 });
    fire(node, config, context, 'feedback:submit', { rating: 2 });
    expect(getState(node).ratingSum).toBe(6);
  });

  it('should evict oldest entry when max_feedback_entries exceeded', () => {
    const { node, config, context } = setup({ max_feedback_entries: 2 });
    fire(node, config, context, 'feedback:submit', { userId: 'u1', rating: 1 });
    fire(node, config, context, 'feedback:submit', { userId: 'u2', rating: 2 });
    fire(node, config, context, 'feedback:submit', { userId: 'u3', rating: 3 });
    expect(getState(node).feedback.length).toBe(2);
    expect(getState(node).feedback[0].userId).toBe('u2');
  });

  it('should default rating to 3 if invalid', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'feedback:submit', { rating: 'bad' });
    expect(getState(node).feedback[0].rating).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// feedback:acknowledge_signal
// ---------------------------------------------------------------------------

describe('feedback:acknowledge_signal', () => {
  it('should mark signal as acknowledged', () => {
    const { node, config, context } = setup({ critical_threshold: 10 });
    fire(node, config, context, 'feedback:update_metric', { name: 'fps', value: 1 });
    const sigId = getState(node).signals[0].id;
    fire(node, config, context, 'feedback:acknowledge_signal', { signalId: sigId });
    expect(getState(node).signals[0].acknowledged).toBe(true);
  });

  it('should do nothing for unknown signalId', () => {
    const { node, config, context } = setup();
    expect(() =>
      fire(node, config, context, 'feedback:acknowledge_signal', { signalId: 'ghost_id' })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// feedback:get_report
// ---------------------------------------------------------------------------

describe('feedback:get_report', () => {
  it('should emit feedback:report', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'feedback:get_report');
    expect(emitted.some(e => e.type === 'feedback:report')).toBe(true);
  });

  it('report should include averageRating', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'feedback:get_report');
    expect((emitted.find(e => e.type === 'feedback:report')!.payload as any)).toHaveProperty(
      'averageRating'
    );
  });

  it('averageRating should be 0 with no submissions', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'feedback:get_report');
    const p = emitted.find(e => e.type === 'feedback:report')!.payload as any;
    expect(p.averageRating).toBe(0);
  });

  it('averageRating should compute correctly after submissions', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'feedback:submit', { rating: 4 });
    fire(node, config, context, 'feedback:submit', { rating: 2 });
    emitted.length = 0;
    fire(node, config, context, 'feedback:get_report');
    const p = emitted.find(e => e.type === 'feedback:report')!.payload as any;
    expect(p.averageRating).toBe(3);
  });

  it('report should include metrics record', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'feedback:get_report');
    const p = emitted.find(e => e.type === 'feedback:report')!.payload as any;
    expect(p.metrics).toBeDefined();
    expect(p.metrics.fps).toBeDefined();
  });

  it('report metrics should include value, target, trend', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'feedback:get_report');
    const m = (emitted.find(e => e.type === 'feedback:report')!.payload as any).metrics.fps;
    expect(m).toHaveProperty('value');
    expect(m).toHaveProperty('target');
    expect(m).toHaveProperty('trend');
  });

  it('report should include totalFeedback', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'feedback:submit', { rating: 5 });
    emitted.length = 0;
    fire(node, config, context, 'feedback:get_report');
    const p = emitted.find(e => e.type === 'feedback:report')!.payload as any;
    expect(p.totalFeedback).toBe(1);
  });

  it('report should include pendingSignals count', () => {
    const { node, config, context, emitted } = setup({ critical_threshold: 10 });
    fire(node, config, context, 'feedback:update_metric', { name: 'fps', value: 1 });
    emitted.length = 0;
    fire(node, config, context, 'feedback:get_report');
    const p = emitted.find(e => e.type === 'feedback:report')!.payload as any;
    expect(p.pendingSignals).toBeGreaterThan(0);
  });

  it('pendingSignals should decrease after acknowledge', () => {
    const { node, config, context, emitted } = setup({ critical_threshold: 10 });
    fire(node, config, context, 'feedback:update_metric', { name: 'fps', value: 1 });
    const sigId = getState(node).signals[0].id;
    fire(node, config, context, 'feedback:acknowledge_signal', { signalId: sigId });
    emitted.length = 0;
    fire(node, config, context, 'feedback:get_report');
    const p = emitted.find(e => e.type === 'feedback:report')!.payload as any;
    expect(p.pendingSignals).toBe(0);
  });

  it('report should include trendSummary', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'feedback:get_report');
    const p = emitted.find(e => e.type === 'feedback:report')!.payload as any;
    expect(p.trendSummary).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// onUpdate
// ---------------------------------------------------------------------------

describe('onUpdate', () => {
  it('should not throw', () => {
    const { node, config, context } = setup();
    expect(() => feedbackLoopHandler.onUpdate(node, config, context, 0.016)).not.toThrow();
  });

  it('should not emit any events (event-driven only)', () => {
    const { node, config, context, emitted } = setup();
    feedbackLoopHandler.onUpdate(node, config, context, 0.016);
    expect(emitted.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Trend detection (with enough samples)
// ---------------------------------------------------------------------------

describe('trend detection', () => {
  it('should detect declining trend', () => {
    const { node, config, context } = setup({ min_samples_for_trend: 3 });
    for (const v of [60, 55, 50, 45, 40]) {
      fire(node, config, context, 'feedback:update_metric', { name: 'fps', value: v });
    }
    expect(getState(node).metrics.get('fps')!.trend).toBe('declining');
  });

  it('should detect improving trend', () => {
    const { node, config, context } = setup({ min_samples_for_trend: 3 });
    for (const v of [30, 40, 50, 60, 70]) {
      fire(node, config, context, 'feedback:update_metric', { name: 'fps', value: v });
    }
    expect(getState(node).metrics.get('fps')!.trend).toBe('improving');
  });

  it('should return stable before min_samples_for_trend', () => {
    const { node, config, context } = setup({ min_samples_for_trend: 10 });
    fire(node, config, context, 'feedback:update_metric', { name: 'fps', value: 55 });
    expect(getState(node).metrics.get('fps')!.trend).toBe('stable');
  });
});

// ---------------------------------------------------------------------------
// Custom metrics config
// ---------------------------------------------------------------------------

describe('custom metrics config', () => {
  it('should create only the metrics defined in config', () => {
    const config: FeedbackConfig = {
      ...BASE_CONFIG,
      metrics: { custom: { target: 100, min: 0, max: 200 } },
    };
    const node = makeNode();
    const { context } = makeContext();
    feedbackLoopHandler.onAttach(node, config, context);
    expect(getState(node).metrics.has('custom')).toBe(true);
    expect(getState(node).metrics.has('fps')).toBe(false);
  });

  it('should not generate signal when auto_signal=false even under critical drift', () => {
    const config: FeedbackConfig = {
      ...BASE_CONFIG,
      auto_signal: false,
      metrics: { hp: { target: 100, min: 0, max: 100 } },
    };
    const node = makeNode();
    const { context, emitted } = makeContext();
    feedbackLoopHandler.onAttach(node, config, context);
    emitted.length = 0;
    feedbackLoopHandler.onEvent(node, config, context, {
      type: 'feedback:update_metric',
      payload: { name: 'hp', value: 1 },
    });
    expect(emitted.some(e => e.type === 'feedback:optimization_signal')).toBe(false);
  });
});
