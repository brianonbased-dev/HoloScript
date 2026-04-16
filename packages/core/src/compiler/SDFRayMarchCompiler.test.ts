import { describe, it, expect } from 'vitest';
import { compileSDFScene, type SDFNode } from './SDFRayMarchCompiler';

describe('SDFRayMarchCompiler', () => {
  it('chains three CSG children using accumulated distance id', () => {
    const root: SDFNode = {
      type: 'csg',
      operation: 'union',
      children: [
        { type: 'primitive', primitive: 'sphere', params: { radius: 0.5 } },
        { type: 'primitive', primitive: 'sphere', params: { radius: 0.4 }, translate: [1, 0, 0] },
        { type: 'primitive', primitive: 'sphere', params: { radius: 0.3 }, translate: [2, 0, 0] },
      ],
    };
    const { fragmentShader } = compileSDFScene(root, 32, 50, 0.01);
    expect(fragmentShader).toContain('opUnion');
    const sceneOps = fragmentShader.match(/float d\d+ = opUnion\(/g) ?? [];
    expect(sceneOps.length).toBe(2);
    expect(fragmentShader).toMatch(/float d\d+ = opUnion\(d\d+, d\d+\)/);
  });

  it('emits intersect op for CSG intersect', () => {
    const root: SDFNode = {
      type: 'csg',
      operation: 'intersect',
      children: [
        { type: 'primitive', primitive: 'box', params: { width: 1, height: 1, depth: 1 } },
        { type: 'primitive', primitive: 'sphere', params: { radius: 0.8 } },
      ],
    };
    const { fragmentShader } = compileSDFScene(root);
    expect(fragmentShader).toContain('opIntersect');
  });

  it('compiles extended primitives (cone, ellipsoid)', () => {
    const root: SDFNode = {
      type: 'csg',
      operation: 'union',
      children: [
        { type: 'primitive', primitive: 'cone', params: { c0: 0.4, c1: 0.35, height: 1 } },
        { type: 'primitive', primitive: 'ellipsoid', params: { rx: 0.5, ry: 0.3, rz: 0.4 } },
      ],
    };
    const { fragmentShader } = compileSDFScene(root);
    expect(fragmentShader).toContain('sdCone');
    expect(fragmentShader).toContain('sdEllipsoid');
  });
});
