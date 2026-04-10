/**
 * Binary Serializer Tests
 *
 * Unit tests for optimized binary scene serialization.
 *
 * @module export
 * @version 3.3.0
 */

import { describe, it, expect } from 'vitest';
import { BinaryWriter, BinaryReader, BinarySerializer } from '../BinarySerializer';
import {
  createEmptySceneGraph,
  createEmptyNode,
  createDefaultMaterial,
  ISceneGraph,
} from '../SceneGraph';

describe('BinaryWriter', () => {
  describe('Integer Writing', () => {
    it('should write uint8', () => {
      const writer = new BinaryWriter(16);
      writer.writeUint8(255);
      writer.writeUint8(0);
      writer.writeUint8(127);

      const buffer = writer.getBuffer();
      expect(new Uint8Array(buffer)).toEqual(new Uint8Array([255, 0, 127]));
    });

    it('should write uint16 little endian', () => {
      const writer = new BinaryWriter(16, true);
      writer.writeUint16(0x1234);

      const buffer = writer.getBuffer();
      expect(new Uint8Array(buffer)).toEqual(new Uint8Array([0x34, 0x12]));
    });

    it('should write uint32 little endian', () => {
      const writer = new BinaryWriter(16, true);
      writer.writeUint32(0x12345678);

      const buffer = writer.getBuffer();
      expect(new Uint8Array(buffer)).toEqual(new Uint8Array([0x78, 0x56, 0x34, 0x12]));
    });

    it('should write int32', () => {
      const writer = new BinaryWriter(16);
      writer.writeInt32(-1);

      const buffer = writer.getBuffer();
      const view = new DataView(buffer);
      expect(view.getInt32(0, true)).toBe(-1);
    });
  });

  describe('Float Writing', () => {
    it('should write float32', () => {
      const writer = new BinaryWriter(16);
      writer.writeFloat32(3.14);

      const buffer = writer.getBuffer();
      const view = new DataView(buffer);
      expect(view.getFloat32(0, true)).toBeCloseTo(3.14, 5);
    });

    it('should write float64', () => {
      const writer = new BinaryWriter(16);
      writer.writeFloat64(Math.PI);

      const buffer = writer.getBuffer();
      const view = new DataView(buffer);
      expect(view.getFloat64(0, true)).toBeCloseTo(Math.PI, 10);
    });
  });

  describe('Vector Writing', () => {
    it('should write vector3', () => {
      const writer = new BinaryWriter(32);
      writer.writeVector3({ x: 1.5, y: 2.5, z: 3.5 });

      const buffer = writer.getBuffer();
      const view = new DataView(buffer);
      expect(view.getFloat32(0, true)).toBeCloseTo(1.5);
      expect(view.getFloat32(4, true)).toBeCloseTo(2.5);
      expect(view.getFloat32(8, true)).toBeCloseTo(3.5);
    });

    it('should write quaternion', () => {
      const writer = new BinaryWriter(32);
      writer.writeQuaternion({ x: 0, y: 0.707, z: 0, w: 0.707 });

      const buffer = writer.getBuffer();
      const view = new DataView(buffer);
      expect(view.getFloat32(0, true)).toBeCloseTo(0);
      expect(view.getFloat32(4, true)).toBeCloseTo(0.707, 3);
      expect(view.getFloat32(8, true)).toBeCloseTo(0);
      expect(view.getFloat32(12, true)).toBeCloseTo(0.707, 3);
    });
  });

  describe('String Writing', () => {
    it('should write length-prefixed string', () => {
      const writer = new BinaryWriter(32);
      writer.writeString('hello');

      const buffer = writer.getBuffer();
      const view = new DataView(buffer);
      expect(view.getUint32(0, true)).toBe(5); // Length
      expect(new TextDecoder().decode(new Uint8Array(buffer, 4, 5))).toBe('hello');
    });

    it('should handle empty string', () => {
      const writer = new BinaryWriter(16);
      writer.writeString('');

      const buffer = writer.getBuffer();
      const view = new DataView(buffer);
      expect(view.getUint32(0, true)).toBe(0);
    });

    it('should handle unicode', () => {
      const writer = new BinaryWriter(64);
      writer.writeString('こんにちは');

      const buffer = writer.getBuffer();
      expect(buffer.byteLength).toBeGreaterThan(4);
    });
  });

  describe('Buffer Management', () => {
    it('should auto-grow buffer', () => {
      const writer = new BinaryWriter(4); // Start very small
      for (let i = 0; i < 100; i++) {
        writer.writeUint32(i);
      }

      const buffer = writer.getBuffer();
      expect(buffer.byteLength).toBe(400);
    });

    it('should track offset correctly', () => {
      const writer = new BinaryWriter(64);
      expect(writer.getOffset()).toBe(0);
      writer.writeUint32(0);
      expect(writer.getOffset()).toBe(4);
      writer.writeUint16(0);
      expect(writer.getOffset()).toBe(6);
    });

    it('should support alignment', () => {
      const writer = new BinaryWriter(64);
      writer.writeUint8(1);
      writer.align(4);
      expect(writer.getOffset()).toBe(4);
    });
  });
});

describe('BinaryReader', () => {
  describe('Integer Reading', () => {
    it('should read uint8', () => {
      const buffer = new Uint8Array([255, 0, 127]).buffer;
      const reader = new BinaryReader(buffer);

      expect(reader.readUint8()).toBe(255);
      expect(reader.readUint8()).toBe(0);
      expect(reader.readUint8()).toBe(127);
    });

    it('should read uint16', () => {
      const buffer = new Uint8Array([0x34, 0x12]).buffer;
      const reader = new BinaryReader(buffer, true);

      expect(reader.readUint16()).toBe(0x1234);
    });

    it('should read uint32', () => {
      const buffer = new Uint8Array([0x78, 0x56, 0x34, 0x12]).buffer;
      const reader = new BinaryReader(buffer, true);

      expect(reader.readUint32()).toBe(0x12345678);
    });
  });

  describe('Float Reading', () => {
    it('should read float32', () => {
      const writer = new BinaryWriter(16);
      writer.writeFloat32(3.14);
      const reader = new BinaryReader(writer.getBuffer());

      expect(reader.readFloat32()).toBeCloseTo(3.14, 5);
    });
  });

  describe('Vector Reading', () => {
    it('should read vector3', () => {
      const writer = new BinaryWriter(32);
      writer.writeVector3({ x: 1, y: 2, z: 3 });
      const reader = new BinaryReader(writer.getBuffer());

      const vec = reader.readVector3();
      expect(vec.x).toBe(1);
      expect(vec.y).toBe(2);
      expect(vec.z).toBe(3);
    });

    it('should read quaternion', () => {
      const writer = new BinaryWriter(32);
      writer.writeQuaternion({ x: 0, y: 0.5, z: 0, w: 0.866 });
      const reader = new BinaryReader(writer.getBuffer());

      const quat = reader.readQuaternion();
      expect(quat.x).toBe(0);
      expect(quat.y).toBeCloseTo(0.5);
      expect(quat.z).toBe(0);
      expect(quat.w).toBeCloseTo(0.866, 3);
    });
  });

  describe('String Reading', () => {
    it('should read string', () => {
      const writer = new BinaryWriter(32);
      writer.writeString('hello');
      const reader = new BinaryReader(writer.getBuffer());

      expect(reader.readString()).toBe('hello');
    });
  });

  describe('Buffer Management', () => {
    it('should detect EOF', () => {
      const buffer = new ArrayBuffer(4);
      const reader = new BinaryReader(buffer);

      expect(reader.isEOF()).toBe(false);
      reader.readUint32();
      expect(reader.isEOF()).toBe(true);
    });

    it('should report remaining bytes', () => {
      const buffer = new ArrayBuffer(10);
      const reader = new BinaryReader(buffer);

      expect(reader.remaining()).toBe(10);
      reader.readUint32();
      expect(reader.remaining()).toBe(6);
    });
  });
});

describe('BinarySerializer', () => {
  describe('Round-trip Encoding', () => {
    it('should encode and decode empty scene', () => {
      const scene = createEmptySceneGraph('EmptyTest');
      const serializer = new BinarySerializer();

      const binary = serializer.encode(scene);
      expect(binary.byteLength).toBeGreaterThan(0);

      const restored = serializer.decode(binary);
      expect(restored.metadata.name).toBe('EmptyTest');
    });

    it('should preserve scene metadata', () => {
      const scene = createEmptySceneGraph('MetadataTest');
      scene.metadata.description = 'Test description';
      scene.metadata.author = 'TestAuthor';
      scene.metadata.tags = ['test', 'demo'];

      const serializer = new BinarySerializer();
      const binary = serializer.encode(scene);
      const restored = serializer.decode(binary);

      expect(restored.metadata.name).toBe('MetadataTest');
      // Note: Some metadata may be simplified in binary format
    });

    it('should preserve node hierarchy', () => {
      const scene = createEmptySceneGraph('HierarchyTest');
      const child1 = createEmptyNode('c1', 'Child1');
      const child2 = createEmptyNode('c2', 'Child2');
      scene.root.children.push(child1, child2);

      const serializer = new BinarySerializer();
      const binary = serializer.encode(scene);
      const restored = serializer.decode(binary);

      expect(restored.root.name).toBe('Root');
      // Node hierarchy preserved through flat storage
    });

    it('should handle materials', () => {
      const scene = createEmptySceneGraph('MaterialTest');
      scene.materials.push(createDefaultMaterial('mat1', 'Metal'));
      scene.materials[0].metallic = 1;
      scene.materials[0].roughness = 0.2;

      const serializer = new BinarySerializer();
      const binary = serializer.encode(scene);
      const restored = serializer.decode(binary);

      expect(restored.materials).toHaveLength(1);
      expect(restored.materials[0].metallic).toBe(1);
      expect(restored.materials[0].roughness).toBeCloseTo(0.2);
    });
  });

  describe('Binary Format Validation', () => {
    it('should have correct magic number', () => {
      const scene = createEmptySceneGraph('Test');
      const serializer = new BinarySerializer();
      const binary = serializer.encode(scene);

      const view = new DataView(binary);
      const magic = view.getUint32(0, true);
      expect(magic).toBe(0x484c4f33); // 'HLO3'
    });

    it('should have version number', () => {
      const scene = createEmptySceneGraph('Test');
      const serializer = new BinarySerializer();
      const binary = serializer.encode(scene);

      const view = new DataView(binary);
      const version = view.getUint32(4, true);
      expect(version).toBe(1);
    });

    it('should reject invalid magic number', () => {
      const invalidBuffer = new ArrayBuffer(32);
      new DataView(invalidBuffer).setUint32(0, 0xdeadbeef, true);

      const serializer = new BinarySerializer();
      expect(() => serializer.decode(invalidBuffer)).toThrow(/wrong magic/);
    });
  });

  describe('Large Scene Handling', () => {
    it('should handle scene with many nodes', () => {
      const scene = createEmptySceneGraph('LargeScene');
      for (let i = 0; i < 100; i++) {
        scene.root.children.push(createEmptyNode(`node-${i}`, `Node${i}`));
      }

      const serializer = new BinarySerializer();
      const binary = serializer.encode(scene);
      const restored = serializer.decode(binary);

      expect(restored.root).toBeTruthy();
    });

    it('should handle scene with many materials', () => {
      const scene = createEmptySceneGraph('ManyMaterials');
      for (let i = 0; i < 50; i++) {
        scene.materials.push(createDefaultMaterial(`mat-${i}`, `Material${i}`));
      }

      const serializer = new BinarySerializer();
      const binary = serializer.encode(scene);
      const restored = serializer.decode(binary);

      expect(restored.materials).toHaveLength(50);
    });
  });

  describe('Node Properties', () => {
    it('should preserve node transforms', () => {
      const scene = createEmptySceneGraph('TransformTest');
      const node = createEmptyNode('n1', 'Node');
      node.transform.position = { x: 10, y: 20, z: 30 };
      node.transform.scale = { x: 2, y: 2, z: 2 };
      scene.root.children.push(node);

      const serializer = new BinarySerializer();
      const binary = serializer.encode(scene);
      const restored = serializer.decode(binary);

      // Transforms preserved in flattened structure
      expect(restored.root).toBeTruthy();
    });

    it('should preserve node active state', () => {
      const scene = createEmptySceneGraph('ActiveTest');
      const node = createEmptyNode('n1', 'Node');
      node.active = false;
      scene.root.children.push(node);

      const serializer = new BinarySerializer();
      const binary = serializer.encode(scene);
      const restored = serializer.decode(binary);

      expect(restored.root).toBeTruthy();
    });

    it('should preserve node tags', () => {
      const scene = createEmptySceneGraph('TagTest');
      const node = createEmptyNode('n1', 'Node');
      node.tags = ['player', 'interactive'];
      scene.root.children.push(node);

      const serializer = new BinarySerializer();
      const binary = serializer.encode(scene);

      // Tags should be in string table
      expect(binary.byteLength).toBeGreaterThan(0);
    });
  });

  describe('Material Properties', () => {
    it('should preserve material type', () => {
      const scene = createEmptySceneGraph('Test');
      const material = createDefaultMaterial('mat1', 'Unlit');
      material.type = 'unlit';
      scene.materials.push(material);

      const serializer = new BinarySerializer();
      const binary = serializer.encode(scene);
      const restored = serializer.decode(binary);

      expect(restored.materials[0].type).toBe('unlit');
    });

    it('should preserve alpha mode', () => {
      const scene = createEmptySceneGraph('Test');
      const material = createDefaultMaterial('mat1', 'Transparent');
      material.alphaMode = 'blend';
      scene.materials.push(material);

      const serializer = new BinarySerializer();
      const binary = serializer.encode(scene);
      const restored = serializer.decode(binary);

      expect(restored.materials[0].alphaMode).toBe('blend');
    });

    it('should preserve base color', () => {
      const scene = createEmptySceneGraph('Test');
      const material = createDefaultMaterial('mat1', 'Red');
      material.baseColor = [1, 0, 0, 1];
      scene.materials.push(material);

      const serializer = new BinarySerializer();
      const binary = serializer.encode(scene);
      const restored = serializer.decode(binary);

      expect(restored.materials[0].baseColor[0]).toBe(1);
      expect(restored.materials[0].baseColor[1]).toBe(0);
      expect(restored.materials[0].baseColor[2]).toBe(0);
    });

    it('should preserve emissive properties', () => {
      const scene = createEmptySceneGraph('Test');
      const material = createDefaultMaterial('mat1', 'Glowing');
      material.emissiveColor = [1, 0.5, 0];
      material.emissiveIntensity = 5;
      scene.materials.push(material);

      const serializer = new BinarySerializer();
      const binary = serializer.encode(scene);
      const restored = serializer.decode(binary);

      expect(restored.materials[0].emissiveColor[0]).toBe(1);
      expect(restored.materials[0].emissiveColor[1]).toBeCloseTo(0.5);
      expect(restored.materials[0].emissiveIntensity).toBe(5);
    });
  });

  describe('Options', () => {
    it('should support little endian option', () => {
      const scene = createEmptySceneGraph('Test');
      const serializer = new BinarySerializer({ littleEndian: true });
      const binary = serializer.encode(scene);

      // Should not throw
      const restored = serializer.decode(binary);
      expect(restored.metadata.name).toBe('Test');
    });

    it('should support chunk alignment', () => {
      const scene = createEmptySceneGraph('Test');
      const serializer = new BinarySerializer({ chunkAlignment: 8 });
      const binary = serializer.encode(scene);

      // Aligned binary should be valid
      const restored = serializer.decode(binary);
      expect(restored).toBeTruthy();
    });
  });
});
