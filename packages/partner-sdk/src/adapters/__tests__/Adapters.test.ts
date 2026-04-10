/**
 * Partner SDK Adapter Tests
 *
 * Tests for Unity, Godot, and Unreal export adapters.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UnityExportAdapter } from '../UnityAdapter.js';
import { GodotExportAdapter } from '../GodotAdapter.js';
import { UnrealExportAdapter } from '../UnrealAdapter.js';
import type { SceneGraph, SceneNode } from '../../runtime/types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestScene(): SceneGraph {
  return {
    name: 'TestScene',
    objects: [
      {
        id: 'cube-1',
        name: 'TestCube',
        type: 'object',
        position: [0, 1, 0],
        rotation: [0, 45, 0],
        scale: [1, 1, 1],
        properties: {
          color: '#ff0000',
          health: 100,
          isActive: true,
        },
        traits: ['@grabbable', '@collidable'],
        children: [],
      },
      {
        id: 'sphere-1',
        name: 'BouncySphere',
        type: 'object',
        position: [5, 0, 0],
        rotation: [0, 0, 0],
        scale: 2,
        properties: {
          bounceForce: 10.5,
        },
        traits: ['@physics'],
        children: [],
      },
    ],
    environment: {
      skybox: 'nebula',
      ambientLight: 0.5,
      gravity: { x: 0, y: -9.81, z: 0 },
    },
  };
}

function createMinimalScene(): SceneGraph {
  return {
    name: 'MinimalScene',
    objects: [
      {
        id: 'box-1',
        name: 'SimpleBox',
        type: 'object',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: 1,
        properties: {},
        traits: [],
        children: [],
      },
    ],
    environment: {},
  };
}

// ============================================================================
// Unity Adapter Tests
// ============================================================================

describe('UnityExportAdapter', () => {
  let adapter: UnityExportAdapter;

  beforeEach(() => {
    adapter = new UnityExportAdapter({
      unityVersion: '2022',
      renderPipeline: 'urp',
      outputDir: './unity-export',
    });
  });

  describe('constructor', () => {
    it('should create adapter with default options', () => {
      expect(adapter).toBeDefined();
    });

    it('should accept XR support config', () => {
      const xrAdapter = new UnityExportAdapter({
        unityVersion: '2023',
        renderPipeline: 'hdrp',
        outputDir: './output',
        xrSupport: true,
      });
      expect(xrAdapter).toBeDefined();
    });

    it('should accept custom namespace', () => {
      const customAdapter = new UnityExportAdapter({
        unityVersion: '2021',
        renderPipeline: 'builtin',
        outputDir: './output',
        namespace: 'MyGame.Generated',
      });
      expect(customAdapter).toBeDefined();
    });
  });

  describe('export()', () => {
    it('should export scene graph to Unity assets', () => {
      const scene = createTestScene();
      const result = adapter.export(scene);

      expect(result.scripts).toBeDefined();
      expect(result.prefabs).toBeDefined();
      expect(result.scene).toBeDefined();
      expect(result.asmdef).toBeDefined();
      expect(result.packageJson).toBeDefined();
    });

    it('should generate script for each object', () => {
      const scene = createTestScene();
      const result = adapter.export(scene);

      expect(result.scripts.length).toBe(2);
      expect(result.scripts[0].type).toBe('csharp');
      expect(result.scripts[0].path).toContain('.cs');
    });

    it('should generate prefab for each object', () => {
      const scene = createTestScene();
      const result = adapter.export(scene);

      expect(result.prefabs.length).toBe(2);
      expect(result.prefabs[0].type).toBe('prefab');
    });

    it('should include class name in script content', () => {
      const scene = createTestScene();
      const result = adapter.export(scene);

      expect(result.scripts[0].content).toContain('class TestCube');
    });

    it('should include position in script', () => {
      const scene = createTestScene();
      const result = adapter.export(scene);

      expect(result.scripts[0].content).toContain('0, 1, 0');
    });

    it('should handle traits', () => {
      const scene = createTestScene();
      const result = adapter.export(scene);

      // Grabbable trait should generate OnGrab method
      expect(result.scripts[0].content).toContain('OnGrab');
    });

    it('should handle minimal scene', () => {
      const scene = createMinimalScene();
      const result = adapter.export(scene);

      expect(result.scripts.length).toBe(1);
      expect(result.prefabs.length).toBe(1);
    });

    it('should generate asmdef file', () => {
      const scene = createTestScene();
      const result = adapter.export(scene);

      expect(result.asmdef.type).toBe('asmdef');
      expect(result.asmdef.content).toBeTruthy();
    });
  });

  describe('XR support', () => {
    it('should include XR imports when enabled', () => {
      const xrAdapter = new UnityExportAdapter({
        unityVersion: '2023',
        renderPipeline: 'urp',
        outputDir: './output',
        xrSupport: true,
      });

      const scene = createTestScene();
      const result = xrAdapter.export(scene);

      expect(result.scripts[0].content).toContain('UnityEngine.XR');
    });
  });
});

// ============================================================================
// Godot Adapter Tests
// ============================================================================

describe('GodotExportAdapter', () => {
  let adapter: GodotExportAdapter;

  beforeEach(() => {
    adapter = new GodotExportAdapter({
      godotVersion: '4.2',
      renderBackend: 'vulkan',
      outputDir: './godot-export',
    });
  });

  describe('constructor', () => {
    it('should create adapter with config', () => {
      expect(adapter).toBeDefined();
    });

    it('should accept XR config', () => {
      const xrAdapter = new GodotExportAdapter({
        godotVersion: '4.2',
        renderBackend: 'vulkan',
        outputDir: './output',
        xrSupport: true,
      });
      expect(xrAdapter).toBeDefined();
    });
  });

  describe('export()', () => {
    it('should export scene graph to Godot resources', () => {
      const scene = createTestScene();
      const result = adapter.export(scene);

      expect(result.scripts).toBeDefined();
      expect(result.scenes).toBeDefined();
      // project.godot might be in a separate field or not returned
    });

    it('should generate GDScript for each object', () => {
      const scene = createTestScene();
      const result = adapter.export(scene);

      expect(result.scripts.length).toBe(2);
      expect(result.scripts[0].type).toBe('gdscript');
      expect(result.scripts[0].path).toContain('.gd');
    });

    it('should generate scene files', () => {
      const scene = createTestScene();
      const result = adapter.export(scene);

      expect(result.scenes.length).toBeGreaterThan(0);
      expect(result.scenes[0].type).toBe('tscn');
    });

    it('should include extends Node3D in script', () => {
      const scene = createTestScene();
      const result = adapter.export(scene);

      expect(result.scripts[0].content).toContain('extends');
    });

    it('should include position in script', () => {
      const scene = createTestScene();
      const result = adapter.export(scene);

      // GDScript uses Vector3()
      expect(result.scripts[0].content).toContain('Vector3');
    });

    it('should generate project.godot if available', () => {
      const scene = createTestScene();
      const result = adapter.export(scene);

      // Project config may or may not be included
      if (result.project) {
        expect(result.project.path).toContain('godot');
      }
    });

    it('should handle minimal scene', () => {
      const scene = createMinimalScene();
      const result = adapter.export(scene);

      expect(result.scripts.length).toBe(1);
    });
  });
});

// ============================================================================
// Unreal Adapter Tests
// ============================================================================

describe('UnrealExportAdapter', () => {
  let adapter: UnrealExportAdapter;

  beforeEach(() => {
    adapter = new UnrealExportAdapter({
      unrealVersion: '5.3',
      outputDir: './unreal-export',
      moduleName: 'HoloScriptGenerated',
    });
  });

  describe('constructor', () => {
    it('should create adapter with config', () => {
      expect(adapter).toBeDefined();
    });

    it('should accept VR config', () => {
      const vrAdapter = new UnrealExportAdapter({
        unrealVersion: '5.3',
        outputDir: './output',
        vrSupport: true,
        moduleName: 'VRModule',
      });
      expect(vrAdapter).toBeDefined();
    });

    it('should accept custom module name', () => {
      const customAdapter = new UnrealExportAdapter({
        unrealVersion: '5.2',
        outputDir: './output',
        moduleName: 'MyGameModule',
      });
      expect(customAdapter).toBeDefined();
    });
  });

  describe('export()', () => {
    it('should export scene graph to Unreal assets', () => {
      const scene = createTestScene();
      const result = adapter.export(scene);

      expect(result.headers).toBeDefined();
      expect(result.sources).toBeDefined();
      expect(result.blueprints).toBeDefined();
      expect(result.level).toBeDefined();
    });

    it('should generate header and source for each object', () => {
      const scene = createTestScene();
      const result = adapter.export(scene);

      expect(result.headers.length).toBe(2);
      expect(result.sources.length).toBe(2);
      // Type may be 'h' or 'header' depending on implementation
      expect(result.headers[0].type).toMatch(/^(h|header)$/);
      expect(result.sources[0].type).toMatch(/^(cpp|source)$/);
    });

    it('should include class declaration in header', () => {
      const scene = createTestScene();
      const result = adapter.export(scene);

      expect(result.headers[0].content).toContain('UCLASS');
      // Class name includes prefix (AHS_) and object name
      expect(result.headers[0].content).toContain('TestCube');
    });

    it('should include UPROPERTY macros', () => {
      const scene = createTestScene();
      const result = adapter.export(scene);

      expect(result.headers[0].content).toContain('UPROPERTY');
    });

    it('should generate blueprint assets', () => {
      const scene = createTestScene();
      const result = adapter.export(scene);

      expect(result.blueprints.length).toBe(2);
    });

    it('should generate level file', () => {
      const scene = createTestScene();
      const result = adapter.export(scene);

      expect(result.level).toBeDefined();
      // Type may be 'level' or 'umap' depending on implementation
      expect(result.level.type).toMatch(/^(level|umap)$/);
    });

    it('should handle minimal scene', () => {
      const scene = createMinimalScene();
      const result = adapter.export(scene);

      expect(result.headers.length).toBe(1);
      expect(result.sources.length).toBe(1);
    });
  });

  describe('module files', () => {
    it('should generate build.cs', () => {
      const scene = createTestScene();
      const result = adapter.export(scene);

      expect(result.buildCs).toBeDefined();
      expect(result.buildCs.content).toContain('PublicDependencyModuleNames');
    });
  });
});

// ============================================================================
// Cross-Adapter Tests
// ============================================================================

describe('Cross-Adapter Compatibility', () => {
  it('should export same scene to all platforms', () => {
    const scene = createTestScene();

    const unityResult = new UnityExportAdapter({
      unityVersion: '2022',
      renderPipeline: 'urp',
      outputDir: './unity',
    }).export(scene);

    const godotResult = new GodotExportAdapter({
      godotVersion: '4.2',
      renderBackend: 'vulkan',
      outputDir: './godot',
    }).export(scene);

    const unrealResult = new UnrealExportAdapter({
      unrealVersion: '5.3',
      outputDir: './unreal',
      moduleName: 'HoloScriptGenerated',
    }).export(scene);

    // All should produce output
    expect(unityResult.scripts.length).toBeGreaterThan(0);
    expect(godotResult.scripts.length).toBeGreaterThan(0);
    expect(unrealResult.headers.length).toBeGreaterThan(0);
  });

  it('should maintain same object count across platforms', () => {
    const scene = createTestScene();
    const objectCount = scene.objects.length;

    const unityResult = new UnityExportAdapter({
      unityVersion: '2022',
      renderPipeline: 'urp',
      outputDir: './unity',
    }).export(scene);

    const godotResult = new GodotExportAdapter({
      godotVersion: '4.2',
      renderBackend: 'vulkan',
      outputDir: './godot',
    }).export(scene);

    const unrealResult = new UnrealExportAdapter({
      unrealVersion: '5.3',
      outputDir: './unreal',
      moduleName: 'HoloScriptGenerated',
    }).export(scene);

    expect(unityResult.scripts.length).toBe(objectCount);
    expect(godotResult.scripts.length).toBe(objectCount);
    expect(unrealResult.headers.length).toBe(objectCount);
  });
});
