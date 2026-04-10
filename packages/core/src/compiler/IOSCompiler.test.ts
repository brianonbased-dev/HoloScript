/**
 * IOSCompiler Tests
 *
 * Tests for the HoloScript → iOS Swift ARKit compiler.
 * Verifies correct Swift code generation for ARKit experiences.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IOSCompiler, type IOSCompilerOptions } from './IOSCompiler';
import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';

describe('IOSCompiler', () => {
  let compiler: IOSCompiler;

  beforeEach(() => {
    compiler = new IOSCompiler();
  });

  // Helper to create a minimal composition
  function createComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
    return {
      type: 'Composition',
      name: 'TestARScene',
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
      expect(compiler).toBeInstanceOf(IOSCompiler);
    });

    it('should compile an empty composition', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result).toBeDefined();
      expect(result.viewFile).toBeDefined();
      expect(result.sceneFile).toBeDefined();
      expect(result.stateFile).toBeDefined();
      expect(result.infoPlist).toBeDefined();
    });

    it('should generate valid Swift imports', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result.viewFile).toContain('import SwiftUI');
      expect(result.sceneFile).toContain('import ARKit');
    });

    it('should use custom class name', () => {
      const customCompiler = new IOSCompiler({ className: 'CustomARView' });
      const composition = createComposition();
      const result = customCompiler.compile(composition);

      expect(result.viewFile).toContain('CustomARView');
    });
  });

  describe('iOS Versions', () => {
    it('should support iOS 17.0', () => {
      const customCompiler = new IOSCompiler({ iosVersion: '17.0' });
      const composition = createComposition();
      const result = customCompiler.compile(composition);

      expect(result.viewFile).toContain('17.0');
    });

    it('should support iOS 15.0', () => {
      const customCompiler = new IOSCompiler({ iosVersion: '15.0' });
      const composition = createComposition();
      const result = customCompiler.compile(composition);

      expect(result.viewFile).toContain('15.0');
    });
  });

  describe('Object Compilation', () => {
    it('should compile objects with geometry', () => {
      const composition = createComposition({
        objects: [
          createObject('TestSphere', {
            properties: [
              { key: 'geometry', value: 'sphere' },
              { key: 'position', value: [0, 0, -1] },
            ],
          }),
        ],
      });
      const result = compiler.compile(composition);

      expect(result.sceneFile).toContain('TestSphere');
    });

    it('should compile objects with colors', () => {
      const composition = createComposition({
        objects: [
          createObject('ColoredCube', {
            properties: [
              { key: 'geometry', value: 'cube' },
              { key: 'color', value: '#ff0000' },
            ],
          }),
        ],
      });
      const result = compiler.compile(composition);

      expect(result.sceneFile).toContain('ColoredCube');
    });

    it('should compile interactive objects', () => {
      const composition = createComposition({
        objects: [
          createObject('TappableObject', {
            traits: ['clickable'],
            properties: [{ key: 'geometry', value: 'cube' }],
          }),
        ],
      });
      const result = compiler.compile(composition);

      expect(result.sceneFile).toContain('TappableObject');
    });
  });

  describe('SwiftUI Integration', () => {
    it('should use SwiftUI by default', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result.viewFile).toContain('SwiftUI');
    });

    it('should support disabling SwiftUI', () => {
      const customCompiler = new IOSCompiler({ useSwiftUI: false });
      const composition = createComposition();
      const result = customCompiler.compile(composition);

      expect(result.viewFile).toBeDefined();
    });
  });

  describe('RealityKit Support', () => {
    it('should not use RealityKit by default', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      // Default uses ARKit/SceneKit
      expect(result.sceneFile).toContain('ARKit');
    });

    it('should support RealityKit when enabled', () => {
      const customCompiler = new IOSCompiler({ useRealityKit: true });
      const composition = createComposition();
      const result = customCompiler.compile(composition);

      expect(result.sceneFile).toBeDefined();
    });
  });

  describe('Info.plist Generation', () => {
    it('should generate valid Info.plist', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result.infoPlist).toContain('<?xml version');
      expect(result.infoPlist).toContain('plist');
    });

    it('should include camera usage description', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result.infoPlist).toContain('NSCameraUsageDescription');
    });
  });

  describe('Lights Compilation', () => {
    it('should compile directional lights', () => {
      const composition = createComposition({
        lights: [
          {
            name: 'SunLight',
            lightType: 'directional',
            properties: [
              { key: 'color', value: '#ffffff' },
              { key: 'intensity', value: 1.0 },
            ],
          },
        ],
      });
      const result = compiler.compile(composition);

      expect(result.sceneFile).toContain('SunLight');
    });

    it('should compile ambient lights', () => {
      const composition = createComposition({
        lights: [
          {
            name: 'AmbientLight',
            lightType: 'ambient',
            properties: [
              { key: 'color', value: '#aaaaaa' },
              { key: 'intensity', value: 0.5 },
            ],
          },
        ],
      });
      const result = compiler.compile(composition);

      expect(result.sceneFile).toBeDefined();
    });
  });

  describe('State Management', () => {
    it('should generate state file', () => {
      const composition = createComposition({
        objects: [
          createObject('StatefulObject', {
            properties: [
              { key: 'geometry', value: 'cube' },
              { key: 'state', value: { count: 0 } },
            ],
          }),
        ],
      });
      const result = compiler.compile(composition);

      expect(result.stateFile).toBeDefined();
      expect(result.stateFile.length).toBeGreaterThan(0);
    });
  });
});
