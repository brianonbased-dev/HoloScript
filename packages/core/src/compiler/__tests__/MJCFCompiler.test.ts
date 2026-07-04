import { describe, it, expect, beforeEach, vi } from 'vitest';
import MJCFCompiler from '../MJCFCompiler';
import type { HoloComposition, HoloObjectDecl, HoloLight } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

/**
 * Helper to build a minimal HoloComposition.
 */
function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    type: 'Composition',
    name: 'TestScene',
    templates: [],
    objects: [],
    spatialGroups: [],
    lights: [],
    animations: [],
    triggers: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    ...overrides,
  } as HoloComposition;
}

function makeObject(overrides: Partial<HoloObjectDecl> = {}): HoloObjectDecl {
  return {
    type: 'Object',
    name: 'TestObj',
    properties: [],
    traits: [],
    ...overrides,
  } as HoloObjectDecl;
}

describe('MJCFCompiler', () => {
  let compiler: MJCFCompiler;

  beforeEach(() => {
    compiler = new MJCFCompiler();
  });

  // =========== Basic XML Structure ===========

  it('compiles minimal composition to valid MJCF XML', () => {
    const mjcf = compiler.compile(makeComposition(), 'test-token');
    expect(mjcf).toContain('<?xml version="1.0"?>');
    expect(mjcf).toContain('<mujoco model="holoscript_model">');
    expect(mjcf).toContain('<worldbody>');
    expect(mjcf).toContain('</worldbody>');
    expect(mjcf).toContain('</mujoco>');
  });

  it('has exactly one mujoco root', () => {
    const mjcf = compiler.compile(makeComposition(), 'test-token');
    const openCount = (mjcf.match(/<mujoco /g) || []).length;
    const closeCount = (mjcf.match(/<\/mujoco>/g) || []).length;
    expect(openCount).toBe(1);
    expect(closeCount).toBe(1);
  });

  it('emits compiler and option elements', () => {
    const mjcf = compiler.compile(makeComposition(), 'test-token');
    expect(mjcf).toContain('<compiler inertiafromgeom="true" eulerseq="xyz"/>');
    expect(mjcf).toContain('<option timestep="0.002"');
    expect(mjcf).toContain('gravity="0 0 -9.81"');
    expect(mjcf).toContain('integrator="Euler"');
  });

  it('includes composition name in comment', () => {
    const mjcf = compiler.compile(makeComposition({ name: 'MyScene' }), 'test-token');
    expect(mjcf).toContain('MyScene');
  });

  it('uses custom model name', () => {
    const custom = new MJCFCompiler({ modelName: 'my_robot' });
    const mjcf = custom.compile(makeComposition(), 'test-token');
    expect(mjcf).toContain('<mujoco model="my_robot">');
  });

  it('uses custom timestep and integrator', () => {
    const custom = new MJCFCompiler({ timestep: 0.001, integrator: 'RK4' });
    const mjcf = custom.compile(makeComposition(), 'test-token');
    expect(mjcf).toContain('timestep="0.001"');
    expect(mjcf).toContain('integrator="RK4"');
  });

  // =========== Ground & Lights ===========

  it('emits ground plane geom by default', () => {
    const mjcf = compiler.compile(makeComposition(), 'test-token');
    expect(mjcf).toContain('<geom name="floor" type="plane"');
  });

  it('skips ground plane when disabled', () => {
    const custom = new MJCFCompiler({ includeGround: false });
    const mjcf = custom.compile(makeComposition(), 'test-token');
    expect(mjcf).not.toContain('name="floor"');
  });

  it('emits sun directional light by default', () => {
    const mjcf = compiler.compile(makeComposition(), 'test-token');
    expect(mjcf).toContain('<light name="sun" directional="true"');
  });

  it('skips scene lights when disabled', () => {
    const custom = new MJCFCompiler({ includeScene: false });
    const mjcf = custom.compile(makeComposition(), 'test-token');
    expect(mjcf).not.toContain('name="sun"');
  });

  it('emits custom lights', () => {
    const light: Partial<HoloLight> = {
      type: 'Light',
      name: 'Spot1',
      lightType: 'point',
      properties: [
        { type: 'LightProperty', key: 'position', value: [5, 5, 5] },
        { type: 'LightProperty', key: 'color', value: '#ffffff' },
      ],
    };
    const comp = makeComposition({ lights: [light as HoloLight] });
    const mjcf = compiler.compile(comp, 'test-token');
    expect(mjcf).toContain('<light name="spot1"');
    expect(mjcf).toContain('pos="5 5 5"');
  });

  // =========== Objects → bodies ===========

  it('emits a body per object', () => {
    const comp = makeComposition({
      objects: [makeObject({ name: 'Cube1' }), makeObject({ name: 'Sphere1' })],
    });
    const mjcf = compiler.compile(comp, 'test-token');
    expect(mjcf).toContain('<body name="cube1"');
    expect(mjcf).toContain('<body name="sphere1"');
  });

  it('emits body pos from position property', () => {
    const obj = makeObject({
      name: 'Pos',
      properties: [{ type: 'ObjectProperty', key: 'position', value: [1, 2, 3] }] as any[],
    });
    const comp = makeComposition({ objects: [obj] });
    const mjcf = compiler.compile(comp, 'test-token');
    expect(mjcf).toContain('<body name="pos" pos="1 2 3"');
  });

  it('emits body euler attribute', () => {
    const obj = makeObject({ name: 'Rot' });
    const comp = makeComposition({ objects: [obj] });
    const mjcf = compiler.compile(comp, 'test-token');
    expect(mjcf).toContain('euler="0 0 0"');
  });

  // =========== Geometry (inline geoms, half-extents) ===========

  it('emits inline box geom with half-extents', () => {
    const obj = makeObject({
      name: 'Box',
      properties: [
        { type: 'ObjectProperty', key: 'geometry', value: 'box' },
        { type: 'ObjectProperty', key: 'scale', value: 2 },
      ] as any[],
    });
    const comp = makeComposition({ objects: [obj] });
    const mjcf = compiler.compile(comp, 'test-token');
    // full extent 2 → MuJoCo half-extents 1 1 1
    expect(mjcf).toContain('<geom type="box" size="1 1 1"');
  });

  it('emits sphere geom with radius', () => {
    const obj = makeObject({
      name: 'Ball',
      properties: [
        { type: 'ObjectProperty', key: 'geometry', value: 'sphere' },
        { type: 'ObjectProperty', key: 'scale', value: 2 },
      ] as any[],
    });
    const comp = makeComposition({ objects: [obj] });
    const mjcf = compiler.compile(comp, 'test-token');
    expect(mjcf).toContain('<geom type="sphere" size="1"');
  });

  it('emits cylinder geom with radius and half-length', () => {
    const obj = makeObject({
      name: 'Cyl',
      properties: [
        { type: 'ObjectProperty', key: 'geometry', value: 'cylinder' },
        { type: 'ObjectProperty', key: 'scale', value: 2 },
      ] as any[],
    });
    const comp = makeComposition({ objects: [obj] });
    const mjcf = compiler.compile(comp, 'test-token');
    expect(mjcf).toContain('<geom type="cylinder" size="1 1"');
  });

  it('emits capsule geom', () => {
    const obj = makeObject({
      properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'capsule' }] as any[],
    });
    const comp = makeComposition({ objects: [obj] });
    const mjcf = compiler.compile(comp, 'test-token');
    expect(mjcf).toContain('<geom type="capsule"');
  });

  it('emits mesh geom and asset declaration for file refs', () => {
    const obj = makeObject({
      properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'robot.stl' }] as any[],
    });
    const comp = makeComposition({ objects: [obj] });
    const mjcf = compiler.compile(comp, 'test-token');
    expect(mjcf).toContain('<asset>');
    expect(mjcf).toContain('<mesh name="robot_stl"');
    expect(mjcf).toContain('<geom type="mesh" mesh="robot_stl"');
  });

  it('omits asset block when no meshes present', () => {
    const comp = makeComposition({ objects: [makeObject()] });
    const mjcf = compiler.compile(comp, 'test-token');
    expect(mjcf).not.toContain('<asset>');
  });

  // =========== Material → rgba ===========

  it('emits rgba on geom from color', () => {
    const obj = makeObject({
      name: 'Red',
      properties: [{ type: 'ObjectProperty', key: 'color', value: '#ff0000' }] as any[],
    });
    const comp = makeComposition({ objects: [obj] });
    const mjcf = compiler.compile(comp, 'test-token');
    expect(mjcf).toContain('rgba="1 0 0 1"');
  });

  // =========== Joints (nested, kinematic tree) ===========

  it('nests child body inside parent and omits joint for fixed', () => {
    const parent = makeObject({ name: 'Base' });
    const child = makeObject({
      name: 'Arm',
      properties: [{ type: 'ObjectProperty', key: 'parent', value: 'Base' }] as any[],
    });
    const comp = makeComposition({ objects: [parent, child] });
    const mjcf = compiler.compile(comp, 'test-token');
    // Child body should be nested within the parent body block.
    const baseSection = mjcf.split('<body name="base"')[1]?.split('</mujoco>')[0] || '';
    expect(baseSection).toContain('<body name="arm"');
    // Default (fixed) joint → no <joint> emitted.
    expect(mjcf).not.toContain('<joint');
  });

  it('emits hinge joint with axis for revolute', () => {
    const parent = makeObject({ name: 'Base' });
    const child = makeObject({
      name: 'Arm',
      properties: [
        { type: 'ObjectProperty', key: 'parent', value: 'Base' },
        { type: 'ObjectProperty', key: 'joint_type', value: 'revolute' },
        { type: 'ObjectProperty', key: 'axis', value: [0, 0, 1] },
      ] as any[],
    });
    const comp = makeComposition({ objects: [parent, child] });
    const mjcf = compiler.compile(comp, 'test-token');
    expect(mjcf).toContain('<joint name="arm_joint" type="hinge"');
    expect(mjcf).toContain('axis="0 0 1"');
  });

  it('maps prismatic to slide joint', () => {
    const parent = makeObject({ name: 'Base' });
    const child = makeObject({
      name: 'Slider',
      properties: [
        { type: 'ObjectProperty', key: 'parent', value: 'Base' },
        { type: 'ObjectProperty', key: 'joint_type', value: 'prismatic' },
        { type: 'ObjectProperty', key: 'axis', value: [1, 0, 0] },
      ] as any[],
    });
    const comp = makeComposition({ objects: [parent, child] });
    const mjcf = compiler.compile(comp, 'test-token');
    expect(mjcf).toContain('type="slide"');
    expect(mjcf).toContain('axis="1 0 0"');
  });

  it('maps floating to free joint', () => {
    const parent = makeObject({ name: 'Base' });
    const child = makeObject({
      name: 'Floater',
      properties: [
        { type: 'ObjectProperty', key: 'parent', value: 'Base' },
        { type: 'ObjectProperty', key: 'joint_type', value: 'floating' },
      ] as any[],
    });
    const comp = makeComposition({ objects: [parent, child] });
    const mjcf = compiler.compile(comp, 'test-token');
    expect(mjcf).toContain('type="free"');
  });

  it('emits root objects (no parent) directly under worldbody', () => {
    const obj = makeObject({ name: 'Standalone' });
    const comp = makeComposition({ objects: [obj] });
    const mjcf = compiler.compile(comp, 'test-token');
    expect(mjcf).toContain('<body name="standalone"');
    expect(mjcf).not.toContain('<joint');
  });

  // =========== Spatial groups ===========

  it('emits spatial group bodies', () => {
    const comp = makeComposition({
      spatialGroups: [
        {
          type: 'SpatialGroup',
          name: 'Group1',
          properties: [],
          objects: [makeObject({ name: 'InGroup' })],
        },
      ],
    } as unknown as HoloComposition);
    const mjcf = compiler.compile(comp, 'test-token');
    expect(mjcf).toContain('Spatial Group: Group1');
    expect(mjcf).toContain('<body name="ingroup"');
  });
});
