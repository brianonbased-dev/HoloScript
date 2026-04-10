/**
 * Avatar Cross-Compilation Tests
 *
 * Tests that avatar compositions with skeleton, morph, IK, and embodiment traits
 * can be compiled through Unity (C#), Unreal (C++/Blueprint), and R3F (WebXR) targets.
 *
 * These tests verify:
 * - Unity: C# MonoBehaviour output with proper component setup
 * - Unreal: C++ header/source with UE5 actor structure
 * - R3F: React Three Fiber JSX nodes with trait metadata
 *
 * @directive Cross-compilation validation for avatar pipeline
 */

import { describe, it, expect, vi } from 'vitest';
import { UnityCompiler } from '../compiler/UnityCompiler';
import { UnrealCompiler } from '../compiler/UnrealCompiler';
import { R3FCompiler } from '../compiler/R3FCompiler';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloObjectProperty,
  HoloLight,
} from '../parser/HoloCompositionTypes';

// Mock RBAC for compiler access
vi.mock('../compiler/identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as any),
    getRBAC: () => ({
      checkAccess: () => ({ allowed: true }),
    }),
  };
});

/**
 * Create a minimal HoloComposition with required fields.
 */
function createComposition(
  name: string,
  overrides: Partial<HoloComposition> = {}
): HoloComposition {
  return {
    type: 'Composition',
    name,
    objects: [],
    templates: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
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
  };
}

/**
 * Create a property for a HoloObjectDecl.
 */
function prop(key: string, value: any): HoloObjectProperty {
  return { type: 'ObjectProperty', key, value };
}

/**
 * Create a trait for a HoloObjectDecl.
 */
function trait(name: string, config: Record<string, any> = {}): HoloObjectTrait {
  return { type: 'ObjectTrait', name, config };
}

/**
 * Create an avatar object with standard traits for testing.
 */
function createAvatarObject(
  name: string,
  traits: HoloObjectTrait[] = [],
  properties: HoloObjectProperty[] = []
): HoloObjectDecl {
  return {
    type: 'Object',
    name,
    properties: [
      prop('geometry', 'sphere'),
      prop('position', [0, 0, 0]),
      prop('scale', [1, 1, 1]),
      ...properties,
    ],
    traits,
  } as HoloObjectDecl;
}

/**
 * Standard avatar traits used across tests.
 */
const AVATAR_TRAITS = {
  skeleton: trait('skeleton', {
    rigType: 'humanoid',
    humanoidMap: {
      hips: 'Hips',
      spine: 'Spine',
      head: 'Head',
      leftUpperArm: 'LeftArm',
      leftHand: 'LeftHand',
      rightUpperArm: 'RightArm',
      rightHand: 'RightHand',
    },
  }),
  morph: trait('morph', {
    targets: [
      { name: 'blinkLeft', weight: 0, category: 'eyes' },
      { name: 'blinkRight', weight: 0, category: 'eyes' },
      { name: 'happy', weight: 0, category: 'expression' },
      { name: 'sad', weight: 0, category: 'expression' },
    ],
    autoBlink: { enabled: true, interval: 4.0, duration: 0.15 },
  }),
  ik: trait('ik', {
    chain: {
      name: 'LeftArm',
      solver: 'fabrik',
      weight: 1.0,
    },
    iterations: 10,
    tolerance: 0.001,
  }),
  avatar_embodiment: trait('avatar_embodiment', {
    tracking_source: 'headset',
    ik_mode: 'full_body',
    lip_sync: true,
  }),
  body_tracking: trait('body_tracking', {
    mode: 'full_body',
    joint_smoothing: 0.3,
    prediction: true,
  }),
  clothing: trait('clothing', {
    slots: [
      { name: 'Hat', mesh: 'Hat_Mesh', enabled: true },
      { name: 'Jacket', mesh: 'Jacket_Mesh', enabled: true },
    ],
  }),
};

// =============================================================================
// Unity C# Cross-Compilation
// =============================================================================

describe('Avatar Cross-Compilation - Unity (C#)', () => {
  it('should compile avatar with skeleton trait to Unity C#', () => {
    const avatarObj = createAvatarObject('RPMAvatar', [AVATAR_TRAITS.skeleton]);
    const composition = createComposition('AvatarScene', {
      objects: [avatarObj],
    });

    const compiler = new UnityCompiler({ className: 'AvatarScene' });
    const result = compiler.compile(composition);

    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    // Should contain C# MonoBehaviour structure
    expect(result).toContain('MonoBehaviour');
    expect(result).toContain('using UnityEngine');
    expect(result).toContain('RPMAvatar');
  });

  it('should compile avatar with multiple traits to Unity C#', () => {
    const avatarObj = createAvatarObject('FullAvatar', [
      AVATAR_TRAITS.skeleton,
      AVATAR_TRAITS.morph,
      AVATAR_TRAITS.ik,
    ]);
    const composition = createComposition('FullAvatarScene', {
      objects: [avatarObj],
    });

    const compiler = new UnityCompiler();
    const result = compiler.compile(composition);

    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    expect(result).toContain('FullAvatar');
  });

  it('should compile avatar scene with lighting for Unity', () => {
    const avatarObj = createAvatarObject('AvatarWithLight', [
      AVATAR_TRAITS.skeleton,
      AVATAR_TRAITS.morph,
    ]);
    const keyLight: HoloLight = {
      type: 'Light',
      name: 'KeyLight',
      lightType: 'directional',
      properties: [
        prop('color', '#ffffff'),
        prop('intensity', 1.0),
        prop('position', [2, 3, 2]),
        prop('castShadows', true),
      ],
    } as any;

    const composition = createComposition('LitAvatarScene', {
      objects: [avatarObj],
      lights: [keyLight],
    });

    const compiler = new UnityCompiler();
    const result = compiler.compile(composition);

    expect(result).toBeDefined();
    // Should reference both the avatar and the light
    expect(result).toContain('AvatarWithLight');
    expect(result).toContain('KeyLight');
  });
});

// =============================================================================
// Unreal Engine C++ Cross-Compilation
// =============================================================================

describe('Avatar Cross-Compilation - Unreal (C++)', () => {
  it('should compile avatar with skeleton trait to Unreal C++', () => {
    const avatarObj = createAvatarObject('UEAvatar', [AVATAR_TRAITS.skeleton]);
    const composition = createComposition('AvatarScene', {
      objects: [avatarObj],
    });

    const compiler = new UnrealCompiler({
      moduleName: 'AvatarModule',
      className: 'AAvatarScene',
    });
    const result = compiler.compile(composition);

    expect(result).toBeDefined();
    expect(result.headerFile).toBeDefined();
    expect(result.sourceFile).toBeDefined();

    // Header should have UE5 structure
    expect(result.headerFile).toContain('#pragma once');
    expect(result.headerFile).toContain('UCLASS(');
    expect(result.headerFile).toContain('AActor');

    // Source should reference the avatar object
    expect(result.sourceFile).toContain('UEAvatar');
  });

  it('should compile avatar with Blueprint generation for Unreal', () => {
    const avatarObj = createAvatarObject('BlueprintAvatar', [
      AVATAR_TRAITS.skeleton,
      AVATAR_TRAITS.morph,
      AVATAR_TRAITS.avatar_embodiment,
    ]);
    const composition = createComposition('BlueprintAvatarScene', {
      objects: [avatarObj],
    });

    const compiler = new UnrealCompiler({
      generateBlueprints: true,
      engineVersion: '5.4',
    });
    const result = compiler.compile(composition);

    expect(result).toBeDefined();
    expect(result.headerFile).toBeDefined();
    expect(result.sourceFile).toBeDefined();
    // Blueprint JSON is generated when option is enabled
    expect(result.blueprintJson).toBeDefined();
  });

  it('should compile multi-object avatar scene for Unreal', () => {
    const playerAvatar = createAvatarObject('PlayerAvatar', [
      AVATAR_TRAITS.skeleton,
      AVATAR_TRAITS.morph,
      AVATAR_TRAITS.ik,
    ]);
    const npcAvatar = createAvatarObject(
      'NPCAvatar',
      [AVATAR_TRAITS.skeleton, AVATAR_TRAITS.morph],
      [prop('position', [3, 0, 0])]
    );
    const composition = createComposition('MultiAvatarScene', {
      objects: [playerAvatar, npcAvatar],
    });

    const compiler = new UnrealCompiler();
    const result = compiler.compile(composition);

    expect(result.headerFile).toBeDefined();
    expect(result.sourceFile).toBeDefined();
    // Both objects should appear in output
    expect(result.sourceFile).toContain('PlayerAvatar');
    expect(result.sourceFile).toContain('NPCAvatar');
  });

  it('should use correct Unreal Engine version in output', () => {
    const avatarObj = createAvatarObject('VersionedAvatar', [AVATAR_TRAITS.skeleton]);
    const composition = createComposition('VersionTest', {
      objects: [avatarObj],
    });

    const compiler = new UnrealCompiler({ engineVersion: '5.3' });
    const result = compiler.compile(composition);

    expect(result.headerFile).toContain('5.3');
  });
});

// =============================================================================
// R3F (React Three Fiber / WebXR) Cross-Compilation
// =============================================================================

describe('Avatar Cross-Compilation - R3F (WebXR)', () => {
  it('should compile avatar to R3F nodes', () => {
    const avatarObj = createAvatarObject('WebAvatar', [
      AVATAR_TRAITS.skeleton,
      AVATAR_TRAITS.morph,
    ]);
    const composition = createComposition('WebAvatarScene', {
      objects: [avatarObj],
    });

    const compiler = new R3FCompiler();
    const result = compiler.compileComposition(composition);

    expect(result).toBeDefined();
    // R3F compileComposition returns a root R3FNode with children
    expect(result.type).toBe('group');
    expect(result.id).toBe('WebAvatarScene');
    expect(result.children).toBeDefined();
    expect(result.children!.length).toBeGreaterThan(0);

    // Find the avatar node in children
    const avatarNode = result.children!.find((n: any) => n.id === 'WebAvatar');
    expect(avatarNode).toBeDefined();
  });

  it('should include trait metadata in R3F nodes', () => {
    const avatarObj = createAvatarObject('TraitAvatar', [
      AVATAR_TRAITS.skeleton,
      AVATAR_TRAITS.morph,
      AVATAR_TRAITS.avatar_embodiment,
    ]);
    const composition = createComposition('TraitScene', {
      objects: [avatarObj],
    });

    const compiler = new R3FCompiler();
    const result = compiler.compileComposition(composition);

    expect(result).toBeDefined();
    expect(result.children).toBeDefined();

    const avatarNode = result.children!.find((n: any) => n.id === 'TraitAvatar');
    expect(avatarNode).toBeDefined();

    // R3F compiler merges trait configs into the node's props,
    // and also applies TraitCompositor visual rules to materialProps.
    // Verify trait-derived data is present in props.
    expect(avatarNode?.props).toBeDefined();
    // The TraitCompositor applies visual presets from traits, which
    // results in materialProps being populated with composed values.
    // At minimum, the compiled node should have trait-related properties.
    expect(Object.keys(avatarNode?.props || {}).length).toBeGreaterThan(0);
  });

  it('should compile avatar scene with lights for R3F', () => {
    const avatarObj = createAvatarObject('LitWebAvatar', [AVATAR_TRAITS.skeleton]);
    const keyLight: HoloLight = {
      type: 'Light',
      name: 'WebKeyLight',
      lightType: 'directional',
      color: '#ffffff',
      intensity: 1.0,
    } as any;

    const composition = createComposition('LitWebScene', {
      objects: [avatarObj],
      lights: [keyLight],
    });

    const compiler = new R3FCompiler();
    const result = compiler.compileComposition(composition);

    expect(result).toBeDefined();
    expect(result.children).toBeDefined();
    // Should have children for both the avatar and the light
    expect(result.children!.length).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
// Cross-Platform Consistency
// =============================================================================

describe('Avatar Cross-Compilation - Platform Consistency', () => {
  it('should compile the same composition across all three platforms', () => {
    const avatarObj = createAvatarObject(
      'CrossPlatformAvatar',
      [AVATAR_TRAITS.skeleton, AVATAR_TRAITS.morph],
      [prop('model', '/models/avatar.glb')]
    );
    const composition = createComposition('CrossPlatformScene', {
      objects: [avatarObj],
    });

    // Unity
    const unityCompiler = new UnityCompiler();
    const unityResult = unityCompiler.compile(composition);
    expect(unityResult).toBeDefined();
    expect(typeof unityResult).toBe('string');
    expect(unityResult.length).toBeGreaterThan(0);

    // Unreal
    const unrealCompiler = new UnrealCompiler();
    const unrealResult = unrealCompiler.compile(composition);
    expect(unrealResult).toBeDefined();
    expect(unrealResult.headerFile.length).toBeGreaterThan(0);
    expect(unrealResult.sourceFile.length).toBeGreaterThan(0);

    // R3F/WebXR
    const r3fCompiler = new R3FCompiler();
    const r3fResult = r3fCompiler.compileComposition(composition);
    expect(r3fResult).toBeDefined();
    expect(r3fResult.children).toBeDefined();

    // All outputs should reference the avatar object
    expect(unityResult).toContain('CrossPlatformAvatar');
    expect(unrealResult.sourceFile).toContain('CrossPlatformAvatar');
    const r3fNode = r3fResult.children!.find((n: any) => n.id === 'CrossPlatformAvatar');
    expect(r3fNode).toBeDefined();
  });

  it('should compile empty composition without errors on all platforms', () => {
    const composition = createComposition('EmptyScene');

    // Unity
    const unityResult = new UnityCompiler().compile(composition);
    expect(unityResult).toBeDefined();

    // Unreal
    const unrealResult = new UnrealCompiler().compile(composition);
    expect(unrealResult.headerFile).toBeDefined();
    expect(unrealResult.sourceFile).toBeDefined();

    // R3F
    const r3fResult = new R3FCompiler().compileComposition(composition);
    expect(r3fResult).toBeDefined();
  });
});
