import { describe, it, expect } from 'vitest';
import { ComputePhysicsCompiler } from '../ComputePhysicsCompiler';
import {
  BASE_SPHERE_RADIUS,
  RENDER_DIAMETER_FACTOR,
  RENDER_EQUALS_PHYSICS_INVARIANT,
  sphereCollisionRadius,
  boxHalfExtents,
} from './geometry-extent';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

// The MACHINE THAT CAN'T BE LENIENT. Parses the ACTUAL emitted Rust and asserts that the
// size the renderer draws EQUALS the size the physics collides — for every primitive it
// covers. This is the enforcement the 2x-sphere "ghost sink" bug slipped through because
// render size and physics size were matched by comment, not by a computed equality.
//
// FAIL-CLOSED: every regex match is asserted non-null before use, so a readability refactor
// that changes the emitted formatting fails the gate LOUDLY instead of silently skipping it.

const prop = (key: string, value: unknown) => ({ key, value });
const obj = (
  name: string,
  props: Array<{ key: string; value: unknown }>,
  traits: Array<{ name: string; config?: Record<string, unknown> }> = []
): HoloObjectDecl => ({ type: 'Object', name, properties: props, traits }) as unknown as HoloObjectDecl;
const comp = (objects: HoloObjectDecl[]): HoloComposition =>
  ({ type: 'HoloComposition', name: 'GeomConsistency', objects }) as HoloComposition;

function emit(scale: [number, number, number]): string {
  return new ComputePhysicsCompiler({ steps: 0 }).compile(
    comp([
      obj('Floor', [prop('mesh', 'cube'), prop('position', [0, 0, 0]), prop('scale', [8, 0.4, 8])]),
      obj('Ball', [prop('mesh', 'sphere'), prop('position', [0, 8, 0]), prop('scale', scale)], [{ name: 'rigid_body' }]),
    ])
  );
}

describe('geometry-consistency gate — render size MUST equal physics size', () => {
  it('sphere: render radius == collision radius (base * model-factor === 1)', () => {
    const rs = emit([2, 2, 2]);

    // base sphere mesh radius (unit-diameter => 0.5)
    const baseM = /gen_sphere\((\d+(?:\.\d+)?),/.exec(rs);
    expect(baseM, 'gen_sphere(...) base radius must be parseable (fail-closed)').not.toBeNull();
    const baseR = Number(baseM![1]);

    // per-body render model-scale factor on r (the "[r*2.0, ...]" coefficient)
    const factorM = /model_of\(\[b\.pos\[0\], b\.pos\[1\], b\.pos\[2\]\], \[r\*(\d+(?:\.\d+)?)/.exec(rs);
    expect(factorM, 'sphere render model-scale factor must be parseable (fail-closed)').not.toBeNull();
    const factor = Number(factorM![1]);

    // THE invariant: rendered radius = baseR * factor * r ; render==physics iff baseR*factor === 1.
    // gen_sphere(1.0) (the real bug) makes this 2.0; a dropped *2 makes it 0.5. Only 1.0 passes.
    expect(baseR).toBe(BASE_SPHERE_RADIUS);
    expect(factor).toBe(RENDER_DIAMETER_FACTOR);
    expect(baseR * factor).toBe(RENDER_EQUALS_PHYSICS_INVARIANT);
    expect(baseR * factor).toBeCloseTo(1, 9);
  });

  it('sphere: the physics radius baked into the body == resolver collision radius', () => {
    const rs = emit([2, 2, 2]);
    // first Body literal: Body { pos: [x, y, z, RADIUS], ... }
    const bodyM = /Body \{ pos: \[(-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?), (\d+(?:\.\d+)?)\]/.exec(rs);
    expect(bodyM, 'a Body literal with pos[3]=radius must be parseable (fail-closed)').not.toBeNull();
    const physicsRadius = Number(bodyM![4]);
    expect(physicsRadius).toBe(sphereCollisionRadius([2, 2, 2])); // 0.5 * max(2,2,2) = 1.0
  });

  it('box: cube base is unit-size so render half == collision half (gen_cube(1.0))', () => {
    const rs = emit([1, 1, 1]);
    const cubeM = /gen_cube\((\d+(?:\.\d+)?)/.exec(rs);
    expect(cubeM, 'gen_cube(...) base size must be parseable (fail-closed)').not.toBeNull();
    // gen_cube(B): render half = 0.5*B*fullExtent ; physics half = 0.5*fullExtent. Equal iff B===1.
    // gen_cube(2.0) would draw every wall/floor at 2x its collider — the sphere bug on a box.
    expect(Number(cubeM![1])).toBe(1);
  });

  it('box: the static AABB half-extents == resolver box half-extents', () => {
    const rs = emit([1, 1, 1]);
    const aabbM = /Aabb \{ mn: \[(-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?), [\d.]+\], mx: \[(-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?),/.exec(rs);
    expect(aabbM, 'a floor Aabb literal must be parseable (fail-closed)').not.toBeNull();
    const half: [number, number, number] = [
      (Number(aabbM![4]) - Number(aabbM![1])) / 2,
      (Number(aabbM![5]) - Number(aabbM![2])) / 2,
      (Number(aabbM![6]) - Number(aabbM![3])) / 2,
    ];
    // Floor scale [8, 0.4, 8] -> half [4, 0.2, 4].
    expect(half).toEqual(boxHalfExtents([8, 0.4, 8]));
  });

  it('collision radius scales with authored scale (guards a mismatched scale convention)', () => {
    expect(sphereCollisionRadius([1, 1, 1])).toBe(0.5);
    expect(sphereCollisionRadius([3, 1, 1])).toBe(1.5); // max axis
    // and the emitted body radius tracks it
    const rs = emit([3, 1, 1]);
    const bodyM = /Body \{ pos: \[-?\d+(?:\.\d+)?, -?\d+(?:\.\d+)?, -?\d+(?:\.\d+)?, (\d+(?:\.\d+)?)\]/.exec(rs);
    expect(bodyM).not.toBeNull();
    expect(Number(bodyM![1])).toBe(1.5);
  });
});
