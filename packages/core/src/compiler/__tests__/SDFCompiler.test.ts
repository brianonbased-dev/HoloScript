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

  // =========== XML escaping ===========

  it('escapes XML special characters in world name', () => {
    const custom = new SDFCompiler({ worldName: 'test<world>&"name' });
    const sdf = custom.compile(makeComposition(), 'test-token');
    expect(sdf).toContain('&lt;');
    expect(sdf).toContain('&amp;');
    expect(sdf).toContain('&quot;');
  });
});
