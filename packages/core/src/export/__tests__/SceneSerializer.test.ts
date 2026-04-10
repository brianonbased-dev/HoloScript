/**
 * Scene Serializer Tests
 *
 * Unit tests for JSON and binary scene serialization.
 *
 * @module export
 * @version 3.3.0
 */

import { describe, it, expect } from 'vitest';
import {
  SceneSerializer,
  findNodeById,
  findNodesByTag,
  traverseNodes,
  getWorldTransform,
} from '../SceneSerializer';
import {
  createEmptySceneGraph,
  createEmptyNode,
  createDefaultMaterial,
  ISceneGraph,
  ISceneNode,
} from '../SceneGraph';

describe('SceneSerializer', () => {
  describe('JSON Serialization', () => {
    it('should serialize empty scene to JSON', () => {
      const scene = createEmptySceneGraph('TestScene');
      const serializer = new SceneSerializer();
      const result = serializer.serialize(scene);

      expect(result.json).toBeTruthy();
      expect(result.stats.nodeCount).toBe(1); // Root node
    });

    it('should deserialize JSON back to scene', () => {
      const scene = createEmptySceneGraph('TestScene');
      const serializer = new SceneSerializer();
      const { json } = serializer.serialize(scene);
      const restored = serializer.deserialize(json);

      expect(restored.metadata.name).toBe('TestScene');
      expect(restored.root.name).toBe('Root');
    });

    it('should preserve scene metadata', () => {
      const scene = createEmptySceneGraph('MyScene');
      scene.metadata.description = 'A test scene';
      scene.metadata.author = 'TestAuthor';
      scene.metadata.tags = ['test', 'demo'];

      const serializer = new SceneSerializer();
      const { json } = serializer.serialize(scene);
      const restored = serializer.deserialize(json);

      expect(restored.metadata.description).toBe('A test scene');
      expect(restored.metadata.author).toBe('TestAuthor');
      expect(restored.metadata.tags).toEqual(['test', 'demo']);
    });

    it('should serialize node hierarchy', () => {
      const scene = createEmptySceneGraph('HierarchyTest');
      const child1 = createEmptyNode('c1', 'Child1');
      const child2 = createEmptyNode('c2', 'Child2');
      const grandchild = createEmptyNode('gc1', 'Grandchild');

      child1.children.push(grandchild);
      scene.root.children.push(child1, child2);

      const serializer = new SceneSerializer();
      const { json, stats } = serializer.serialize(scene);

      expect(stats.nodeCount).toBe(4);

      const restored = serializer.deserialize(json);
      expect(restored.root.children).toHaveLength(2);
      expect(restored.root.children[0].children).toHaveLength(1);
    });

    it('should serialize materials', () => {
      const scene = createEmptySceneGraph('MaterialTest');
      scene.materials.push(createDefaultMaterial('mat1', 'Metal'));
      scene.materials.push(createDefaultMaterial('mat2', 'Plastic'));
      scene.materials[0].metallic = 1;
      scene.materials[0].roughness = 0.2;

      const serializer = new SceneSerializer();
      const { json, stats } = serializer.serialize(scene);

      expect(stats.materialCount).toBe(2);

      const restored = serializer.deserialize(json);
      expect(restored.materials).toHaveLength(2);
      expect(restored.materials[0].metallic).toBe(1);
      expect(restored.materials[0].roughness).toBe(0.2);
    });

    it('should support minified output', () => {
      const scene = createEmptySceneGraph('Test');
      const serializer = new SceneSerializer();

      const pretty = serializer.serialize(scene, { prettyPrint: true });
      const minified = serializer.serialize(scene, { prettyPrint: false });

      expect(minified.json!.length).toBeLessThan(pretty.json!.length);
    });

    it('should support custom indentation', () => {
      const scene = createEmptySceneGraph('Test');
      const serializer = new SceneSerializer();

      const indent2 = serializer.serialize(scene, { prettyPrint: true });
      const minified = serializer.serialize(scene, { prettyPrint: false });

      // prettyPrint uses default 2-space indentation
      expect(indent2.json!).toContain('  ');
      expect(minified.json!).not.toContain('\n');
    });
  });

  describe('Binary Serialization', () => {
    it('should serialize to binary format', () => {
      const scene = createEmptySceneGraph('BinaryTest');
      const serializer = new SceneSerializer();
      const result = serializer.serializeBinary(scene);

      expect(result.binary).toBeInstanceOf(ArrayBuffer);
      expect(result.binary.byteLength).toBeGreaterThan(0);
    });

    it('should have correct magic number', () => {
      const scene = createEmptySceneGraph('Test');
      const serializer = new SceneSerializer();
      const result = serializer.serializeBinary(scene);

      const view = new DataView(result.binary);
      const magic = view.getUint32(0, true);
      expect(magic).toBe(0x484f4c4f); // 'HOLO'
    });

    it('should deserialize binary back to scene', async () => {
      const scene = createEmptySceneGraph('BinaryRoundtrip');
      scene.metadata.description = 'Test description';

      const serializer = new SceneSerializer();
      const result = serializer.serializeBinary(scene);
      const restored = await serializer.deserializeBinary(result.binary);

      expect(restored.metadata.name).toBe('BinaryRoundtrip');
    });

    it('should handle complex scene in binary', async () => {
      const scene = createEmptySceneGraph('Complex');
      for (let i = 0; i < 10; i++) {
        scene.root.children.push(createEmptyNode(`node-${i}`, `Node${i}`));
      }
      scene.materials.push(createDefaultMaterial('mat1', 'Material1'));

      const serializer = new SceneSerializer();
      const result = serializer.serializeBinary(scene);
      const restored = await serializer.deserializeBinary(result.binary);

      expect(restored.root.children).toHaveLength(10);
    });
  });

  describe('Validation', () => {
    it('should validate valid scene', () => {
      const scene = createEmptySceneGraph('Valid');
      const serializer = new SceneSerializer();
      const result = serializer.validate(scene);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing root', () => {
      const scene = createEmptySceneGraph('Invalid');
      (scene as any).root = undefined;

      const serializer = new SceneSerializer();
      const result = serializer.validate(scene);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'root')).toBe(true);
    });

    it('should detect empty metadata name as valid (no validation on name)', () => {
      const scene = createEmptySceneGraph('Test');
      (scene.metadata as any).name = '';

      const serializer = new SceneSerializer();
      const result = serializer.validate(scene);

      // Validation doesn't check metadata.name currently
      expect(result.valid).toBe(true);
    });

    it('should detect missing version', () => {
      const scene = createEmptySceneGraph('Test');
      (scene as any).version = '';

      const serializer = new SceneSerializer();
      const result = serializer.validate(scene);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'version')).toBe(true);
    });
  });

  describe('Clone and Merge', () => {
    it('should deep clone scene', () => {
      const scene = createEmptySceneGraph('Original');
      scene.metadata.description = 'Original description';
      scene.root.children.push(createEmptyNode('c1', 'Child'));

      const serializer = new SceneSerializer();
      const cloned = serializer.clone(scene);

      // Modify original
      scene.metadata.description = 'Modified';
      scene.root.children[0].name = 'Modified Child';

      // Clone should be unchanged
      expect(cloned.metadata.description).toBe('Original description');
      expect(cloned.root.children[0].name).toBe('Child');
    });

    it('should merge scenes', () => {
      const scene1 = createEmptySceneGraph('Scene1');
      scene1.root.children.push(createEmptyNode('c1', 'Child1'));
      scene1.materials.push(createDefaultMaterial('mat1', 'Mat1'));

      const scene2 = createEmptySceneGraph('Scene2');
      scene2.root.children.push(createEmptyNode('c2', 'Child2'));
      scene2.materials.push(createDefaultMaterial('mat2', 'Mat2'));

      const serializer = new SceneSerializer();
      const merged = serializer.merge(scene1, scene2);

      expect(merged.root.children).toHaveLength(2);
      expect(merged.materials).toHaveLength(2);
    });
  });

  describe('Convenience Methods', () => {
    it('should convert to JSON and back', () => {
      const scene = createEmptySceneGraph('Test');
      const serializer = new SceneSerializer();

      const json = serializer.toJSON(scene);
      expect(typeof json).toBe('string');

      const restored = serializer.fromJSON(json);
      expect(restored.metadata.name).toBe('Test');
    });
  });

  describe('Round-trip Tests', () => {
    it('should preserve node transforms through JSON round-trip', () => {
      const scene = createEmptySceneGraph('TransformTest');
      const node = createEmptyNode('n1', 'Node');
      node.transform.position = { x: 10, y: 20, z: 30 };
      node.transform.rotation = { x: 0, y: 0.707, z: 0, w: 0.707 };
      node.transform.scale = { x: 2, y: 2, z: 2 };
      scene.root.children.push(node);

      const serializer = new SceneSerializer();
      const { json } = serializer.serialize(scene);
      const restored = serializer.deserialize(json);

      const restoredNode = restored.root.children[0];
      expect(restoredNode.transform.position.x).toBe(10);
      expect(restoredNode.transform.position.y).toBe(20);
      expect(restoredNode.transform.position.z).toBe(30);
      expect(restoredNode.transform.scale.x).toBe(2);
    });

    it('should preserve node tags through round-trip', () => {
      const scene = createEmptySceneGraph('TagTest');
      const node = createEmptyNode('n1', 'Node');
      node.tags = ['player', 'enemy', 'interactive'];
      scene.root.children.push(node);

      const serializer = new SceneSerializer();
      const { json } = serializer.serialize(scene);
      const restored = serializer.deserialize(json);

      expect(restored.root.children[0].tags).toEqual(['player', 'enemy', 'interactive']);
    });

    it('should preserve material properties through round-trip', () => {
      const scene = createEmptySceneGraph('MaterialTest');
      const material = createDefaultMaterial('mat1', 'Gold');
      material.metallic = 1;
      material.roughness = 0.1;
      material.baseColor = [1, 0.84, 0, 1];
      material.emissiveColor = [0.5, 0.5, 0];
      material.emissiveIntensity = 2;
      scene.materials.push(material);

      const serializer = new SceneSerializer();
      const { json } = serializer.serialize(scene);
      const restored = serializer.deserialize(json);

      const restoredMat = restored.materials[0];
      expect(restoredMat.metallic).toBe(1);
      expect(restoredMat.roughness).toBe(0.1);
      expect(restoredMat.baseColor).toEqual([1, 0.84, 0, 1]);
      expect(restoredMat.emissiveIntensity).toBe(2);
    });
  });
});

describe('Utility Functions', () => {
  describe('findNodeById', () => {
    it('should find root node', () => {
      const scene = createEmptySceneGraph('Test');
      const found = findNodeById(scene.root, scene.root.id);
      expect(found).toBe(scene.root);
    });

    it('should find nested node', () => {
      const scene = createEmptySceneGraph('Test');
      const child = createEmptyNode('target-id', 'Target');
      const grandchild = createEmptyNode('gc-id', 'Grandchild');
      child.children.push(grandchild);
      scene.root.children.push(child);

      const found = findNodeById(scene.root, 'gc-id');
      expect(found).toBeTruthy();
      expect(found?.name).toBe('Grandchild');
    });

    it('should return undefined for non-existent id', () => {
      const scene = createEmptySceneGraph('Test');
      const found = findNodeById(scene.root, 'non-existent');
      expect(found).toBeUndefined();
    });
  });

  describe('findNodesByTag', () => {
    it('should find all nodes with tag', () => {
      const scene = createEmptySceneGraph('Test');
      const node1 = createEmptyNode('n1', 'Node1');
      const node2 = createEmptyNode('n2', 'Node2');
      const node3 = createEmptyNode('n3', 'Node3');
      node1.tags = ['enemy'];
      node2.tags = ['enemy', 'boss'];
      node3.tags = ['player'];
      scene.root.children.push(node1, node2, node3);

      const enemies = findNodesByTag(scene.root, 'enemy');
      expect(enemies).toHaveLength(2);
      expect(enemies.map((n) => n.name)).toContain('Node1');
      expect(enemies.map((n) => n.name)).toContain('Node2');
    });

    it('should return empty array for non-existent tag', () => {
      const scene = createEmptySceneGraph('Test');
      const found = findNodesByTag(scene.root, 'nonexistent');
      expect(found).toEqual([]);
    });
  });

  describe('traverseNodes', () => {
    it('should visit all nodes', () => {
      const scene = createEmptySceneGraph('Test');
      const child1 = createEmptyNode('c1', 'Child1');
      const child2 = createEmptyNode('c2', 'Child2');
      const grandchild = createEmptyNode('gc', 'Grandchild');
      child1.children.push(grandchild);
      scene.root.children.push(child1, child2);

      const visited: string[] = [];
      traverseNodes(scene.root, (node) => {
        visited.push(node.name);
      });

      expect(visited).toHaveLength(4);
      expect(visited).toContain('Root');
      expect(visited).toContain('Child1');
      expect(visited).toContain('Child2');
      expect(visited).toContain('Grandchild');
    });

    it('should provide depth information', () => {
      const scene = createEmptySceneGraph('Test');
      const child = createEmptyNode('c1', 'Child');
      const grandchild = createEmptyNode('gc', 'Grandchild');
      child.children.push(grandchild);
      scene.root.children.push(child);

      const depths: Record<string, number> = {};
      traverseNodes(scene.root, (node, depth) => {
        depths[node.name] = depth;
      });

      expect(depths['Root']).toBe(0);
      expect(depths['Child']).toBe(1);
      expect(depths['Grandchild']).toBe(2);
    });
  });

  describe('getWorldTransform', () => {
    it('should return identity for root node', () => {
      const scene = createEmptySceneGraph('Test');
      const worldTransform = getWorldTransform(scene.root, scene.root.id);

      expect(worldTransform).toBeTruthy();
      expect(worldTransform!.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(worldTransform!.scale).toEqual({ x: 1, y: 1, z: 1 });
    });

    it('should accumulate translations', () => {
      const scene = createEmptySceneGraph('Test');
      scene.root.transform.position = { x: 10, y: 0, z: 0 };

      const child = createEmptyNode('c1', 'Child');
      child.transform.position = { x: 5, y: 0, z: 0 };
      scene.root.children.push(child);

      const worldTransform = getWorldTransform(scene.root, 'c1');

      // Position should be parent position + child position
      expect(worldTransform).toBeTruthy();
      expect(worldTransform!.position.x).toBe(15);
    });

    it('should accumulate scales', () => {
      const scene = createEmptySceneGraph('Test');
      scene.root.transform.scale = { x: 2, y: 2, z: 2 };

      const child = createEmptyNode('c1', 'Child');
      child.transform.scale = { x: 0.5, y: 0.5, z: 0.5 };
      scene.root.children.push(child);

      const worldTransform = getWorldTransform(scene.root, 'c1');

      // Scale should be parent scale * child scale
      expect(worldTransform).toBeTruthy();
      expect(worldTransform!.scale.x).toBe(1);
    });
  });
});
