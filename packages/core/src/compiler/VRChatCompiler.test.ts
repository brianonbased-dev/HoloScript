/**
 * VRChatCompiler Tests
 *
 * Tests for the HoloScript → VRChat SDK3 + UdonSharp compiler.
 * Verifies correct C# generation for VRChat worlds.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VRChatCompiler, type VRChatCompilerOptions } from './VRChatCompiler';
import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';

vi.mock('./identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

describe('VRChatCompiler', () => {
  let compiler: VRChatCompiler;

  beforeEach(() => {
    compiler = new VRChatCompiler();
  });

  // Helper to create a minimal composition
  function createComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
    return {
      type: 'Composition',
      name: 'TestWorld',
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

  // Helper to create an object declaration
  function createObject(name: string, overrides: Partial<HoloObjectDecl> = {}): HoloObjectDecl {
    return {
      name,
      properties: [],
      traits: [],
      ...overrides,
    } as HoloObjectDecl;
  }

  describe('Basic Compilation', () => {
    it('should create a compiler instance', () => {
      expect(compiler).toBeDefined();
      expect(compiler).toBeInstanceOf(VRChatCompiler);
    });

    it('should compile an empty composition', () => {
      const composition = createComposition();
      const result = compiler.compile(composition, 'test-token');

      expect(result).toBeDefined();
      expect(result.mainScript).toBeDefined();
      expect(result.udonScripts).toBeDefined();
      expect(result.prefabHierarchy).toBeDefined();
      expect(result.worldDescriptor).toBeDefined();
    });

    it('should include VRChat SDK imports', () => {
      const composition = createComposition();
      const result = compiler.compile(composition, 'test-token');

      expect(result.mainScript).toContain('using VRC.SDKBase');
      expect(result.mainScript).toContain('using UdonSharp');
    });

    it('should use custom namespace', () => {
      const customCompiler = new VRChatCompiler({ namespace: 'MyWorld' });
      const composition = createComposition();
      const result = customCompiler.compile(composition, 'test-token');

      expect(result.mainScript).toContain('namespace MyWorld');
    });

    it('should use custom class name', () => {
      const customCompiler = new VRChatCompiler({ className: 'CustomWorld' });
      const composition = createComposition();
      const result = customCompiler.compile(composition, 'test-token');

      expect(result.mainScript).toContain('class CustomWorld');
    });
  });

  describe('Object Compilation', () => {
    it('should compile objects with geometry', () => {
      const composition = createComposition({
        objects: [
          createObject('TestCube', {
            properties: [
              { key: 'geometry', value: 'cube' },
              { key: 'position', value: [0, 1, 0] },
            ],
          }),
        ],
      });
      const result = compiler.compile(composition, 'test-token');

      expect(result.prefabHierarchy).toContain('TestCube');
    });

    it('should compile grabbable objects with VRC_Pickup', () => {
      const composition = createComposition({
        objects: [
          createObject('GrabbableCube', {
            traits: ['grabbable'],
            properties: [{ key: 'geometry', value: 'cube' }],
          }),
        ],
      });
      const result = compiler.compile(composition, 'test-token');

      expect(result.prefabHierarchy).toContain('GrabbableCube');
    });

    it('should compile objects with physics', () => {
      const composition = createComposition({
        objects: [
          createObject('PhysicsCube', {
            traits: ['collidable', 'physics'],
            properties: [
              { key: 'geometry', value: 'cube' },
              { key: 'physics', value: { mass: 1.0 } },
            ],
          }),
        ],
      });
      const result = compiler.compile(composition, 'test-token');

      expect(result.prefabHierarchy).toContain('PhysicsCube');
    });
  });

  describe('SDK Versions', () => {
    it('should support SDK 3.5', () => {
      const customCompiler = new VRChatCompiler({ sdkVersion: '3.5' });
      const composition = createComposition();
      const result = customCompiler.compile(composition, 'test-token');

      expect(result.mainScript).toBeDefined();
    });

    it('should support SDK 3.0', () => {
      const customCompiler = new VRChatCompiler({ sdkVersion: '3.0' });
      const composition = createComposition();
      const result = customCompiler.compile(composition, 'test-token');

      expect(result.mainScript).toBeDefined();
    });
  });

  describe('UdonSharp Generation', () => {
    it('should generate Udon scripts when enabled', () => {
      const customCompiler = new VRChatCompiler({ useUdonSharp: true });
      const composition = createComposition({
        objects: [
          createObject('InteractiveButton', {
            traits: ['clickable'],
            properties: [{ key: 'geometry', value: 'cube' }],
          }),
        ],
      });
      const result = customCompiler.compile(composition, 'test-token');

      expect(result.udonScripts).toBeDefined();
    });
  });

  describe('World Descriptor', () => {
    it('should generate world descriptor', () => {
      const composition = createComposition({ name: 'MyTestWorld' });
      const result = compiler.compile(composition, 'test-token');

      expect(result.worldDescriptor).toBeDefined();
      expect(result.worldDescriptor.length).toBeGreaterThan(0);
    });
  });

  describe('Environment Handling', () => {
    it('should compile environment settings', () => {
      const composition = createComposition({
        environment: {
          properties: [
            { key: 'skybox', value: 'nebula' },
            { key: 'ambient_light', value: 0.3 },
          ],
        },
      });
      const result = compiler.compile(composition, 'test-token');

      expect(result.mainScript).toBeDefined();
    });
  });
});
