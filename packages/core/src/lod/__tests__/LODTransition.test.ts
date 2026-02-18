import { describe, it, expect, beforeEach } from 'vitest';
import { LODTransition } from '../LODTransition';

describe('LODTransition', () => {
  it('defaults to crossfade mode', () => {
    const lod = new LODTransition();
    expect(lod.getMode()).toBe('crossfade');
  });

  it('instant mode completes immediately', () => {
    const lod = new LODTransition({ mode: 'instant' });
    lod.startTransition('ent1', 0, 1);
    expect(lod.isTransitioning('ent1')).toBe(false);
    expect(lod.getBlendFactor('ent1')).toBe(1);
  });

  it('crossfade progresses over time', () => {
    const lod = new LODTransition({ mode: 'crossfade', duration: 1.0 });
    lod.startTransition('ent1', 0, 1);
    expect(lod.isTransitioning('ent1')).toBe(true);

    lod.update(0.5); // 50%
    expect(lod.getBlendFactor('ent1')).toBeCloseTo(0.5);
    expect(lod.isTransitioning('ent1')).toBe(true);

    lod.update(0.5); // 100%
    expect(lod.getBlendFactor('ent1')).toBe(1);
    expect(lod.isTransitioning('ent1')).toBe(false);
  });

  it('dither mode returns binary threshold', () => {
    const lod = new LODTransition({ mode: 'dither', duration: 1.0 });
    lod.startTransition('ent1', 0, 1);

    lod.update(0.3); // 30% < 50% → 0
    expect(lod.getBlendFactor('ent1')).toBe(0);

    lod.update(0.3); // 60% > 50% → 1
    expect(lod.getBlendFactor('ent1')).toBe(1);
  });

  it('morph mode uses smoothstep', () => {
    const lod = new LODTransition({ mode: 'morph', duration: 1.0 });
    lod.startTransition('ent1', 0, 1);

    lod.update(0.5); // 50% → smoothstep(0.5) = 0.5
    expect(lod.getBlendFactor('ent1')).toBeCloseTo(0.5);
  });

  it('getDitherThreshold returns raw progress', () => {
    const lod = new LODTransition({ duration: 1.0 });
    lod.startTransition('ent1', 0, 1);
    lod.update(0.3);
    expect(lod.getDitherThreshold('ent1')).toBeCloseTo(0.3);
  });

  it('shouldTransition respects hysteresis band', () => {
    const lod = new LODTransition({ hysteresisBand: 5 });
    // Upgrading (lod going up) needs distance > threshold + band
    expect(lod.shouldTransition(55, 50, 0, 1)).toBe(false); // 55 <= 55
    expect(lod.shouldTransition(56, 50, 0, 1)).toBe(true);  // 56 > 55

    // Downgrading (lod going down) needs distance < threshold - band
    expect(lod.shouldTransition(46, 50, 1, 0)).toBe(false); // 46 > 45, not a downgrade trigger
    expect(lod.shouldTransition(44, 50, 1, 0)).toBe(true);  // 44 < 45
  });

  it('getTransitionState returns undefined for unknown entity', () => {
    const lod = new LODTransition();
    expect(lod.getTransitionState('nope')).toBeUndefined();
  });

  it('setMode changes the transition mode', () => {
    const lod = new LODTransition();
    lod.setMode('dither');
    expect(lod.getMode()).toBe('dither');
  });

  it('getBlendFactor returns 1 for unknown entity', () => {
    const lod = new LODTransition();
    expect(lod.getBlendFactor('unknown')).toBe(1);
  });
});
