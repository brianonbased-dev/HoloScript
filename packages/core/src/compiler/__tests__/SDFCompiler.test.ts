import { describe, it, expect, beforeEach, vi } from 'vitest';
import SDFCompiler from '../SDFCompiler';
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

describe('SDFCompiler', () => {
  let compiler: SDFCompiler;

  beforeEach(() => {
    compiler = new SDFCompiler();
  });

  // =========== Basic XML Structure ===========

  it('compiles minimal composition to valid SDF XML', () => {
    const sdf = compiler.compile(makeComposition(), 'test-token');
    expect(sdf).toContain('<?xml version="1.0"?>');
    expect(sdf).toContain('<sdf version="1.8">');
    expect(sdf).toContain('</sdf>');
    expect(sdf).toContain('<world name="holoscript_world">');
    expect(sdf).toContain('</world>');
  });

  it('includes composition name in comment', () => {
    const sdf = compiler.compile(makeComposition({ name: 'MyScene' }), 'test-token');
    expect(sdf).toContain('MyScene');
  });

  it('uses custom world name', () => {
    const custom = new SDFCompiler({ worldName: 'my_world' });
    const sdf = custom.compile(makeComposition(), 'test-token');
    expect(sdf).toContain('my_world');
  });

  it('uses custom SDF version', () => {
    const custom = new SDFCompiler({ sdfVersion: '1.6' });
    const sdf = custom.compile(makeComposition(), 'test-token');
    expect(sdf).toContain('version="1.6"');
  });

  // =========== Physics ===========

  it('emits physics section by default', () => {
    const sdf = compiler.compile(makeComposition(), 'test-token');
    expect(sdf).toContain('<physics');
    expect(sdf).toContain('type="ode"');
    expect(sdf).toContain('<max_step_size>');
  });

  it('skips physics when disabled', () => {
    const custom = new SDFCompiler({ includePhysics: false });
    const sdf = custom.compile(makeComposition(), 'test-token');
    expect(sdf).not.toContain('<physics');
  });

  it('uses bullet engine when configured', () => {
    const custom = new SDFCompiler({ physicsEngine: 'bullet' });
    const sdf = custom.compile(makeComposition(), 'test-token');
    expect(sdf).toContain('type="bullet"');
    expect(sdf).not.toContain('<ode>'); // ODE-specific block
  });

  // =========== Scene ===========

  it('emits scene section by default', () => {
    const sdf = compiler.compile(makeComposition(), 'test-token');
    expect(sdf).toContain('<scene>');
    expect(sdf).toContain('<ambient>');
    expect(sdf).toContain('<shadows>true</shadows>');
  });

  it('skips scene when disabled', () => {
    const custom = new SDFCompiler({ includeScene: false });
    const sdf = custom.compile(makeComposition(), 'test-token');
    expect(sdf).not.toContain('<scene>');
  });

  it('emits skybox background', () => {
    const comp = makeComposition({
      environment: {
        type: 'Environment',
        properties: [{ type: 'EnvironmentProperty', key: 'skybox', value: 'sunset' }],
      },
    } as unknown as HoloComposition);
    const sdf = compiler.compile(comp, 'test-token');
    expect(sdf).toContain('<background>0.9 0.5 0.3 1</background>');
  });

  // =========== Ground Plane & Sun ===========

  it('emits ground plane model', () => {
    const sdf = compiler.compile(makeComposition(), 'test-token');
    expect(sdf).toContain('ground_plane');
    expect(sdf).toContain('<static>true</static>');
  });

  it('emits sun directional light', () => {
    const sdf = compiler.compile(makeComposition(), 'test-token');
    expect(sdf).toContain('<light name="sun" type="directional">');
    expect(sdf).toContain('<cast_shadows>true</cast_shadows>');
  });

  // =========== Objects ===========

  it('emits model for each object', () => {
    const comp = makeComposition({
      objects: [makeObject({ name: 'Cube1' }), makeObject({ name: 'Sphere1' })],
    });
    const sdf = compiler.compile(comp, 'test-token');
    expect(sdf).toContain('<model name="cube1">');
    expect(sdf).toContain('<model name="sphere1">');
  });

  it('emits static for objects without physics trait', () => {
    const comp = makeComposition({ objects: [makeObject()] });
    const sdf = compiler.compile(comp, 'test-token');
    expect(sdf).toContain('<static>true</static>');
  });

  it('skips static and adds inertial for objects with physics trait', () => {
    const obj = makeObject({ name: 'Ball', traits: ['physics'] as any[] });
    const comp = makeComposition({ objects: [obj] });
    const sdf = compiler.compile(comp, 'test-token');
    // Within the Ball model, there should be no <static>true — may appear from ground plane
    const ballSection = sdf.split('model name="ball"')[1]?.split('</model>')[0] || '';
    expect(ballSection).not.toContain('<static>true</static>');
    expect(ballSection).toContain('<inertial>');
    expect(ballSection).toContain('<mass>');
  });

  it('emits position from object properties', () => {
    const obj = makeObject({
      name: 'Pos',
      properties: [{ type: 'ObjectProperty', key: 'position', value: [1, 2, 3] }] as any[],
    });
    const comp = makeComposition({ objects: [obj] });
    const sdf = compiler.compile(comp, 'test-token');
    expect(sdf).toContain('1 2 3');
  });

  it('emits geometry based on property', () => {
    const obj = makeObject({
      name: 'Sphere',
      properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'sphere' }] as any[],
    });
    const comp = makeComposition({ objects: [obj] });
    const sdf = compiler.compile(comp, 'test-token');
    expect(sdf).toContain('<sphere>');
  });

  it('emits color material', () => {
    const obj = makeObject({
      name: 'Red',
      properties: [{ type: 'ObjectProperty', key: 'color', value: '#ff0000' }] as any[],
    });
    const comp = makeComposition({ objects: [obj] });
    const sdf = compiler.compile(comp, 'test-token');
    expect(sdf).toContain('<ambient>1 0 0 1</ambient>');
  });

  // =========== Lights ===========

  it('emits custom lights', () => {
    const light: Partial<HoloLight> = {
      type: 'Light',
      name: 'Spot1',
      lightType: 'spot',
      properties: [
        { type: 'LightProperty', key: 'position', value: [5, 5, 5] },
        { type: 'LightProperty', key: 'color', value: '#ffffff' },
        { type: 'LightProperty', key: 'angle', value: 30 },
      ],
    };
    const comp = makeComposition({ lights: [light as HoloLight] });
    const sdf = compiler.compile(comp, 'test-token');
    expect(sdf).toContain('type="spot"');
    expect(sdf).toContain('<spot>');
    expect(sdf).toContain('<inner_angle>');
  });

  // =========== Spatial Groups ===========

  it('emits spatial group models', () => {
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
    const sdf = compiler.compile(comp, 'test-token');
    expect(sdf).toContain('Spatial Group: Group1');
    expect(sdf).toContain('ingroup');
  });

  // =========== Geometry types ===========

  it('emits cylinder geometry', () => {
    const obj = makeObject({
      properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'cylinder' }] as any[],
    });
    const comp = makeComposition({ objects: [obj] });
    const sdf = compiler.compile(comp, 'test-token');
    expect(sdf).toContain('<cylinder>');
  });

  it('emits mesh geometry for file refs', () => {
    const obj = makeObject({
      properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'robot.dae' }] as any[],
    });
    const comp = makeComposition({ objects: [obj] });
    const sdf = compiler.compile(comp, 'test-token');
    expect(sdf).toContain('<mesh>');
    expect(sdf).toContain('model://robot.dae');
  });

  // =========== Gazebo Harmonic Plugins ===========

  it('emits gz-sim system plugins for Harmonic', () => {
    const custom = new SDFCompiler({ gazeboVersion: 'harmonic' });
    const sdf = custom.compile(makeComposition(), 'test-token');
    expect(sdf).toContain('gz-sim-physics-system');
    expect(sdf).toContain('gz-sim-sensors-system');
    expect(sdf).toContain('gz-sim-scene-broadcaster-system');
    expect(sdf).toContain('gz-sim-contact-system');
    expect(sdf).toContain('gz-sim-imu-system');
    expect(sdf).toContain('gz-sim-joint-state-publisher-system');
    expect(sdf).toContain('<engine>ode</engine>');
    expect(sdf).toContain('<render_engine>ogre2</render_engine>');
  });

  it('uses custom physics engine in Harmonic plugins', () => {
    const custom = new SDFCompiler({ gazeboVersion: 'harmonic', physicsEngine: 'bullet' });
    const sdf = custom.compile(makeComposition(), 'test-token');
    expect(sdf).toContain('<engine>bullet</engine>');
  });

  it('skips gz-sim plugins for Classic', () => {
    const custom = new SDFCompiler({ gazeboVersion: 'classic' });
    const sdf = custom.compile(makeComposition(), 'test-token');
    expect(sdf).not.toContain('gz-sim-physics-system');
    expect(sdf).not.toContain('gz-sim-sensors-system');
  });

  // =========== Proper Inertia ===========

  it('calculates box inertia properly', () => {
    const obj = makeObject({
      name: 'Box',
      traits: ['physics'],
      properties: [
        { type: 'ObjectProperty', key: 'mass', value: 12 } as any,
        { type: 'ObjectProperty', key: 'geometry', value: 'box' } as any,
        { type: 'ObjectProperty', key: 'scale', value: 2 } as any,
      ],
    });
    const comp = makeComposition({ objects: [obj] });
    const sdf = compiler.compile(comp, 'test-token');
    const boxSection = sdf.split('model name="box"')[1]?.split('</model>')[0] || '';
    // Box 2x2x2, mass 12: ixx = iyy = izz = 12*(4+4)/12 = 8
    expect(boxSection).toContain('<ixx>8.000000e+0</ixx>');
    expect(boxSection).toContain('<iyy>8.000000e+0</iyy>');
    expect(boxSection).toContain('<izz>8.000000e+0</izz>');
    expect(boxSection).toContain('<ixy>0.000000e+0</ixy>');
    expect(boxSection).toContain('<ixz>0.000000e+0</ixz>');
    expect(boxSection).toContain('<iyz>0.000000e+0</iyz>');
  });

  it('calculates sphere inertia properly', () => {
    const obj = makeObject({
      name: 'Sphere',
      traits: ['physics'],
      properties: [
        { type: 'ObjectProperty', key: 'mass', value: 10 } as any,
        { type: 'ObjectProperty', key: 'geometry', value: 'sphere' } as any,
        { type: 'ObjectProperty', key: 'scale', value: 2 } as any,
      ],
    });
    const comp = makeComposition({ objects: [obj] });
    const sdf = compiler.compile(comp, 'test-token');
    const sphereSection = sdf.split('model name="sphere"')[1]?.split('</model>')[0] || '';
    // Sphere r=1, mass 10: i = (2/5)*10*1 = 4
    expect(sphereSection).toContain('<ixx>4.000000e+0</ixx>');
    expect(sphereSection).toContain('<izz>4.000000e+0</izz>');
  });

  it('calculates cylinder inertia properly', () => {
    const obj = makeObject({
      name: 'Cylinder',
      traits: ['physics'],
      properties: [
        { type: 'ObjectProperty', key: 'mass', value: 6 } as any,
        { type: 'ObjectProperty', key: 'geometry', value: 'cylinder' } as any,
        { type: 'ObjectProperty', key: 'scale', value: 2 } as any,
      ],
    });
    const comp = makeComposition({ objects: [obj] });
    const sdf = compiler.compile(comp, 'test-token');
    const cylSection = sdf.split('model name="cylinder"')[1]?.split('</model>')[0] || '';
    // Cylinder r=1, l=2, mass 6: ixx = iyy = 6*(3+4)/12 = 3.5, izz = 6/2 = 3
    expect(cylSection).toContain('<ixx>3.500000e+0</ixx>');
    expect(cylSection).toContain('<iyy>3.500000e+0</iyy>');
    expect(cylSection).toContain('<izz>3.000000e+0</izz>');
  });

  it('extracts mass from physics property block', () => {
    const obj = makeObject({
      name: 'Heavy',
      traits: ['physics'],
      properties: [
        { type: 'ObjectProperty', key: 'physics', value: { mass: 50 } } as any,
      ],
    });
    const comp = makeComposition({ objects: [obj] });
    const sdf = compiler.compile(comp, 'test-token');
    expect(sdf).toContain('<mass>50</mass>');
  });

  it('prefers direct mass property over physics block', () => {
    const obj = makeObject({
      name: 'DirectMass',
      traits: ['physics'],
      properties: [
        { type: 'ObjectProperty', key: 'mass', value: 20 } as any,
        { type: 'ObjectProperty', key: 'physics', value: { mass: 30 } } as any,
      ],
    });
    const comp = makeComposition({ objects: [obj] });
    const sdf = compiler.compile(comp, 'test-token');
    expect(sdf).toContain('<mass>20</mass>');
  });

  // =========== Joint Articulation ===========

  it('emits fixed joint for object with parent', () => {
    const parent = makeObject({ name: 'Base' });
    const child = makeObject({
      name: 'Arm',
      properties: [
        { type: 'ObjectProperty', key: 'parent', value: 'Base' } as any,
      ],
    });
    const comp = makeComposition({ objects: [parent, child] });
    const sdf = compiler.compile(comp, 'test-token');
    expect(sdf).toContain('<joint name="arm_joint" type="fixed">');
    expect(sdf).toContain('<parent>base</parent>');
    expect(sdf).toContain('<child>arm</child>');
  });

  it('emits revolute joint with axis', () => {
    const parent = makeObject({ name: 'Base' });
    const child = makeObject({
      name: 'Arm',
      properties: [
        { type: 'ObjectProperty', key: 'parent', value: 'Base' } as any,
        { type: 'ObjectProperty', key: 'joint_type', value: 'revolute' } as any,
        { type: 'ObjectProperty', key: 'axis', value: [0, 0, 1] } as any,
      ],
    });
    const comp = makeComposition({ objects: [parent, child] });
    const sdf = compiler.compile(comp, 'test-token');
    expect(sdf).toContain('<joint name="arm_joint" type="revolute">');
    expect(sdf).toContain('<xyz>0 0 1</xyz>');
  });

  it('skips joint when no parent is specified', () => {
    const obj = makeObject({ name: 'Standalone' });
    const comp = makeComposition({ objects: [obj] });
    const sdf = compiler.compile(comp, 'test-token');
    expect(sdf).not.toContain('joint');
  });
});
