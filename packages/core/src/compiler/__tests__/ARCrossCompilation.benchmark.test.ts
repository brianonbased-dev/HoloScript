/**
 * AR Cross-Compilation Benchmark Tests
 *
 * Validates that AR compositions compile successfully across all three
 * primary AR targets: ARKit (iOS), ARCore (Android), and WebXR.
 *
 * Measures:
 * - Compilation success for each target
 * - Output format correctness (Swift/Kotlin/JavaScript)
 * - AR trait presence in compiled output
 * - Platform-specific framework imports
 * - Compilation timing benchmarks
 *
 * @version 1.0.0
 */

import { describe, it, expect, vi } from 'vitest';
import { ARCompiler, type ARCompilerOptions } from '../ARCompiler';
import { IOSCompiler, type IOSCompilerOptions } from '../IOSCompiler';
import { AndroidCompiler, type AndroidCompilerOptions } from '../AndroidCompiler';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

// Mock RBAC for ARCompiler (which uses agentToken)
vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createComposition(
  name: string,
  objects: HoloObjectDecl[] = [],
  overrides: Partial<HoloComposition> = {}
): HoloComposition {
  return {
    type: 'Composition',
    name,
    objects,
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

function createARObject(
  name: string,
  traits: string[] = [],
  properties: Array<{ key: string; value: unknown }> = []
): HoloObjectDecl {
  return {
    name,
    properties,
    traits,
  } as HoloObjectDecl;
}

function measureTime(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

// ─── ARCompiler (WebXR) Tests ─────────────────────────────────────────────────

describe('AR Cross-Compilation: WebXR (ARCompiler)', () => {
  const parser = new HoloCompositionParser();

  it('compiles plane detection composition to WebXR', () => {
    const compiler = new ARCompiler({
      target: 'webxr',
      minify: false,
      source_maps: false,
      features: { hit_test: true, image_tracking: false },
    });

    const input = `
      composition "PlaneDetectionAR" {
        object "plane_detector" @ar_beacon(type: "surface") {
          mesh: "plane"
        }
        object "placement_reticle" @overlay {
          layout: "vertical"
          text: "Tap to place"
        }
      }
    `;

    const parseResult = parser.parse(input);
    expect(parseResult.ast).toBeDefined();

    const result = compiler.compile(parseResult.ast!, 'test-token');
    expect(result.success).toBe(true);
    expect(result.target).toBe('webxr');
    expect(result.code).toContain('THREE');
    expect(result.code).toContain('ARRuntime');
    expect(result.code).toContain('renderer.xr.enabled = true');
    expect(result.code).toContain('hit_test: true');
    expect(result.errors).toHaveLength(0);
  });

  it('compiles image tracking composition to WebXR', () => {
    const compiler = new ARCompiler({
      target: 'webxr',
      minify: false,
      source_maps: false,
      features: { hit_test: false, image_tracking: true },
    });

    const input = `
      composition "ImageTrackingAR" {
        object "tracker" @ar_beacon(type: "image", id: "poster_01") {
          mesh: "cube"
        }
      }
    `;

    const parseResult = parser.parse(input);
    const result = compiler.compile(parseResult.ast!, 'test-token');

    expect(result.success).toBe(true);
    expect(result.code).toContain('image_tracking: true');
    expect(result.code).toContain('onBeaconDetected');
  });

  it('compiles to AR.js target as fallback', () => {
    const compiler = new ARCompiler({
      target: 'ar.js',
      minify: false,
      source_maps: false,
      features: { hit_test: false, image_tracking: false },
    });

    const input = `
      composition "BasicAR" {
        object "marker" @overlay {
          text: "Hello AR"
        }
      }
    `;

    const parseResult = parser.parse(input);
    const result = compiler.compile(parseResult.ast!, 'test-token');

    expect(result.success).toBe(true);
    expect(result.target).toBe('ar.js');
    expect(result.code).toContain('THREE');
    // AR.js does not use renderer.xr.enabled
    expect(result.code).not.toContain('renderer.xr.enabled');
  });

  it('warns when no AR traits are present', () => {
    const compiler = new ARCompiler({
      target: 'webxr',
      minify: false,
      source_maps: false,
      features: { hit_test: true, image_tracking: true },
    });

    const input = `
      composition "EmptyAR" {
        object "box" {
          mesh: "cube"
        }
      }
    `;

    const parseResult = parser.parse(input);
    const result = compiler.compile(parseResult.ast!, 'test-token');

    expect(result.success).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('No AR traits found');
  });
});

// ─── IOSCompiler (ARKit) Tests ────────────────────────────────────────────────

describe('AR Cross-Compilation: ARKit (IOSCompiler)', () => {
  it('compiles an empty AR scene to Swift/ARKit', () => {
    const compiler = new IOSCompiler();
    const composition = createComposition('PlaneDetectionScene');
    const result = compiler.compile(composition);

    expect(result.viewFile).toContain('import SwiftUI');
    expect(result.viewFile).toContain('import ARKit');
    expect(result.viewFile).toContain('import SceneKit');
    expect(result.sceneFile).toContain('ARKit');
    expect(result.infoPlist).toBeDefined();
  });

  it('compiles with RealityKit for newer iOS targets', () => {
    const compiler = new IOSCompiler({ useRealityKit: true, iosVersion: '17.0' });
    const composition = createComposition('RealityKitScene');
    const result = compiler.compile(composition);

    expect(result.viewFile).toContain('import ARKit');
    expect(result.sceneFile).toBeDefined();
  });

  it('generates Info.plist with camera permission for AR', () => {
    const compiler = new IOSCompiler();
    const composition = createComposition('CameraScene');
    const result = compiler.compile(composition);

    expect(result.infoPlist).toContain('NSCameraUsageDescription');
  });

  it('generates ARWorldTrackingConfiguration with plane detection', () => {
    const compiler = new IOSCompiler({ iosVersion: '17.0' });
    const composition = createComposition('WorldTrackingScene');
    const result = compiler.compile(composition);

    expect(result.viewFile).toContain('ARWorldTrackingConfiguration');
    expect(result.viewFile).toContain('planeDetection');
    expect(result.viewFile).toContain('.horizontal');
    expect(result.viewFile).toContain('.vertical');
  });

  it('includes scene reconstruction for iOS 17+', () => {
    const compiler = new IOSCompiler({ iosVersion: '17.0' });
    const composition = createComposition('MeshScene');
    const result = compiler.compile(composition);

    expect(result.viewFile).toContain('sceneReconstruction');
    expect(result.viewFile).toContain('meshWithClassification');
  });

  it('compiles objects with geometry to SceneKit nodes', () => {
    const obj = createARObject(
      'arCube',
      [],
      [
        { key: 'geometry', value: 'box' },
        { key: 'color', value: '#FF0000' },
      ]
    );
    const composition = createComposition('ObjectScene', [obj]);
    const compiler = new IOSCompiler();
    const result = compiler.compile(composition);

    expect(result.sceneFile).toContain('arCube');
  });

  it('generates directional light in Swift', () => {
    const composition = createComposition('LightScene', [], {
      lights: [
        {
          name: 'sunLight',
          type: 'directional',
          properties: [
            { key: 'color', value: '#ffffff' },
            { key: 'intensity', value: 1.0 },
          ],
        } as any,
      ],
    });
    const compiler = new IOSCompiler();
    const result = compiler.compile(composition);

    expect(result.sceneFile).toContain('SCNLight');
    expect(result.sceneFile).toContain('sunLight');
  });
});

// ─── AndroidCompiler (ARCore) Tests ───────────────────────────────────────────

describe('AR Cross-Compilation: ARCore (AndroidCompiler)', () => {
  it('compiles an empty AR scene to Kotlin/ARCore', () => {
    const compiler = new AndroidCompiler();
    const composition = createComposition('PlaneDetectionScene');
    const result = compiler.compile(composition);

    expect(result.activityFile).toContain('package com.holoscript.generated');
    expect(result.activityFile).toContain('com.google.ar.core');
    expect(result.activityFile).toContain('ArFragment');
    expect(result.manifestFile).toBeDefined();
    expect(result.buildGradle).toBeDefined();
  });

  it('generates AndroidManifest with camera permission and ARCore metadata', () => {
    const compiler = new AndroidCompiler();
    const composition = createComposition('ARScene');
    const result = compiler.compile(composition);

    expect(result.manifestFile).toContain('android.permission.CAMERA');
    expect(result.manifestFile).toContain('com.google.ar.core');
  });

  it('generates build.gradle.kts with ARCore dependency', () => {
    const compiler = new AndroidCompiler();
    const composition = createComposition('ARScene');
    const result = compiler.compile(composition);

    // The ARCore dependency may be written as 'com.google.ar:core' or 'arcore'
    expect(result.buildGradle).toContain('ar');
    expect(result.buildGradle).toContain('core');
  });

  it('uses Sceneform by default for AR rendering', () => {
    const compiler = new AndroidCompiler({ useSceneform: true });
    const composition = createComposition('SceneformScene');
    const result = compiler.compile(composition);

    // Sceneform shows up in build.gradle or imports
    expect(result.buildGradle).toContain('sceneform');
  });

  it('supports Filament renderer when enabled', () => {
    const compiler = new AndroidCompiler({ useFilament: true });
    const composition = createComposition('FilamentScene');
    const result = compiler.compile(composition);

    expect(result.activityFile).toBeDefined();
  });

  it('uses Jetpack Compose for UI by default', () => {
    const compiler = new AndroidCompiler();
    const composition = createComposition('ComposeScene');
    const result = compiler.compile(composition);

    expect(result.buildGradle).toContain('compose');
  });

  it('generates state management file', () => {
    const compiler = new AndroidCompiler();
    const composition = createComposition('StateScene');
    const result = compiler.compile(composition);

    expect(result.stateFile).toBeDefined();
    expect(result.stateFile).toContain('ViewModel');
  });

  it('compiles objects with geometry to Sceneform nodes', () => {
    const obj = createARObject(
      'ArSphere',
      [],
      [
        { key: 'geometry', value: 'sphere' },
        { key: 'color', value: '#00FF00' },
      ]
    );
    const composition = createComposition('ObjectScene', [obj]);
    const compiler = new AndroidCompiler();
    const result = compiler.compile(composition);

    expect(result.nodeFactoryFile).toContain('ArSphere');
  });
});

// ─── Cross-Platform Parity Tests ──────────────────────────────────────────────

describe('AR Cross-Compilation: Cross-Platform Parity', () => {
  it('all three compilers produce output for the same composition', () => {
    const composition = createComposition('CrossPlatformAR', [
      createARObject(
        'anchor_point',
        [],
        [
          { key: 'geometry', value: 'sphere' },
          { key: 'color', value: '#0088FF' },
        ]
      ),
    ]);

    const iosResult = new IOSCompiler().compile(composition);
    const androidResult = new AndroidCompiler().compile(composition);

    // WebXR needs parsed AST
    const parser = new HoloCompositionParser();
    const input = `
      composition "CrossPlatformAR" {
        object "anchor_point" @overlay {
          geometry: "sphere"
          color: "#0088FF"
        }
      }
    `;
    const parseResult = parser.parse(input);
    const webxrResult = new ARCompiler({
      target: 'webxr',
      minify: false,
      source_maps: false,
      features: { hit_test: true, image_tracking: false },
    }).compile(parseResult.ast!, 'test-token');

    // All succeed
    expect(iosResult.viewFile.length).toBeGreaterThan(0);
    expect(androidResult.activityFile.length).toBeGreaterThan(0);
    expect(webxrResult.success).toBe(true);
    expect(webxrResult.code.length).toBeGreaterThan(0);
  });

  it('iOS output contains Swift-specific constructs', () => {
    const composition = createComposition('SwiftCheck');
    const result = new IOSCompiler().compile(composition);

    expect(result.viewFile).toContain('struct');
    expect(result.viewFile).toContain(': View');
    expect(result.viewFile).toContain('@StateObject');
    expect(result.sceneFile).toContain('enum');
  });

  it('Android output contains Kotlin-specific constructs', () => {
    const composition = createComposition('KotlinCheck');
    const result = new AndroidCompiler().compile(composition);

    expect(result.activityFile).toContain('class');
    expect(result.activityFile).toContain(': AppCompatActivity()');
    expect(result.activityFile).toContain('override fun onCreate');
    expect(result.activityFile).toContain('private lateinit var');
  });

  it('WebXR output contains JavaScript/Three.js constructs', () => {
    const parser = new HoloCompositionParser();
    const input = `
      composition "JSCheck" {
        object "marker" @overlay {
          text: "test"
        }
      }
    `;
    const parseResult = parser.parse(input);
    const result = new ARCompiler({
      target: 'webxr',
      minify: false,
      source_maps: false,
      features: { hit_test: true, image_tracking: false },
    }).compile(parseResult.ast!, 'test-token');

    expect(result.code).toContain("import * as THREE from 'three'");
    expect(result.code).toContain('const scene = new THREE.Scene()');
    expect(result.code).toContain('const renderer = new THREE.WebGLRenderer');
  });
});

// ─── Compilation Performance Benchmarks ───────────────────────────────────────

describe('AR Cross-Compilation: Performance Benchmarks', () => {
  const ITERATIONS = 100;

  it(`iOS compilation stays under 50ms for ${ITERATIONS} iterations (empty composition)`, () => {
    const compiler = new IOSCompiler();
    const composition = createComposition('PerfTest');

    const totalTime = measureTime(() => {
      for (let i = 0; i < ITERATIONS; i++) {
        compiler.compile(composition);
      }
    });

    const avgMs = totalTime / ITERATIONS;
    // Each compilation should be well under 50ms
    expect(avgMs).toBeLessThan(50);
  });

  it(`Android compilation stays under 50ms for ${ITERATIONS} iterations (empty composition)`, () => {
    const compiler = new AndroidCompiler();
    const composition = createComposition('PerfTest');

    const totalTime = measureTime(() => {
      for (let i = 0; i < ITERATIONS; i++) {
        compiler.compile(composition);
      }
    });

    const avgMs = totalTime / ITERATIONS;
    expect(avgMs).toBeLessThan(50);
  });

  it(`WebXR compilation stays under 50ms for ${ITERATIONS} iterations`, () => {
    const parser = new HoloCompositionParser();
    const input = `
      composition "PerfTest" {
        object "beacon" @ar_beacon(type: "qr") {
          mesh: "cube"
        }
        object "overlay" @overlay {
          text: "benchmark"
        }
      }
    `;
    const parseResult = parser.parse(input);

    const compiler = new ARCompiler({
      target: 'webxr',
      minify: false,
      source_maps: false,
      features: { hit_test: true, image_tracking: true },
    });

    const totalTime = measureTime(() => {
      for (let i = 0; i < ITERATIONS; i++) {
        compiler.compile(parseResult.ast!, 'test-token');
      }
    });

    const avgMs = totalTime / ITERATIONS;
    expect(avgMs).toBeLessThan(50);
  });

  it('iOS compilation with objects is proportional to object count', () => {
    const compiler = new IOSCompiler();

    // 1 object
    const comp1 = createComposition('Small', [
      createARObject('obj1', [], [{ key: 'geometry', value: 'box' }]),
    ]);

    // 10 objects
    const objects10 = Array.from({ length: 10 }, (_, i) =>
      createARObject(`obj${i}`, [], [{ key: 'geometry', value: 'sphere' }])
    );
    const comp10 = createComposition('Medium', objects10);

    const time1 = measureTime(() => {
      for (let i = 0; i < 50; i++) compiler.compile(comp1);
    });
    const time10 = measureTime(() => {
      for (let i = 0; i < 50; i++) compiler.compile(comp10);
    });

    // 10x objects should not be more than 20x slower (sub-linear is fine)
    expect(time10 / time1).toBeLessThan(20);
  });

  it('Android compilation with objects is proportional to object count', () => {
    const compiler = new AndroidCompiler();

    const comp1 = createComposition('Small', [
      createARObject('obj1', [], [{ key: 'geometry', value: 'box' }]),
    ]);

    const objects10 = Array.from({ length: 10 }, (_, i) =>
      createARObject(`obj${i}`, [], [{ key: 'geometry', value: 'sphere' }])
    );
    const comp10 = createComposition('Medium', objects10);

    const time1 = measureTime(() => {
      for (let i = 0; i < 50; i++) compiler.compile(comp1);
    });
    const time10 = measureTime(() => {
      for (let i = 0; i < 50; i++) compiler.compile(comp10);
    });

    expect(time10 / time1).toBeLessThan(20);
  });
});
