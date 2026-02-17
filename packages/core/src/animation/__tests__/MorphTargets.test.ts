import { describe, it, expect, beforeEach } from 'vitest';
import { MorphTargetSystem } from '../MorphTargets';
import type { MorphDelta } from '../MorphTargets';

describe('MorphTargetSystem', () => {
  let sys: MorphTargetSystem;
  const vertexCount = 4;

  beforeEach(() => { sys = new MorphTargetSystem(vertexCount); });

  // ---------------------------------------------------------------------------
  // Target Management
  // ---------------------------------------------------------------------------

  it('addTarget registers a morph target', () => {
    sys.addTarget('smile', [{ vertexIndex: 0, dx: 0.1, dy: 0, dz: 0 }]);
    expect(sys.getTargetCount()).toBe(1);
  });

  it('removeTarget removes a morph target', () => {
    sys.addTarget('smile', []);
    sys.removeTarget('smile');
    expect(sys.getTargetCount()).toBe(0);
  });

  it('setWeight updates target weight', () => {
    sys.addTarget('smile', []);
    sys.setWeight('smile', 0.8);
    expect(sys.getWeight('smile')).toBeCloseTo(0.8);
  });

  it('setWeight clamps to 0-1', () => {
    sys.addTarget('smile', []);
    sys.setWeight('smile', 1.5);
    expect(sys.getWeight('smile')).toBe(1);
    sys.setWeight('smile', -0.5);
    expect(sys.getWeight('smile')).toBe(0);
  });

  it('getWeight returns 0 for unknown target', () => {
    expect(sys.getWeight('nope')).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Presets
  // ---------------------------------------------------------------------------

  it('addPreset and applyPreset set weights', () => {
    sys.addTarget('smile', []);
    sys.addTarget('frown', []);
    const weights = new Map([['smile', 0.9], ['frown', 0.1]]);
    sys.addPreset('happy', weights);
    sys.applyPreset('happy');
    expect(sys.getWeight('smile')).toBeCloseTo(0.9);
    expect(sys.getWeight('frown')).toBeCloseTo(0.1);
  });

  it('applyPreset with unknown preset does nothing', () => {
    sys.addTarget('smile', []);
    sys.setWeight('smile', 0.5);
    sys.applyPreset('nope');
    expect(sys.getWeight('smile')).toBeCloseTo(0.5);
  });

  // ---------------------------------------------------------------------------
  // Vertex Computation
  // ---------------------------------------------------------------------------

  it('computeDeformedPositions applies weighted deltas', () => {
    const deltas: MorphDelta[] = [
      { vertexIndex: 0, dx: 1, dy: 0, dz: 0 },
      { vertexIndex: 1, dx: 0, dy: 2, dz: 0 },
    ];
    sys.addTarget('test', deltas);
    sys.setWeight('test', 0.5);

    // Base: [0,0,0, 0,0,0, 0,0,0, 0,0,0]
    const base = new Float32Array(vertexCount * 3);
    const result = sys.computeDeformedPositions(base);
    expect(result[0]).toBeCloseTo(0.5); // vertex 0 x += 1 * 0.5
    expect(result[4]).toBeCloseTo(1.0); // vertex 1 y += 2 * 0.5
  });

  it('zero-weight target does not modify positions', () => {
    sys.addTarget('test', [{ vertexIndex: 0, dx: 10, dy: 10, dz: 10 }]);
    sys.setWeight('test', 0);
    const base = new Float32Array(vertexCount * 3);
    const result = sys.computeDeformedPositions(base);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Interpolation
  // ---------------------------------------------------------------------------

  it('lerpWeights interpolates between current and target weights', () => {
    sys.addTarget('smile', []);
    sys.setWeight('smile', 0);
    const targetWeights = new Map([['smile', 1]]);
    sys.lerpWeights(targetWeights, 0.5);
    expect(sys.getWeight('smile')).toBeCloseTo(0.5);
  });

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  it('getActiveTargets lists targets with weight > 0', () => {
    sys.addTarget('a', []);
    sys.addTarget('b', []);
    sys.setWeight('a', 0.5);
    expect(sys.getActiveTargets()).toEqual(['a']);
  });

  it('getVertexCount returns configured count', () => {
    expect(sys.getVertexCount()).toBe(vertexCount);
  });
});
