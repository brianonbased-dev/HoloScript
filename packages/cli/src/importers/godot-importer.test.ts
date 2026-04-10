/**
 * Godot Importer Tests
 *
 * Tests for importing Godot .tscn scene files into HoloScript.
 */

import { describe, it, expect } from 'vitest';
import { parseGodotScene, buildNodeTree, generateHoloCode, importGodot } from './godot-importer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Godot Importer', () => {
  describe('parseGodotScene', () => {
    it('should parse empty scene', () => {
      const content = '[gd_scene format=3]';
      const result = parseGodotScene(content);
      expect(result.header.format).toBe(3);
      expect(result.nodes.length).toBe(0);
    });

    it('should parse scene header', () => {
      const content = `[gd_scene load_steps=5 format=3 uid="uid://abc123"]`;
      const result = parseGodotScene(content);
      expect(result.header.format).toBe(3);
      expect(result.header.loadSteps).toBe(5);
    });

    it('should parse external resources', () => {
      const content = `
[gd_scene format=3]
[ext_resource type="Material" path="res://materials/ground.tres" id="1"]
[ext_resource type="PackedScene" path="res://scenes/player.tscn" id="2"]
`;
      const result = parseGodotScene(content);
      expect(result.extResources.size).toBe(2);
      expect(result.extResources.get('1')?.type).toBe('Material');
      expect(result.extResources.get('2')?.path).toBe('res://scenes/player.tscn');
    });

    it('should parse sub-resources', () => {
      const content = `
[gd_scene format=3]
[sub_resource type="BoxMesh" id="SubResource_box1"]
size = Vector3(2, 2, 2)

[sub_resource type="StandardMaterial3D" id="SubResource_mat1"]
albedo_color = Color(1, 0, 0, 1)
`;
      const result = parseGodotScene(content);
      expect(result.subResources.size).toBe(2);
      expect(result.subResources.get('SubResource_box1')?.type).toBe('BoxMesh');
      expect(result.subResources.get('SubResource_mat1')?.type).toBe('StandardMaterial3D');
    });

    it('should parse root node', () => {
      const content = `
[gd_scene format=3]
[node name="Level" type="Node3D"]
`;
      const result = parseGodotScene(content);
      expect(result.nodes.length).toBe(1);
      expect(result.nodes[0].name).toBe('Level');
      expect(result.nodes[0].type).toBe('Node3D');
    });

    it('should parse child nodes', () => {
      const content = `
[gd_scene format=3]
[node name="Level" type="Node3D"]
[node name="Ground" type="MeshInstance3D" parent="."]
[node name="Player" type="CharacterBody3D" parent="."]
`;
      const result = parseGodotScene(content);
      expect(result.nodes.length).toBe(3);
      expect(result.nodes[1].parent).toBe('.');
      expect(result.nodes[2].parent).toBe('.');
    });

    it('should parse nested nodes', () => {
      const content = `
[gd_scene format=3]
[node name="Level" type="Node3D"]
[node name="Enemies" type="Node3D" parent="."]
[node name="Enemy1" type="CharacterBody3D" parent="Enemies"]
[node name="Enemy2" type="CharacterBody3D" parent="Enemies"]
`;
      const result = parseGodotScene(content);
      expect(result.nodes.length).toBe(4);
      expect(result.nodes[2].parent).toBe('Enemies');
    });

    it('should parse Vector3 properties', () => {
      const content = `
[gd_scene format=3]
[node name="Object" type="Node3D"]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 5, 10, 15)
`;
      const result = parseGodotScene(content);
      expect(result.nodes[0].properties.transform).toBeDefined();
      const transform = result.nodes[0].properties.transform as {
        origin: { x: number; y: number; z: number };
      };
      expect(transform.origin.x).toBe(5);
      expect(transform.origin.y).toBe(10);
      expect(transform.origin.z).toBe(15);
    });

    it('should parse Color properties', () => {
      const content = `
[gd_scene format=3]
[sub_resource type="StandardMaterial3D" id="mat1"]
albedo_color = Color(0.5, 0.7, 0.9, 1)
`;
      const result = parseGodotScene(content);
      const mat = result.subResources.get('mat1');
      expect(mat).toBeDefined();
      const color = mat?.properties.albedo_color as { r: number; g: number; b: number };
      expect(color.r).toBeCloseTo(0.5);
      expect(color.g).toBeCloseTo(0.7);
      expect(color.b).toBeCloseTo(0.9);
    });

    it('should parse resource references', () => {
      const content = `
[gd_scene format=3]
[node name="Mesh" type="MeshInstance3D"]
mesh = SubResource("SubResource_box1")
`;
      const result = parseGodotScene(content);
      const meshRef = result.nodes[0].properties.mesh as { resourceRef: string };
      expect(meshRef.resourceRef).toBe('SubResource_box1');
    });

    it('should parse CSGBox3D', () => {
      const content = `
[gd_scene format=3]
[node name="Box" type="CSGBox3D"]
size = Vector3(2, 3, 4)
`;
      const result = parseGodotScene(content);
      expect(result.nodes[0].type).toBe('CSGBox3D');
    });

    it('should parse RigidBody3D', () => {
      const content = `
[gd_scene format=3]
[node name="Ball" type="RigidBody3D"]
mass = 2.5
`;
      const result = parseGodotScene(content);
      expect(result.nodes[0].type).toBe('RigidBody3D');
      expect(result.nodes[0].properties.mass).toBe(2.5);
    });

    it('should parse DirectionalLight3D', () => {
      const content = `
[gd_scene format=3]
[node name="Sun" type="DirectionalLight3D"]
light_color = Color(1, 0.95, 0.9, 1)
light_energy = 1.5
`;
      const result = parseGodotScene(content);
      expect(result.nodes[0].type).toBe('DirectionalLight3D');
      expect(result.nodes[0].properties.light_energy).toBe(1.5);
    });

    it('should parse Camera3D', () => {
      const content = `
[gd_scene format=3]
[node name="Camera" type="Camera3D"]
fov = 75
near = 0.1
far = 1000
`;
      const result = parseGodotScene(content);
      expect(result.nodes[0].type).toBe('Camera3D');
      expect(result.nodes[0].properties.fov).toBe(75);
    });
  });

  describe('buildNodeTree', () => {
    it('should build tree with root nodes', () => {
      const content = `
[gd_scene format=3]
[node name="Level" type="Node3D"]
[node name="Ground" type="MeshInstance3D" parent="."]
`;
      const scene = parseGodotScene(content);
      const tree = buildNodeTree(scene.nodes);

      expect(tree.length).toBe(1);
      expect(tree[0].node.name).toBe('Level');
      expect(tree[0].children.length).toBe(1);
      expect(tree[0].children[0].node.name).toBe('Ground');
    });

    it('should handle deeply nested nodes', () => {
      const content = `
[gd_scene format=3]
[node name="Level" type="Node3D"]
[node name="Enemies" type="Node3D" parent="."]
[node name="Enemy1" type="CharacterBody3D" parent="Enemies"]
`;
      const scene = parseGodotScene(content);
      const tree = buildNodeTree(scene.nodes);

      expect(tree[0].children[0].children[0].node.name).toBe('Enemy1');
    });
  });

  describe('generateHoloCode', () => {
    it('should generate composition wrapper', () => {
      const content = `
[gd_scene format=3]
[node name="TestLevel" type="Node3D"]
`;
      const scene = parseGodotScene(content);
      const { code } = generateHoloCode(scene, 'TestLevel');

      expect(code).toContain('composition "TestLevel"');
      expect(code).toContain('environment {');
    });

    it('should convert CSGBox3D to cube', () => {
      const content = `
[gd_scene format=3]
[node name="Level" type="Node3D"]
[node name="Box" type="CSGBox3D" parent="."]
`;
      const scene = parseGodotScene(content);
      const { code, stats } = generateHoloCode(scene, 'TestLevel');

      expect(code).toContain('geometry: "cube"');
      expect(stats.meshesImported).toBe(1);
    });

    it('should convert CSGSphere3D to sphere', () => {
      const content = `
[gd_scene format=3]
[node name="Level" type="Node3D"]
[node name="Ball" type="CSGSphere3D" parent="."]
`;
      const scene = parseGodotScene(content);
      const { code } = generateHoloCode(scene, 'TestLevel');

      expect(code).toContain('geometry: "sphere"');
    });

    it('should add physics trait for RigidBody3D', () => {
      const content = `
[gd_scene format=3]
[node name="Level" type="Node3D"]
[node name="Ball" type="RigidBody3D" parent="."]
`;
      const scene = parseGodotScene(content);
      const { code, stats } = generateHoloCode(scene, 'TestLevel');

      expect(code).toContain('@physics');
      expect(stats.traitsGenerated).toBeGreaterThan(0);
    });

    it('should add collidable trait for StaticBody3D', () => {
      const content = `
[gd_scene format=3]
[node name="Level" type="Node3D"]
[node name="Ground" type="StaticBody3D" parent="."]
`;
      const scene = parseGodotScene(content);
      const { code } = generateHoloCode(scene, 'TestLevel');

      expect(code).toContain('@collidable');
    });

    it('should add trigger trait for Area3D', () => {
      const content = `
[gd_scene format=3]
[node name="Level" type="Node3D"]
[node name="TriggerZone" type="Area3D" parent="."]
`;
      const scene = parseGodotScene(content);
      const { code } = generateHoloCode(scene, 'TestLevel');

      expect(code).toContain('@trigger');
    });

    it('should generate directional light', () => {
      const content = `
[gd_scene format=3]
[node name="Level" type="Node3D"]
[node name="Sun" type="DirectionalLight3D" parent="."]
light_energy = 1.2
`;
      const scene = parseGodotScene(content);
      const { code, stats } = generateHoloCode(scene, 'TestLevel');

      expect(code).toContain('directional_light');
      expect(stats.lightsImported).toBe(1);
    });

    it('should generate point light', () => {
      const content = `
[gd_scene format=3]
[node name="Level" type="Node3D"]
[node name="Lamp" type="OmniLight3D" parent="."]
`;
      const scene = parseGodotScene(content);
      const { code } = generateHoloCode(scene, 'TestLevel');

      expect(code).toContain('point_light');
    });

    it('should generate camera', () => {
      const content = `
[gd_scene format=3]
[node name="Level" type="Node3D"]
[node name="MainCamera" type="Camera3D" parent="."]
fov = 60
`;
      const scene = parseGodotScene(content);
      const { code, stats } = generateHoloCode(scene, 'TestLevel');

      expect(code).toContain('perspective_camera');
      expect(stats.camerasImported).toBe(1);
    });

    it('should include position from transform', () => {
      const content = `
[gd_scene format=3]
[node name="Level" type="Node3D"]
[node name="Object" type="MeshInstance3D" parent="."]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 5, 10, 15)
`;
      const scene = parseGodotScene(content);
      const { code } = generateHoloCode(scene, 'TestLevel');

      expect(code).toContain('position: [5, 10, 15]');
    });
  });

  describe('importGodot', () => {
    it('should fail for non-existent file', async () => {
      const result = await importGodot({
        inputPath: '/non/existent/file.tscn',
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail for unsupported file type', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'godot-test-'));
      const tempFile = path.join(tempDir, 'test.txt');
      fs.writeFileSync(tempFile, 'test content');

      try {
        const result = await importGodot({
          inputPath: tempFile,
        });

        expect(result.success).toBe(false);
        expect(result.errors[0]).toContain('Unsupported file type');
      } finally {
        fs.unlinkSync(tempFile);
        fs.rmdirSync(tempDir);
      }
    });

    it('should import valid Godot scene', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'godot-test-'));
      const tempFile = path.join(tempDir, 'test.tscn');
      const content = `
[gd_scene format=3]
[node name="Level" type="Node3D"]
[node name="Box" type="CSGBox3D" parent="."]
`;
      fs.writeFileSync(tempFile, content);

      try {
        const result = await importGodot({
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
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'godot-test-'));
      const inputFile = path.join(tempDir, 'test.tscn');
      const outputFile = path.join(tempDir, 'output.holo');

      const content = `
[gd_scene format=3]
[node name="Level" type="Node3D"]
[node name="Cube" type="CSGBox3D" parent="."]
`;
      fs.writeFileSync(inputFile, content);

      try {
        const result = await importGodot({
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

    it('should use filename as scene name by default', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'godot-test-'));
      const tempFile = path.join(tempDir, 'MyLevel.tscn');
      const content = `
[gd_scene format=3]
[node name="Level" type="Node3D"]
`;
      fs.writeFileSync(tempFile, content);

      try {
        const result = await importGodot({
          inputPath: tempFile,
        });

        expect(result.success).toBe(true);
        expect(result.sceneName).toBe('MyLevel');
      } finally {
        fs.unlinkSync(tempFile);
        fs.rmdirSync(tempDir);
      }
    });
  });
});
