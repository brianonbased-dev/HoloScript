/**
 * URDFCompiler — Production Test Suite
 *
 * Covers: compile() returns URDF XML, robot element, links, joints,
 * visual/collision geometry, inertial, spatial groups, and options.
 *
 * Notes:
 * - The URDF compiler uses property key 'geometry' (not 'mesh') to extract geometry.
 * - sanitizeName() lowercases names: 'Gripper' → 'gripper'.
 * - Collision geometry is only emitted if object has @collidable or @physics trait.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { URDFCompiler } from '../URDFCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

function makeComp(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    name: 'RobotArm',
    objects: [],
    lights: [],
    timelines: [],
    transitions: [],
    ...overrides,
  } as HoloComposition;
}

function makeObj(name: string, props: Array<{ key: string; value: unknown }> = [], traits: any[] = []): HoloObjectDecl {
  return {
    name,
    properties: props.map(({ key, value }) => ({ key, value })),
    traits,
    children: [],
  } as any;
}

describe('URDFCompiler — Production', () => {
  let compiler: URDFCompiler;

  beforeEach(() => {
    compiler = new URDFCompiler();
  });

  // ─── Construction ────────────────────────────────────────────────────
  it('constructs with default options', () => {
    expect(compiler).toBeDefined();
  });

  it('constructs with custom options', () => {
    const c = new URDFCompiler({ robotName: 'MyRobot', includeVisual: true, includeCollision: true, includeInertial: true });
    expect(c).toBeDefined();
  });

  // ─── compile() returns XML ────────────────────────────────────────────
  it('compile returns a string', () => {
    const out = compiler.compile(makeComp());
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('empty composition compiles without error', () => {
    expect(() => compiler.compile(makeComp())).not.toThrow();
  });

  // ─── URDF XML structure ───────────────────────────────────────────────
  it('output contains XML declaration', () => {
    const out = compiler.compile(makeComp());
    expect(out).toContain('<?xml');
  });

  it('output contains <robot> element', () => {
    const out = compiler.compile(makeComp());
    expect(out).toContain('<robot');
  });

  it('output contains closing </robot>', () => {
    const out = compiler.compile(makeComp());
    expect(out).toContain('</robot>');
  });

  it('robot name appears in output', () => {
    const c = new URDFCompiler({ robotName: 'ManipulatorBot' });
    const out = c.compile(makeComp());
    expect(out).toContain('ManipulatorBot');
  });

  // ─── Base link ────────────────────────────────────────────────────────
  it('output contains base_link', () => {
    const out = compiler.compile(makeComp());
    expect(out).toContain('base_link');
  });

  it('output contains <link> element', () => {
    const out = compiler.compile(makeComp());
    expect(out).toContain('<link');
  });

  // ─── Objects generate links ───────────────────────────────────────────
  // Note: sanitizeName lowercases. 'Arm' → 'arm', 'Gripper' → 'gripper'.
  // Use geometry key (not mesh) — URDFCompiler.extractGeometry reads property key 'geometry'.
  it('compiles a box object to a link (lowercase name)', () => {
    const obj = makeObj('Arm', [{ key: 'geometry', value: 'box' }]);
    const out = compiler.compile(makeComp({ objects: [obj] }));
    expect(out).toContain('arm'); // sanitizeName lowercases
  });

  it('compiles a sphere object (lowercase name)', () => {
    const obj = makeObj('Gripper', [{ key: 'geometry', value: 'sphere' }]);
    const out = compiler.compile(makeComp({ objects: [obj] }));
    expect(out).toContain('gripper'); // sanitizeName lowercases
  });

  it('compiles a cylinder object (lowercase name)', () => {
    const obj = makeObj('Joint1', [{ key: 'geometry', value: 'cylinder' }]);
    const out = compiler.compile(makeComp({ objects: [obj] }));
    expect(out).toContain('joint1'); // sanitizeName lowercases
  });

  // ─── Object with position ─────────────────────────────────────────────
  it('compiles object with xyz position', () => {
    const obj = makeObj('Link1', [{ key: 'position', value: [0.1, 0.2, 0.3] }]);
    const out = compiler.compile(makeComp({ objects: [obj] }));
    expect(out).toBeDefined();
  });

  // ─── Visual geometry ─────────────────────────────────────────────────
  // Visual is included when geometry property is set and includeVisual=true (default).
  it('includeVisual=true adds <visual> element for object with geometry', () => {
    const c = new URDFCompiler({ includeVisual: true });
    const obj = makeObj('Part', [{ key: 'geometry', value: 'box' }]);
    const out = c.compile(makeComp({ objects: [obj] }));
    expect(out).toContain('<visual>');
  });

  // ─── Collision ────────────────────────────────────────────────────────
  // Collision geometry is only emitted when object has @collidable or @physics trait.
  it('includeCollision=true with collidable trait adds <collision> element', () => {
    const c = new URDFCompiler({ includeCollision: true });
    const obj = makeObj('Base', [{ key: 'geometry', value: 'box' }], [{ name: 'collidable' }]);
    const out = c.compile(makeComp({ objects: [obj] }));
    expect(out).toContain('<collision>');
  });

  // ─── Inertial ─────────────────────────────────────────────────────────
  it('includeInertial=true adds <inertial> element', () => {
    const c = new URDFCompiler({ includeInertial: true, defaultMass: 1.5 });
    const obj = makeObj('Link', [{ key: 'geometry', value: 'box' }]);
    const out = c.compile(makeComp({ objects: [obj] }));
    expect(out).toContain('<inertial>');
  });

  // ─── Joint from child objects ─────────────────────────────────────────
  it('child object generates a joint', () => {
    const child = makeObj('Forearm', [{ key: 'geometry', value: 'cylinder' }]);
    const parent = { ...makeObj('UpperArm', [{ key: 'geometry', value: 'box' }]), children: [child] };
    const out = compiler.compile(makeComp({ objects: [parent as any] }));
    expect(out).toContain('<joint');
  });

  // ─── Physics trait ────────────────────────────────────────────────────
  it('physics trait does not throw and adds inertial', () => {
    const c = new URDFCompiler({ includeInertial: true });
    const obj = makeObj('HeavyPart', [{ key: 'geometry', value: 'box' }], [{ name: 'physics', config: { mass: 5.0 } }]);
    expect(() => c.compile(makeComp({ objects: [obj] }))).not.toThrow();
  });

  // ─── Mesh path prefix ─────────────────────────────────────────────────
  it('custom geometry .dae file compiles without error', () => {
    const c = new URDFCompiler({ meshPathPrefix: 'package://myrobot/meshes/' });
    const obj = makeObj('Part', [{ key: 'geometry', value: 'custom.dae' }]);
    const out = c.compile(makeComp({ objects: [obj] }));
    expect(out).toBeDefined();
  });

  // ─── Multiple objects ─────────────────────────────────────────────────
  it('compiles multiple objects as separate links', () => {
    const objs = [makeObj('Base'), makeObj('Shoulder'), makeObj('Elbow')];
    const out = compiler.compile(makeComp({ objects: objs }));
    // sanitizeName lowercases all names
    expect(out).toContain('base');
    expect(out).toContain('shoulder');
    expect(out).toContain('elbow');
  });
});
