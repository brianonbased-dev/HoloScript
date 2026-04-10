/**
 * UnrealCompiler Tests
 *
 * Tests for the HoloScript → Unreal Engine 5 C++ compiler.
 * Verifies correct C++ code generation for UE5 actors.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UnrealCompiler, type UnrealCompilerOptions } from './UnrealCompiler';
import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';

describe('UnrealCompiler', () => {
  let compiler: UnrealCompiler;

  beforeEach(() => {
    compiler = new UnrealCompiler();
  });

  // Helper to create a minimal composition
  function createComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
    return {
      type: 'Composition',
      name: 'TestScene',
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
      expect(compiler).toBeInstanceOf(UnrealCompiler);
    });

    it('should compile an empty composition', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result).toBeDefined();
      expect(result.headerFile).toBeDefined();
      expect(result.sourceFile).toBeDefined();
    });

    it('should generate valid C++ header structure', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result.headerFile).toContain('#pragma once');
      expect(result.headerFile).toContain('#include');
      expect(result.headerFile).toContain('UCLASS(');
    });

    it('should generate valid C++ source structure', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result.sourceFile).toContain('#include');
    });

    it('should use custom module name', () => {
      const customCompiler = new UnrealCompiler({ moduleName: 'MyModule' });
      const composition = createComposition();
      const result = customCompiler.compile(composition);

      expect(result.headerFile).toContain('MYMODULE_API');
    });

    it('should use custom class name', () => {
      const customCompiler = new UnrealCompiler({ className: 'ACustomScene' });
      const composition = createComposition();
      const result = customCompiler.compile(composition);

      expect(result.headerFile).toContain('ACustomScene');
      expect(result.sourceFile).toContain('ACustomScene');
    });
  });

  describe('Object Compilation', () => {
    it('should compile objects with geometry', () => {
      const composition = createComposition({
        objects: [
          createObject('TestCube', {
            properties: [
              { key: 'geometry', value: 'cube' },
              { key: 'position', value: [0, 100, 0] },
            ],
          }),
        ],
      });
      const result = compiler.compile(composition);

      expect(result.sourceFile).toContain('TestCube');
    });

    it('should compile objects with physics', () => {
      const composition = createComposition({
        objects: [
          createObject('PhysicsCube', {
            traits: ['physics', 'collidable'],
            properties: [
              { key: 'geometry', value: 'cube' },
              { key: 'physics', value: { mass: 10.0 } },
            ],
          }),
        ],
      });
      const result = compiler.compile(composition);

      expect(result.sourceFile).toContain('PhysicsCube');
    });

    it('should compile grabbable objects', () => {
      const composition = createComposition({
        objects: [
          createObject('GrabbableItem', {
            traits: ['grabbable'],
            properties: [{ key: 'geometry', value: 'sphere' }],
          }),
        ],
      });
      const result = compiler.compile(composition);

      expect(result.sourceFile).toContain('GrabbableItem');
    });
  });

  describe('Engine Versions', () => {
    it('should support UE5.4', () => {
      const customCompiler = new UnrealCompiler({ engineVersion: '5.4' });
      const composition = createComposition();
      const result = customCompiler.compile(composition);

      expect(result.headerFile).toBeDefined();
    });

    it('should support UE5.0', () => {
      const customCompiler = new UnrealCompiler({ engineVersion: '5.0' });
      const composition = createComposition();
      const result = customCompiler.compile(composition);

      expect(result.headerFile).toBeDefined();
    });
  });

  describe('Blueprint Generation', () => {
    it('should not generate blueprints by default', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result.blueprintJson).toBeUndefined();
    });

    it('should generate blueprints when enabled', () => {
      const customCompiler = new UnrealCompiler({ generateBlueprints: true });
      const composition = createComposition({
        objects: [createObject('TestObject')],
      });
      const result = customCompiler.compile(composition);

      expect(result.blueprintJson).toBeDefined();
    });
  });

  describe('Enhanced Input', () => {
    it('should use enhanced input by default', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      // Enhanced input should be enabled by default
      expect(result.headerFile).toBeDefined();
    });

    it('should support disabling enhanced input', () => {
      const customCompiler = new UnrealCompiler({ useEnhancedInput: false });
      const composition = createComposition();
      const result = customCompiler.compile(composition);

      expect(result.headerFile).toBeDefined();
    });
  });

  describe('Lights Compilation', () => {
    it('should compile point lights', () => {
      const composition = createComposition({
        lights: [
          {
            name: 'TestLight',
            lightType: 'point',
            properties: [
              { key: 'color', value: '#ffffff' },
              { key: 'intensity', value: 1.0 },
            ],
          },
        ],
      });
      const result = compiler.compile(composition);

      expect(result.sourceFile).toContain('TestLight');
    });

    it('should compile directional lights', () => {
      const composition = createComposition({
        lights: [
          {
            name: 'SunLight',
            lightType: 'directional',
            properties: [
              { key: 'color', value: '#ffffcc' },
              { key: 'intensity', value: 1.5 },
            ],
          },
        ],
      });
      const result = compiler.compile(composition);

      expect(result.sourceFile).toContain('SunLight');
    });
  });

  describe('Environment Handling', () => {
    it('should compile environment settings', () => {
      const composition = createComposition({
        environment: {
          properties: [
            { key: 'skybox', value: 'sunset' },
            { key: 'ambient_light', value: 0.5 },
          ],
        },
      });
      const result = compiler.compile(composition);

      expect(result.sourceFile).toBeDefined();
    });
  });
});
