import { describe, it, expect, beforeEach } from 'vitest';
import { MorphTargetSystem } from '@holoscript/engine/animation/MorphTargets';
import type { MorphDelta } from '@holoscript/engine/animation/MorphTargets';

// =============================================================================
// C244 — Morph Targets
// =============================================================================

const SMILE_DELTAS: MorphDelta[] = [
  { vertexIndex: 0, dx: 0.1, dy: 0.2, dz: 0 },
  { vertexIndex: 1, dx: -0.1, dy: 0.2, dz: 0 },
];

describe('MorphTargetSystem', () => {
  let sys: MorphTargetSystem;
  beforeEach(() => {
    sys = new MorphTargetSystem(100);
  });

  it('constructor records vertex count', () => {
    expect(sys.getVertexCount()).toBe(100);
  });

  it('addTarget increases target count', () => {
    sys.addTarget('smile', SMILE_DELTAS);
    expect(sys.getTargetCount()).toBe(1);
  });

  it('removeTarget decreases count', () => {
    sys.addTarget('smile', SMILE_DELTAS);
    sys.removeTarget('smile');
    expect(sys.getTargetCount()).toBe(0);
  });

  it('setWeight clamps 0-1', () => {
    sys.addTarget('smile', SMILE_DELTAS);
    sys.setWeight('smile', 1.5);
    expect(sys.getWeight('smile')).toBe(1);
    sys.setWeight('smile', -0.5);
    expect(sys.getWeight('smile')).toBe(0);
  });

  it('getWeight defaults to 0', () => {
    sys.addTarget('smile', SMILE_DELTAS);
    expect(sys.getWeight('smile')).toBe(0);
  });

  it('getWeight returns 0 for unknown target', () => {
    expect(sys.getWeight('nonexistent')).toBe(0);
  });

  it('computeDeformedPositions with weight 0 returns copy of base', () => {
    sys.addTarget('smile', SMILE_DELTAS);
    const base = new Float32Array(300); // 100 vertices * 3
    base[0] = 1;
    base[1] = 2;
    base[2] = 3;
    const result = sys.computeDeformedPositions(base);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe(2);
    expect(result[2]).toBe(3);
  });

  it('computeDeformedPositions applies weighted deltas', () => {
    sys.addTarget('smile', SMILE_DELTAS);
    sys.setWeight('smile', 1.0);
    const base = new Float32Array(300);
    const result = sys.computeDeformedPositions(base);
    // vertex 0: dx=0.1*1, dy=0.2*1
    expect(result[0]).toBeCloseTo(0.1);
    expect(result[1]).toBeCloseTo(0.2);
  });

  it('addPreset and applyPreset sets weights', () => {
    sys.addTarget('smile', SMILE_DELTAS);
    sys.addTarget('frown', [{ vertexIndex: 0, dx: 0, dy: -0.2, dz: 0 }]);
    sys.addPreset(
      'happy',
      new Map([
        ['smile', 0.8],
        ['frown', 0.0],
      ])
    );
    sys.applyPreset('happy');
    expect(sys.getWeight('smile')).toBeCloseTo(0.8);
    expect(sys.getWeight('frown')).toBe(0);
  });

  it('applyPreset with unknown name is no-op', () => {
    sys.addTarget('smile', SMILE_DELTAS);
    sys.setWeight('smile', 0.5);
    sys.applyPreset('nonexistent');
    expect(sys.getWeight('smile')).toBe(0.5);
  });

  it('lerpWeights interpolates between current and target', () => {
    sys.addTarget('smile', SMILE_DELTAS);
    sys.setWeight('smile', 0);
    sys.lerpWeights(new Map([['smile', 1.0]]), 0.5);
    expect(sys.getWeight('smile')).toBeCloseTo(0.5);
  });

  it('getActiveTargets returns only non-zero weight targets', () => {
    sys.addTarget('smile', SMILE_DELTAS);
    sys.addTarget('frown', []);
    sys.setWeight('smile', 0.5);
    const active = sys.getActiveTargets();
    expect(active).toContain('smile');
    expect(active).not.toContain('frown');
  });
});
