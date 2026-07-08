import { describe, it, expect } from 'vitest';
import {
  resolveMaterial,
  massFor,
  primitiveVolume,
  combineRestitution,
  combineFriction,
  materialNames,
  DEFAULT_MATERIAL_NAME,
} from './material-registry';
import { ComputePhysicsCompiler } from '../ComputePhysicsCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

const prop = (key: string, value: unknown) => ({ key, value });
const obj = (
  name: string,
  props: Array<{ key: string; value: unknown }>,
  traits: Array<{ name: string; config?: Record<string, unknown> }> = []
): HoloObjectDecl => ({ type: 'Object', name, properties: props, traits }) as unknown as HoloObjectDecl;
const comp = (objects: HoloObjectDecl[]): HoloComposition =>
  ({ type: 'HoloComposition', name: 'M', objects }) as HoloComposition;

describe('material-registry — the reality of matter as data (D.125)', () => {
  it('resolves a real material to real physical + render constants', () => {
    const { material, defaulted } = resolveMaterial('rubber');
    expect(defaulted).toBe(false);
    expect(material.name).toBe('rubber');
    expect(material.restitution).toBeCloseTo(0.85);
    expect(material.roughness).toBeCloseTo(0.8);
    expect(material.metalness).toBe(0);
  });

  it('resolves aliases (bouncy/tire -> rubber, metal/iron -> steel)', () => {
    expect(resolveMaterial('bouncy').material.name).toBe('rubber');
    expect(resolveMaterial('tire').material.name).toBe('rubber');
    expect(resolveMaterial('metal').material.name).toBe('steel');
    expect(resolveMaterial('iron').material.name).toBe('steel');
  });

  it('defaults to a REAL material (not a matterless abstraction) and flags it', () => {
    const miss = resolveMaterial(undefined);
    expect(miss.defaulted).toBe(true);
    expect(miss.material.name).toBe(DEFAULT_MATERIAL_NAME);
    expect(resolveMaterial('not-a-material').defaulted).toBe(true);
  });

  it('derives mass from density x volume — never a hand-set float', () => {
    const steel = resolveMaterial('steel').material;
    expect(massFor(steel, 1)).toBeCloseTo(7850); // 7850 kg/m^3 x 1 m^3
    // a 0.5m-radius steel sphere: 7850 * (4/3)π(0.5^3)
    const vol = primitiveVolume('sphere', 0.5, [0.5, 0.5, 0.5]);
    expect(vol).toBeCloseTo((4 / 3) * Math.PI * 0.125, 4);
    expect(massFor(steel, vol)).toBeGreaterThan(4000);
  });

  it('combines a material PAIR for object-on-object reactions (geometric mean)', () => {
    const rubber = resolveMaterial('rubber').material;
    const steel = resolveMaterial('steel').material;
    expect(combineRestitution(rubber, steel)).toBeCloseTo(Math.sqrt(0.85 * 0.6));
    expect(combineFriction(rubber, steel)).toBeCloseTo(Math.sqrt(0.9 * 0.6));
  });

  it('exposes the material vocabulary for gates/benchmarks', () => {
    const names = materialNames();
    expect(names).toEqual(expect.arrayContaining(['rubber', 'steel', 'plastic', 'wood', 'glass', 'clay']));
  });
});

describe('ComputePhysicsCompiler — material drives physics + surface (D.125)', () => {
  it('a rubber sphere gets rubber restitution/friction + mass from density, not bare floats', () => {
    const rs = new ComputePhysicsCompiler({ steps: 0 }).compile(
      comp([obj('Ball', [prop('mesh', 'sphere'), prop('position', [0, 5, 0]), prop('material', 'rubber')], [{ name: 'rigid_body' }])])
    );
    // rubber restitution 0.85, friction 0.9 flow into the body params.
    expect(rs).toContain('params: [0.85, 0.9, 0.0, 0.0]');
    // rubber surface (roughness 0.8) emitted into BODY_MAT.
    expect(rs).toContain('const BODY_MAT: &[[f32; 4]] = &[');
    expect(rs).toMatch(/\[0\.8, 0\.0, 0\.05, 0\.0\]/); // rubber roughness/metal/subsurface
  });

  it('an explicit restitution overrides the material (the "unless explicitly designed" clause)', () => {
    const rs = new ComputePhysicsCompiler({ steps: 0 }).compile(
      comp([obj('Ball', [prop('mesh', 'sphere'), prop('material', 'rubber')], [{ name: 'rigid_body', config: { restitution: 0.1 } }])])
    );
    expect(rs).toContain('params: [0.1, 0.9, 0.0, 0.0]'); // restitution overridden, friction still rubber
  });

  it('no material -> defaults to a real material (plastic), not a matterless 0.6', () => {
    const rs = new ComputePhysicsCompiler({ steps: 0 }).compile(
      comp([obj('Ball', [prop('mesh', 'sphere')], [{ name: 'rigid_body' }])])
    );
    expect(rs).toContain('params: [0.7, 0.35, 0.0, 0.0]'); // plastic restitution 0.7, friction 0.35
  });

  it('renders spheres at their COLLISION radius (render size == physics size — the 2x bug guard)', () => {
    const rs = new ComputePhysicsCompiler({ steps: 0 }).compile(
      comp([obj('Ball', [prop('mesh', 'sphere')], [{ name: 'rigid_body' }])])
    );
    // Base sphere is unit-DIAMETER (radius 0.5) and scaled by r*2 -> render radius == r.
    // gen_sphere(1.0) here would draw every ball at 2x its collision radius (the ghost-sink bug).
    expect(rs).toContain('gen_sphere(0.5, 16, 16)');
    expect(rs).toContain('[r*2.0, r*2.0, r*2.0]');
  });
});
