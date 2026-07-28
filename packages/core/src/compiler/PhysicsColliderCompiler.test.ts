import { describe, it, expect } from 'vitest';
import { PhysicsColliderCompiler } from './PhysicsColliderCompiler';
import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';

const prop = (key: string, value: unknown) => ({ key, value });
const obj = (
  name: string,
  props: Array<{ key: string; value: unknown }>,
  traits: Array<{ name: string }> = []
): HoloObjectDecl => ({ type: 'ObjectDecl', name, properties: props, traits }) as HoloObjectDecl;

const comp = (objects: HoloObjectDecl[], name = 'PhysScene'): HoloComposition =>
  ({ type: 'HoloComposition', name, objects }) as HoloComposition;

describe('PhysicsColliderCompiler — a second consumer of the shared geometry vocabulary', () => {
  it('turns a purpose=collision cube into a fixed cuboid collider sized from its scale', () => {
    const world = new PhysicsColliderCompiler().compileToObject(
      comp([
        obj('Floor', [
          prop('mesh', 'cube'),
          prop('purpose', 'collision'),
          prop('position', [0, -1, 0]),
          prop('scale', [10, 0.5, 10]),
        ]),
      ])
    );
    expect(world.colliderCount).toBe(1);
    const c = world.colliders[0];
    expect(c.shape).toBe('cuboid');
    // Cube generator is unit 1.0 → half-extent 0.5 * scale.
    expect(c.halfExtents).toEqual([5, 0.25, 5]);
    expect(c.translation).toEqual([0, -1, 0]);
    expect(c.bodyType).toBe('fixed');
    expect(c.isSensor).toBe(false);
    expect(c.primitive).toBe('box');
    expect(c.purpose).toBe('collision');
  });

  it('turns a trigger sphere into a ball SENSOR (overlap, not solid)', () => {
    const world = new PhysicsColliderCompiler().compileToObject(
      comp([
        obj('Zone', [prop('mesh', 'sphere'), prop('purpose', 'trigger'), prop('scale', [3, 3, 3])]),
      ])
    );
    const c = world.colliders[0];
    expect(c.shape).toBe('ball');
    expect(c.radius).toBe(1.5); // sphere radius 0.5 * scale 3
    expect(c.isSensor).toBe(true);
    expect(c.primitive).toBe('sphere');
  });

  it('gives a rigidbody-trait object a DYNAMIC collider even though it also renders', () => {
    const world = new PhysicsColliderCompiler().compileToObject(
      comp([obj('Crate', [prop('mesh', 'cube')], [{ name: 'rigidbody' }])])
    );
    const c = world.colliders[0];
    expect(c.bodyType).toBe('dynamic');
    expect(c.shape).toBe('cuboid');
    // A rigidbody is visible AND physical — it is NOT a functional-only purpose.
    expect(c.purpose).toBe('render');
  });

  it('keeps the object rotation that the render path drops', () => {
    const world = new PhysicsColliderCompiler().compileToObject(
      comp([
        obj('Ramp', [
          prop('mesh', 'cube'),
          prop('purpose', 'collision'),
          prop('rotation', [-15, 0, 0]),
        ]),
      ])
    );
    expect(world.colliders[0].rotation).toEqual([-15, 0, 0]);
  });

  it('approximates a torus collider (no exact primitive) and flags it', () => {
    const world = new PhysicsColliderCompiler().compileToObject(
      comp([obj('Ring', [prop('mesh', 'torus'), prop('purpose', 'collision')])])
    );
    const c = world.colliders[0];
    expect(c.shape).toBe('cylinder');
    expect(c.approximated).toBe(true);
  });

  it('emits NO colliders for a pure-render scene (physics reads only physical geometry)', () => {
    const world = new PhysicsColliderCompiler().compileToObject(
      comp([
        obj('Deco', [prop('mesh', 'sphere')]),
        obj('Panel', [prop('mesh', 'cube'), prop('color', '#fff')]),
      ])
    );
    expect(world.colliderCount).toBe(0);
    expect(world.colliders).toEqual([]);
  });

  it('resolves collider geometry through the SAME registry the render target uses (box→cuboid, cylinder→cylinder)', () => {
    const world = new PhysicsColliderCompiler().compileToObject(
      comp([
        obj('B', [prop('mesh', 'panel'), prop('purpose', 'collision')]), // panel aliases → box
        obj('C', [prop('mesh', 'pillar'), prop('purpose', 'collision')]), // pillar aliases → cylinder
      ])
    );
    expect(world.colliders.map((c) => c.shape)).toEqual(['cuboid', 'cylinder']);
    expect(world.colliders.map((c) => c.primitive)).toEqual(['box', 'cylinder']);
  });

  it('emits a loadable holoscript.physics.v1 descriptor as JSON', () => {
    const json = new PhysicsColliderCompiler().compile(
      comp([obj('Floor', [prop('mesh', 'cube'), prop('purpose', 'collision')])])
    );
    const parsed = JSON.parse(json);
    expect(parsed.format).toBe('holoscript.physics.v1');
    expect(parsed.generator).toBe('PhysicsColliderCompiler');
    expect(parsed.colliderCount).toBe(1);
  });
});
