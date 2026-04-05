/**
 * IOSCompiler LiDAR Scanner Tests (M.010.02a)
 *
 * Verifies that the IOSCompiler emits correct Swift code for
 * LiDAR scanner traits (ARMeshAnchor, classification, sceneReconstruction, depthMap).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IOSCompiler } from './IOSCompiler';
import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';

describe('IOSCompiler — LiDAR Scanner', () => {
  let compiler: IOSCompiler;

  beforeEach(() => {
    compiler = new IOSCompiler();
  });

  function createComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
    return {
      type: 'Composition',
      name: 'TestLiDARScene',
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

  function createObject(name: string, traitNames: string[]): HoloObjectDecl {
    return {
      name,
      properties: [],
      traits: traitNames.map((t) => ({ name: t, args: [] })),
    } as unknown as HoloObjectDecl;
  }

  describe('lidarScannerFile presence', () => {
    it('should NOT emit lidarScannerFile when no lidar traits present', () => {
      const composition = createComposition({
        objects: [createObject('Cube', ['interactive'])],
      });
      const result = compiler.compile(composition);
      expect(result.lidarScannerFile).toBeUndefined();
    });

    it('should emit lidarScannerFile when lidar_scan trait is present', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_scan'])],
      });
      const result = compiler.compile(composition);
      expect(result.lidarScannerFile).toBeDefined();
      expect(typeof result.lidarScannerFile).toBe('string');
      expect(result.lidarScannerFile!.length).toBeGreaterThan(100);
    });

    it('should emit lidarScannerFile for any lidar_* trait', () => {
      const lidarTraits = [
        'lidar_scan',
        'lidar_mesh_capture',
        'lidar_realtime_mesh',
        'lidar_mesh_classification',
        'lidar_point_cloud',
        'lidar_mesh_simplify',
        'lidar_mesh_smooth',
        'lidar_mesh_to_holo',
        'lidar_mesh_export',
        'lidar_depth_map',
        'lidar_depth_confidence',
      ];
      for (const trait of lidarTraits) {
        const composition = createComposition({
          objects: [createObject('Scanner', [trait])],
        });
        const result = compiler.compile(composition);
        expect(result.lidarScannerFile).toBeDefined();
      }
    });
  });

  describe('Swift code structure', () => {
    it('should contain ARKit import', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_scan'])],
      });
      const result = compiler.compile(composition);
      expect(result.lidarScannerFile).toContain('import ARKit');
    });

    it('should contain SwiftUI import', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_scan'])],
      });
      const result = compiler.compile(composition);
      expect(result.lidarScannerFile).toContain('import SwiftUI');
    });

    it('should check supportsSceneReconstruction', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_scan'])],
      });
      const result = compiler.compile(composition);
      expect(result.lidarScannerFile).toContain(
        'supportsSceneReconstruction(.meshWithClassification)'
      );
    });

    it('should configure sceneReconstruction', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_scan'])],
      });
      const result = compiler.compile(composition);
      expect(result.lidarScannerFile).toContain(
        'config.sceneReconstruction = .meshWithClassification'
      );
    });

    it('should contain ARMeshAnchor processing', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_scan'])],
      });
      const result = compiler.compile(composition);
      expect(result.lidarScannerFile).toContain('ARMeshAnchor');
    });

    it('should contain LiDARHoloEntity struct', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_scan'])],
      });
      const result = compiler.compile(composition);
      expect(result.lidarScannerFile).toContain('struct LiDARHoloEntity');
    });

    it('should contain extractGeometry function', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_scan'])],
      });
      const result = compiler.compile(composition);
      expect(result.lidarScannerFile).toContain('func extractGeometry');
      expect(result.lidarScannerFile).toContain('ARMeshGeometry');
    });

    it('should contain LiDARManager class with custom class name', () => {
      const customCompiler = new IOSCompiler({ className: 'MyApp' });
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_scan'])],
      });
      const result = customCompiler.compile(composition);
      expect(result.lidarScannerFile).toContain('class MyAppLiDARManager');
    });

    it('should contain SwiftUI view', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_scan'])],
      });
      const result = compiler.compile(composition);
      expect(result.lidarScannerFile).toContain('LiDARScanView: View');
      expect(result.lidarScannerFile).toContain('LiDAR Scanner');
    });
  });

  describe('classification mapping', () => {
    it('should emit classification mapping for lidar_mesh_classification', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_mesh_classification'])],
      });
      const result = compiler.compile(composition);
      const swift = result.lidarScannerFile!;
      expect(swift).toContain('ARMeshClassification');
      expect(swift).toContain('holoLabel');
      expect(swift).toContain('.wall');
      expect(swift).toContain('.floor');
      expect(swift).toContain('.ceiling');
      expect(swift).toContain('.table');
      expect(swift).toContain('.seat');
      expect(swift).toContain('.window');
      expect(swift).toContain('.door');
    });

    it('should emit extractClassifications when classification trait present', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_mesh_classification'])],
      });
      const result = compiler.compile(composition);
      expect(result.lidarScannerFile).toContain('func extractClassifications');
    });

    it('should NOT emit extractClassifications when only lidar_scan', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_scan'])],
      });
      const result = compiler.compile(composition);
      expect(result.lidarScannerFile).not.toContain('func extractClassifications');
    });
  });

  describe('depth traits', () => {
    it('should access sceneDepth.depthMap for lidar_depth_map', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_depth_map'])],
      });
      const result = compiler.compile(composition);
      const swift = result.lidarScannerFile!;
      expect(swift).toContain('sceneDepth?.depthMap');
      expect(swift).toContain('CVPixelBuffer');
      expect(swift).toContain('.sceneDepth');
    });

    it('should access sceneDepth.confidenceMap for lidar_depth_confidence', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_depth_confidence'])],
      });
      const result = compiler.compile(composition);
      const swift = result.lidarScannerFile!;
      expect(swift).toContain('sceneDepth?.confidenceMap');
    });

    it('should enable sceneDepth frame semantics when depth traits present', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_depth_map'])],
      });
      const result = compiler.compile(composition);
      expect(result.lidarScannerFile).toContain('frameSemantics.insert(.sceneDepth)');
    });
  });

  describe('point cloud', () => {
    it('should access rawFeaturePoints for lidar_point_cloud', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_point_cloud'])],
      });
      const result = compiler.compile(composition);
      const swift = result.lidarScannerFile!;
      expect(swift).toContain('rawFeaturePoints');
      expect(swift).toContain('pointCloud');
    });
  });

  describe('realtime mesh', () => {
    it('should contain didUpdate anchors delegate for lidar_realtime_mesh', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_realtime_mesh'])],
      });
      const result = compiler.compile(composition);
      const swift = result.lidarScannerFile!;
      expect(swift).toContain('didUpdate anchors');
      expect(swift).toContain('didAdd anchors');
      expect(swift).toContain('processAnchors');
    });
  });

  describe('mesh-to-holo export', () => {
    it('should emit exportToHolo for lidar_mesh_to_holo', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_mesh_to_holo'])],
      });
      const result = compiler.compile(composition);
      const swift = result.lidarScannerFile!;
      expect(swift).toContain('func exportToHolo()');
      expect(swift).toContain('composition LiDARScan');
      expect(swift).toContain('.holo');
    });

    it('should NOT emit exportToHolo when only lidar_scan', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_scan'])],
      });
      const result = compiler.compile(composition);
      expect(result.lidarScannerFile).not.toContain('func exportToHolo');
    });
  });

  describe('mesh export (USDZ/OBJ)', () => {
    it('should emit MDLAsset export for lidar_mesh_export', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_mesh_export'])],
      });
      const result = compiler.compile(composition);
      const swift = result.lidarScannerFile!;
      expect(swift).toContain('import ModelIO');
      expect(swift).toContain('MDLAsset');
      expect(swift).toContain('exportMeshAsUSDZ');
      expect(swift).toContain('exportMeshAsOBJ');
    });
  });

  describe('mesh simplification', () => {
    it('should emit simplifyMesh for lidar_mesh_simplify', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_mesh_simplify'])],
      });
      const result = compiler.compile(composition);
      const swift = result.lidarScannerFile!;
      expect(swift).toContain('import ModelIO');
      expect(swift).toContain('func simplifyMesh');
      expect(swift).toContain('MDLMesh');
    });
  });

  describe('combined traits', () => {
    it('should handle all traits together without errors', () => {
      const composition = createComposition({
        objects: [
          createObject('FullScanner', [
            'lidar_scan',
            'lidar_mesh_capture',
            'lidar_realtime_mesh',
            'lidar_mesh_classification',
            'lidar_point_cloud',
            'lidar_mesh_simplify',
            'lidar_mesh_to_holo',
            'lidar_mesh_export',
            'lidar_depth_map',
            'lidar_depth_confidence',
          ]),
        ],
      });
      const result = compiler.compile(composition);
      const swift = result.lidarScannerFile!;

      // All key patterns should be present
      expect(swift).toContain('import ARKit');
      expect(swift).toContain('import ModelIO');
      expect(swift).toContain('supportsSceneReconstruction');
      expect(swift).toContain('ARMeshAnchor');
      expect(swift).toContain('extractClassifications');
      expect(swift).toContain('rawFeaturePoints');
      expect(swift).toContain('sceneDepth?.depthMap');
      expect(swift).toContain('sceneDepth?.confidenceMap');
      expect(swift).toContain('func exportToHolo');
      expect(swift).toContain('exportMeshAsUSDZ');
      expect(swift).toContain('func simplifyMesh');
      expect(swift).toContain('frameSemantics.insert(.sceneDepth)');
    });

    it('should still produce base files alongside lidarScannerFile', () => {
      const composition = createComposition({
        objects: [createObject('Scanner', ['lidar_scan'])],
      });
      const result = compiler.compile(composition);
      expect(result.viewFile).toBeDefined();
      expect(result.sceneFile).toBeDefined();
      expect(result.stateFile).toBeDefined();
      expect(result.infoPlist).toBeDefined();
      expect(result.lidarScannerFile).toBeDefined();
    });
  });
});
