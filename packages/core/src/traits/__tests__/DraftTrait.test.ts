import { describe, it, expect, beforeEach } from 'vitest';
import { DraftManager, DRAFT_DEFAULTS, DRAFT_TRAIT } from '../DraftTrait';
import {
  PerformanceRegressionMonitor,
  PERF_REGRESSION_DEFAULTS,
} from '../PerformanceRegressionMonitor';

// ── DraftTrait Unit Tests ───────────────────────────────────────────────────

describe('@draft Trait', () => {
  describe('DRAFT_TRAIT metadata', () => {
    it('has correct name and category', () => {
      expect(DRAFT_TRAIT.name).toBe('@draft');
      expect(DRAFT_TRAIT.category).toBe('pipeline');
    });

    it('defines all expected properties', () => {
      const props = Object.keys(DRAFT_TRAIT.properties);
      expect(props).toContain('shape');
      expect(props).toContain('collision');
      expect(props).toContain('color');
      expect(props).toContain('opacity');
      expect(props).toContain('wireframe');
      expect(props).toContain('collisionScale');
      expect(props).toContain('targetMaturity');
    });
  });

  describe('DRAFT_DEFAULTS', () => {
    it('defaults shape to box', () => {
      expect(DRAFT_DEFAULTS.shape).toBe('box');
    });

    it('defaults collision to true (key circular pipeline insight)', () => {
      expect(DRAFT_DEFAULTS.collision).toBe(true);
    });

    it('defaults color to blockout blue', () => {
      expect(DRAFT_DEFAULTS.color).toBe('#88aaff');
    });
  });
});

describe('DraftManager', () => {
  let manager: DraftManager;

  beforeEach(() => {
    manager = new DraftManager();
  });

  it('sets and gets draft config', () => {
    const config = manager.setDraft('entity-1', { shape: 'sphere' });
    expect(config.shape).toBe('sphere');
    expect(config.collision).toBe(true); // default

    const retrieved = manager.getDraft('entity-1');
    expect(retrieved).toEqual(config);
  });

  it('returns null for non-draft entities', () => {
    expect(manager.getDraft('unknown')).toBeNull();
    expect(manager.isDraft('unknown')).toBe(false);
  });

  it('promotes draft to mesh', () => {
    manager.setDraft('entity-1', { targetMaturity: 'mesh' });
    expect(manager.isDraft('entity-1')).toBe(true);

    const result = manager.promote('entity-1');
    expect(result).toBe('mesh');
    expect(manager.isDraft('entity-1')).toBe(false);
  });

  it('promotes draft to final', () => {
    manager.setDraft('entity-1', { targetMaturity: 'final' });
    const result = manager.promote('entity-1');
    expect(result).toBe('final');
    expect(manager.isDraft('entity-1')).toBe(false);
  });

  it('demotes entity back to draft', () => {
    manager.setDraft('entity-1');
    manager.promote('entity-1');
    expect(manager.isDraft('entity-1')).toBe(false);

    const config = manager.demote('entity-1', { shape: 'cylinder' });
    expect(manager.isDraft('entity-1')).toBe(true);
    expect(config.shape).toBe('cylinder');
  });

  it('returns collision shape when collision enabled', () => {
    manager.setDraft('entity-1', { shape: 'capsule', collision: true });
    expect(manager.getCollisionShape('entity-1')).toBe('capsule');
  });

  it('returns null collision shape when collision disabled', () => {
    manager.setDraft('entity-1', { shape: 'capsule', collision: false });
    expect(manager.getCollisionShape('entity-1')).toBeNull();
  });

  it('demoteAll regresses all entities to draft', () => {
    const ids = ['a', 'b', 'c'];
    manager.demoteAll(ids, 'sphere');
    expect(manager.count).toBe(3);
    expect(manager.getDraft('a')?.shape).toBe('sphere');
    expect(manager.getDraft('b')?.shape).toBe('sphere');
    expect(manager.getDraft('c')?.shape).toBe('sphere');
  });

  it('clear removes all drafts', () => {
    manager.setDraft('a');
    manager.setDraft('b');
    expect(manager.count).toBe(2);
    manager.clear();
    expect(manager.count).toBe(0);
  });

  it('getDraftIds returns all draft entity IDs', () => {
    manager.setDraft('x');
    manager.setDraft('y');
    manager.setDraft('z');
    expect(manager.getDraftIds()).toEqual(expect.arrayContaining(['x', 'y', 'z']));
    expect(manager.getDraftIds()).toHaveLength(3);
  });
});

// ── PerformanceRegressionMonitor Unit Tests ──────────────────────────────────

describe('PerformanceRegressionMonitor', () => {
  it('starts in non-regressed state', () => {
    const monitor = new PerformanceRegressionMonitor();
    const state = monitor.getState();
    expect(state.isRegressed).toBe(false);
    expect(state.avgFrameTimeMs).toBe(0);
    expect(state.regressionCount).toBe(0);
  });

  it('tracks rolling average frame time', () => {
    const monitor = new PerformanceRegressionMonitor();
    monitor.tick(5.0);
    monitor.tick(7.0);
    const state = monitor.tick(6.0);
    expect(state.avgFrameTimeMs).toBe(6.0);
  });

  it('regresses after consecutive frames above threshold', () => {
    const monitor = new PerformanceRegressionMonitor({
      thresholdMs: 9.0,
      consecutiveFrames: 3,
    });

    // 3 frames above 9ms
    monitor.tick(10.0);
    monitor.tick(10.0);
    const state = monitor.tick(10.0);
    expect(state.isRegressed).toBe(true);
    expect(state.regressionCount).toBe(1);
  });

  it('does not regress if frames go below threshold', () => {
    const monitor = new PerformanceRegressionMonitor({
      thresholdMs: 9.0,
      consecutiveFrames: 3,
    });

    monitor.tick(10.0);
    monitor.tick(10.0);
    // Drop below threshold — resets counter
    monitor.tick(5.0);
    const state = monitor.tick(10.0);
    expect(state.isRegressed).toBe(false);
  });

  it('recovers after consecutive frames below recovery threshold', () => {
    const monitor = new PerformanceRegressionMonitor({
      thresholdMs: 9.0,
      consecutiveFrames: 2,
      recoveryThresholdMs: 7.0,
      recoveryFrames: 3,
    });

    // Force regression
    monitor.tick(10.0);
    monitor.tick(10.0);
    expect(monitor.getState().isRegressed).toBe(true);

    // Need enough low ticks for rolling avg to drop below 7.0 AND sustain 3 consecutive
    // Rolling avg window is 10 frames. After regression [10,10], feed low ticks until
    // avg drops below 7.0 for 3 consecutive frames.
    for (let i = 0; i < 10; i++) {
      monitor.tick(1.0);
    }
    // After 12 total ticks, last 10 are [10,1,1,1,1,1,1,1,1,1] avg=1.9 — well below 7
    expect(monitor.getState().isRegressed).toBe(false);
    expect(monitor.getState().recoveryCount).toBe(1);
  });

  it('forceRegress/forceRecover work', () => {
    const monitor = new PerformanceRegressionMonitor();
    monitor.forceRegress();
    expect(monitor.getState().isRegressed).toBe(true);
    expect(monitor.getState().regressionCount).toBe(1);

    monitor.forceRecover();
    expect(monitor.getState().isRegressed).toBe(false);
    expect(monitor.getState().recoveryCount).toBe(1);
  });

  it('reset clears all state', () => {
    const monitor = new PerformanceRegressionMonitor({ consecutiveFrames: 1 });
    monitor.tick(20.0);
    expect(monitor.getState().isRegressed).toBe(true);

    monitor.reset();
    const state = monitor.getState();
    expect(state.isRegressed).toBe(false);
    expect(state.avgFrameTimeMs).toBe(0);
    expect(state.regressionCount).toBe(0);
  });

  it('respects enabled=false', () => {
    const monitor = new PerformanceRegressionMonitor({
      enabled: false,
      consecutiveFrames: 1,
    });
    monitor.tick(100.0);
    expect(monitor.getState().isRegressed).toBe(false);
  });

  it('uses default VR 90Hz thresholds', () => {
    expect(PERF_REGRESSION_DEFAULTS.thresholdMs).toBe(9.0);
    expect(PERF_REGRESSION_DEFAULTS.recoveryThresholdMs).toBe(7.0);
    expect(PERF_REGRESSION_DEFAULTS.consecutiveFrames).toBe(5);
    expect(PERF_REGRESSION_DEFAULTS.recoveryFrames).toBe(30);
  });
});
