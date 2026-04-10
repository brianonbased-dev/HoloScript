/**
 * AndroidCompiler Tests
 *
 * Tests for the HoloScript → Android Kotlin ARCore compiler.
 * Verifies correct Kotlin code generation for ARCore experiences.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AndroidCompiler, type AndroidCompilerOptions } from './AndroidCompiler';
import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';

describe('AndroidCompiler', () => {
  let compiler: AndroidCompiler;

  beforeEach(() => {
    compiler = new AndroidCompiler();
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
      expect(compiler).toBeInstanceOf(AndroidCompiler);
    });

    it('should compile an empty composition', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result).toBeDefined();
      expect(result.activityFile).toBeDefined();
      expect(result.stateFile).toBeDefined();
      expect(result.nodeFactoryFile).toBeDefined();
      expect(result.manifestFile).toBeDefined();
      expect(result.buildGradle).toBeDefined();
    });

    it('should generate valid Kotlin package declaration', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result.activityFile).toContain('package com.holoscript.generated');
    });

    it('should use custom package name', () => {
      const customCompiler = new AndroidCompiler({ packageName: 'com.myapp.ar' });
      const composition = createComposition();
      const result = customCompiler.compile(composition);

      expect(result.activityFile).toContain('package com.myapp.ar');
    });

    it('should use custom class name', () => {
      const customCompiler = new AndroidCompiler({ className: 'CustomARActivity' });
      const composition = createComposition();
      const result = customCompiler.compile(composition);

      expect(result.activityFile).toContain('CustomARActivity');
    });
  });

  describe('SDK Versions', () => {
    it('should use default SDK versions', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result.buildGradle).toContain('minSdk');
      expect(result.buildGradle).toContain('targetSdk');
    });

    it('should use custom min SDK version', () => {
      const customCompiler = new AndroidCompiler({ minSdk: 24 });
      const composition = createComposition();
      const result = customCompiler.compile(composition);

      expect(result.buildGradle).toContain('24');
    });

    it('should use custom target SDK version', () => {
      const customCompiler = new AndroidCompiler({ targetSdk: 35 });
      const composition = createComposition();
      const result = customCompiler.compile(composition);

      expect(result.buildGradle).toContain('35');
    });
  });

  describe('Object Compilation', () => {
    it('should compile objects with geometry', () => {
      const composition = createComposition({
        objects: [
          createObject('TestCube', {
            properties: [
              { key: 'geometry', value: 'cube' },
              { key: 'position', value: [0, 0, -1] },
            ],
          }),
        ],
      });
      const result = compiler.compile(composition);

      expect(result.nodeFactoryFile).toContain('TestCube');
    });

    it('should compile objects with colors', () => {
      const composition = createComposition({
        objects: [
          createObject('ColoredSphere', {
            properties: [
              { key: 'geometry', value: 'sphere' },
              { key: 'color', value: '#00ff00' },
            ],
          }),
        ],
      });
      const result = compiler.compile(composition);

      expect(result.nodeFactoryFile).toContain('ColoredSphere');
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

      expect(result.activityFile).toBeDefined();
    });
  });

  describe('Jetpack Compose Integration', () => {
    it('should use Jetpack Compose by default', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result.buildGradle).toContain('compose');
    });

    it('should support disabling Jetpack Compose', () => {
      const customCompiler = new AndroidCompiler({ useJetpackCompose: false });
      const composition = createComposition();
      const result = customCompiler.compile(composition);

      expect(result.activityFile).toBeDefined();
    });
  });

  describe('Sceneform Support', () => {
    it('should use Sceneform by default', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result.buildGradle).toContain('sceneform');
    });

    it('should support Filament when enabled', () => {
      const customCompiler = new AndroidCompiler({ useFilament: true, useSceneform: false });
      const composition = createComposition();
      const result = customCompiler.compile(composition);

      expect(result.buildGradle).toBeDefined();
    });
  });

  describe('Manifest Generation', () => {
    it('should generate valid AndroidManifest.xml', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result.manifestFile).toContain('<?xml version');
      expect(result.manifestFile).toContain('manifest');
    });

    it('should include camera permission', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result.manifestFile).toContain('android.permission.CAMERA');
    });

    it('should include ARCore metadata', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result.manifestFile).toContain('com.google.ar.core');
    });
  });

  describe('Build.gradle Generation', () => {
    it('should generate valid build.gradle.kts', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result.buildGradle).toContain('plugins');
      expect(result.buildGradle).toContain('android');
      expect(result.buildGradle).toContain('dependencies');
    });

    it('should include ARCore dependency', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result.buildGradle).toContain('com.google.ar:core');
    });
  });

  describe('Lights Compilation', () => {
    it('should compile directional lights', () => {
      const composition = createComposition({
        lights: [
          {
            name: 'SunLight',
            type: 'directional',
            color: '#ffffff',
            intensity: 1.0,
          },
        ],
      });
      const result = compiler.compile(composition);

      expect(result.nodeFactoryFile).toBeDefined();
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
