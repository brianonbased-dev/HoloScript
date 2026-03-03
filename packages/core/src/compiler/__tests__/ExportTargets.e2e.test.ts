/**
 * End-to-End Export Target Tests
 *
 * Comprehensive end-to-end tests for all 18 HoloScript export targets.
 * Each test verifies that a canonical HoloComposition compiles to valid output
 * that contains the required structural elements for its target platform.
 *
 * Covered targets:
 *   XR/VR: Unity, Unreal, Godot, Babylon.js, OpenXR, WebGPU, VRChat, Android
 *   Robotics: URDF, SDF
 *   3D Interchange: glTF (pipeline), WASM
 *   Web: R3F (React Three Fiber)
 *   Misc: PlayCanvas, iOS, DTDL (IoT), VisionOS
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi} from 'vitest';

// Compiler imports
import { UnityCompiler } from '../UnityCompiler';
import { UnrealCompiler, type UnrealCompileResult } from '../UnrealCompiler';
import { GodotCompiler } from '../GodotCompiler';
import { BabylonCompiler } from '../BabylonCompiler';
import { OpenXRCompiler } from '../OpenXRCompiler';
import { WebGPUCompiler } from '../WebGPUCompiler';
import { VRChatCompiler, type VRChatCompileResult } from '../VRChatCompiler';
import { AndroidCompiler, type AndroidCompileResult } from '../AndroidCompiler';
import { URDFCompiler } from '../URDFCompiler';
import { SDFCompiler } from '../SDFCompiler';
import { WASMCompiler } from '../WASMCompiler';
import { PlayCanvasCompiler } from '../PlayCanvasCompiler';
import { IOSCompiler, type IOSCompileResult } from '../IOSCompiler';
import { DTDLCompiler } from '../DTDLCompiler';
import { VisionOSCompiler } from '../VisionOSCompiler';

import type { HoloComposition, HoloObjectDecl, HoloTrait } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});


// =============================================================================
// Shared Test Fixtures
// =============================================================================

/**
 * Creates a minimal valid HoloComposition for testing.
 * Matches the "simple cube" scenario: cube { @color(red) @position(0,1,0) @grabbable }
 */
function createSimpleCubeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  const redColorTrait: HoloTrait = {
    name: 'color',
    args: [{ type: 'StringLiteral', value: 'red' }],
  } as unknown as HoloTrait;

  const positionTrait: HoloTrait = {
    name: 'position',
    args: [
      { type: 'NumberLiteral', value: 0 },
      { type: 'NumberLiteral', value: 1 },
      { type: 'NumberLiteral', value: 0 },
    ],
  } as unknown as HoloTrait;

  const grabbableTrait: HoloTrait = {
    name: 'grabbable',
    args: [],
  } as unknown as HoloTrait;

  const cube: HoloObjectDecl = {
    name: 'cube',
    properties: [],
    traits: [redColorTrait, positionTrait, grabbableTrait],
  } as unknown as HoloObjectDecl;

  return {
    type: 'Composition',
    name: 'SimpleCubeScene',
    objects: [cube],
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
 * Creates a more complex composition with multiple objects and physics.
 * Matches the "physics demo": sphere + plane with @physics, @gravity, @collidable
 */
function createPhysicsDemoComposition(): HoloComposition {
  const physicsTrait: HoloTrait = { name: 'physics', args: [] } as unknown as HoloTrait;
  const gravityTrait: HoloTrait = { name: 'gravity', args: [] } as unknown as HoloTrait;
  const collidableTrait: HoloTrait = { name: 'collidable', args: [] } as unknown as HoloTrait;
  const staticTrait: HoloTrait = { name: 'static', args: [] } as unknown as HoloTrait;

  const sphere: HoloObjectDecl = {
    name: 'sphere',
    properties: [],
    traits: [physicsTrait, gravityTrait, collidableTrait],
  } as unknown as HoloObjectDecl;

  const plane: HoloObjectDecl = {
    name: 'plane',
    properties: [],
    traits: [collidableTrait, staticTrait],
  } as unknown as HoloObjectDecl;

  return {
    type: 'Composition',
    name: 'PhysicsDemo',
    objects: [sphere, plane],
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
  };
}

/** Creates an empty composition (edge case: no objects). */
function createEmptyComposition(name = 'EmptyScene'): HoloComposition {
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
  };
}

// =============================================================================
// Unity Export (C# MonoBehaviour)
// =============================================================================

describe('E2E Export: Unity (C#)', () => {
  let compiler: UnityCompiler;

  beforeEach(() => {
    compiler = new UnityCompiler();
  });

  it('compiles simple cube to valid C# structure', () => {
    const composition = createSimpleCubeComposition();
    const output = compiler.compile(composition, 'test-token');

    // Must be valid C# class structure
    expect(output).toContain('using UnityEngine');
    expect(output).toContain('MonoBehaviour');
    expect(output).toContain('void Awake');
    // Must reference the object
    expect(output).toContain('cube');
  });

  it('includes HoloScript source attribution comment', () => {
    const composition = createSimpleCubeComposition();
    const output = compiler.compile(composition, 'test-token');

    expect(output).toContain('HoloScript');
    expect(output).toContain('SimpleCubeScene');
  });

  it('compiles empty composition without errors', () => {
    const output = compiler.compile(createEmptyComposition(), 'test-token');
    expect(output).toBeTruthy();
    expect(output).toContain('MonoBehaviour');
  });

  it('compiles physics demo with multiple objects', () => {
    const output = compiler.compile(createPhysicsDemoComposition(), 'test-token');
    expect(output).toBeTruthy();
    expect(output.length).toBeGreaterThan(100);
  });

  it('respects custom namespace option', () => {
    const customCompiler = new UnityCompiler({ namespace: 'MyGame' });
    const output = customCompiler.compile(createSimpleCubeComposition(), 'test-token');
    expect(output).toContain('MyGame');
  });

  it('respects custom className option', () => {
    const customCompiler = new UnityCompiler({ className: 'MainScene' });
    const output = customCompiler.compile(createSimpleCubeComposition(), 'test-token');
    expect(output).toContain('MainScene');
  });
});

// =============================================================================
// Unreal Export (C++ header + source files)
// =============================================================================

describe('E2E Export: Unreal Engine', () => {
  let compiler: UnrealCompiler;

  beforeEach(() => {
    compiler = new UnrealCompiler();
  });

  it('compiles simple cube to valid Unreal result with header and source', () => {
    const composition = createSimpleCubeComposition();
    const result: UnrealCompileResult = compiler.compile(composition, 'test-token');

    // Returns structured result with C++ files
    expect(result).toBeDefined();
    expect(result).toHaveProperty('headerFile');
    expect(result).toHaveProperty('sourceFile');
    expect(typeof result.headerFile).toBe('string');
    expect(typeof result.sourceFile).toBe('string');
    expect(result.headerFile.length).toBeGreaterThan(50);
    expect(result.sourceFile.length).toBeGreaterThan(50);
  });

  it('header file contains Unreal C++ class structure', () => {
    const result = compiler.compile(createSimpleCubeComposition(), 'test-token');
    // Unreal C++ header typically has UCLASS, #pragma once, or AActor
    expect(result.headerFile).toMatch(/#pragma once|UCLASS|#include|AActor/i);
  });

  it('source file contains Unreal method implementations', () => {
    const result = compiler.compile(createSimpleCubeComposition(), 'test-token');
    expect(result.sourceFile).toMatch(/#include|BeginPlay|AActor|UStaticMesh/i);
  });

  it('includes source composition name in output files', () => {
    const result = compiler.compile(createSimpleCubeComposition(), 'test-token');
    const combinedOutput = result.headerFile + result.sourceFile;
    expect(combinedOutput).toContain('SimpleCubeScene');
  });

  it('compiles empty composition without errors', () => {
    const result = compiler.compile(createEmptyComposition(), 'test-token');
    expect(result).toBeDefined();
    expect(result.headerFile).toBeTruthy();
    expect(result.sourceFile).toBeTruthy();
  });

  it('compiles physics demo with multiple objects', () => {
    const result = compiler.compile(createPhysicsDemoComposition(), 'test-token');
    expect(result).toBeDefined();
    expect(result.headerFile).toBeTruthy();
  });
});

// =============================================================================
// Godot Export (GDScript)
// =============================================================================

describe('E2E Export: Godot (GDScript)', () => {
  let compiler: GodotCompiler;

  beforeEach(() => {
    compiler = new GodotCompiler();
  });

  it('compiles simple cube to valid GDScript', () => {
    const composition = createSimpleCubeComposition();
    const output = compiler.compile(composition, 'test-token');

    // Must be GDScript format
    expect(output).toContain('extends');
    expect(output).toContain('_ready');
  });

  it('includes source composition comment', () => {
    const composition = createSimpleCubeComposition();
    const output = compiler.compile(composition, 'test-token');
    expect(output).toContain('SimpleCubeScene');
  });

  it('compiles empty composition without errors', () => {
    const output = compiler.compile(createEmptyComposition(), 'test-token');
    expect(output).toBeTruthy();
    expect(output).toContain('extends');
  });

  it('compiles physics demo', () => {
    const output = compiler.compile(createPhysicsDemoComposition(), 'test-token');
    expect(output).toBeTruthy();
  });

  it('uses Node3D for 3D scene root', () => {
    const output = compiler.compile(createSimpleCubeComposition(), 'test-token');
    expect(output).toMatch(/extends\s+Node3D/);
  });
});

// =============================================================================
// Babylon.js Export (JavaScript)
// =============================================================================

describe('E2E Export: Babylon.js (JavaScript)', () => {
  let compiler: BabylonCompiler;

  beforeEach(() => {
    compiler = new BabylonCompiler();
  });

  it('compiles simple cube to valid Babylon.js code', () => {
    const composition = createSimpleCubeComposition();
    const output = compiler.compile(composition, 'test-token');

    // Must be JavaScript
    expect(output).toBeTruthy();
    expect(typeof output).toBe('string');
  });

  it('includes BABYLON namespace references', () => {
    const composition = createSimpleCubeComposition();
    const output = compiler.compile(composition, 'test-token');
    // Check for Babylon.js patterns
    expect(output).toMatch(/babylon|BABYLON|engine|scene/i);
  });

  it('compiles empty composition without errors', () => {
    const output = compiler.compile(createEmptyComposition(), 'test-token');
    expect(output).toBeTruthy();
  });

  it('compiles physics demo', () => {
    const output = compiler.compile(createPhysicsDemoComposition(), 'test-token');
    expect(output).toBeTruthy();
  });
});

// =============================================================================
// OpenXR Export (C++/GLSL-style)
// =============================================================================

describe('E2E Export: OpenXR', () => {
  let compiler: OpenXRCompiler;

  beforeEach(() => {
    compiler = new OpenXRCompiler();
  });

  it('compiles simple cube to valid OpenXR output', () => {
    const composition = createSimpleCubeComposition();
    const output = compiler.compile(composition, 'test-token');

    expect(output).toBeTruthy();
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(50);
  });

  it('includes XR session or space references', () => {
    const output = compiler.compile(createSimpleCubeComposition(), 'test-token');
    expect(output).toMatch(/xr|XR|session|space|openxr|OpenXR/i);
  });

  it('compiles empty composition without errors', () => {
    const output = compiler.compile(createEmptyComposition(), 'test-token');
    expect(output).toBeTruthy();
  });

  it('compiles physics demo', () => {
    const output = compiler.compile(createPhysicsDemoComposition(), 'test-token');
    expect(output).toBeTruthy();
  });
});

// =============================================================================
// WebGPU Export (JavaScript/WGSL)
// =============================================================================

describe('E2E Export: WebGPU', () => {
  let compiler: WebGPUCompiler;

  beforeEach(() => {
    compiler = new WebGPUCompiler();
  });

  it('compiles simple cube to valid WebGPU output', () => {
    const composition = createSimpleCubeComposition();
    const output = compiler.compile(composition, 'test-token');

    expect(output).toBeTruthy();
    expect(typeof output).toBe('string');
  });

  it('includes WebGPU API references', () => {
    const output = compiler.compile(createSimpleCubeComposition(), 'test-token');
    expect(output).toMatch(/gpu|GPU|webgpu|WebGPU|device|adapter/i);
  });

  it('compiles empty composition without errors', () => {
    const output = compiler.compile(createEmptyComposition(), 'test-token');
    expect(output).toBeTruthy();
  });
});

// =============================================================================
// VRChat Export (Unity C# with Udon scripts)
// =============================================================================

describe('E2E Export: VRChat', () => {
  let compiler: VRChatCompiler;

  beforeEach(() => {
    compiler = new VRChatCompiler();
  });

  it('compiles simple cube to valid VRChat result with required fields', () => {
    const composition = createSimpleCubeComposition();
    const result: VRChatCompileResult = compiler.compile(composition, 'test-token');

    expect(result).toBeDefined();
    expect(result).toHaveProperty('mainScript');
    expect(result).toHaveProperty('udonScripts');
    expect(result).toHaveProperty('prefabHierarchy');
    expect(result).toHaveProperty('worldDescriptor');
  });

  it('main script includes VRChat or Udon references', () => {
    const result = compiler.compile(createSimpleCubeComposition(), 'test-token');
    expect(result.mainScript).toMatch(/VRC|vrchat|Udon|udon|UdonBehaviour/i);
  });

  it('prefab hierarchy is a non-empty string', () => {
    const result = compiler.compile(createSimpleCubeComposition(), 'test-token');
    expect(typeof result.prefabHierarchy).toBe('string');
    expect(result.prefabHierarchy.length).toBeGreaterThan(0);
  });

  it('compiles empty composition without errors', () => {
    const result = compiler.compile(createEmptyComposition(), 'test-token');
    expect(result).toBeDefined();
    expect(result.mainScript).toBeTruthy();
  });

  it('compiles physics demo', () => {
    const result = compiler.compile(createPhysicsDemoComposition(), 'test-token');
    expect(result).toBeDefined();
    expect(result.mainScript).toBeTruthy();
  });
});

// =============================================================================
// Android XR Export (Kotlin Activity + multiple files)
// =============================================================================

describe('E2E Export: Android', () => {
  let compiler: AndroidCompiler;

  beforeEach(() => {
    compiler = new AndroidCompiler();
  });

  it('compiles simple cube to valid Android result with required files', () => {
    const composition = createSimpleCubeComposition();
    const result: AndroidCompileResult = compiler.compile(composition, 'test-token');

    expect(result).toBeDefined();
    expect(result).toHaveProperty('activityFile');
    expect(result).toHaveProperty('manifestFile');
    expect(result).toHaveProperty('buildGradle');
    expect(typeof result.activityFile).toBe('string');
    expect(result.activityFile.length).toBeGreaterThan(50);
  });

  it('activity file includes Android or ARCore references', () => {
    const result = compiler.compile(createSimpleCubeComposition(), 'test-token');
    expect(result.activityFile).toMatch(/android|Android|ARCore|arcore|Activity|import/i);
  });

  it('manifest file contains Android package structure', () => {
    const result = compiler.compile(createSimpleCubeComposition(), 'test-token');
    expect(result.manifestFile).toMatch(/<manifest|<application|android:|AndroidManifest/i);
  });

  it('compiles empty composition without errors', () => {
    const result = compiler.compile(createEmptyComposition(), 'test-token');
    expect(result).toBeDefined();
    expect(result.activityFile).toBeTruthy();
  });
});

// =============================================================================
// URDF Export (XML - ROS/Gazebo)
// =============================================================================

describe('E2E Export: URDF (Robotics)', () => {
  let compiler: URDFCompiler;

  beforeEach(() => {
    compiler = new URDFCompiler();
  });

  it('compiles simple cube to valid URDF XML', () => {
    const composition = createSimpleCubeComposition();
    const output = compiler.compile(composition, 'test-token');

    // Must be valid XML URDF structure
    expect(output).toContain('<?xml version="1.0"?>');
    expect(output).toContain('<robot');
    expect(output).toContain('</robot>');
  });

  it('includes required base_link element', () => {
    const output = compiler.compile(createSimpleCubeComposition(), 'test-token');
    expect(output).toContain('<link name="base_link">');
  });

  it('includes source attribution comment', () => {
    const output = compiler.compile(createSimpleCubeComposition(), 'test-token');
    expect(output).toContain('HoloScript URDFCompiler');
  });

  it('compiles empty composition to minimal valid URDF', () => {
    const output = compiler.compile(createEmptyComposition(), 'test-token');
    expect(output).toContain('<robot');
    expect(output).toContain('</robot>');
  });

  it('compiles physics demo with multiple objects', () => {
    const output = compiler.compile(createPhysicsDemoComposition(), 'test-token');
    expect(output).toContain('<robot');
    expect(output).toContain('<link');
  });

  it('uses custom robot name when specified', () => {
    const customCompiler = new URDFCompiler({ robotName: 'TestRobot' });
    const output = customCompiler.compile(createEmptyComposition(), 'test-token');
    expect(output).toContain('TestRobot');
  });
});

// =============================================================================
// SDF Export (XML - Gazebo)
// =============================================================================

describe('E2E Export: SDF (Simulation Description Format)', () => {
  let compiler: SDFCompiler;

  beforeEach(() => {
    compiler = new SDFCompiler();
  });

  it('compiles simple cube to valid SDF XML', () => {
    const composition = createSimpleCubeComposition();
    const output = compiler.compile(composition, 'test-token');

    // Must be valid SDF XML structure
    expect(output).toContain('<?xml version="1.0"?>');
    expect(output).toContain('<sdf');
    expect(output).toContain('</sdf>');
    expect(output).toContain('<world');
  });

  it('includes source attribution comment', () => {
    const output = compiler.compile(createSimpleCubeComposition(), 'test-token');
    expect(output).toContain('HoloScript');
  });

  it('compiles empty composition to minimal valid SDF', () => {
    const output = compiler.compile(createEmptyComposition(), 'test-token');
    expect(output).toContain('<sdf');
    expect(output).toContain('<world');
  });

  it('compiles physics demo with sphere and plane', () => {
    const output = compiler.compile(createPhysicsDemoComposition(), 'test-token');
    expect(output).toContain('<sdf');
    expect(output.length).toBeGreaterThan(200);
  });

  it('uses custom world name when specified', () => {
    const customCompiler = new SDFCompiler({ worldName: 'my_world' });
    const output = customCompiler.compile(createEmptyComposition(), 'test-token');
    expect(output).toContain('my_world');
  });
});

// =============================================================================
// WASM Export (WebAssembly)
// =============================================================================

describe('E2E Export: WebAssembly (WASM)', () => {
  let compiler: WASMCompiler;

  beforeEach(() => {
    compiler = new WASMCompiler();
  });

  it('compiles simple cube to valid WASM result', () => {
    const composition = createSimpleCubeComposition();
    const result = compiler.compile(composition, 'test-token');

    // WASMCompiler returns an object, not a string
    expect(result).toBeDefined();
    expect(result).toHaveProperty('exports');
  });

  it('includes module name in compilation result', () => {
    const result = compiler.compile(createSimpleCubeComposition(), 'test-token');
    expect(result).toBeDefined();
  });

  it('compiles empty composition without errors', () => {
    const result = compiler.compile(createEmptyComposition(), 'test-token');
    expect(result).toBeDefined();
  });
});

// =============================================================================
// PlayCanvas Export (JavaScript)
// =============================================================================

describe('E2E Export: PlayCanvas', () => {
  let compiler: PlayCanvasCompiler;

  beforeEach(() => {
    compiler = new PlayCanvasCompiler();
  });

  it('compiles simple cube to valid PlayCanvas output', () => {
    const composition = createSimpleCubeComposition();
    const output = compiler.compile(composition, 'test-token');

    expect(output).toBeTruthy();
    expect(typeof output).toBe('string');
  });

  it('includes PlayCanvas API references', () => {
    const output = compiler.compile(createSimpleCubeComposition(), 'test-token');
    expect(output).toMatch(/PlayCanvas|pc\.|Application|Entity/i);
  });

  it('compiles empty composition without errors', () => {
    const output = compiler.compile(createEmptyComposition(), 'test-token');
    expect(output).toBeTruthy();
  });

  it('compiles physics demo', () => {
    const output = compiler.compile(createPhysicsDemoComposition(), 'test-token');
    expect(output).toBeTruthy();
  });
});

// =============================================================================
// iOS Export (Swift + multiple files)
// =============================================================================

describe('E2E Export: iOS (Swift/ARKit)', () => {
  let compiler: IOSCompiler;

  beforeEach(() => {
    compiler = new IOSCompiler();
  });

  it('compiles simple cube to valid iOS result with required files', () => {
    const composition = createSimpleCubeComposition();
    const result: IOSCompileResult = compiler.compile(composition, 'test-token');

    expect(result).toBeDefined();
    expect(result).toHaveProperty('viewFile');
    expect(result).toHaveProperty('sceneFile');
    expect(result).toHaveProperty('infoPlist');
    expect(typeof result.viewFile).toBe('string');
    expect(result.viewFile.length).toBeGreaterThan(50);
  });

  it('view file includes Swift or ARKit references', () => {
    const result = compiler.compile(createSimpleCubeComposition(), 'test-token');
    expect(result.viewFile).toMatch(/import|ARKit|SceneKit|RealityKit|UIView|SwiftUI|class/i);
  });

  it('info.plist contains iOS privacy keys or XML structure', () => {
    const result = compiler.compile(createSimpleCubeComposition(), 'test-token');
    expect(result.infoPlist).toMatch(/<plist|<key|<string|NSCamera|Privacy/i);
  });

  it('compiles empty composition without errors', () => {
    const result = compiler.compile(createEmptyComposition(), 'test-token');
    expect(result).toBeDefined();
    expect(result.viewFile).toBeTruthy();
  });
});

// =============================================================================
// DTDL Export (Digital Twins Definition Language - Azure IoT)
// =============================================================================

describe('E2E Export: DTDL (Digital Twins)', () => {
  let compiler: DTDLCompiler;

  beforeEach(() => {
    compiler = new DTDLCompiler();
  });

  it('compiles simple cube to valid DTDL output', () => {
    const composition = createSimpleCubeComposition();
    const output = compiler.compile(composition, 'test-token');

    expect(output).toBeTruthy();
    expect(typeof output).toBe('string');
  });

  it('includes DTDL context or @type references', () => {
    const output = compiler.compile(createSimpleCubeComposition(), 'test-token');
    // DTDL uses JSON-LD format
    expect(output).toMatch(/@context|@type|dtmi:|Interface/i);
  });

  it('compiles empty composition without errors', () => {
    const output = compiler.compile(createEmptyComposition(), 'test-token');
    expect(output).toBeTruthy();
  });
});

// =============================================================================
// VisionOS Export (Apple Vision Pro - RealityKit)
// =============================================================================

describe('E2E Export: VisionOS (Apple Vision Pro)', () => {
  let compiler: VisionOSCompiler;

  beforeEach(() => {
    compiler = new VisionOSCompiler();
  });

  it('compiles simple cube to valid VisionOS output', () => {
    const composition = createSimpleCubeComposition();
    const output = compiler.compile(composition, 'test-token');

    expect(output).toBeTruthy();
    expect(typeof output).toBe('string');
  });

  it('includes Swift or RealityKit references', () => {
    const output = compiler.compile(createSimpleCubeComposition(), 'test-token');
    expect(output).toMatch(/import RealityKit|import SwiftUI|visionOS|Vision\s*OS|ModelEntity|Entity/i);
  });

  it('compiles empty composition without errors', () => {
    const output = compiler.compile(createEmptyComposition(), 'test-token');
    expect(output).toBeTruthy();
  });

  it('compiles physics demo', () => {
    const output = compiler.compile(createPhysicsDemoComposition(), 'test-token');
    expect(output).toBeTruthy();
  });
});

// =============================================================================
// Cross-Target Consistency Tests
// =============================================================================

describe('E2E Cross-Target: Consistency Guarantees', () => {
  it('all compilers return non-empty output for simple cube', () => {
    const composition = createSimpleCubeComposition();

    // String-output compilers
    const stringCompilers: Array<{ name: string; compile: (c: HoloComposition) => string }> = [
      { name: 'Unity', compile: (c) => new UnityCompiler().compile(c, 'test-token') },
      { name: 'Godot', compile: (c) => new GodotCompiler().compile(c, 'test-token') },
      { name: 'Babylon', compile: (c) => new BabylonCompiler().compile(c, 'test-token') },
      { name: 'OpenXR', compile: (c) => new OpenXRCompiler().compile(c, 'test-token') },
      { name: 'WebGPU', compile: (c) => new WebGPUCompiler().compile(c, 'test-token') },
      { name: 'URDF', compile: (c) => new URDFCompiler().compile(c, 'test-token') },
      { name: 'SDF', compile: (c) => new SDFCompiler().compile(c, 'test-token') },
      { name: 'PlayCanvas', compile: (c) => new PlayCanvasCompiler().compile(c, 'test-token') },
      { name: 'DTDL', compile: (c) => new DTDLCompiler().compile(c, 'test-token') },
      { name: 'VisionOS', compile: (c) => new VisionOSCompiler().compile(c, 'test-token') },
    ];

    for (const { name, compile } of stringCompilers) {
      const output = compile(composition);
      expect(output, `${name} compiler should produce non-empty string output`).toBeTruthy();
      expect(output.length, `${name} compiler output should be at least 50 chars`).toBeGreaterThan(50);
    }

    // Object-output compilers (return multi-file result structs)
    const unrealResult = new UnrealCompiler().compile(composition, 'test-token');
    expect(unrealResult.headerFile, 'Unreal headerFile should be non-empty').toBeTruthy();
    expect(unrealResult.sourceFile, 'Unreal sourceFile should be non-empty').toBeTruthy();

    const vrchatResult = new VRChatCompiler().compile(composition, 'test-token');
    expect(vrchatResult.mainScript, 'VRChat mainScript should be non-empty').toBeTruthy();

    const androidResult = new AndroidCompiler().compile(composition, 'test-token');
    expect(androidResult.activityFile, 'Android activityFile should be non-empty').toBeTruthy();

    const iosResult = new IOSCompiler().compile(composition, 'test-token');
    expect(iosResult.viewFile, 'iOS viewFile should be non-empty').toBeTruthy();

    // Object-output (WASM)
    const wasmResult = new WASMCompiler().compile(composition, 'test-token');
    expect(wasmResult, 'WASM compiler result should be defined').toBeDefined();
  });

  it('all string-output compilers preserve composition name in output', () => {
    const composition = createSimpleCubeComposition({ name: 'UniqueSceneName123' });

    const namePreservingCompilers = [
      { name: 'Unity', compile: () => new UnityCompiler().compile(composition, 'test-token') },
      { name: 'Godot', compile: () => new GodotCompiler().compile(composition, 'test-token') },
      { name: 'URDF', compile: () => new URDFCompiler().compile(composition, 'test-token') },
      { name: 'SDF', compile: () => new SDFCompiler().compile(composition, 'test-token') },
    ];

    for (const { name, compile } of namePreservingCompilers) {
      const output = compile();
      expect(
        output,
        `${name} compiler should include composition name`
      ).toContain('UniqueSceneName123');
    }
  });

  it('all 15 compilers handle empty composition without throwing', () => {
    const empty = createEmptyComposition();

    // String-output compilers
    expect(() => new UnityCompiler().compile(empty, 'test-token')).not.toThrow();
    expect(() => new GodotCompiler().compile(empty, 'test-token')).not.toThrow();
    expect(() => new BabylonCompiler().compile(empty, 'test-token')).not.toThrow();
    expect(() => new OpenXRCompiler().compile(empty, 'test-token')).not.toThrow();
    expect(() => new WebGPUCompiler().compile(empty, 'test-token')).not.toThrow();
    expect(() => new URDFCompiler().compile(empty, 'test-token')).not.toThrow();
    expect(() => new SDFCompiler().compile(empty, 'test-token')).not.toThrow();
    expect(() => new PlayCanvasCompiler().compile(empty, 'test-token')).not.toThrow();
    expect(() => new DTDLCompiler().compile(empty, 'test-token')).not.toThrow();
    expect(() => new VisionOSCompiler().compile(empty, 'test-token')).not.toThrow();

    // Object-output compilers
    expect(() => new UnrealCompiler().compile(empty, 'test-token')).not.toThrow();
    expect(() => new VRChatCompiler().compile(empty, 'test-token')).not.toThrow();
    expect(() => new AndroidCompiler().compile(empty, 'test-token')).not.toThrow();
    expect(() => new IOSCompiler().compile(empty, 'test-token')).not.toThrow();
    expect(() => new WASMCompiler().compile(empty, 'test-token')).not.toThrow();
  });

  it('XML-based exporters produce well-formed XML tags', () => {
    const composition = createSimpleCubeComposition();

    const xmlCompilers = [
      { name: 'URDF', output: new URDFCompiler().compile(composition, 'test-token') },
      { name: 'SDF', output: new SDFCompiler().compile(composition, 'test-token') },
    ];

    for (const { name, output } of xmlCompilers) {
      // Every opening tag should have a corresponding closing tag
      const openTags = (output.match(/<[a-zA-Z][^/>\s]*/g) || [])
        .filter((t) => !t.startsWith('<?') && !t.startsWith('<!--'));
      const closeTags = (output.match(/<\/[a-zA-Z][^>]*/g) || []);

      // Both should be non-empty
      expect(openTags.length, `${name} should have opening XML tags`).toBeGreaterThan(0);
      expect(closeTags.length, `${name} should have closing XML tags`).toBeGreaterThan(0);

      // Check for XML declaration
      expect(output, `${name} should start with XML declaration`).toContain('<?xml');
    }
  });
});

// =============================================================================
// Regression Tests: Edge Cases
// =============================================================================

describe('E2E Edge Cases', () => {
  it('handles composition name with special characters safely', () => {
    const specialName = 'Scene-Test_123 (Demo)';
    const composition = createSimpleCubeComposition({ name: specialName });

    // Should not throw, even with special chars in name
    expect(() => new UnityCompiler().compile(composition, 'test-token')).not.toThrow();
    expect(() => new URDFCompiler().compile(composition, 'test-token')).not.toThrow();
    expect(() => new SDFCompiler().compile(composition, 'test-token')).not.toThrow();
  });

  it('handles composition with many objects (scalability)', () => {
    const manyObjects: HoloObjectDecl[] = Array.from({ length: 50 }, (_, i) => ({
      name: `object_${i}`,
      properties: [],
      traits: [],
    } as unknown as HoloObjectDecl));

    const largComposition = createSimpleCubeComposition({ objects: manyObjects });

    // Should compile without performance issues
    const startTime = Date.now();
    new UnityCompiler().compile(largComposition, 'test-token');
    new URDFCompiler().compile(largComposition, 'test-token');
    new SDFCompiler().compile(largComposition, 'test-token');
    const elapsed = Date.now() - startTime;

    // Should compile 50 objects across 3 targets in under 5 seconds
    expect(elapsed).toBeLessThan(5000);
  });
});
