import { describe, expect, it } from 'vitest';
import {
  SDFPointEvaluator,
  evaluateSDFNode,
  type SDFNode,
} from '../SDFPointEvaluator';

describe('SDFPointEvaluator', () => {
  it('evaluates primitive sphere distances on the JS side', () => {
    const sphere: SDFNode = {
      type: 'primitive',
      primitive: 'sphere',
      params: { radius: 1 },
    };

    expect(evaluateSDFNode(sphere, [0, 0, 0])).toBeCloseTo(-1);
    expect(evaluateSDFNode(sphere, [1, 0, 0])).toBeCloseTo(0);
    expect(evaluateSDFNode(sphere, [2, 0, 0])).toBeCloseTo(1);
  });

  it('honors compiler-shaped translate and scale transforms', () => {
    const translated: SDFNode = {
      type: 'primitive',
      primitive: 'sphere',
      params: { radius: 1 },
      translate: [2, 0, 0],
      scale: [2, 2, 2],
    };

    expect(evaluateSDFNode(translated, [2, 0, 0])).toBeCloseTo(-2);
    expect(evaluateSDFNode(translated, [4, 0, 0])).toBeCloseTo(0);
    expect(evaluateSDFNode(translated, [6, 0, 0])).toBeCloseTo(2);
  });

  it('combines child distances with CSG operations', () => {
    const scene: SDFNode = {
      type: 'csg',
      operation: 'intersect',
      children: [
        { type: 'primitive', primitive: 'sphere', params: { radius: 1 } },
        { type: 'primitive', primitive: 'box', params: { width: 0.5, height: 0.5, depth: 0.5 } },
      ],
    };

    expect(evaluateSDFNode(scene, [0, 0, 0])).toBeCloseTo(-0.5);
    expect(evaluateSDFNode(scene, [0.75, 0, 0])).toBeCloseTo(0.25);
  });

  it('supports repeat domains before evaluating the child node', () => {
    const repeated: SDFNode = {
      type: 'domain',
      operation: 'repeat',
      params: { cx: 2, cy: 2, cz: 2 },
      children: [{ type: 'primitive', primitive: 'sphere', params: { radius: 0.25 } }],
    };

    expect(evaluateSDFNode(repeated, [0, 0, 0])).toBeCloseTo(-0.25);
    expect(evaluateSDFNode(repeated, [2, 0, 0])).toBeCloseTo(-0.25);
    expect(evaluateSDFNode(repeated, [1, 0, 0])).toBeCloseTo(0.75);
  });

  it('returns deterministic sample records for conjecture harnesses', () => {
    const evaluator = new SDFPointEvaluator({
      type: 'csg',
      operation: 'smooth_union',
      smoothness: 0.2,
      children: [
        { type: 'primitive', primitive: 'sphere', params: { radius: 0.6 } },
        {
          type: 'primitive',
          primitive: 'sphere',
          params: { radius: 0.6 },
          translate: [0.8, 0, 0],
        },
      ],
    });

    const samples = evaluator.sample([
      [0, 0, 0],
      [0.4, 0, 0],
      [2, 0, 0],
    ]);

    expect(samples).toHaveLength(3);
    expect(samples[0].rootType).toBe('csg');
    expect(samples[0].operation).toBe('smooth_union');
    expect(samples[0].distance).toBeLessThan(0);
    expect(samples[1].distance).toBeLessThan(samples[2].distance);
  });

  it('rejects malformed trees before a probe can treat them as evidence', () => {
    expect(() =>
      evaluateSDFNode({ type: 'csg', operation: 'union', children: [] }, [0, 0, 0]),
    ).toThrow(/at least two children/);
    expect(() =>
      evaluateSDFNode({ type: 'primitive', primitive: 'sphere', scale: [1, 0, 1] }, [0, 0, 0]),
    ).toThrow(/scale entries/);
  });
});
