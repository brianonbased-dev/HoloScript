/**
 * KVFlow Early Warning Tests — carousel-pattern detection and per-brain metrics.
 *
 * Tests the KVFlowCarouselDetector and checkCarouselEarlyWarning function:
 * - Per-brain hit-rate computation
 * - Carousel-pattern detection (eviction-reload cycling)
 * - Prefetch stall avoidance tracking
 * - Workflow graph drift detection
 * - Overall hit-rate and prefetch effectiveness
 *
 * @module @holoscript/llm-provider/kvflow
 */

import { describe, it, expect } from 'vitest';
import {
  KVFlowCarouselDetector,
  checkCarouselEarlyWarning,
} from '../kvflow/KVFlowEarlyWarning';
import type {
  KVFlowTelemetry,
  KVFlowScope,
  StepNodeId,
} from '../kvflow/types';

// =============================================================================
// Test Fixtures
// =============================================================================

function makeEvent(
  type: KVFlowTelemetry['type'],
  stepId: StepNodeId,
  scope: KVFlowScope,
  overrides?: Partial<KVFlowTelemetry>
): KVFlowTelemetry {
  return {
    type,
    stepId,
    scope,
    stepsToExecution: 0,
    timestamp: new Date().toISOString(),
    gpuUsedBytes: 1_000_000,
    gpuTotalBytes: 4_000_000,
    ...overrides,
  };
}

function makeHit(stepId: StepNodeId, scope: KVFlowScope = 'role-overlay'): KVFlowTelemetry {
  return makeEvent('hit', stepId, scope, {
    cacheHit: true,
    stepsToExecution: 0,
  });
}

function makeMiss(stepId: StepNodeId, scope: KVFlowScope = 'role-overlay'): KVFlowTelemetry {
  return makeEvent('miss', stepId, scope, {
    cacheHit: false,
    stepsToExecution: 0,
  });
}

function makeEviction(stepId: StepNodeId, scope: KVFlowScope = 'scene-turn'): KVFlowTelemetry {
  return makeEvent('eviction', stepId, scope, {
    evictedCount: 1,
    stepsToExecution: 5,
  });
}

function makePrefetch(stepId: StepNodeId, scope: KVFlowScope = 'role-overlay'): KVFlowTelemetry {
  return makeEvent('prefetch', stepId, scope, {
    prefetchedCount: 1,
    stepsToExecution: 1,
  });
}

function makePressure(ratio: number): KVFlowTelemetry {
  return makeEvent('pressure', 'system', 'shared-prefix', {
    pressureRatio: ratio,
    stepsToExecution: 0,
  });
}

// =============================================================================
// Per-Brain Hit-Rate Tests
// =============================================================================

describe('KVFlowCarouselDetector per-brain metrics', () => {
  it('computes per-brain hit rates', () => {
    const detector = new KVFlowCarouselDetector();

    const telemetry: KVFlowTelemetry[] = [
      // claude: 3 hits, 1 miss = 0.75 hit rate
      makeHit('claude:0'),
      makeHit('claude:0'),
      makeHit('claude:0'),
      makeMiss('claude:0'),
      // gemini: 1 hit, 3 misses = 0.25 hit rate
      makeHit('gemini:0'),
      makeMiss('gemini:0'),
      makeMiss('gemini:0'),
      makeMiss('gemini:0'),
    ];

    const report = detector.checkCarouselEarlyWarning(telemetry, {
      brainEntries: [
        { stepId: 'claude:0', scope: 'role-overlay', residency: 'device', stepsToExecution: 0 },
        { stepId: 'gemini:0', scope: 'role-overlay', residency: 'device', stepsToExecution: 2 },
      ],
    });

    const claudeMetrics = report.brainMetrics.get('claude:0');
    const geminiMetrics = report.brainMetrics.get('gemini:0');

    expect(claudeMetrics).toBeDefined();
    expect(claudeMetrics!.hits).toBe(3);
    expect(claudeMetrics!.misses).toBe(1);
    expect(claudeMetrics!.hitRate).toBe(0.75);

    expect(geminiMetrics).toBeDefined();
    expect(geminiMetrics!.hits).toBe(1);
    expect(geminiMetrics!.misses).toBe(3);
    expect(geminiMetrics!.hitRate).toBe(0.25);
  });

  it('handles zero events gracefully', () => {
    const detector = new KVFlowCarouselDetector();

    const report = detector.checkCarouselEarlyWarning([], {
      brainEntries: [],
    });

    expect(report.overallHitRate).toBe(0);
    expect(report.brainMetrics.size).toBe(0);
    expect(report.warnings).toEqual([]);
  });

  it('tracks brain entries from context even with no telemetry', () => {
    const detector = new KVFlowCarouselDetector();

    const report = detector.checkCarouselEarlyWarning([], {
      brainEntries: [
        { stepId: 'claude:0', scope: 'role-overlay', residency: 'device', stepsToExecution: 0 },
      ],
    });

    expect(report.brainMetrics.size).toBe(1);
    const claude = report.brainMetrics.get('claude:0')!;
    expect(claude.hits).toBe(0);
    expect(claude.misses).toBe(0);
    expect(claude.hitRate).toBe(0); // No events = 0 hit rate
  });
});

// =============================================================================
// Carousel Pattern Detection Tests
// =============================================================================

describe('KVFlowCarouselDetector carousel patterns', () => {
  it('detects eviction-reload cycles as carousel pattern', () => {
    const detector = new KVFlowCarouselDetector({ minSampleSize: 3 });

    // Simulate carousel: evict → miss (reload) → evict → miss (reload) → ...
    // This is the core KVFlow problem: LRU evicts something that's needed again soon
    const telemetry: KVFlowTelemetry[] = [
      makeEviction('claude:0', 'role-overlay'),
      makeMiss('claude:0', 'role-overlay'), // Reload after eviction = cycle 1
      makeEviction('claude:0', 'role-overlay'),
      makeMiss('claude:0', 'role-overlay'), // Reload after eviction = cycle 2
      makeEviction('claude:0', 'role-overlay'),
      makeMiss('claude:0', 'role-overlay'), // Reload after eviction = cycle 3
      makeHit('claude:0'),
      makeHit('claude:0'),
    ];

    const report = detector.checkCarouselEarlyWarning(telemetry, {
      brainEntries: [
        { stepId: 'claude:0', scope: 'role-overlay', residency: 'device', stepsToExecution: 0 },
      ],
    });

    expect(report.warnings.length).toBeGreaterThan(0);

    // The carousel warning for claude:0
    const carouselWarning = report.warnings.find((w) => w.stepId === 'claude:0');
    expect(carouselWarning).toBeDefined();
    expect(carouselWarning!.cycles).toBeGreaterThan(0);
    expect(carouselWarning!.severity).toBe('early_warning'); // 3 cycles ≥ early_warning threshold (2)
  });

  it('escalates to critical for many eviction-reload cycles', () => {
    const detector = new KVFlowCarouselDetector();

    // 10 eviction-reload cycles = critical
    const telemetry: KVFlowTelemetry[] = [];
    for (let i = 0; i < 10; i++) {
      telemetry.push(makeEviction('claude:0', 'role-overlay'));
      telemetry.push(makeMiss('claude:0', 'role-overlay'));
    }

    const report = detector.checkCarouselEarlyWarning(telemetry, {
      brainEntries: [
        { stepId: 'claude:0', scope: 'role-overlay', residency: 'evicted', stepsToExecution: 5 },
      ],
    });

    const carouselWarning = report.warnings.find((w) => w.stepId === 'claude:0');
    expect(carouselWarning).toBeDefined();
    expect(carouselWarning!.severity).toBe('critical');
  });

  it('does not warn with insufficient data', () => {
    const detector = new KVFlowCarouselDetector({ minSampleSize: 5 });

    // Only 2 events — below minSampleSize
    const telemetry: KVFlowTelemetry[] = [
      makeHit('claude:0'),
      makeMiss('claude:0'),
    ];

    const report = detector.checkCarouselEarlyWarning(telemetry, {
      brainEntries: [],
    });

    // No warnings — insufficient data
    expect(report.warnings).toEqual([]);
  });

  it('detects low hit rate even without carousel cycles', () => {
    const detector = new KVFlowCarouselDetector({ minSampleSize: 3 });

    // Low hit rate (1/5 = 0.2) but no eviction-reload cycles
    const telemetry: KVFlowTelemetry[] = [
      makeMiss('claude:0'),
      makeMiss('claude:0'),
      makeMiss('claude:0'),
      makeMiss('claude:0'),
      makeHit('claude:0'),
    ];

    const report = detector.checkCarouselEarlyWarning(telemetry, {
      brainEntries: [],
    });

    const lowHitRateWarning = report.warnings.find((w) => w.stepId === 'claude:0');
    expect(lowHitRateWarning).toBeDefined();
    expect(lowHitRateWarning!.hitRate).toBe(0.2);
    expect(lowHitRateWarning!.severity).toBe('early_warning');
  });
});

// =============================================================================
// Prefetch Stall Avoidance Tests
// =============================================================================

describe('KVFlowCarouselDetector prefetch effectiveness', () => {
  it('tracks prefetch stalls avoided per brain', () => {
    const detector = new KVFlowCarouselDetector();

    // Prefetch for gemini's brain completed before it was needed
    const telemetry: KVFlowTelemetry[] = [
      makePrefetch('gemini:0'),  // Prefetched gemini's KV
      makeHit('gemini:0'),       // Hit because prefetch loaded it
      makeMiss('claude:0'),      // Claude had a miss (no prefetch)
    ];

    const report = detector.checkCarouselEarlyWarning(telemetry, {
      brainEntries: [
        { stepId: 'gemini:0', scope: 'role-overlay', residency: 'device', stepsToExecution: 1 },
        { stepId: 'claude:0', scope: 'role-overlay', residency: 'device', stepsToExecution: 0 },
      ],
    });

    const geminiMetrics = report.brainMetrics.get('gemini:0');
    expect(geminiMetrics).toBeDefined();
    expect(geminiMetrics!.prefetchStallsAvoided).toBe(1);
  });

  it('tracks stalls observed (misses without prior prefetch)', () => {
    const detector = new KVFlowCarouselDetector();

    // Claude has a miss with no prefetch = stall observed
    const telemetry: KVFlowTelemetry[] = [
      makeMiss('claude:0'),
    ];

    const report = detector.checkCarouselEarlyWarning(telemetry, {
      brainEntries: [],
    });

    const claudeMetrics = report.brainMetrics.get('claude:0');
    expect(claudeMetrics).toBeDefined();
    expect(claudeMetrics!.stallsObserved).toBe(1);
  });

  it('computes overall prefetch effectiveness', () => {
    const detector = new KVFlowCarouselDetector();

    const telemetry: KVFlowTelemetry[] = [
      makePrefetch('gemini:0'),
      makePrefetch('copilot:0'),
      makeMiss('claude:0'),  // Only 1 miss
    ];

    const report = detector.checkCarouselEarlyWarning(telemetry, {
      brainEntries: [],
    });

    // 2 prefetches / (2 prefetches + 1 miss) = 0.667
    expect(report.overallPrefetchEffectiveness).toBeGreaterThan(0.5);
    expect(report.overallPrefetchEffectiveness).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// Workflow Graph Drift Detection Tests
// =============================================================================

describe('KVFlowCarouselDetector workflow drift', () => {
  it('detects stale config after graph change', () => {
    const detector = new KVFlowCarouselDetector({ driftDetectionEnabled: true });

    const report = detector.checkCarouselEarlyWarning([], {
      brainEntries: [],
      graphChangeAt: '2026-05-18T10:00:00Z',
      configUpdatedAt: '2026-05-18T09:00:00Z', // 1 hour before graph change
      stepsAddedSinceConfig: 3,
      stepsRemovedSinceConfig: 1,
    });

    expect(report.drift).toBeDefined();
    expect(report.drift!.isStale).toBe(true);
    expect(report.drift!.stepsAdded).toBe(3);
    expect(report.drift!.stepsRemoved).toBe(1);
  });

  it('reports no drift when config is up to date', () => {
    const detector = new KVFlowCarouselDetector({ driftDetectionEnabled: true });

    const report = detector.checkCarouselEarlyWarning([], {
      brainEntries: [],
      graphChangeAt: '2026-05-18T09:00:00Z',
      configUpdatedAt: '2026-05-18T10:00:00Z', // After graph change
      stepsAddedSinceConfig: 0,
      stepsRemovedSinceConfig: 0,
    });

    expect(report.drift).toBeNull(); // No drift
  });

  it('skips drift when detection is disabled', () => {
    const detector = new KVFlowCarouselDetector({ driftDetectionEnabled: false });

    const report = detector.checkCarouselEarlyWarning([], {
      brainEntries: [],
      graphChangeAt: '2026-05-18T10:00:00Z',
      configUpdatedAt: '2026-05-18T09:00:00Z',
      stepsAddedSinceConfig: 5,
    });

    expect(report.drift).toBeNull();
  });
});

// =============================================================================
// Overall Hit Rate and Summary Tests
// =============================================================================

describe('KVFlowCarouselDetector overall metrics', () => {
  it('computes overall hit rate from all telemetry', () => {
    const detector = new KVFlowCarouselDetector();

    const telemetry: KVFlowTelemetry[] = [
      makeHit('claude:0'),
      makeHit('claude:0'),
      makeMiss('claude:0'),
      makeHit('gemini:0'),
      makeMiss('gemini:0'),
    ];

    const report = detector.checkCarouselEarlyWarning(telemetry, {
      brainEntries: [],
    });

    // 3 hits / 5 hit+miss events = 0.6
    expect(report.overallHitRate).toBe(0.6);
  });

  it('builds a meaningful summary', () => {
    const detector = new KVFlowCarouselDetector();

    const telemetry: KVFlowTelemetry[] = [
      // Healthy brain (high hit rate)
      makeHit('claude:0'),
      makeHit('claude:0'),
      makeHit('claude:0'),
      makeHit('claude:0'),
      // At-risk brain (low hit rate)
      makeMiss('gemini:0'),
      makeMiss('gemini:0'),
      makeMiss('gemini:0'),
      // Prefetch + hit for copilot (moderate hit rate)
      makePrefetch('copilot:0'),
      makeHit('copilot:0'),
      makeHit('copilot:0'),
      makeMiss('copilot:0'),
    ];

    const report = detector.checkCarouselEarlyWarning(telemetry, {
      brainEntries: [
        { stepId: 'claude:0', scope: 'role-overlay', residency: 'device', stepsToExecution: 0 },
        { stepId: 'gemini:0', scope: 'role-overlay', residency: 'device', stepsToExecution: 2 },
        { stepId: 'copilot:0', scope: 'role-overlay', residency: 'device', stepsToExecution: 1 },
      ],
    });

    expect(report.summary.totalBrains).toBe(3);
    expect(report.summary.healthyBrains).toBe(1); // claude at 1.0
    expect(report.summary.atRiskBrains).toBe(1); // gemini at 0.0
    expect(report.summary.totalStallsAvoided).toBe(1); // copilot prefetch
  });

  it('convenience function checkCarouselEarlyWarning matches instance method', () => {
    const telemetry: KVFlowTelemetry[] = [
      makeHit('claude:0'),
      makeMiss('claude:0'),
    ];

    const report = checkCarouselEarlyWarning(telemetry, {
      brainEntries: [],
    });

    expect(report.overallHitRate).toBe(0.5);
    expect(report.brainMetrics.has('claude:0')).toBe(true);
  });
});

// =============================================================================
// Status Line Tests
// =============================================================================

describe('KVFlowCarouselDetector status line', () => {
  it('reports healthy when hit rate is high and no warnings', () => {
    const detector = new KVFlowCarouselDetector();

    const telemetry: KVFlowTelemetry[] = [
      makeHit('claude:0'),
      makeHit('claude:0'),
      makeHit('claude:0'),
    ];

    const report = detector.checkCarouselEarlyWarning(telemetry, {
      brainEntries: [],
    });

    expect(report.summary.statusLine).toContain('healthy');
  });

  it('reports at-risk when hit rate is low', () => {
    const detector = new KVFlowCarouselDetector({ minSampleSize: 2 });

    const telemetry: KVFlowTelemetry[] = [
      makeMiss('claude:0'),
      makeMiss('claude:0'),
    ];

    const report = detector.checkCarouselEarlyWarning(telemetry, {
      brainEntries: [],
    });

    expect(report.summary.statusLine).toContain('at-risk');
  });

  it('includes carousel warnings in status line', () => {
    const detector = new KVFlowCarouselDetector({ minSampleSize: 3 });

    // Create carousel pattern
    const telemetry: KVFlowTelemetry[] = [];
    for (let i = 0; i < 5; i++) {
      telemetry.push(makeEviction('claude:0', 'role-overlay'));
      telemetry.push(makeMiss('claude:0', 'role-overlay'));
    }

    const report = detector.checkCarouselEarlyWarning(telemetry, {
      brainEntries: [],
    });

    expect(report.summary.statusLine).toContain('carousel');
  });
});