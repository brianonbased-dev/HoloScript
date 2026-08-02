/**
 * AndroidCompiler Tests
 *
 * Tests for the HoloScript → Android Kotlin ARCore compiler.
 * Verifies correct Kotlin code generation for ARCore experiences.
 */

import { createHash } from 'crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { AndroidCompiler, type AndroidCompilerOptions } from './AndroidCompiler';
import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';

function hashRecordStrings(obj: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const k of Object.keys(obj).sort()) {
    const v = obj[k];
    if (typeof v === 'string') {
      parts.push(`${k}:${createHash('sha256').update(v, 'utf8').digest('hex')}`);
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      parts.push(`${k}:${hashRecordStrings(v as Record<string, unknown>)}`);
    }
  }
  return createHash('sha256').update(parts.join('|'), 'utf8').digest('hex');
}

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

    it('should use custom target SDK version (above the SceneView 36 floor)', () => {
      const customCompiler = new AndroidCompiler({ targetSdk: 37 });
      const composition = createComposition();
      const result = customCompiler.compile(composition);

      expect(result.buildGradle).toContain('37');
    });

    it('floors compile/target SDK at 36 (SceneView 4.18.0 requires API 36)', () => {
      const customCompiler = new AndroidCompiler({ targetSdk: 34 });
      const composition = createComposition();
      const result = customCompiler.compile(composition);

      expect(result.buildGradle).toContain('compileSdk = 36');
      expect(result.buildGradle).toContain('targetSdk = 36');
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

      // SceneView emits one declarative node per object inside the Compose ARScene { }.
      expect(result.activityFile).toContain('TestCube');
      expect(result.activityFile).toContain('CubeNode');
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

      expect(result.activityFile).toContain('ColoredSphere');
      expect(result.activityFile).toContain('SphereNode');
      expect(result.activityFile).toContain('Color(0xFF00FF00)');
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

  describe('SceneView Support', () => {
    it('uses SceneView (Apache 2.0), not the EOL Sceneform fork', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result.buildGradle).toContain('io.github.sceneview:arsceneview');
      expect(result.buildGradle).not.toContain('sceneform');
    });

    it('emits a Compose ARScene activity (Filament renderer via SceneView)', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      expect(result.activityFile).toContain('ARScene');
      expect(result.activityFile).toContain('ComponentActivity');
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

    it('emits caller-supplied Android release identity', () => {
      const releaseCompiler = new AndroidCompiler({ versionCode: 1000, versionName: '0.1.0' });
      const result = releaseCompiler.compile(createComposition());

      expect(result.buildGradle).toContain('versionCode = 1000');
      expect(result.buildGradle).toContain('versionName = "0.1.0"');
    });

    it('includes the SceneView dependency (pulls ARCore + Filament transitively)', () => {
      const composition = createComposition();
      const result = compiler.compile(composition);

      // ARCore is no longer a direct dep — SceneView's arsceneview AAR brings it in.
      expect(result.buildGradle).toContain('io.github.sceneview:arsceneview');
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
    it('dissolves the Sceneform ViewModel — SceneView keeps state in the composable tree', () => {
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

      // No separate SceneState ViewModel file under the declarative ARScene model.
      expect(result.stateFile).toBe('');
      expect(result.nodeFactoryFile).toBe('');
      expect(result.activityFile).toContain('ARScene');
    });
  });

  describe('W4-T3 Wave-1 characterization (split gate)', () => {
    it('AndroidCompiler fingerprint for empty Wave1 gate composition', () => {
      const composition = createComposition({ name: 'Wave1SplitCharacterization' });
      const out = compiler.compile(composition);
      // Re-locked 2026-06-21: FULL Sceneform→SceneView retarget. activityFile is now a Compose
      // ComponentActivity hosting a declarative ARScene { }; stateFile + nodeFactoryFile are ''
      // (the ViewModel/NodeFactory dissolve under the declarative model); manifest gains
      // xmlns:tools + tools:replace; build.gradle.kts emits io.github.sceneview:arsceneview:4.18.0,
      // compileSdk 36, the compose-compiler plugin + compilerOptions DSL. Proven GREEN end-to-end:
      // golden-diff + real gradlew assembleDebug + live ARCore session on a Galaxy S23. Prior
      // (Sceneform) lock: 85ff47fd.
      expect(hashRecordStrings(out as unknown as Record<string, unknown>)).toBe(
        'ba9aa76b5a7c0e510e9cdea7c4fbcfd6d7465c22f09459cbfd2224fa9d1583df'
      );
    });
  });
});
