/**
 * USDZ Exporter Tests
 *
 * Comprehensive test suite for USDZ export functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { USDZExporter, type IUSDZExportOptions } from '../USDZExporter';
import type { IUSDStage, IUSDMesh, IUSDMaterial, IUSDPrim } from '../USDTypes';
import {
  createEmptySceneGraph,
  createEmptyNode,
  createDefaultMaterial,
  type ISceneGraph,
  type IMesh,
  type IMaterial,
  type IVector3,
} from '../../SceneGraph';

describe('USDZExporter', () => {
  let exporter: USDZExporter;
  let sceneGraph: ISceneGraph;

  beforeEach(() => {
    exporter = new USDZExporter();
    sceneGraph = createEmptySceneGraph('TestScene');
  });

  // ========================================================================
  // Basic Export Tests
  // ========================================================================

  describe('Basic Export', () => {
    it('should export empty scene graph', async () => {
      const result = await exporter.export(sceneGraph);

      expect(result).toBeDefined();
      expect(result.usdz).toBeInstanceOf(ArrayBuffer);
      expect(result.usdz.byteLength).toBeGreaterThan(0);
      expect(result.stage).toBeDefined();
      expect(result.stats).toBeDefined();
    });

    it('should create valid USD stage', async () => {
      const result = await exporter.export(sceneGraph);

      expect(result.stage.metadata).toBeDefined();
      expect(result.stage.metadata.version).toBe('0.10.0');
      expect(result.stage.metadata.upAxis).toBe('Y');
      expect(result.stage.defaultPrim).toBe('Root');
      expect(result.stage.prims).toHaveLength(1); // Root prim
    });

    it('should include export statistics', async () => {
      const result = await exporter.export(sceneGraph);

      expect(result.stats.primCount).toBeGreaterThan(0);
      expect(result.stats.exportTime).toBeGreaterThan(0);
      expect(result.stats.usdzSize).toBe(result.usdz.byteLength);
    });
  });

  // ========================================================================
  // Material Conversion Tests
  // ========================================================================

  describe('Material Conversion', () => {
    it('should convert PBR material to UsdPreviewSurface', async () => {
      const material = createDefaultMaterial('mat1', 'TestMaterial');
      material.baseColor = [1, 0, 0, 1]; // Red
      material.metallic = 0.8;
      material.roughness = 0.2;
      sceneGraph.materials.push(material);

      const result = await exporter.export(sceneGraph);

      // Find materials scope
      const rootPrim = result.stage.prims[0];
      const materialsScope = rootPrim.children?.find((p) => p.name === 'Materials');

      expect(materialsScope).toBeDefined();
      expect(materialsScope?.children?.length).toBe(1);

      const usdMaterial = materialsScope?.children?.[0] as IUSDMaterial;
      expect(usdMaterial.type).toBe('Material');
      expect(usdMaterial.surfaceShader).toBeDefined();
    });

    it('should handle material with textures', async () => {
      const material = createDefaultMaterial('mat1', 'TexturedMaterial');
      material.baseColorTexture = {
        id: 'tex1',
        uvChannel: 0,
        offset: { u: 0, v: 0 },
        scale: { u: 1, v: 1 },
        rotation: 0,
      };
      sceneGraph.materials.push(material);

      const result = await exporter.export(sceneGraph);

      expect(result.stats.materialCount).toBe(1);
    });

    it('should handle transparent materials', async () => {
      const material = createDefaultMaterial('mat1', 'TransparentMaterial');
      material.alphaMode = 'blend';
      material.baseColor = [1, 1, 1, 0.5]; // 50% transparent
      sceneGraph.materials.push(material);

      const result = await exporter.export(sceneGraph);

      const rootPrim = result.stage.prims[0];
      const materialsScope = rootPrim.children?.find((p) => p.name === 'Materials');
      const usdMaterial = materialsScope?.children?.[0] as IUSDMaterial;

      expect(usdMaterial).toBeDefined();
    });

    it('should handle masked materials', async () => {
      const material = createDefaultMaterial('mat1', 'MaskedMaterial');
      material.alphaMode = 'mask';
      material.alphaCutoff = 0.7;
      sceneGraph.materials.push(material);

      const result = await exporter.export(sceneGraph);

      expect(result.stats.materialCount).toBe(1);
    });

    it('should convert multiple materials', async () => {
      for (let i = 0; i < 5; i++) {
        const material = createDefaultMaterial(`mat${i}`, `Material${i}`);
        material.baseColor = [Math.random(), Math.random(), Math.random(), 1];
        sceneGraph.materials.push(material);
      }

      const result = await exporter.export(sceneGraph);

      expect(result.stats.materialCount).toBe(5);
    });
  });

  // ========================================================================
  // Mesh Conversion Tests
  // ========================================================================

  describe('Mesh Conversion', () => {
    it('should convert simple triangle mesh', async () => {
      const mesh = createSimpleTriangleMesh();
      sceneGraph.meshes.push(mesh);

      // Create buffer data
      const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const buffer = {
        id: 'buf1',
        byteLength: positions.byteLength,
        data: positions.buffer,
      };
      sceneGraph.buffers.push(buffer);

      const bufferView = {
        id: 'bv1',
        bufferIndex: 0,
        byteOffset: 0,
        byteLength: positions.byteLength,
      };
      sceneGraph.bufferViews.push(bufferView);

      const accessor = {
        id: 'acc1',
        bufferViewIndex: 0,
        byteOffset: 0,
        componentType: 'float' as const,
        type: 'vec3' as const,
        count: 3,
        normalized: false,
      };
      sceneGraph.accessors.push(accessor);

      const result = await exporter.export(sceneGraph);

      expect(result.stats.meshCount).toBeGreaterThan(0);
    });

    it('should handle indexed mesh', async () => {
      const mesh = createIndexedMesh();
      sceneGraph.meshes.push(mesh);

      // Add buffers, bufferViews, and accessors
      setupMeshBuffers(sceneGraph);

      const result = await exporter.export(sceneGraph);

      const rootPrim = result.stage.prims[0];
      const geometryScope = rootPrim.children?.find((p) => p.name === 'Geometry');

      expect(geometryScope).toBeDefined();
      expect(geometryScope?.children?.length).toBeGreaterThan(0);
    });

    it('should convert mesh with normals', async () => {
      const mesh = createMeshWithNormals();
      sceneGraph.meshes.push(mesh);
      setupMeshBuffers(sceneGraph);

      const result = await exporter.export(sceneGraph);

      const rootPrim = result.stage.prims[0];
      const geometryScope = rootPrim.children?.find((p) => p.name === 'Geometry');
      const usdMesh = geometryScope?.children?.[0] as IUSDMesh;

      expect(usdMesh).toBeDefined();
      expect(usdMesh.normals).toBeDefined();
    });

    it('should convert mesh with UVs', async () => {
      const mesh = createMeshWithUVs();
      sceneGraph.meshes.push(mesh);
      setupMeshBuffers(sceneGraph);

      const result = await exporter.export(sceneGraph);

      const rootPrim = result.stage.prims[0];
      const geometryScope = rootPrim.children?.find((p) => p.name === 'Geometry');
      const usdMesh = geometryScope?.children?.[0] as IUSDMesh;

      expect(usdMesh).toBeDefined();
      expect(usdMesh.primvars).toBeDefined();
      expect(usdMesh.primvars?.length).toBeGreaterThan(0);
    });

    it('should handle multiple primitives per mesh', async () => {
      const mesh: IMesh = {
        id: 'mesh1',
        name: 'MultiPrimMesh',
        primitives: [
          {
            attributes: { POSITION: 0 },
            mode: 'triangles',
          },
          {
            attributes: { POSITION: 1 },
            mode: 'triangles',
          },
        ],
        bounds: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 1, y: 1, z: 1 },
        },
      };
      sceneGraph.meshes.push(mesh);
      setupMeshBuffers(sceneGraph);

      const result = await exporter.export(sceneGraph);

      expect(result.stats.meshCount).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // Scene Hierarchy Tests
  // ========================================================================

  describe('Scene Hierarchy', () => {
    it('should convert scene hierarchy', async () => {
      // Create parent node
      const parent = createEmptyNode('parent', 'ParentNode');
      const child1 = createEmptyNode('child1', 'Child1');
      const child2 = createEmptyNode('child2', 'Child2');

      parent.children = [child1, child2];
      sceneGraph.root.children = [parent];

      const result = await exporter.export(sceneGraph);

      const rootPrim = result.stage.prims[0];
      expect(rootPrim.children).toBeDefined();
    });

    it('should apply transforms correctly', async () => {
      const node = createEmptyNode('node1', 'TransformedNode');
      node.transform.position = [1, 2, 3 ];
      node.transform.scale = [2, 2, 2 ];
      sceneGraph.root.children = [node];

      const result = await exporter.export(sceneGraph);

      expect(result.stage.prims[0].children).toBeDefined();
    });

    it('should handle deep hierarchies', async () => {
      let current = sceneGraph.root;
      for (let i = 0; i < 10; i++) {
        const node = createEmptyNode(`node${i}`, `Node${i}`);
        current.children = [node];
        current = node;
      }

      const result = await exporter.export(sceneGraph);

      expect(result.stats.primCount).toBeGreaterThan(10);
    });
  });

  // ========================================================================
  // AR Metadata Tests
  // ========================================================================

  describe('AR Metadata', () => {
    it('should add AR Quick Look metadata', async () => {
      const options: IUSDZExportOptions = {
        lookAtCamera: true,
        placementMode: 'floor',
        enableOcclusion: true,
        allowContentScaling: false,
      };

      exporter = new USDZExporter(options);
      const result = await exporter.export(sceneGraph);

      expect(result.stage.customLayerData?.arQuickLook).toBeDefined();
      const arData = result.stage.customLayerData?.arQuickLook as any;
      expect(arData.arBehaviors.hasLookAtCamera).toBe(true);
      expect(arData.arBehaviors.initialPlacementMode).toBe('floor');
    });

    it('should set canonical camera distance', async () => {
      const options: IUSDZExportOptions = {
        canonicalCameraDistance: 5.0,
      };

      exporter = new USDZExporter(options);
      const result = await exporter.export(sceneGraph);

      const arData = result.stage.customLayerData?.arQuickLook as any;
      expect(arData?.canonicalCameraDistance).toBe(5.0);
    });

    it('should support different placement modes', async () => {
      const modes: Array<'floor' | 'wall' | 'table' | 'any'> = ['floor', 'wall', 'table', 'any'];

      for (const mode of modes) {
        const options: IUSDZExportOptions = { placementMode: mode };
        exporter = new USDZExporter(options);
        const result = await exporter.export(sceneGraph);

        const arData = result.stage.customLayerData?.arQuickLook as any;
        expect(arData?.arBehaviors.initialPlacementMode).toBe(mode);
      }
    });
  });

  // ========================================================================
  // Export Options Tests
  // ========================================================================

  describe('Export Options', () => {
    it('should respect metersPerUnit option', async () => {
      const options: IUSDZExportOptions = {
        metersPerUnit: 0.01, // Centimeters
      };

      exporter = new USDZExporter(options);
      const result = await exporter.export(sceneGraph);

      expect(result.stage.metadata.metersPerUnit).toBe(0.01);
    });

    it('should respect upAxis option', async () => {
      const options: IUSDZExportOptions = {
        upAxis: 'Z',
      };

      exporter = new USDZExporter(options);
      const result = await exporter.export(sceneGraph);

      expect(result.stage.metadata.upAxis).toBe('Z');
    });

    it('should handle material quality settings', async () => {
      const qualities: Array<'draft' | 'standard' | 'high'> = ['draft', 'standard', 'high'];

      for (const quality of qualities) {
        const options: IUSDZExportOptions = { materialQuality: quality };
        exporter = new USDZExporter(options);
        const result = await exporter.export(sceneGraph);

        expect(result).toBeDefined();
      }
    });
  });

  // ========================================================================
  // USDZ Packaging Tests
  // ========================================================================

  describe('USDZ Packaging', () => {
    it('should create valid ZIP archive', async () => {
      const result = await exporter.export(sceneGraph);

      // Check ZIP signature
      const view = new DataView(result.usdz);
      const signature = view.getUint32(0, true);
      expect(signature).toBe(0x04034b50); // ZIP local file header signature
    });

    it('should include main USD file', async () => {
      const result = await exporter.export(sceneGraph);

      expect(result.stats.fileCount).toBeGreaterThan(0);
    });

    it('should create uncompressed archive', async () => {
      const result = await exporter.export(sceneGraph);

      // USDZ requires uncompressed ZIP
      const view = new DataView(result.usdz);
      const compressionMethod = view.getUint16(8, true);
      expect(compressionMethod).toBe(0); // 0 = no compression
    });
  });

  // ========================================================================
  // Edge Cases and Error Handling
  // ========================================================================

  describe('Edge Cases', () => {
    it('should handle scene with no meshes', async () => {
      const result = await exporter.export(sceneGraph);

      expect(result.stats.meshCount).toBe(0);
      expect(result.usdz.byteLength).toBeGreaterThan(0);
    });

    it('should handle scene with no materials', async () => {
      const result = await exporter.export(sceneGraph);

      expect(result.stats.materialCount).toBe(0);
    });

    it('should sanitize invalid USD names', async () => {
      const node = createEmptyNode('node1', 'Invalid-Name!@#$');
      sceneGraph.root.children = [node];

      const result = await exporter.export(sceneGraph);

      // Should succeed without throwing
      expect(result).toBeDefined();
    });

    it('should handle empty node names', async () => {
      const node = createEmptyNode('node1', '');
      sceneGraph.root.children = [node];

      const result = await exporter.export(sceneGraph);

      expect(result).toBeDefined();
    });

    it('should handle very large scenes', async () => {
      // Create 100 nodes
      for (let i = 0; i < 100; i++) {
        const node = createEmptyNode(`node${i}`, `Node${i}`);
        sceneGraph.root.children.push(node);
      }

      const result = await exporter.export(sceneGraph);

      expect(result.stats.primCount).toBeGreaterThan(100);
    });
  });

  // ========================================================================
  // Performance Tests
  // ========================================================================

  describe('Performance', () => {
    it('should export in reasonable time', async () => {
      const startTime = performance.now();
      const result = await exporter.export(sceneGraph);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(1000); // < 1 second for empty scene
      expect(result.stats.exportTime).toBeLessThan(1000);
    });

    it('should handle complex scenes efficiently', async () => {
      // Create complex scene
      for (let i = 0; i < 50; i++) {
        const material = createDefaultMaterial(`mat${i}`, `Material${i}`);
        sceneGraph.materials.push(material);
      }

      const startTime = performance.now();
      const result = await exporter.export(sceneGraph);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(5000); // < 5 seconds
    });
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

function createSimpleTriangleMesh(): IMesh {
  return {
    id: 'mesh1',
    name: 'Triangle',
    primitives: [
      {
        attributes: {
          POSITION: 0,
        },
        mode: 'triangles',
      },
    ],
    bounds: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 1, y: 1, z: 0 },
    },
  };
}

function createIndexedMesh(): IMesh {
  return {
    id: 'mesh2',
    name: 'IndexedMesh',
    primitives: [
      {
        attributes: {
          POSITION: 0,
        },
        indices: 1,
        mode: 'triangles',
      },
    ],
    bounds: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 1, y: 1, z: 1 },
    },
  };
}

function createMeshWithNormals(): IMesh {
  return {
    id: 'mesh3',
    name: 'MeshWithNormals',
    primitives: [
      {
        attributes: {
          POSITION: 0,
          NORMAL: 1,
        },
        mode: 'triangles',
      },
    ],
    bounds: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 1, y: 1, z: 1 },
    },
  };
}

function createMeshWithUVs(): IMesh {
  return {
    id: 'mesh4',
    name: 'MeshWithUVs',
    primitives: [
      {
        attributes: {
          POSITION: 0,
          TEXCOORD_0: 1,
        },
        mode: 'triangles',
      },
    ],
    bounds: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 1, y: 1, z: 1 },
    },
  };
}

function setupMeshBuffers(sceneGraph: ISceneGraph): void {
  // Create position data
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]);

  // Create normal data
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);

  // Create UV data
  const uvs = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

  // Create index data
  const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);

  // Combine all data
  const totalSize = positions.byteLength + normals.byteLength + uvs.byteLength + indices.byteLength;

  const combinedBuffer = new ArrayBuffer(totalSize);
  const combinedView = new Uint8Array(combinedBuffer);

  let offset = 0;
  combinedView.set(new Uint8Array(positions.buffer), offset);
  offset += positions.byteLength;
  combinedView.set(new Uint8Array(normals.buffer), offset);
  offset += normals.byteLength;
  combinedView.set(new Uint8Array(uvs.buffer), offset);
  offset += uvs.byteLength;
  combinedView.set(new Uint8Array(indices.buffer), offset);

  // Add buffer
  sceneGraph.buffers.push({
    id: 'buf1',
    byteLength: totalSize,
    data: combinedBuffer,
  });

  // Add buffer views
  offset = 0;
  sceneGraph.bufferViews.push({
    id: 'bv_pos',
    bufferIndex: 0,
    byteOffset: offset,
    byteLength: positions.byteLength,
  });
  offset += positions.byteLength;

  sceneGraph.bufferViews.push({
    id: 'bv_norm',
    bufferIndex: 0,
    byteOffset: offset,
    byteLength: normals.byteLength,
  });
  offset += normals.byteLength;

  sceneGraph.bufferViews.push({
    id: 'bv_uv',
    bufferIndex: 0,
    byteOffset: offset,
    byteLength: uvs.byteLength,
  });
  offset += uvs.byteLength;

  sceneGraph.bufferViews.push({
    id: 'bv_idx',
    bufferIndex: 0,
    byteOffset: offset,
    byteLength: indices.byteLength,
  });

  // Add accessors
  sceneGraph.accessors.push({
    id: 'acc_pos',
    bufferViewIndex: 0,
    byteOffset: 0,
    componentType: 'float',
    type: 'vec3',
    count: 4,
    normalized: false,
  });

  sceneGraph.accessors.push({
    id: 'acc_norm',
    bufferViewIndex: 1,
    byteOffset: 0,
    componentType: 'float',
    type: 'vec3',
    count: 4,
    normalized: false,
  });

  sceneGraph.accessors.push({
    id: 'acc_uv',
    bufferViewIndex: 2,
    byteOffset: 0,
    componentType: 'float',
    type: 'vec2',
    count: 4,
    normalized: false,
  });

  sceneGraph.accessors.push({
    id: 'acc_idx',
    bufferViewIndex: 3,
    byteOffset: 0,
    componentType: 'ushort',
    type: 'scalar',
    count: 6,
    normalized: false,
  });
}
