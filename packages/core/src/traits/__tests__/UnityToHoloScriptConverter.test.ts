/**
 * UnityToHoloScriptConverter.test.ts — v4.0
 *
 * Validates the Unity → HoloScript migration converter.
 * Covers: material conversion, component→trait mapping, scene structure,
 * hierarchy, unsupported components, and the HoloScript trait wrapper.
 */

import { describe, it, expect } from 'vitest';
import {
  convertUnityMaterial,
  convertUnityScene,
  unityConverterHandler,
} from '../UnityToHoloScriptConverter';
import type { UnityScene, UnityMaterial, UnityGameObject } from '../UnityToHoloScriptConverter';

function makeCtx() {
  const events: { type: string; payload: unknown }[] = [];
  return {
    emit: (type: string, payload: unknown) => events.push({ type, payload }),
    events,
    of: (type: string) => events.filter((e) => e.type === type),
  };
}

// ─── Material Conversion ─────────────────────────────────────────────────────

describe('UnityConverter — material conversion', () => {
  it('converts Standard shader to pbr type', () => {
    const mat: UnityMaterial = {
      name: 'Metal',
      shader: 'Standard',
      properties: { _Color: { r: 1, g: 0, b: 0, a: 1 }, _Metallic: 0.9, _Glossiness: 0.8 },
    };
    const { id, dsl } = convertUnityMaterial(mat);
    expect(id).toBe('Metal');
    expect(dsl).toContain('pbr');
    expect(dsl).toContain('metalness: 0.90');
    expect(dsl).toContain('roughness: 0.20'); // 1 - 0.8
  });

  it('converts URP/Unlit shader to unlit type', () => {
    const mat: UnityMaterial = { name: 'Sky', shader: 'Universal Render Pipeline/Unlit' };
    const { dsl } = convertUnityMaterial(mat);
    expect(dsl).toContain('unlit');
  });

  it('converts Toon/Lit shader to toon type', () => {
    const mat: UnityMaterial = { name: 'Cartoon', shader: 'Toon/Lit' };
    const { dsl } = convertUnityMaterial(mat);
    expect(dsl).toContain('toon');
  });

  it('emits emissive when emission color is non-black', () => {
    const mat: UnityMaterial = {
      name: 'Glowing',
      shader: 'Standard',
      properties: { _EmissionColor: { r: 0, g: 0.5, b: 1, a: 1 } },
    };
    const { dsl } = convertUnityMaterial(mat);
    expect(dsl).toContain('emissive:');
  });

  it('omits emissive for black emission', () => {
    const mat: UnityMaterial = {
      name: 'Dark',
      shader: 'Standard',
      properties: { _EmissionColor: { r: 0, g: 0, b: 0, a: 1 } },
    };
    const { dsl } = convertUnityMaterial(mat);
    expect(dsl).not.toContain('emissive:');
  });

  it('sanitizes material name with spaces and special chars', () => {
    const mat: UnityMaterial = { name: 'My Cool Material!', shader: 'Standard' };
    const { id } = convertUnityMaterial(mat);
    expect(id).toMatch(/^[a-zA-Z0-9_]+$/);
  });

  it('defaults to pbr for unknown shaders', () => {
    const mat: UnityMaterial = { name: 'Custom', shader: 'SomeCustomShader' };
    const { dsl } = convertUnityMaterial(mat);
    expect(dsl).toContain('pbr');
  });
});

// ─── Scene Conversion ────────────────────────────────────────────────────────

const MINIMAL_SCENE: UnityScene = {
  name: 'TestScene',
  gameObjects: [
    {
      name: 'Cube',
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 45, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      components: [
        { type: 'MeshFilter', properties: { mesh: 'Cube' } },
        { type: 'MeshRenderer', properties: { material: 'mat1' } },
      ],
    },
  ],
  materials: {
    mat1: {
      name: 'mat1',
      shader: 'Standard',
      properties: { _Color: { r: 0.8, g: 0.2, b: 0.2, a: 1 }, _Metallic: 0.1, _Glossiness: 0.5 },
    },
  },
};

describe('UnityConverter — scene conversion', () => {
  it('emits scene header and scene block', () => {
    const { dsl } = convertUnityScene(MINIMAL_SCENE);
    expect(dsl).toContain('scene TestScene');
    expect(dsl).toContain('HoloScript Scene');
    expect(dsl).toContain('UnityToHoloScriptConverter');
  });

  it('emits environment block with skybox', () => {
    const scene: UnityScene = { ...MINIMAL_SCENE, settings: { skybox: 'neon_dusk' } };
    const { dsl } = convertUnityScene(scene);
    expect(dsl).toContain('skybox: "neon_dusk"');
  });

  it('converts scene materials into DSL material blocks', () => {
    const { dsl } = convertUnityScene(MINIMAL_SCENE);
    expect(dsl).toContain('material mat1 : pbr');
  });

  it('outputs object block with position/rotation/scale', () => {
    const { dsl } = convertUnityScene(MINIMAL_SCENE);
    expect(dsl).toContain('object Cube');
    expect(dsl).toContain('position: [1, 2, 3]');
    expect(dsl).toContain('rotation: [0, 45, 0]');
  });

  it('maps Rigidbody to PhysicsTrait', () => {
    const scene: UnityScene = {
      name: 'Phys',
      gameObjects: [
        {
          name: 'Ball',
          components: [
            { type: 'MeshFilter', properties: { mesh: 'Sphere' } },
            { type: 'Rigidbody', properties: { mass: 1 } },
          ],
        },
      ],
    };
    const result = convertUnityScene(scene);
    expect(result.traits).toContain('PhysicsTrait');
    expect(result.dsl).toContain('"PhysicsTrait"');
  });

  it('maps NavMeshAgent to PatrolTrait', () => {
    const scene: UnityScene = {
      name: 'AI',
      gameObjects: [{ name: 'Enemy', components: [{ type: 'NavMeshAgent' }] }],
    };
    const result = convertUnityScene(scene);
    expect(result.traits).toContain('PatrolTrait');
  });

  it('accumulates unsupported components into warnings', () => {
    const scene: UnityScene = {
      name: 'Weird',
      gameObjects: [{ name: 'Obj', components: [{ type: 'WheelCollider' }] }],
    };
    const result = convertUnityScene(scene);
    expect(result.unsupportedComponents).toContain('WheelCollider');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('converts nested child hierarchy', () => {
    const scene: UnityScene = {
      name: 'Nested',
      gameObjects: [
        {
          name: 'Parent',
          children: [{ name: 'Child', position: { x: 0, y: 1, z: 0 } }],
        },
      ],
    };
    const { dsl } = convertUnityScene(scene);
    expect(dsl).toContain('object Parent');
    expect(dsl).toContain('object Child');
    expect(dsl).toContain('children {');
  });

  it('emits fog settings when enabled', () => {
    const scene: UnityScene = {
      name: 'Foggy',
      gameObjects: [],
      settings: { fog: true, fogDensity: 0.05, fogColor: { r: 0.5, g: 0.5, b: 0.7 } },
    };
    const { dsl } = convertUnityScene(scene);
    expect(dsl).toContain('fog_density: 0.05');
  });

  it('maps multiple components to multiple traits without duplication', () => {
    const scene: UnityScene = {
      name: 'Multi',
      gameObjects: [
        {
          name: 'Actor',
          components: [{ type: 'Rigidbody' }, { type: 'BoxCollider' }, { type: 'AudioSource' }],
        },
      ],
    };
    const result = convertUnityScene(scene);
    const unique = new Set(result.traits);
    expect(unique.size).toBe(result.traits.length); // no duplicates
    expect(result.traits).toContain('PhysicsTrait');
    expect(result.traits).toContain('ColliderTrait');
    expect(result.traits).toContain('AudioTrait');
  });
});

// ─── HoloScript Trait Wrapper ─────────────────────────────────────────────────

describe('UnityConverter — HoloScript trait (unityConverterHandler)', () => {
  it('emits unity_converter_ready on attach', () => {
    const node = {} as any;
    const ctx = makeCtx();
    unityConverterHandler.onAttach(node, unityConverterHandler.defaultConfig, ctx);
    expect(ctx.of('unity_converter_ready').length).toBe(1);
  });

  it('emits unity_scene_converted on unity_convert_scene event', () => {
    const node = {} as any;
    const ctx = makeCtx();
    unityConverterHandler.onAttach(node, unityConverterHandler.defaultConfig, ctx);
    unityConverterHandler.onEvent(node, unityConverterHandler.defaultConfig, ctx, {
      type: 'unity_convert_scene',
      payload: { scene: MINIMAL_SCENE, requestId: 'r1' },
    });
    const converted = ctx.of('unity_scene_converted');
    expect(converted.length).toBe(1);
    expect((converted[0].payload as any).requestId).toBe('r1');
    expect(typeof (converted[0].payload as any).dsl).toBe('string');
  });

  it('emits unity_converter_error when no scene provided', () => {
    const node = {} as any;
    const ctx = makeCtx();
    unityConverterHandler.onAttach(node, unityConverterHandler.defaultConfig, ctx);
    unityConverterHandler.onEvent(node, unityConverterHandler.defaultConfig, ctx, {
      type: 'unity_convert_scene',
      payload: {},
    });
    expect(ctx.of('unity_converter_error').length).toBe(1);
  });

  it('emits unity_material_converted on unity_convert_material event', () => {
    const node = {} as any;
    const ctx = makeCtx();
    unityConverterHandler.onAttach(node, unityConverterHandler.defaultConfig, ctx);
    unityConverterHandler.onEvent(node, unityConverterHandler.defaultConfig, ctx, {
      type: 'unity_convert_material',
      payload: { material: { name: 'GlowMat', shader: 'Standard' } },
    });
    const result = ctx.of('unity_material_converted');
    expect(result.length).toBe(1);
    expect((result[0].payload as any).dsl).toContain('pbr');
  });

  it('emits unity_converter_stopped on detach', () => {
    const node = {} as any;
    const ctx = makeCtx();
    unityConverterHandler.onAttach(node, unityConverterHandler.defaultConfig, ctx);
    unityConverterHandler.onDetach(node, unityConverterHandler.defaultConfig, ctx);
    expect(ctx.of('unity_converter_stopped').length).toBe(1);
    expect(node.__unityConverterState).toBeUndefined();
  });

  it('increments totalConverted across multiple conversions', () => {
    const node = {} as any;
    const ctx = makeCtx();
    unityConverterHandler.onAttach(node, unityConverterHandler.defaultConfig, ctx);
    for (let i = 0; i < 3; i++) {
      unityConverterHandler.onEvent(node, unityConverterHandler.defaultConfig, ctx, {
        type: 'unity_convert_scene',
        payload: { scene: { name: `Scene${i}`, gameObjects: [] } },
      });
    }
    expect(node.__unityConverterState.totalConverted).toBe(3);
  });
});
