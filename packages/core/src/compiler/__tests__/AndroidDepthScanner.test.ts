/**
 * AndroidCompiler Depth Scanner Tests (M.010.02b)
 *
 * Verifies that the AndroidCompiler emits correct Kotlin code
 * for depth scanning traits: ARCore depth, ToF, stereo, mesh
 * generation, .holo conversion, realtime streaming, and export.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AndroidCompiler } from '../AndroidCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

function createComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    type: 'Composition',
    name: 'DepthScanScene',
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

function createObject(
  name: string,
  traits: Array<string | { name: string; config?: Record<string, unknown> }> = []
): HoloObjectDecl {
  return {
    name,
    properties: [],
    traits,
  } as HoloObjectDecl;
}

describe('AndroidCompiler — Depth Scanner (M.010.02b)', () => {
  let compiler: AndroidCompiler;

  beforeEach(() => {
    compiler = new AndroidCompiler();
  });

  describe('hasDepthScanTraits detection', () => {
    it('should NOT emit depth scanner code when no depth traits present', () => {
      const composition = createComposition({
        objects: [createObject('Cube')],
      });
      const result = compiler.compile(composition);
      expect(result.activityFile).not.toContain('setupDepthScanner');
      expect(result.activityFile).not.toContain('DepthMode.AUTOMATIC');
    });

    it('should emit depth scanner code when depth_scan trait is present', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['depth_scan'])],
      });
      const result = compiler.compile(composition);
      expect(result.activityFile).toContain('setupDepthScanner()');
      expect(result.activityFile).toContain('Config.DepthMode.AUTOMATIC');
    });

    it('should detect any DEPTH_SCANNER_TRAITS member', () => {
      for (const trait of [
        'depth_scan',
        'depth_ml_arcore',
        'depth_tof',
        'depth_stereo',
        'depth_auto_select',
        'depth_confidence_map',
        'depth_mesh_generate',
        'depth_mesh_to_holo',
        'depth_realtime',
        'depth_export',
      ]) {
        const composition = createComposition({
          objects: [createObject('Obj', [trait])],
        });
        const result = compiler.compile(composition);
        expect(result.activityFile).toContain('setupDepthScanner()');
      }
    });
  });

  describe('ARCore depth session config', () => {
    it('should configure ARCore DepthMode.AUTOMATIC', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['depth_scan'])],
      });
      const result = compiler.compile(composition);
      expect(result.activityFile).toContain('config.depthMode = Config.DepthMode.AUTOMATIC');
      expect(result.activityFile).toContain('session.configure(config)');
    });

    it('should emit default depth config values', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['depth_scan'])],
      });
      const result = compiler.compile(composition);
      expect(result.activityFile).toContain('depthConfidenceThreshold = 128');
      expect(result.activityFile).toContain('depthMaxMeters = 5f');
      expect(result.activityFile).toContain('depthMeshDecimation = 0.5f');
    });
  });

  describe('depth_ml_arcore — ARCore ML depth', () => {
    it('should emit acquireDepthImage16Bits for ARCore ML depth', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['depth_ml_arcore'])],
      });
      const result = compiler.compile(composition);
      expect(result.activityFile).toContain('frame.acquireDepthImage16Bits()');
      expect(result.activityFile).toContain('ARCore ML depth');
    });
  });

  describe('depth_confidence_map', () => {
    it('should emit acquireRawDepthConfidenceImage', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['depth_confidence_map'])],
      });
      const result = compiler.compile(composition);
      expect(result.activityFile).toContain('frame.acquireRawDepthConfidenceImage()');
      expect(result.activityFile).toContain('depthConfidenceImage');
    });
  });

  describe('depth_auto_select — runtime source detection', () => {
    it('should emit ToF sensor check', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['depth_auto_select'])],
      });
      const result = compiler.compile(composition);
      expect(result.activityFile).toContain(
        'packageManager.hasSystemFeature("android.hardware.sensor.proximity")'
      );
    });

    it('should emit ARCore depth support check', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['depth_auto_select'])],
      });
      const result = compiler.compile(composition);
      expect(result.activityFile).toContain(
        'session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)'
      );
    });

    it('should emit dual camera stereo check', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['depth_auto_select'])],
      });
      const result = compiler.compile(composition);
      expect(result.activityFile).toContain('cameraManager');
      expect(result.activityFile).toContain('cameraIdList');
      expect(result.activityFile).toContain('>= 2');
    });

    it('should emit priority: ToF > ARCore ML > Stereo', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['depth_auto_select'])],
      });
      const result = compiler.compile(composition);
      expect(result.activityFile).toContain('hasToF -> "ToF"');
      expect(result.activityFile).toContain('hasARCoreDepth -> "ARCore_ML"');
      expect(result.activityFile).toContain('hasStereo -> "Stereo"');
    });

    it('should emit detectDepthSource call in setupDepthScanner', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['depth_auto_select'])],
      });
      const result = compiler.compile(composition);
      expect(result.activityFile).toContain('detectDepthSource()');
    });
  });

  describe('depth_mesh_generate — triangle mesh from depth', () => {
    it('should emit generateMeshFromDepth function', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['depth_mesh_generate'])],
      });
      const result = compiler.compile(composition);
      expect(result.activityFile).toContain('fun generateMeshFromDepth');
      expect(result.activityFile).toContain('mutableListOf<Vector3>()');
      expect(result.activityFile).toContain('mutableListOf<Int>()');
    });

    it('should emit depth pixel to 3D point unprojection', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['depth_mesh_generate'])],
      });
      const result = compiler.compile(composition);
      expect(result.activityFile).toContain('depthMm / 1000.0f');
      expect(result.activityFile).toContain('vertices.add(Vector3(');
    });

    it('should emit triangulation of adjacent points', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['depth_mesh_generate'])],
      });
      const result = compiler.compile(composition);
      expect(result.activityFile).toContain('indices.add(i)');
      expect(result.activityFile).toContain('indices.add(i + cols)');
    });
  });

  describe('depth_mesh_to_holo — .holo conversion', () => {
    it('should emit convertMeshToHolo function', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['depth_mesh_to_holo'])],
      });
      const result = compiler.compile(composition);
      expect(result.activityFile).toContain('fun convertMeshToHolo');
      expect(result.activityFile).toContain('holoEntities');
      expect(result.activityFile).toContain('"DepthPoint"');
    });

    it('should call convertMeshToHolo from generateMeshFromDepth when both present', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['depth_mesh_generate', 'depth_mesh_to_holo'])],
      });
      const result = compiler.compile(composition);
      expect(result.activityFile).toContain('convertMeshToHolo(vertices, indices)');
    });
  });

  describe('depth_realtime — continuous frame processing', () => {
    it('should emit render loop depth processing', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['depth_realtime'])],
      });
      const result = compiler.compile(composition);
      expect(result.activityFile).toContain('addOnUpdateListener');
      expect(result.activityFile).toContain('processDepthFrame(frame)');
    });
  });

  describe('depth_export — OBJ/GLB export', () => {
    it('should emit exportDepthMesh function', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['depth_export'])],
      });
      const result = compiler.compile(composition);
      expect(result.activityFile).toContain('fun exportDepthMesh');
      expect(result.activityFile).toContain('depth_scan_${System.currentTimeMillis()}');
    });

    it('should emit OBJ format writing', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['depth_export'])],
      });
      const result = compiler.compile(composition);
      expect(result.activityFile).toContain('appendLine("v ${v.x} ${v.y} ${v.z}")');
      expect(result.activityFile).toContain('appendLine("f ');
    });

    it('should default export format to glb', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['depth_export'])],
      });
      const result = compiler.compile(composition);
      expect(result.activityFile).toContain('val format = "glb"');
    });
  });

  describe('build.gradle depth dependencies', () => {
    it('should add ARCore depth dependency when depth traits present', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['depth_scan'])],
      });
      const result = compiler.compile(composition);
      expect(result.buildGradle).toContain("implementation 'com.google.ar:core:1.40.0'");
    });

    it('should NOT add depth dependency when no depth traits', () => {
      const composition = createComposition({
        objects: [createObject('Cube')],
      });
      const result = compiler.compile(composition);
      // The base ARCore dep (1.41.0) is always present, but the depth-specific 1.40.0 should not be
      expect(result.buildGradle).not.toContain('ARCore Depth API (M.010.02b)');
    });
  });

  describe('combined depth traits', () => {
    it('should emit all depth features when all traits present', () => {
      const composition = createComposition({
        objects: [
          createObject('FullScanner', [
            'depth_scan',
            'depth_auto_select',
            'depth_ml_arcore',
            'depth_confidence_map',
            'depth_mesh_generate',
            'depth_mesh_to_holo',
            'depth_realtime',
            'depth_export',
          ]),
        ],
      });
      const result = compiler.compile(composition);

      // Session config
      expect(result.activityFile).toContain('Config.DepthMode.AUTOMATIC');

      // Auto-select
      expect(result.activityFile).toContain('detectDepthSource()');
      expect(result.activityFile).toContain('hasToF -> "ToF"');

      // ML ARCore
      expect(result.activityFile).toContain('ARCore ML depth');

      // Confidence
      expect(result.activityFile).toContain('acquireRawDepthConfidenceImage()');

      // Mesh generation
      expect(result.activityFile).toContain('generateMeshFromDepth');

      // Mesh to holo
      expect(result.activityFile).toContain('convertMeshToHolo');

      // Realtime
      expect(result.activityFile).toContain('addOnUpdateListener');

      // Export
      expect(result.activityFile).toContain('exportDepthMesh');

      // Gradle
      expect(result.buildGradle).toContain('com.google.ar:core:1.40.0');
    });
  });
});
