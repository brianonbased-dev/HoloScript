import { describe, it, expect } from 'vitest';
import {
  USDZPipeline,
  generateUSDA,
  getUSDZConversionCommand,
  getPythonConversionScript,
} from '../../compiler/USDZPipeline';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

describe('USDZPipeline', () => {
  const createBasicComposition = (): HoloComposition => ({
    name: 'TestScene',
    objects: [
      {
        name: 'Cube1',
        properties: [
          { key: 'mesh', value: 'cube' },
          { key: 'position', value: [0, 1, 0] },
          { key: 'color', value: '#ff0000' },
        ],
      },
    ],
  });

  describe('USDZPipeline class', () => {
    it('should create pipeline with default options', () => {
      const pipeline = new USDZPipeline();
      expect(pipeline).toBeDefined();
    });

    it('should create pipeline with custom options', () => {
      const pipeline = new USDZPipeline({
        upAxis: 'Z',
        metersPerUnit: 0.01,
        exportMaterials: false,
      });
      expect(pipeline).toBeDefined();
    });
  });

  describe('generateUSDA', () => {
    it('should generate valid USDA header', () => {
      const composition = createBasicComposition();
      const usda = generateUSDA(composition);

      expect(usda).toContain('#usda 1.0');
      expect(usda).toContain('defaultPrim = "TestScene"');
      expect(usda).toContain('upAxis = "Y"');
      expect(usda).toContain('metersPerUnit = 1');
    });

    it('should generate materials section', () => {
      const composition = createBasicComposition();
      const usda = generateUSDA(composition);

      expect(usda).toContain('# Materials');
      expect(usda).toContain('def Material');
      expect(usda).toContain('UsdPreviewSurface');
    });

    it('should convert hex colors to RGB', () => {
      const composition = createBasicComposition();
      const usda = generateUSDA(composition);

      // #ff0000 should be (1, 0, 0)
      expect(usda).toContain('diffuseColor = (1, 0, 0)');
    });

    it('should generate scene hierarchy', () => {
      const composition = createBasicComposition();
      const usda = generateUSDA(composition);

      expect(usda).toContain('# Scene Hierarchy');
      expect(usda).toContain('def Xform "TestScene"');
      expect(usda).toContain('kind = "assembly"');
    });

    it('should generate object transforms', () => {
      const composition = createBasicComposition();
      const usda = generateUSDA(composition);

      expect(usda).toContain('def Xform "Cube1"');
      expect(usda).toContain('xformOp:translate = (0, 1, 0)');
    });

    it('should generate cube geometry', () => {
      const composition = createBasicComposition();
      const usda = generateUSDA(composition);

      expect(usda).toContain('def Cube "Geometry"');
    });

    it('should generate sphere geometry', () => {
      const composition: HoloComposition = {
        name: 'SphereScene',
        objects: [
          {
            name: 'Ball',
            properties: [
              { key: 'mesh', value: 'sphere' },
              { key: 'radius', value: 0.5 },
            ],
          },
        ],
      };
      const usda = generateUSDA(composition);

      expect(usda).toContain('def Sphere "Geometry"');
      expect(usda).toContain('double radius = 0.5');
    });

    it('should generate cylinder geometry', () => {
      const composition: HoloComposition = {
        name: 'CylinderScene',
        objects: [
          {
            name: 'Pillar',
            properties: [
              { key: 'mesh', value: 'cylinder' },
              { key: 'radius', value: 0.3 },
              { key: 'size', value: [0.6, 2, 0.6] },
            ],
          },
        ],
      };
      const usda = generateUSDA(composition);

      expect(usda).toContain('def Cylinder "Geometry"');
      expect(usda).toContain('double height = 2');
      expect(usda).toContain('double radius = 0.3');
    });

    it('should generate plane geometry', () => {
      const composition: HoloComposition = {
        name: 'PlaneScene',
        objects: [
          {
            name: 'Floor',
            properties: [
              { key: 'mesh', value: 'plane' },
              { key: 'size', value: 10 },
            ],
          },
        ],
      };
      const usda = generateUSDA(composition);

      expect(usda).toContain('def Mesh "Geometry"');
      expect(usda).toContain('faceVertexCounts = [4]');
      expect(usda).toContain('point3f[] points');
    });

    it('should handle nested objects', () => {
      const composition: HoloComposition = {
        name: 'NestedScene',
        objects: [
          {
            name: 'Parent',
            properties: [{ key: 'mesh', value: 'cube' }],
            children: [
              {
                name: 'Child',
                properties: [
                  { key: 'mesh', value: 'sphere' },
                  { key: 'position', value: [1, 0, 0] },
                ],
              },
            ],
          },
        ],
      };
      const usda = generateUSDA(composition);

      expect(usda).toContain('def Xform "Parent"');
      expect(usda).toContain('def Xform "Child"');
    });

    it('should handle spatial groups', () => {
      const composition: HoloComposition = {
        name: 'GroupedScene',
        spatialGroups: [
          {
            name: 'Furniture',
            properties: [{ key: 'position', value: [5, 0, 0] }],
            objects: [
              {
                name: 'Table',
                properties: [{ key: 'mesh', value: 'cube' }],
              },
            ],
          },
        ],
      };
      const usda = generateUSDA(composition);

      expect(usda).toContain('def Xform "Furniture"');
      expect(usda).toContain('xformOp:translate = (5, 0, 0)');
      expect(usda).toContain('def Xform "Table"');
    });

    it('should handle material with metallic and roughness', () => {
      const composition: HoloComposition = {
        name: 'MetalScene',
        objects: [
          {
            name: 'MetalBall',
            properties: [
              { key: 'mesh', value: 'sphere' },
              {
                key: 'material',
                value: {
                  color: '#888888',
                  metalness: 1.0,
                  roughness: 0.2,
                },
              },
            ],
          },
        ],
      };
      const usda = generateUSDA(composition);

      expect(usda).toContain('float inputs:metallic = 1');
      expect(usda).toContain('float inputs:roughness = 0.2');
    });

    it('should handle surface presets', () => {
      const composition: HoloComposition = {
        name: 'PresetScene',
        objects: [
          {
            name: 'GlassPane',
            properties: [
              { key: 'mesh', value: 'cube' },
              { key: 'surface', value: 'glass' },
            ],
          },
        ],
      };
      const usda = generateUSDA(composition);

      expect(usda).toContain('float inputs:opacity');
      expect(usda).toContain('float inputs:ior');
    });

    it('should handle rotation transform', () => {
      const composition: HoloComposition = {
        name: 'RotatedScene',
        objects: [
          {
            name: 'RotatedCube',
            properties: [
              { key: 'mesh', value: 'cube' },
              { key: 'rotation', value: [45, 0, 90] },
            ],
          },
        ],
      };
      const usda = generateUSDA(composition);

      expect(usda).toContain('xformOp:rotateXYZ = (45, 0, 90)');
    });

    it('should handle scale transform', () => {
      const composition: HoloComposition = {
        name: 'ScaledScene',
        objects: [
          {
            name: 'BigCube',
            properties: [
              { key: 'mesh', value: 'cube' },
              { key: 'scale', value: [2, 3, 1] },
            ],
          },
        ],
      };
      const usda = generateUSDA(composition);

      expect(usda).toContain('xformOp:scale = (2, 3, 1)');
    });

    it('should handle uniform scale', () => {
      const composition: HoloComposition = {
        name: 'UniformScaleScene',
        objects: [
          {
            name: 'ScaledSphere',
            properties: [
              { key: 'mesh', value: 'sphere' },
              { key: 'scale', value: 2.5 },
            ],
          },
        ],
      };
      const usda = generateUSDA(composition);

      expect(usda).toContain('xformOp:scale = (2.5, 2.5, 2.5)');
    });

    it('should handle model references', () => {
      const composition: HoloComposition = {
        name: 'ModelScene',
        objects: [
          {
            name: 'Character',
            properties: [{ key: 'model', value: 'models/robot.glb' }],
          },
        ],
      };
      const usda = generateUSDA(composition);

      expect(usda).toContain('External model reference: models/robot.glb');
    });

    it('should skip materials when exportMaterials is false', () => {
      const composition = createBasicComposition();
      const usda = generateUSDA(composition, { exportMaterials: false });

      expect(usda).not.toContain('def Material');
    });

    it('should use Z up axis when configured', () => {
      const composition = createBasicComposition();
      const usda = generateUSDA(composition, { upAxis: 'Z' });

      expect(usda).toContain('upAxis = "Z"');
    });
  });

  describe('Conversion Helpers', () => {
    it('should generate xcrun conversion command', () => {
      const cmd = getUSDZConversionCommand('scene.usda', 'scene.usdz');

      expect(cmd).toContain('xcrun usdz_converter');
      expect(cmd).toContain('scene.usda');
      expect(cmd).toContain('scene.usdz');
    });

    it('should generate Python conversion script', () => {
      const script = getPythonConversionScript('scene.usda', 'scene.usdz');

      expect(script).toContain('#!/usr/bin/env python3');
      expect(script).toContain('from pxr import');
      expect(script).toContain('CreateNewUsdzPackage');
      expect(script).toContain('scene.usda');
      expect(script).toContain('scene.usdz');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty composition', () => {
      const composition: HoloComposition = {
        name: 'EmptyScene',
      };
      const usda = generateUSDA(composition);

      expect(usda).toContain('#usda 1.0');
      expect(usda).toContain('def Xform "EmptyScene"');
    });

    it('should sanitize names with special characters', () => {
      const composition: HoloComposition = {
        name: 'My Scene!',
        objects: [
          {
            name: 'Object #1',
            properties: [{ key: 'mesh', value: 'cube' }],
          },
        ],
      };
      const usda = generateUSDA(composition);

      expect(usda).toContain('def Xform "My_Scene_"');
      expect(usda).toContain('def Xform "Object__1"');
    });

    it('should sanitize names starting with numbers', () => {
      const composition: HoloComposition = {
        name: '3DScene',
        objects: [
          {
            name: '123Object',
            properties: [{ key: 'mesh', value: 'cube' }],
          },
        ],
      };
      const usda = generateUSDA(composition);

      expect(usda).toContain('def Xform "_3DScene"');
      expect(usda).toContain('def Xform "_123Object"');
    });

    it('should handle object without mesh property', () => {
      const composition: HoloComposition = {
        name: 'DefaultScene',
        objects: [
          {
            name: 'EmptyObject',
            properties: [{ key: 'position', value: [0, 0, 0] }],
          },
        ],
      };
      const usda = generateUSDA(composition);

      // Should default to cube
      expect(usda).toContain('def Cube "Geometry"');
    });
  });
});
