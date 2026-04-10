/**
 * Unity Importer Tests
 *
 * Tests for importing Unity scene and prefab files into HoloScript.
 */

import { describe, it, expect } from 'vitest';
import { parseUnityYAML, buildSceneTree, generateHoloCode, importUnity } from './unity-importer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Unity Importer', () => {
  describe('parseUnityYAML', () => {
    it('should parse empty Unity YAML', () => {
      const content = '';
      const result = parseUnityYAML(content);
      expect(result.size).toBe(0);
    });

    it('should parse GameObject document', () => {
      const content = `
--- !u!1 &100000
GameObject:
  m_Name: TestObject
  m_IsActive: 1
  m_Component: []
`;
      const result = parseUnityYAML(content);
      expect(result.size).toBe(1);
      expect(result.has('100000')).toBe(true);
      expect(result.get('100000')?.type).toBe('GameObject');
    });

    it('should parse Transform document', () => {
      const content = `
--- !u!4 &400000
Transform:
  m_LocalPosition: {x: 1, y: 2, z: 3}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalScale: {x: 1, y: 1, z: 1}
`;
      const result = parseUnityYAML(content);
      expect(result.size).toBe(1);
      expect(result.has('400000')).toBe(true);
      expect(result.get('400000')?.type).toBe('Transform');
    });

    it('should parse multiple documents', () => {
      const content = `
--- !u!1 &100001
GameObject:
  m_Name: Object1
  m_IsActive: 1
  m_Component:
    - component: {fileID: 400001}

--- !u!4 &400001
Transform:
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalScale: {x: 1, y: 1, z: 1}

--- !u!1 &100002
GameObject:
  m_Name: Object2
  m_IsActive: 1
  m_Component:
    - component: {fileID: 400002}

--- !u!4 &400002
Transform:
  m_LocalPosition: {x: 5, y: 0, z: 5}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalScale: {x: 1, y: 1, z: 1}
`;
      const result = parseUnityYAML(content);
      expect(result.size).toBe(4);
    });

    it('should parse Light component', () => {
      const content = `
--- !u!108 &108000
Light:
  m_Type: 1
  m_Color: {r: 1, g: 0.9, b: 0.8, a: 1}
  m_Intensity: 1.5
  m_Range: 10
`;
      const result = parseUnityYAML(content);
      expect(result.size).toBe(1);
      expect(result.get('108000')?.type).toBe('Light');
    });

    it('should parse Rigidbody component', () => {
      const content = `
--- !u!54 &54000
Rigidbody:
  m_Mass: 2.5
  m_Drag: 0.1
  m_AngularDrag: 0.05
  m_UseGravity: 1
  m_IsKinematic: 0
`;
      const result = parseUnityYAML(content);
      expect(result.size).toBe(1);
      expect(result.get('54000')?.type).toBe('Rigidbody');
    });

    it('should parse BoxCollider component', () => {
      const content = `
--- !u!65 &65000
BoxCollider:
  m_IsTrigger: 0
  m_Size: {x: 1, y: 2, z: 3}
  m_Center: {x: 0, y: 0, z: 0}
`;
      const result = parseUnityYAML(content);
      expect(result.size).toBe(1);
      expect(result.get('65000')?.type).toBe('BoxCollider');
    });
  });

  describe('buildSceneTree', () => {
    it('should build scene from documents', () => {
      const content = `
--- !u!1 &100001
GameObject:
  m_Name: RootObject
  m_IsActive: 1
  m_Component:
    - component: {fileID: 400001}

--- !u!4 &400001
Transform:
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalScale: {x: 1, y: 1, z: 1}
`;
      const documents = parseUnityYAML(content);
      const scene = buildSceneTree(documents, 'TestScene');

      expect(scene.name).toBe('TestScene');
      expect(scene.gameObjects.length).toBeGreaterThan(0);
    });
  });

  describe('generateHoloCode', () => {
    it('should generate composition wrapper', () => {
      const content = `
--- !u!1 &100001
GameObject:
  m_Name: TestCube
  m_IsActive: 1
  m_Component:
    - component: {fileID: 400001}

--- !u!4 &400001
Transform:
  m_LocalPosition: {x: 1, y: 2, z: 3}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalScale: {x: 1, y: 1, z: 1}
`;
      const documents = parseUnityYAML(content);
      const scene = buildSceneTree(documents, 'TestScene');
      const { code, stats } = generateHoloCode(scene);

      expect(code).toContain('composition "TestScene"');
      expect(code).toContain('environment {');
      expect(stats.gameObjectsImported).toBeGreaterThanOrEqual(0);
    });

    it('should include position from transform', () => {
      const content = `
--- !u!1 &100001
GameObject:
  m_Name: PositionedObject
  m_IsActive: 1
  m_Component:
    - component: {fileID: 400001}

--- !u!4 &400001
Transform:
  m_LocalPosition: {x: 5, y: 10, z: 15}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalScale: {x: 1, y: 1, z: 1}
`;
      const documents = parseUnityYAML(content);
      const scene = buildSceneTree(documents, 'TestScene');
      const { code } = generateHoloCode(scene);

      expect(code).toContain('position: [5, 10, 15]');
    });

    it('should add physics trait for Rigidbody', () => {
      const content = `
--- !u!1 &100001
GameObject:
  m_Name: PhysicsObject
  m_IsActive: 1
  m_Component:
    - component: {fileID: 400001}
    - component: {fileID: 54001}

--- !u!4 &400001
Transform:
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalScale: {x: 1, y: 1, z: 1}

--- !u!54 &54001
Rigidbody:
  m_Mass: 1
  m_UseGravity: 1
  m_IsKinematic: 0
`;
      const documents = parseUnityYAML(content);
      const scene = buildSceneTree(documents, 'TestScene');
      const { code } = generateHoloCode(scene);

      expect(code).toContain('@physics');
    });

    it('should add collidable trait for BoxCollider', () => {
      const content = `
--- !u!1 &100001
GameObject:
  m_Name: CollidableObject
  m_IsActive: 1
  m_Component:
    - component: {fileID: 400001}
    - component: {fileID: 65001}

--- !u!4 &400001
Transform:
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalScale: {x: 1, y: 1, z: 1}

--- !u!65 &65001
BoxCollider:
  m_IsTrigger: 0
  m_Size: {x: 1, y: 1, z: 1}
`;
      const documents = parseUnityYAML(content);
      const scene = buildSceneTree(documents, 'TestScene');
      const { code } = generateHoloCode(scene);

      expect(code).toContain('@collidable');
    });

    it('should add trigger trait for trigger colliders', () => {
      const content = `
--- !u!1 &100001
GameObject:
  m_Name: TriggerObject
  m_IsActive: 1
  m_Component:
    - component: {fileID: 400001}
    - component: {fileID: 65001}

--- !u!4 &400001
Transform:
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalScale: {x: 1, y: 1, z: 1}

--- !u!65 &65001
BoxCollider:
  m_IsTrigger: 1
  m_Size: {x: 1, y: 1, z: 1}
`;
      const documents = parseUnityYAML(content);
      const scene = buildSceneTree(documents, 'TestScene');
      const { code } = generateHoloCode(scene);

      expect(code).toContain('@trigger');
    });

    it('should generate light nodes', () => {
      const content = `
--- !u!1 &100001
GameObject:
  m_Name: MainLight
  m_IsActive: 1
  m_Component:
    - component: {fileID: 400001}
    - component: {fileID: 108001}

--- !u!4 &400001
Transform:
  m_LocalPosition: {x: 0, y: 10, z: 0}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalScale: {x: 1, y: 1, z: 1}

--- !u!108 &108001
Light:
  m_Type: 1
  m_Color: {r: 1, g: 1, b: 1, a: 1}
  m_Intensity: 1.0
`;
      const documents = parseUnityYAML(content);
      const scene = buildSceneTree(documents, 'TestScene');
      const { code, stats } = generateHoloCode(scene);

      expect(code).toContain('directional_light');
      expect(stats.lightsImported).toBe(1);
    });

    it('should generate camera nodes', () => {
      const content = `
--- !u!1 &100001
GameObject:
  m_Name: MainCamera
  m_IsActive: 1
  m_Component:
    - component: {fileID: 400001}
    - component: {fileID: 20001}

--- !u!4 &400001
Transform:
  m_LocalPosition: {x: 0, y: 5, z: -10}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalScale: {x: 1, y: 1, z: 1}

--- !u!20 &20001
Camera:
  field_of_view: 60
  near_clip_plane: 0.3
  far_clip_plane: 1000
`;
      const documents = parseUnityYAML(content);
      const scene = buildSceneTree(documents, 'TestScene');
      const { code, stats } = generateHoloCode(scene);

      expect(code).toContain('perspective_camera');
      expect(stats.camerasImported).toBe(1);
    });
  });

  describe('importUnity', () => {
    it('should fail for non-existent file', async () => {
      const result = await importUnity({
        inputPath: '/non/existent/file.unity',
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail for unsupported file type', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unity-test-'));
      const tempFile = path.join(tempDir, 'test.txt');
      fs.writeFileSync(tempFile, 'test content');

      try {
        const result = await importUnity({
          inputPath: tempFile,
        });

        expect(result.success).toBe(false);
        expect(result.errors[0]).toContain('Unsupported file type');
      } finally {
        fs.unlinkSync(tempFile);
        fs.rmdirSync(tempDir);
      }
    });

    it('should import valid Unity scene', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unity-test-'));
      const tempFile = path.join(tempDir, 'test.unity');
      const content = `
--- !u!1 &100001
GameObject:
  m_Name: TestCube
  m_IsActive: 1
  m_Component:
    - component: {fileID: 400001}

--- !u!4 &400001
Transform:
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalScale: {x: 1, y: 1, z: 1}
`;
      fs.writeFileSync(tempFile, content);

      try {
        const result = await importUnity({
          inputPath: tempFile,
          sceneName: 'CustomSceneName',
        });

        expect(result.success).toBe(true);
        expect(result.sceneName).toBe('CustomSceneName');
        expect(result.holoCode).toContain('composition "CustomSceneName"');
      } finally {
        fs.unlinkSync(tempFile);
        fs.rmdirSync(tempDir);
      }
    });

    it('should write output file when outputPath specified', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unity-test-'));
      const inputFile = path.join(tempDir, 'test.unity');
      const outputFile = path.join(tempDir, 'output.holo');

      const content = `
--- !u!1 &100001
GameObject:
  m_Name: TestObject
  m_IsActive: 1
  m_Component:
    - component: {fileID: 400001}

--- !u!4 &400001
Transform:
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalScale: {x: 1, y: 1, z: 1}
`;
      fs.writeFileSync(inputFile, content);

      try {
        const result = await importUnity({
          inputPath: inputFile,
          outputPath: outputFile,
        });

        expect(result.success).toBe(true);
        expect(fs.existsSync(outputFile)).toBe(true);

        const outputContent = fs.readFileSync(outputFile, 'utf-8');
        expect(outputContent).toContain('composition');
      } finally {
        fs.unlinkSync(inputFile);
        if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
        fs.rmdirSync(tempDir);
      }
    });
  });
});
