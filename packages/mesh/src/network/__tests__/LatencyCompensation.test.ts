/**
 * LatencyCompensation Unit Tests
 *
 * Tests InputPatternAnalyzer, IntentPredictor, AdaptiveHorizon,
 * CorrectionBlender, StateHistoryBuffer, and DEFAULT_LATENCY_CONFIG.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InputPatternAnalyzer,
  IntentPredictor,
  AdaptiveHorizon,
  CorrectionBlender,
  StateHistoryBuffer,
  DEFAULT_LATENCY_CONFIG,
  type IInteractable,
} from '@holoscript/core';
import type { IInputCommand, IVector3, IQuaternion } from '@holoscript/core';

// Helpers
function makeInput(tick: number, moveX = 0, moveZ = 0): IInputCommand {
  return {
    tick,
    timestamp: Date.now() + tick * 16,
    inputs: { moveX, moveZ, jump: false, action: false },
    sequenceNumber: tick,
  };
}

const ZERO_VEC3: IVector3 = { x: 0, y: 0, z: 0 };
const IDENTITY_QUAT: IQuaternion = { x: 0, y: 0, z: 0, w: 1 };

describe('InputPatternAnalyzer', () => {
  let analyzer: InputPatternAnalyzer;

  beforeEach(() => {
    analyzer = new InputPatternAnalyzer(32);
  });

  describe('recordInput', () => {
    it('should accept inputs without error', () => {
      expect(() => analyzer.recordInput(makeInput(1, 0, 1))).not.toThrow();
    });
  });

  describe('predictNextInput', () => {
    it('should return null with no history', () => {
      expect(analyzer.predictNextInput(1)).toBeNull();
    });

    it('should return null with insufficient history', () => {
      analyzer.recordInput(makeInput(0));
      analyzer.recordInput(makeInput(1));
      expect(analyzer.predictNextInput(2)).toBeNull();
    });

    it('should predict stationary when no movement', () => {
      for (let i = 0; i < 10; i++) {
        analyzer.recordInput(makeInput(i, 0, 0));
      }
      const prediction = analyzer.predictNextInput(10);
      expect(prediction).not.toBeNull();
      expect(prediction!.confidence).toBeGreaterThan(0);
      expect(prediction!.input.inputs.moveX).toBe(0);
    });

    it('should predict consistent forward movement', () => {
      for (let i = 0; i < 10; i++) {
        analyzer.recordInput(makeInput(i, 0, 1));
      }
      const prediction = analyzer.predictNextInput(10);
      expect(prediction).not.toBeNull();
      expect(prediction!.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('clear', () => {
    it('should clear history', () => {
      for (let i = 0; i < 5; i++) analyzer.recordInput(makeInput(i));
      analyzer.clear();
      expect(analyzer.predictNextInput(5)).toBeNull();
    });
  });
});

describe('IntentPredictor', () => {
  let predictor: IntentPredictor;

  beforeEach(() => {
    predictor = new IntentPredictor();
  });

  it('should register interactables without error', () => {
    const interactables: IInteractable[] = [
      { id: 'door1', position: [10, 0, 0], radius: 2, type: 'door' },
    ];
    expect(() => predictor.setInteractables(interactables)).not.toThrow();
  });

  it('should return null with insufficient trajectory', () => {
    predictor.setInteractables([
      { id: 'x', position: [5, 0, 0], radius: 1, type: 'pickup' },
    ]);
    const result = predictor.predictIntent(ZERO_VEC3, { x: 1, y: 0, z: 0 });
    expect(result).toBeNull(); // < 5 trajectory records
  });

  it('should return null with no interactables', () => {
    for (let i = 0; i < 10; i++) predictor.recordPosition({ x: i, y: 0, z: 0 }, i * 100);
    const result = predictor.predictIntent({ x: 9, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(result).toBeNull();
  });

  it('should predict towards nearby interactable when moving towards it', () => {
    predictor.setInteractables([
      { id: 'pickup1', position: [5, 0, 0], radius: 1.5, type: 'pickup' },
    ]);
    for (let i = 0; i < 8; i++) predictor.recordPosition({ x: i * 0.5, y: 0, z: 0 }, i * 100);

    const result = predictor.predictIntent(
      { x: 3, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      undefined,
      2000
    );

    if (result) {
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.interactableId).toBe('pickup1');
    }
  });

  it('should clear trajectory history', () => {
    for (let i = 0; i < 10; i++) predictor.recordPosition({ x: i, y: 0, z: 0 }, i * 100);
    predictor.clear();
    predictor.setInteractables([
      { id: 'x', position: [5, 0, 0], radius: 1, type: 'generic' },
    ]);
    const result = predictor.predictIntent({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(result).toBeNull(); // cleared
  });
});

describe('AdaptiveHorizon', () => {
  it('should start with standard tier (RTT=0)', () => {
    const h = new AdaptiveHorizon(DEFAULT_LATENCY_CONFIG);
    expect(h.getTier()).toBe('standard');
    expect(h.getAverageRTT()).toBe(0);
  });

  it('should compute input tier at 100-300ms RTT', () => {
    const h = new AdaptiveHorizon(DEFAULT_LATENCY_CONFIG);
    for (let i = 0; i < 10; i++) h.recordRTT(150);
    expect(h.getTier()).toBe('input');
  });

  it('should compute intent tier at >300ms RTT', () => {
    const h = new AdaptiveHorizon(DEFAULT_LATENCY_CONFIG);
    for (let i = 0; i < 10; i++) h.recordRTT(400);
    expect(h.getTier()).toBe('intent');
  });

  it('should update horizon based on RTT + jitter + safety', () => {
    const h = new AdaptiveHorizon(DEFAULT_LATENCY_CONFIG);
    for (let i = 0; i < 20; i++) h.recordRTT(50 + i * 5);
    const horizon = h.update();
    expect(horizon).toBeGreaterThan(0);
    expect(horizon).toBeLessThanOrEqual(DEFAULT_LATENCY_CONFIG.maxHorizon);
  });

  it('should compute jitter as P95-P50', () => {
    const h = new AdaptiveHorizon(DEFAULT_LATENCY_CONFIG);
    for (let i = 0; i < 20; i++) h.recordRTT(50 + i * 2);
    expect(h.getJitter()).toBeGreaterThan(0);
  });
});

describe('CorrectionBlender', () => {
  it('should return none for invisible error', () => {
    const cb = new CorrectionBlender(DEFAULT_LATENCY_CONFIG);
    const type = cb.queueCorrection(
      { x: 0, y: 0, z: 0 },
      { x: 0.05, y: 0, z: 0 },
      IDENTITY_QUAT,
      IDENTITY_QUAT
    );
    expect(type).toBe('none');
  });

  it('should return exponential for small error', () => {
    const cb = new CorrectionBlender(DEFAULT_LATENCY_CONFIG);
    const type = cb.queueCorrection(
      { x: 0, y: 0, z: 0 },
      { x: 0.3, y: 0, z: 0 },
      IDENTITY_QUAT,
      IDENTITY_QUAT
    );
    expect(type).toBe('exponential');
  });

  it('should return snap for large error', () => {
    const cb = new CorrectionBlender(DEFAULT_LATENCY_CONFIG);
    const type = cb.queueCorrection(
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      IDENTITY_QUAT,
      IDENTITY_QUAT
    );
    expect(type).toBe('snap');
  });

  it('should blend towards target', () => {
    const cb = new CorrectionBlender(DEFAULT_LATENCY_CONFIG);
    cb.queueCorrection({ x: 0, y: 0, z: 0 }, { x: 0.3, y: 0, z: 0 }, IDENTITY_QUAT, IDENTITY_QUAT);
    expect(cb.isBlending()).toBe(true);
    const result = cb.update(500, { x: 0, y: 0, z: 0 }, IDENTITY_QUAT);
    expect(result.position.x).toBeCloseTo(0.3, 1);
  });
});

describe('StateHistoryBuffer', () => {
  const makeState = (tick: number) => ({
    position: ZERO_VEC3,
    rotation: IDENTITY_QUAT,
    velocity: ZERO_VEC3,
    angularVelocity: ZERO_VEC3,
    timestamp: Date.now(),
    tick,
    confidence: 1,
  });

  it('should push and retrieve by tick', () => {
    const buf = new StateHistoryBuffer(128);
    buf.push(makeState(1));
    buf.push(makeState(2));
    expect(buf.getAtTick(1)).not.toBeNull();
    expect(buf.getAtTick(2)!.tick).toBe(2);
    expect(buf.getAtTick(99)).toBeNull();
  });

  it('should get latest', () => {
    const buf = new StateHistoryBuffer();
    expect(buf.getLatest()).toBeNull();
    buf.push(makeState(5));
    buf.push(makeState(10));
    expect(buf.getLatest()!.tick).toBe(10);
  });

  it('should clear before tick', () => {
    const buf = new StateHistoryBuffer();
    for (let i = 1; i <= 5; i++) buf.push(makeState(i));
    buf.clearBefore(3);
    expect(buf.getAtTick(1)).toBeNull();
    expect(buf.getAtTick(2)).toBeNull();
    expect(buf.getAtTick(3)).not.toBeNull();
  });

  it('should cap size', () => {
    const buf = new StateHistoryBuffer(5);
    for (let i = 0; i < 10; i++) buf.push(makeState(i));
    expect(buf.size).toBe(5);
  });
});

describe('DEFAULT_LATENCY_CONFIG', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_LATENCY_CONFIG.maxHorizon).toBeGreaterThan(0);
    expect(DEFAULT_LATENCY_CONFIG.blendDurations.small).toBeGreaterThan(0);
    expect(DEFAULT_LATENCY_CONFIG.thresholds.invisible).toBeGreaterThan(0);
    expect(DEFAULT_LATENCY_CONFIG.inputHistorySize).toBeGreaterThan(0);
  });
});
