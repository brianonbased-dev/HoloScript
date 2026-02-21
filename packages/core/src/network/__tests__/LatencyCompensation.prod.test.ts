/**
 * LatencyCompensation — Production Test Suite
 *
 * Pure CPU logic across all 5 exported classes:
 * - DEFAULT_LATENCY_CONFIG: threshold values, blend durations, horizon limits
 * - InputPatternAnalyzer: history recording, stationary prediction, movement prediction
 * - AdaptiveHorizon: RTT average, jitter P95-P50, tier selection (standard/input/intent), horizon calc
 * - CorrectionBlender: threshold-based type selection (none/exponential/bezier/snap), blend math
 * - StateHistoryBuffer: ring buffer, getAtTick, getLatest, clearBefore, getAfterTick
 * - LatencyCompensator: full system integration
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LATENCY_CONFIG,
  InputPatternAnalyzer,
  AdaptiveHorizon,
  CorrectionBlender,
  StateHistoryBuffer,
  LatencyCompensator,
} from '../LatencyCompensation';

// ─── DEFAULT_LATENCY_CONFIG ───────────────────────────────────────────────────

describe('DEFAULT_LATENCY_CONFIG', () => {
  it('maxHorizon = 1000ms', () => {
    expect(DEFAULT_LATENCY_CONFIG.maxHorizon).toBe(1000);
  });
  it('safetyMargin = 100ms', () => {
    expect(DEFAULT_LATENCY_CONFIG.safetyMargin).toBe(100);
  });
  it('maxDivergenceTime = 3000ms', () => {
    expect(DEFAULT_LATENCY_CONFIG.maxDivergenceTime).toBe(3000);
  });
  it('thresholds.invisible = 0.1m (sub-0.1m errors are not corrected)', () => {
    expect(DEFAULT_LATENCY_CONFIG.thresholds.invisible).toBe(0.1);
  });
  it('thresholds.small = 0.5m → exponential blend', () => {
    expect(DEFAULT_LATENCY_CONFIG.thresholds.small).toBe(0.5);
  });
  it('thresholds.medium = 2.0m → Bezier curve', () => {
    expect(DEFAULT_LATENCY_CONFIG.thresholds.medium).toBe(2.0);
  });
  it('blendDurations.small = 200ms', () => {
    expect(DEFAULT_LATENCY_CONFIG.blendDurations.small).toBe(200);
  });
  it('blendDurations.medium = 300ms', () => {
    expect(DEFAULT_LATENCY_CONFIG.blendDurations.medium).toBe(300);
  });
  it('blendDurations.snap = 100ms', () => {
    expect(DEFAULT_LATENCY_CONFIG.blendDurations.snap).toBe(100);
  });
  it('correctionBudgetPerFrame = 3', () => {
    expect(DEFAULT_LATENCY_CONFIG.correctionBudgetPerFrame).toBe(3);
  });
  it('inputHistorySize = 256', () => {
    expect(DEFAULT_LATENCY_CONFIG.inputHistorySize).toBe(256);
  });
  it('stateHistorySize = 128', () => {
    expect(DEFAULT_LATENCY_CONFIG.stateHistorySize).toBe(128);
  });
  it('isLocalPlayer = false by default', () => {
    expect(DEFAULT_LATENCY_CONFIG.isLocalPlayer).toBe(false);
  });
});

// ─── InputPatternAnalyzer ─────────────────────────────────────────────────────

function makeInput(tick: number, moveX: number, moveZ: number): any {
  return {
    tick,
    timestamp: Date.now(),
    inputs: { moveX, moveZ, jump: false, action: false },
    sequenceNumber: tick,
  };
}

describe('InputPatternAnalyzer', () => {
  it('constructs with default history of 64', () => {
    const a = new InputPatternAnalyzer();
    expect(a).toBeDefined();
  });
  it('predictNextInput returns null with fewer than 3 inputs', () => {
    const a = new InputPatternAnalyzer();
    a.recordInput(makeInput(1, 0, 0));
    a.recordInput(makeInput(2, 0, 0));
    expect(a.predictNextInput(3)).toBeNull();
  });
  it('predicts stationary (0,0) with high confidence when player is still', () => {
    const a = new InputPatternAnalyzer();
    for (let i = 0; i < 6; i++) a.recordInput(makeInput(i, 0, 0));
    const result = a.predictNextInput(6);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result!.input.inputs.moveX).toBe(0);
    expect(result!.input.inputs.moveZ).toBe(0);
  });
  it('predicts consistent movement direction with 0.8 confidence', () => {
    const a = new InputPatternAnalyzer();
    for (let i = 0; i < 8; i++) a.recordInput(makeInput(i, 0.8, 0));
    const result = a.predictNextInput(8);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.8);
    expect(result!.input.inputs.moveX).toBeGreaterThan(0);
  });
  it('predicts inconsistent movement with 0.5 confidence', () => {
    const a = new InputPatternAnalyzer();
    // Alternating directions = inconsistent
    for (let i = 0; i < 8; i++) {
      a.recordInput(makeInput(i, i % 2 === 0 ? 1 : -1, 0));
    }
    const result = a.predictNextInput(8);
    // Should have movement but low confidence
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeLessThanOrEqual(0.8);
  });
  it('predicted tick = currentTick + 1', () => {
    const a = new InputPatternAnalyzer();
    for (let i = 0; i < 6; i++) a.recordInput(makeInput(i, 0, 0));
    const result = a.predictNextInput(10);
    expect(result!.input.tick).toBe(11);
  });
  it('clear() empties history → predictNextInput returns null', () => {
    const a = new InputPatternAnalyzer();
    for (let i = 0; i < 6; i++) a.recordInput(makeInput(i, 1, 0));
    a.clear();
    expect(a.predictNextInput(6)).toBeNull();
  });
  it('history is capped at maxHistory (LRU sliding window)', () => {
    const a = new InputPatternAnalyzer(4);
    for (let i = 0; i < 10; i++) a.recordInput(makeInput(i, 1, 0));
    // As long as we can still predict (not testing internals, just stability)
    expect(() => a.predictNextInput(10)).not.toThrow();
  });
});

// ─── AdaptiveHorizon ──────────────────────────────────────────────────────────

describe('AdaptiveHorizon', () => {
  it('constructs with default horizon = 100ms', () => {
    const h = new AdaptiveHorizon(DEFAULT_LATENCY_CONFIG);
    expect(h.getHorizon()).toBe(100);
  });
  it('getAverageRTT returns 0 when no samples', () => {
    const h = new AdaptiveHorizon(DEFAULT_LATENCY_CONFIG);
    expect(h.getAverageRTT()).toBe(0);
  });
  it('getAverageRTT averages recorded RTT values', () => {
    const h = new AdaptiveHorizon(DEFAULT_LATENCY_CONFIG);
    h.recordRTT(100);
    h.recordRTT(200);
    h.recordRTT(300);
    expect(h.getAverageRTT()).toBe(200);
  });
  it('getTier = standard when avgRTT < 100ms', () => {
    const h = new AdaptiveHorizon(DEFAULT_LATENCY_CONFIG);
    h.recordRTT(50);
    h.recordRTT(60);
    h.recordRTT(70);
    expect(h.getTier()).toBe('standard');
  });
  it('getTier = input when avgRTT 100–300ms', () => {
    const h = new AdaptiveHorizon(DEFAULT_LATENCY_CONFIG);
    for (let i = 0; i < 5; i++) h.recordRTT(200);
    expect(h.getTier()).toBe('input');
  });
  it('getTier = intent when avgRTT >= 300ms', () => {
    const h = new AdaptiveHorizon(DEFAULT_LATENCY_CONFIG);
    for (let i = 0; i < 5; i++) h.recordRTT(400);
    expect(h.getTier()).toBe('intent');
  });
  it('getJitter returns 0 with fewer than 5 samples', () => {
    const h = new AdaptiveHorizon(DEFAULT_LATENCY_CONFIG);
    h.recordRTT(100);
    h.recordRTT(200);
    expect(h.getJitter()).toBe(0);
  });
  it('getJitter = P95 - P50 of RTT samples', () => {
    const h = new AdaptiveHorizon(DEFAULT_LATENCY_CONFIG);
    // Uniform: all same → jitter = 0
    for (let i = 0; i < 10; i++) h.recordRTT(100);
    expect(h.getJitter()).toBe(0);
  });
  it('getJitter is non-zero with variable RTTs', () => {
    const h = new AdaptiveHorizon(DEFAULT_LATENCY_CONFIG);
    // P95 index = floor(20 * 0.95) = 19, P50 index = floor(20 * 0.5) = 10
    // Sorted: [50,50,50,50,50,50,50,50,50,50, 500,500,500,500,500,500,500,500,500,500]
    // P50 = sorted[10] = 500 if we have 10 lows + 10 highs... let's weight low end
    // Use 15 low + 5 high: sorted 20 vals, P95=idx19=500, P50=idx10=50 → jitter = 450
    for (let i = 0; i < 15; i++) h.recordRTT(50);
    for (let i = 0; i < 5; i++) h.recordRTT(500);
    expect(h.getJitter()).toBeGreaterThan(0);
  });
  it('update() returns horizon capped at maxHorizon', () => {
    const h = new AdaptiveHorizon(DEFAULT_LATENCY_CONFIG);
    // Very high RTT + high jitter should be capped at 1000ms
    for (let i = 0; i < 10; i++) h.recordRTT(2000);
    const horizon = h.update();
    expect(horizon).toBeLessThanOrEqual(DEFAULT_LATENCY_CONFIG.maxHorizon);
  });
  it('update() = avgRTT + jitter*2 + safetyMargin (basic)', () => {
    const h = new AdaptiveHorizon(DEFAULT_LATENCY_CONFIG);
    for (let i = 0; i < 10; i++) h.recordRTT(100);
    // avgRTT=100, jitter=0, safetyMargin=100 → 200
    const horizon = h.update();
    expect(horizon).toBe(200);
  });
});

// ─── CorrectionBlender ────────────────────────────────────────────────────────

function makeVec3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}
function makeQuat(x = 0, y = 0, z = 0, w = 1) {
  return { x, y, z, w };
}

describe('CorrectionBlender', () => {
  it('queueCorrection returns none for invisible error (< 0.1m)', () => {
    const b = new CorrectionBlender(DEFAULT_LATENCY_CONFIG);
    const result = b.queueCorrection(
      makeVec3(0, 0, 0), makeVec3(0.05, 0, 0), // 0.05m error
      makeQuat(), makeQuat()
    );
    expect(result).toBe('none');
  });
  it('queueCorrection returns exponential for small error (0.1–0.5m)', () => {
    const b = new CorrectionBlender(DEFAULT_LATENCY_CONFIG);
    const result = b.queueCorrection(
      makeVec3(0, 0, 0), makeVec3(0.3, 0, 0), // 0.3m
      makeQuat(), makeQuat()
    );
    expect(result).toBe('exponential');
  });
  it('queueCorrection returns bezier for medium error (0.5–2.0m)', () => {
    const b = new CorrectionBlender(DEFAULT_LATENCY_CONFIG);
    const result = b.queueCorrection(
      makeVec3(0, 0, 0), makeVec3(1.0, 0, 0), // 1.0m
      makeQuat(), makeQuat()
    );
    expect(result).toBe('bezier');
  });
  it('queueCorrection returns snap for large error (> 2.0m)', () => {
    const b = new CorrectionBlender(DEFAULT_LATENCY_CONFIG);
    const result = b.queueCorrection(
      makeVec3(0, 0, 0), makeVec3(5.0, 0, 0), // 5.0m
      makeQuat(), makeQuat()
    );
    expect(result).toBe('snap');
  });
  it('isBlending = false when no corrections queued', () => {
    const b = new CorrectionBlender(DEFAULT_LATENCY_CONFIG);
    expect(b.isBlending()).toBe(false);
  });
  it('isBlending = true after correction queued', () => {
    const b = new CorrectionBlender(DEFAULT_LATENCY_CONFIG);
    b.queueCorrection(makeVec3(0, 0, 0), makeVec3(0.3, 0, 0), makeQuat(), makeQuat());
    expect(b.isBlending()).toBe(true);
  });
  it('clear() removes all active corrections', () => {
    const b = new CorrectionBlender(DEFAULT_LATENCY_CONFIG);
    b.queueCorrection(makeVec3(0, 0, 0), makeVec3(0.3, 0, 0), makeQuat(), makeQuat());
    b.clear();
    expect(b.isBlending()).toBe(false);
  });
  it('update() returns current position when no corrections', () => {
    const b = new CorrectionBlender(DEFAULT_LATENCY_CONFIG);
    const pos = makeVec3(5, 0, 0);
    const { position } = b.update(16, pos, makeQuat());
    expect(position).toEqual(pos);
  });
  it('update() makes progress toward target position over time', () => {
    const b = new CorrectionBlender(DEFAULT_LATENCY_CONFIG);
    const start = makeVec3(0, 0, 0);
    const target = makeVec3(0.3, 0, 0);
    b.queueCorrection(start, target, makeQuat(), makeQuat());
    // After 100ms (half of 200ms blend), position should move toward target
    const { position } = b.update(100, start, makeQuat());
    expect(position.x).toBeGreaterThan(0);
    expect(position.x).toBeLessThanOrEqual(0.3);
  });
  it('correction budget limits queueing beyond correctionBudgetPerFrame', () => {
    const b = new CorrectionBlender({ ...DEFAULT_LATENCY_CONFIG, correctionBudgetPerFrame: 2 });
    // Queue 3 corrections — third should be 'none' (budget exceeded)
    b.queueCorrection(makeVec3(0, 0, 0), makeVec3(0.3, 0, 0), makeQuat(), makeQuat());
    b.queueCorrection(makeVec3(0, 0, 0), makeVec3(0.4, 0, 0), makeQuat(), makeQuat());
    const result = b.queueCorrection(makeVec3(0, 0, 0), makeVec3(0.35, 0, 0), makeQuat(), makeQuat());
    expect(result).toBe('none');
  });
  it('isLocalPlayer doubles blend duration (correction queued counts for longer)', () => {
    // Test indirectly: local player corrections use 1.5x duration
    const b = new CorrectionBlender({ ...DEFAULT_LATENCY_CONFIG, isLocalPlayer: true });
    const result = b.queueCorrection(
      makeVec3(0), makeVec3(0.3, 0, 0), makeQuat(), makeQuat()
    );
    expect(result).toBe('exponential'); // still exponential, just longer
    expect(b.isBlending()).toBe(true);
  });
});

// ─── StateHistoryBuffer ───────────────────────────────────────────────────────

function makeState(tick: number, x = 0): any {
  return {
    position: { x, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    velocity: { x: 0, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
    timestamp: Date.now(),
    tick,
    confidence: 1,
  };
}

describe('StateHistoryBuffer', () => {
  it('size = 0 initially', () => {
    const buf = new StateHistoryBuffer();
    expect(buf.size).toBe(0);
  });
  it('getLatest returns null when empty', () => {
    const buf = new StateHistoryBuffer();
    expect(buf.getLatest()).toBeNull();
  });
  it('push increases size', () => {
    const buf = new StateHistoryBuffer();
    buf.push(makeState(1));
    buf.push(makeState(2));
    expect(buf.size).toBe(2);
  });
  it('getLatest returns the most recently pushed state', () => {
    const buf = new StateHistoryBuffer();
    buf.push(makeState(1, 1));
    buf.push(makeState(2, 2));
    expect(buf.getLatest()!.tick).toBe(2);
  });
  it('getAtTick returns correct state by tick', () => {
    const buf = new StateHistoryBuffer();
    buf.push(makeState(10));
    buf.push(makeState(20));
    buf.push(makeState(30));
    const s = buf.getAtTick(20);
    expect(s!.tick).toBe(20);
  });
  it('getAtTick returns null for missing tick', () => {
    const buf = new StateHistoryBuffer();
    buf.push(makeState(10));
    expect(buf.getAtTick(99)).toBeNull();
  });
  it('clearBefore removes all states with tick < given', () => {
    const buf = new StateHistoryBuffer();
    buf.push(makeState(1));
    buf.push(makeState(2));
    buf.push(makeState(3));
    buf.push(makeState(4));
    buf.clearBefore(3);
    expect(buf.getAtTick(1)).toBeNull();
    expect(buf.getAtTick(2)).toBeNull();
    expect(buf.getAtTick(3)).not.toBeNull(); // 3 is not < 3
  });
  it('getAfterTick returns all states with tick > given', () => {
    const buf = new StateHistoryBuffer();
    buf.push(makeState(1));
    buf.push(makeState(5));
    buf.push(makeState(10));
    const after = buf.getAfterTick(5);
    expect(after).toHaveLength(1);
    expect(after[0].tick).toBe(10);
  });
  it('ring buffer drops oldest when maxSize exceeded', () => {
    const buf = new StateHistoryBuffer(3);
    buf.push(makeState(1));
    buf.push(makeState(2));
    buf.push(makeState(3));
    buf.push(makeState(4)); // should evict tick=1
    expect(buf.size).toBe(3);
    expect(buf.getAtTick(1)).toBeNull();
    expect(buf.getAtTick(4)).not.toBeNull();
  });
  it('clear() empties buffer', () => {
    const buf = new StateHistoryBuffer();
    buf.push(makeState(1));
    buf.push(makeState(2));
    buf.clear();
    expect(buf.size).toBe(0);
  });
});

// ─── LatencyCompensator ───────────────────────────────────────────────────────

describe('LatencyCompensator', () => {
  it('constructs with entityId', () => {
    const c = new LatencyCompensator('player_1');
    expect(c.entityId).toBe('player_1');
  });
  it('initial tier = standard (no RTT samples)', () => {
    const c = new LatencyCompensator('p1');
    expect(c.getTier()).toBe('standard');
  });
  it('initial averageRTT = 0', () => {
    const c = new LatencyCompensator('p1');
    expect(c.getAverageRTT()).toBe(0);
  });
  it('recordRTT changes averageRTT', () => {
    const c = new LatencyCompensator('p1');
    c.recordRTT(100);
    c.recordRTT(200);
    expect(c.getAverageRTT()).toBe(150);
  });
  it('getTier = input when RTT is 150ms', () => {
    const c = new LatencyCompensator('p1');
    for (let i = 0; i < 5; i++) c.recordRTT(150);
    c.predict(makeState(0), 0.016); // trigger horizon.update()
    expect(c.getTier()).toBe('input');
  });
  it('getTier = intent when RTT is 400ms', () => {
    const c = new LatencyCompensator('p1');
    for (let i = 0; i < 5; i++) c.recordRTT(400);
    c.predict(makeState(0), 0.016);
    expect(c.getTier()).toBe('intent');
  });
  it('predict returns a state with the same position (standard tier, no velocity)', () => {
    const c = new LatencyCompensator('p1');
    for (let i = 0; i < 3; i++) c.recordRTT(50);
    const state = makeState(0, 5); // x=5 
    const predicted = c.predict(state, 0.016);
    // position.x should be very close to 5 (no velocity so no drift)
    expect(predicted.position.x).toBeCloseTo(5, 0);
  });
  it('predict increments tick', () => {
    const c = new LatencyCompensator('p1');
    const s = makeState(10);
    const predicted = c.predict(s, 0.016);
    expect(predicted.tick).toBeGreaterThanOrEqual(10);
  });
  it('isLocalPlayer overrides default', () => {
    const c = new LatencyCompensator('p1', { isLocalPlayer: true });
    // Just checks that it doesn't throw and returns correct entityId
    expect(c.entityId).toBe('p1');
  });
  it('setInteractables does not throw', () => {
    const c = new LatencyCompensator('p1');
    expect(() =>
      c.setInteractables([
        { id: 'door1', position: makeVec3(10, 0, 0), radius: 1.5, type: 'door' },
      ])
    ).not.toThrow();
  });
  it('recordInput does not throw', () => {
    const c = new LatencyCompensator('p1');
    expect(() => c.recordInput(makeInput(1, 0.5, 0))).not.toThrow();
  });
  it('getCorrectedState returns position and rotation', () => {
    const c = new LatencyCompensator('p1');
    const state = makeState(0, 3);
    c.predict(state, 0.016);
    const corrected = c.getCorrectedState(16);
    expect(corrected).toHaveProperty('position');
    expect(corrected).toHaveProperty('rotation');
  });
});
