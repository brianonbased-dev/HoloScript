/**
 * GLTFExporter Tests
 *
 * Tests for GLTF 2.0 exporter functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GLTFExporter } from '../GLTFExporter';
import {
  type IGLTFDocument,
  type IGLTFExportOptions,
  validateGLTFDocument,
  GLB_MAGIC,
  GLB_VERSION,
} from '../GLTFTypes';
import {
  type ISceneGraph,
  type ISceneNode,
  type IMesh,
  type IMaterial,
  type ITexture,
  type IAnimation,
  type ISkin,
  createEmptySceneGraph,
  createEmptyNode,
  createDefaultMaterial,
} from '../../SceneGraph';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestSceneGraph(name = 'TestScene'): ISceneGraph {
  const sg = createEmptySceneGraph();
  sg.metadata.name = name;
  return sg;
}

function createTestNode(name: string): ISceneNode {
  const id = `node_${name}`;
  return createEmptyNode(id, name);
}

function createTestMesh(id: string, name: string): IMesh {
  return {
    id,
    name,
    primitives: [
      {
        attributes: { POSITION: 0 },
        indices: 1,
        materialRef: undefined,
        mode: 'triangles',
      },
    ],
    morphWeights: [],
    metadata: {},
  };
}

function createTestMaterial(id: string, name: string): IMaterial {
  const mat = createDefaultMaterial();
  mat.id = id;
  mat.name = name;
  return mat;
}

function createTestTexture(id: string, name: string): ITexture {
  return {
    id,
    name,
    sourceType: 'uri',
    source: 'test.png',
    mimeType: 'image/png',
    width: 256,
    height: 256,
    magFilter: 'linear',
    minFilter: 'trilinear',
    wrapS: 'repeat',
    wrapT: 'repeat',
    metadata: {},
  };
}

function createMinimalSceneGraphWithBuffer(): ISceneGraph {
  const sg = createTestSceneGraph('BufferTest');

  // Create position data: 3 vertices (triangle)
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0.5, 1, 0]);
  const indices = new Uint16Array([0, 1, 2]);

  // Create buffer with all data
  const posBuffer = positions.buffer.slice(
    positions.byteOffset,
    positions.byteOffset + positions.byteLength
  ) as ArrayBuffer;
  const idxBuffer = indices.buffer.slice(
    indices.byteOffset,
    indices.byteOffset + indices.byteLength
  ) as ArrayBuffer;

  // Combine into single buffer
  const totalLength = posBuffer.byteLength + idxBuffer.byteLength;
  const combinedBuffer = new ArrayBuffer(totalLength);
  const combinedView = new Uint8Array(combinedBuffer);
  combinedView.set(new Uint8Array(posBuffer), 0);
  combinedView.set(new Uint8Array(idxBuffer), posBuffer.byteLength);

  sg.buffers = [
    {
      id: 'buffer0',
      byteLength: totalLength,
      data: combinedBuffer,
    },
  ];

  sg.bufferViews = [
    {
      id: 'bv_positions',
      bufferIndex: 0,
      byteOffset: 0,
      byteLength: posBuffer.byteLength,
      target: 'arrayBuffer',
    },
    {
      id: 'bv_indices',
      bufferIndex: 0,
      byteOffset: posBuffer.byteLength,
      byteLength: idxBuffer.byteLength,
      target: 'elementArrayBuffer',
    },
  ];

  sg.accessors = [
    {
      id: 'acc_positions',
      bufferViewIndex: 0,
      byteOffset: 0,
      componentType: 'float',
      count: 3,
      type: 'vec3',
      min: [0, 0, 0],
      max: [1, 1, 0],
    },
    {
      id: 'acc_indices',
      bufferViewIndex: 1,
      byteOffset: 0,
      componentType: 'ushort',
      count: 3,
      type: 'scalar',
    },
  ];

  // Create mesh referencing accessors
  sg.meshes = [
    {
      id: 'mesh0',
      name: 'Triangle',
      primitives: [
        {
          attributes: { POSITION: 0 },
          indices: 1,
          mode: 'triangles',
        },
      ],
      morphWeights: [],
      metadata: {},
    },
  ];

  // Add mesh component to root
  sg.root.components = [
    {
      type: 'mesh',
      meshRef: 'mesh0',
      properties: {},
    },
  ];

  return sg;
}

// ============================================================================
// GLTFExporter Instance Tests
// ============================================================================

describe('GLTFExporter', () => {
  describe('construction', () => {
    it('creates exporter with default options', () => {
      const exporter = new GLTFExporter();
      expect(exporter).toBeDefined();
    });

    it('creates exporter with custom options', () => {
      const exporter = new GLTFExporter({
        binary: false,
        prettyPrint: true,
        generator: 'TestGenerator',
      });
      expect(exporter).toBeDefined();
    });
  });

  describe('empty scene export', () => {
    it('exports empty scene to GLB', async () => {
      const exporter = new GLTFExporter({ binary: true });
      const sg = createTestSceneGraph('EmptyScene');

      const result = await exporter.export(sg);

      expect(result.glb).toBeDefined();
      expect(result.document).toBeDefined();
      expect(result.stats.nodeCount).toBeGreaterThanOrEqual(1); // At least root
    });

    it('exports empty scene to JSON', async () => {
      const exporter = new GLTFExporter({ binary: false });
      const sg = createTestSceneGraph('EmptyScene');

      const result = await exporter.export(sg);

      expect(result.json).toBeDefined();
      expect(result.document).toBeDefined();
    });

    it('validates exported document structure', async () => {
      const exporter = new GLTFExporter();
      const sg = createTestSceneGraph('ValidScene');

      const result = await exporter.export(sg);

      expect(result.document.asset).toBeDefined();
      expect(result.document.asset.version).toBe('2.0');
      expect(result.document.asset.generator).toContain('HoloScript');
    });
  });
});

// ============================================================================
// Node Export Tests
// ============================================================================

describe('GLTFExporter Node Export', () => {
  it('exports single node', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();

    const result = await exporter.export(sg);

    expect(result.document.nodes).toBeDefined();
    expect(result.document.nodes!.length).toBeGreaterThanOrEqual(1);
  });

  it('exports node with transform', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();
    sg.root.transform = {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 2, y: 2, z: 2 },
    };

    const result = await exporter.export(sg);
    const rootNode = result.document.nodes![0];

    expect(rootNode.translation).toEqual([1, 2, 3]);
    expect(rootNode.scale).toEqual([2, 2, 2]);
  });

  it('exports node hierarchy', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();
    sg.root.children = [createTestNode('Child1'), createTestNode('Child2')];

    const result = await exporter.export(sg);

    expect(result.document.nodes!.length).toBeGreaterThanOrEqual(3);
    // Root is exported last (post-order traversal), find it via scene reference
    const rootIndex = result.document.scenes![0].nodes![0];
    const rootNode = result.document.nodes![rootIndex];
    expect(rootNode.children).toHaveLength(2);
  });

  it('exports deep node hierarchy', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();

    const child1 = createTestNode('Level1');
    const child2 = createTestNode('Level2');
    const child3 = createTestNode('Level3');

    child2.children = [child3];
    child1.children = [child2];
    sg.root.children = [child1];

    const result = await exporter.export(sg);

    expect(result.document.nodes!.length).toBeGreaterThanOrEqual(4);
  });

  it('exports node metadata as extras', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();
    sg.root.metadata = { customKey: 'customValue', number: 42 };

    const result = await exporter.export(sg);
    const rootNode = result.document.nodes![0];

    expect(rootNode.extras).toEqual({
      customKey: 'customValue',
      number: 42,
    });
  });
});

// ============================================================================
// Material Export Tests
// ============================================================================

describe('GLTFExporter Material Export', () => {
  it('exports basic PBR material', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();
    sg.materials = [createTestMaterial('mat1', 'TestMaterial')];

    const result = await exporter.export(sg);

    expect(result.document.materials).toBeDefined();
    expect(result.document.materials!.length).toBe(1);
    expect(result.document.materials![0].name).toBe('TestMaterial');
  });

  it('exports material with color factors', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();

    const material = createTestMaterial('mat1', 'ColorMaterial');
    material.baseColor = [1, 0.5, 0, 1];
    material.metallic = 0.8;
    material.roughness = 0.2;
    sg.materials = [material];

    const result = await exporter.export(sg);
    const mat = result.document.materials![0];

    expect(mat.pbrMetallicRoughness?.baseColorFactor).toEqual([1, 0.5, 0, 1]);
    expect(mat.pbrMetallicRoughness?.metallicFactor).toBe(0.8);
    expect(mat.pbrMetallicRoughness?.roughnessFactor).toBe(0.2);
  });

  it('exports material alpha mode', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();

    const material = createTestMaterial('mat1', 'AlphaMaterial');
    material.alphaMode = 'mask';
    material.alphaCutoff = 0.5;
    sg.materials = [material];

    const result = await exporter.export(sg);
    const mat = result.document.materials![0];

    expect(mat.alphaMode).toBe('MASK');
    expect(mat.alphaCutoff).toBe(0.5);
  });

  it('exports double-sided material', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();

    const material = createTestMaterial('mat1', 'DoubleSided');
    material.doubleSided = true;
    sg.materials = [material];

    const result = await exporter.export(sg);

    expect(result.document.materials![0].doubleSided).toBe(true);
  });

  it('exports emissive material', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();

    const material = createTestMaterial('mat1', 'Emissive');
    material.emissiveColor = [1, 0.5, 0];
    sg.materials = [material];

    const result = await exporter.export(sg);

    expect(result.document.materials![0].emissiveFactor).toEqual([1, 0.5, 0]);
  });
});

// ============================================================================
// Texture Export Tests
// ============================================================================

describe('GLTFExporter Texture Export', () => {
  it('exports texture with URI source', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();
    sg.textures = [createTestTexture('tex1', 'TestTexture')];

    const result = await exporter.export(sg);

    expect(result.document.textures).toBeDefined();
    expect(result.document.textures!.length).toBe(1);
    expect(result.document.images).toBeDefined();
    expect(result.document.images![0].uri).toBe('test.png');
  });

  it('exports texture sampler settings', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();

    const texture = createTestTexture('tex1', 'SamplerTest');
    texture.magFilter = 'nearest';
    texture.minFilter = 'linear';
    texture.wrapS = 'clamp';
    texture.wrapT = 'mirror';
    sg.textures = [texture];

    const result = await exporter.export(sg);

    expect(result.document.samplers).toBeDefined();
    expect(result.document.samplers!.length).toBe(1);
  });

  it('links texture to material correctly', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();

    const texture = createTestTexture('tex1', 'BaseColorTex');
    sg.textures = [texture];

    const material = createTestMaterial('mat1', 'TexturedMat');
    material.baseColorTexture = { id: 'tex1', uvChannel: 0 };
    sg.materials = [material];

    const result = await exporter.export(sg);

    expect(result.document.materials![0].pbrMetallicRoughness?.baseColorTexture).toBeDefined();
    expect(result.document.materials![0].pbrMetallicRoughness?.baseColorTexture?.index).toBe(0);
  });
});

// ============================================================================
// Mesh Export Tests
// ============================================================================

describe('GLTFExporter Mesh Export', () => {
  it('exports mesh with buffer data', async () => {
    const exporter = new GLTFExporter();
    const sg = createMinimalSceneGraphWithBuffer();

    const result = await exporter.export(sg);

    expect(result.document.meshes).toBeDefined();
    expect(result.document.meshes!.length).toBe(1);
    expect(result.document.meshes![0].primitives.length).toBe(1);
  });

  it('exports mesh accessors', async () => {
    const exporter = new GLTFExporter();
    const sg = createMinimalSceneGraphWithBuffer();

    const result = await exporter.export(sg);

    expect(result.document.accessors).toBeDefined();
    expect(result.document.accessors!.length).toBeGreaterThanOrEqual(2);
  });

  it('exports buffer views', async () => {
    const exporter = new GLTFExporter();
    const sg = createMinimalSceneGraphWithBuffer();

    const result = await exporter.export(sg);

    expect(result.document.bufferViews).toBeDefined();
    expect(result.document.bufferViews!.length).toBeGreaterThanOrEqual(2);
  });

  it('creates buffer for binary export', async () => {
    const exporter = new GLTFExporter({ binary: true });
    const sg = createMinimalSceneGraphWithBuffer();

    const result = await exporter.export(sg);

    expect(result.document.buffers).toBeDefined();
    expect(result.document.buffers!.length).toBe(1);
    expect(result.document.buffers![0].byteLength).toBeGreaterThan(0);
  });

  it('links mesh to node via component', async () => {
    const exporter = new GLTFExporter();
    const sg = createMinimalSceneGraphWithBuffer();

    const result = await exporter.export(sg);
    const rootNode = result.document.nodes![0];

    expect(rootNode.mesh).toBeDefined();
    expect(rootNode.mesh).toBe(0);
  });
});

// ============================================================================
// GLB Binary Format Tests
// ============================================================================

describe('GLTFExporter GLB Format', () => {
  it('produces valid GLB header', async () => {
    const exporter = new GLTFExporter({ binary: true });
    const sg = createTestSceneGraph();

    const result = await exporter.export(sg);
    const view = new DataView(result.glb!);

    // Check magic number 'glTF'
    expect(view.getUint32(0, true)).toBe(GLB_MAGIC);

    // Check version
    expect(view.getUint32(4, true)).toBe(GLB_VERSION);

    // Check total length matches buffer size
    expect(view.getUint32(8, true)).toBe(result.glb!.byteLength);
  });

  it('produces valid JSON chunk', async () => {
    const exporter = new GLTFExporter({ binary: true });
    const sg = createTestSceneGraph();

    const result = await exporter.export(sg);
    const view = new DataView(result.glb!);

    // JSON chunk type at offset 16
    const jsonChunkType = view.getUint32(16, true);
    expect(jsonChunkType).toBe(0x4e4f534a); // 'JSON'
  });

  it('can round-trip GLB to document', async () => {
    const exporter = new GLTFExporter({ binary: true });
    const sg = createMinimalSceneGraphWithBuffer();

    const result = await exporter.export(sg);
    const glb = result.glb!;
    const view = new DataView(glb);

    // Extract JSON chunk length and data
    const jsonChunkLength = view.getUint32(12, true);
    const jsonStart = 20;
    const jsonBytes = new Uint8Array(glb, jsonStart, jsonChunkLength);

    // Trim padding (spaces)
    let end = jsonBytes.length;
    while (end > 0 && jsonBytes[end - 1] === 0x20) end--;

    const jsonString = new TextDecoder().decode(jsonBytes.subarray(0, end));
    const parsedDoc = JSON.parse(jsonString) as IGLTFDocument;

    expect(parsedDoc.asset.version).toBe('2.0');
    expect(parsedDoc.meshes).toBeDefined();
  });

  it('4-byte aligns chunks', async () => {
    const exporter = new GLTFExporter({ binary: true });
    const sg = createMinimalSceneGraphWithBuffer();

    const result = await exporter.export(sg);

    // Total size should be 4-byte aligned
    expect(result.glb!.byteLength % 4).toBe(0);
  });

  it('reports GLB size in stats', async () => {
    const exporter = new GLTFExporter({ binary: true });
    const sg = createTestSceneGraph();

    const result = await exporter.export(sg);

    expect(result.stats.glbSize).toBe(result.glb!.byteLength);
  });
});

// ============================================================================
// JSON Export Tests
// ============================================================================

describe('GLTFExporter JSON Format', () => {
  it('produces valid JSON string', async () => {
    const exporter = new GLTFExporter({ binary: false });
    const sg = createTestSceneGraph();

    const result = await exporter.export(sg);

    expect(result.json).toBeDefined();
    expect(() => JSON.parse(result.json!)).not.toThrow();
  });

  it('produces pretty-printed JSON when requested', async () => {
    const exporter = new GLTFExporter({ binary: false, prettyPrint: true });
    const sg = createTestSceneGraph();

    const result = await exporter.export(sg);

    // Pretty-printed JSON contains newlines
    expect(result.json!.includes('\n')).toBe(true);
  });

  it('reports JSON size in stats', async () => {
    const exporter = new GLTFExporter({ binary: false });
    const sg = createTestSceneGraph();

    const result = await exporter.export(sg);
    const expectedSize = new TextEncoder().encode(result.json!).length;

    expect(result.stats.jsonSize).toBe(expectedSize);
  });

  it('can re-export to GLB', async () => {
    const jsonExporter = new GLTFExporter({ binary: false });
    const glbExporter = new GLTFExporter({ binary: true });
    const sg = createTestSceneGraph();

    const jsonResult = await jsonExporter.export(sg);
    const glbResult = await glbExporter.export(sg);

    // Both should produce valid documents
    expect(jsonResult.document.asset.version).toBe('2.0');
    expect(glbResult.document.asset.version).toBe('2.0');
  });
});

// ============================================================================
// Animation Export Tests
// ============================================================================

describe('GLTFExporter Animation Export', () => {
  it('exports simple animation', async () => {
    const exporter = new GLTFExporter({ includeAnimations: true });
    const sg = createMinimalSceneGraphWithBuffer();

    // Add time keyframes buffer
    const times = new Float32Array([0, 0.5, 1]);
    const values = new Float32Array([0, 0, 0, 0, 1, 0, 0, 2, 0]); // 3 translations

    const timeBuffer = times.buffer.slice(
      times.byteOffset,
      times.byteOffset + times.byteLength
    ) as ArrayBuffer;
    const valueBuffer = values.buffer.slice(
      values.byteOffset,
      values.byteOffset + values.byteLength
    ) as ArrayBuffer;

    // Add to existing buffers
    const existingLength = sg.buffers[0].byteLength;
    const newBuffer = new ArrayBuffer(
      existingLength + timeBuffer.byteLength + valueBuffer.byteLength
    );
    const newView = new Uint8Array(newBuffer);
    newView.set(new Uint8Array(sg.buffers[0].data!), 0);
    newView.set(new Uint8Array(timeBuffer), existingLength);
    newView.set(new Uint8Array(valueBuffer), existingLength + timeBuffer.byteLength);

    sg.buffers[0].data = newBuffer;
    sg.buffers[0].byteLength = newBuffer.byteLength;

    // Add buffer views for animation
    sg.bufferViews.push({
      id: 'bv_anim_time',
      bufferIndex: 0,
      byteOffset: existingLength,
      byteLength: timeBuffer.byteLength,
      target: 'arrayBuffer',
    });
    sg.bufferViews.push({
      id: 'bv_anim_values',
      bufferIndex: 0,
      byteOffset: existingLength + timeBuffer.byteLength,
      byteLength: valueBuffer.byteLength,
      target: 'arrayBuffer',
    });

    // Add accessors
    const timeAccessorIdx = sg.accessors.length;
    sg.accessors.push({
      id: 'acc_anim_time',
      bufferViewIndex: 2,
      byteOffset: 0,
      componentType: 'float',
      count: 3,
      type: 'scalar',
      min: [0],
      max: [1],
    });

    sg.accessors.push({
      id: 'acc_anim_values',
      bufferViewIndex: 3,
      byteOffset: 0,
      componentType: 'float',
      count: 3,
      type: 'vec3',
    });

    // Add animation
    sg.animations = [
      {
        id: 'anim1',
        name: 'BounceAnim',
        samplers: [
          {
            inputBufferView: timeAccessorIdx,
            outputBufferView: timeAccessorIdx + 1,
            interpolation: 'linear',
          },
        ],
        channels: [
          {
            targetNode: sg.root.id,
            targetPath: 'translation',
            samplerIndex: 0,
          },
        ],
        duration: 1,
        metadata: {},
      },
    ];

    const result = await exporter.export(sg);

    expect(result.document.animations).toBeDefined();
    expect(result.document.animations!.length).toBe(1);
    expect(result.document.animations![0].name).toBe('BounceAnim');
  });

  it('skips animations when disabled', async () => {
    const exporter = new GLTFExporter({ includeAnimations: false });
    const sg = createTestSceneGraph();
    sg.animations = [
      {
        id: 'anim1',
        name: 'SkippedAnim',
        samplers: [],
        channels: [],
        duration: 1,
        metadata: {},
      },
    ];

    const result = await exporter.export(sg);

    // Animations array should be undefined or empty
    expect(result.document.animations?.length || 0).toBe(0);
  });
});

// ============================================================================
// Camera Export Tests
// ============================================================================

describe('GLTFExporter Camera Export', () => {
  it('exports perspective camera', async () => {
    const exporter = new GLTFExporter({ includeCameras: true });
    const sg = createTestSceneGraph();
    sg.root.components = [
      {
        type: 'camera',
        cameraType: 'perspective',
        fov: 60,
        near: 0.1,
        far: 1000,
        aspectRatio: 1.777,
        properties: { name: 'MainCamera' },
      },
    ];

    const result = await exporter.export(sg);

    expect(result.document.cameras).toBeDefined();
    expect(result.document.cameras!.length).toBe(1);
    expect(result.document.cameras![0].type).toBe('perspective');
    expect(result.document.cameras![0].perspective).toBeDefined();
  });

  it('exports orthographic camera', async () => {
    const exporter = new GLTFExporter({ includeCameras: true });
    const sg = createTestSceneGraph();
    sg.root.components = [
      {
        type: 'camera',
        cameraType: 'orthographic',
        orthoSize: 5,
        near: 0.1,
        far: 100,
        properties: { name: 'OrthoCamera' },
      },
    ];

    const result = await exporter.export(sg);

    expect(result.document.cameras).toBeDefined();
    expect(result.document.cameras![0].type).toBe('orthographic');
    expect(result.document.cameras![0].orthographic).toBeDefined();
    expect(result.document.cameras![0].orthographic?.xmag).toBe(5);
  });

  it('links camera to node', async () => {
    const exporter = new GLTFExporter({ includeCameras: true });
    const sg = createTestSceneGraph();
    sg.root.components = [
      {
        type: 'camera',
        cameraType: 'perspective',
        fov: 45,
        near: 0.1,
        far: 500,
        properties: {},
      },
    ];

    const result = await exporter.export(sg);
    const rootNode = result.document.nodes![0];

    expect(rootNode.camera).toBeDefined();
    expect(rootNode.camera).toBe(0);
  });

  it('skips cameras when disabled', async () => {
    const exporter = new GLTFExporter({ includeCameras: false });
    const sg = createTestSceneGraph();
    sg.root.components = [
      {
        type: 'camera',
        cameraType: 'perspective',
        fov: 60,
        properties: {},
      },
    ];

    const result = await exporter.export(sg);

    expect(result.document.cameras?.length || 0).toBe(0);
  });
});

// ============================================================================
// Statistics Tests
// ============================================================================

describe('GLTFExporter Statistics', () => {
  it('reports accurate node count', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();
    sg.root.children = [createTestNode('A'), createTestNode('B')];

    const result = await exporter.export(sg);

    expect(result.stats.nodeCount).toBe(3);
  });

  it('reports accurate mesh count', async () => {
    const exporter = new GLTFExporter();
    const sg = createMinimalSceneGraphWithBuffer();

    const result = await exporter.export(sg);

    expect(result.stats.meshCount).toBe(1);
  });

  it('reports accurate material count', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();
    sg.materials = [createTestMaterial('m1', 'Mat1'), createTestMaterial('m2', 'Mat2')];

    const result = await exporter.export(sg);

    expect(result.stats.materialCount).toBe(2);
  });

  it('reports export time', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();

    const result = await exporter.export(sg);

    expect(result.stats.exportTime).toBeGreaterThan(0);
  });

  it('reports buffer size for binary export', async () => {
    const exporter = new GLTFExporter({ binary: true });
    const sg = createMinimalSceneGraphWithBuffer();

    const result = await exporter.export(sg);

    expect(result.stats.bufferSize).toBeGreaterThan(0);
  });
});

// ============================================================================
// Document Validation Tests
// ============================================================================

describe('GLTFExporter Document Validation', () => {
  it('produces valid GLTF 2.0 document', async () => {
    const exporter = new GLTFExporter();
    const sg = createMinimalSceneGraphWithBuffer();

    const result = await exporter.export(sg);
    const errors = validateGLTFDocument(result.document);

    expect(errors.length).toBe(0);
  });

  it('sets generator metadata', async () => {
    const exporter = new GLTFExporter({ generator: 'CustomGenerator v1.0' });
    const sg = createTestSceneGraph();

    const result = await exporter.export(sg);

    expect(result.document.asset.generator).toBe('CustomGenerator v1.0');
  });

  it('sets copyright metadata', async () => {
    const exporter = new GLTFExporter({ copyright: '2024 Test Corp' });
    const sg = createTestSceneGraph();

    const result = await exporter.export(sg);

    expect(result.document.asset.copyright).toBe('2024 Test Corp');
  });

  it('cleans up empty arrays', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();
    // No meshes, materials, etc.

    const result = await exporter.export(sg);

    // Empty arrays should be removed
    expect(result.document.meshes).toBeUndefined();
    expect(result.document.materials).toBeUndefined();
    expect(result.document.textures).toBeUndefined();
    expect(result.document.animations).toBeUndefined();
    expect(result.document.skins).toBeUndefined();
  });
});

// ============================================================================
// Multi-Export Tests
// ============================================================================

describe('GLTFExporter Multiple Exports', () => {
  it('can export multiple scenes sequentially', async () => {
    const exporter = new GLTFExporter();

    const sg1 = createTestSceneGraph('Scene1');
    const sg2 = createTestSceneGraph('Scene2');

    const result1 = await exporter.export(sg1);
    const result2 = await exporter.export(sg2);

    expect(result1.document.scenes![0].name).toBe('Scene1');
    expect(result2.document.scenes![0].name).toBe('Scene2');
  });

  it('resets internal state between exports', async () => {
    const exporter = new GLTFExporter();

    const sg1 = createMinimalSceneGraphWithBuffer();
    const sg2 = createTestSceneGraph('Empty');

    await exporter.export(sg1);
    const result2 = await exporter.export(sg2);

    // Second export should not have mesh from first
    expect(result2.document.meshes).toBeUndefined();
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('GLTFExporter Edge Cases', () => {
  it('handles node with default transform', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();
    sg.root.transform = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    };

    const result = await exporter.export(sg);

    expect(result.document.nodes).toBeDefined();
  });

  it('handles empty children array', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();
    sg.root.children = [];

    const result = await exporter.export(sg);

    expect(result.document.nodes![0].children).toBeUndefined();
  });

  it('handles node with empty components array', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();
    sg.root.components = [];

    const result = await exporter.export(sg);

    expect(result.document.nodes).toBeDefined();
    expect(result.document.nodes![0]).toBeDefined();
  });

  it('handles material without textures', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();
    const mat = createTestMaterial('m1', 'NoTextures');
    mat.baseColorTexture = undefined;
    mat.metallicRoughnessTexture = undefined;
    mat.normalTexture = undefined;
    mat.occlusionTexture = undefined;
    mat.emissiveTexture = undefined;
    sg.materials = [mat];

    const result = await exporter.export(sg);

    expect(result.document.materials![0].pbrMetallicRoughness?.baseColorTexture).toBeUndefined();
  });

  it('handles material with all texture types', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();

    sg.textures = [
      createTestTexture('base', 'BaseColor'),
      createTestTexture('mr', 'MetallicRoughness'),
      createTestTexture('normal', 'Normal'),
      createTestTexture('occlusion', 'Occlusion'),
      createTestTexture('emissive', 'Emissive'),
    ];

    const mat = createTestMaterial('m1', 'AllTextures');
    mat.baseColorTexture = { id: 'base', uvChannel: 0 };
    mat.metallicRoughnessTexture = { id: 'mr', uvChannel: 0 };
    mat.normalTexture = { id: 'normal', uvChannel: 0 };
    mat.occlusionTexture = { id: 'occlusion', uvChannel: 0 };
    mat.emissiveTexture = { id: 'emissive', uvChannel: 0 };
    sg.materials = [mat];

    const result = await exporter.export(sg);

    expect(result.document.materials![0].pbrMetallicRoughness?.baseColorTexture).toBeDefined();
    expect(
      result.document.materials![0].pbrMetallicRoughness?.metallicRoughnessTexture
    ).toBeDefined();
    expect(result.document.materials![0].normalTexture).toBeDefined();
    expect(result.document.materials![0].occlusionTexture).toBeDefined();
    expect(result.document.materials![0].emissiveTexture).toBeDefined();
  });

  it('handles mesh with multiple primitives', async () => {
    const exporter = new GLTFExporter();
    const sg = createMinimalSceneGraphWithBuffer();
    sg.meshes[0].primitives.push({
      attributes: { POSITION: 0 },
      indices: 1,
      mode: 'lines',
    });

    const result = await exporter.export(sg);

    expect(result.document.meshes![0].primitives.length).toBe(2);
  });

  it('handles texture with embedded data URI', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();

    const texture = createTestTexture('embedded', 'Embedded');
    texture.sourceType = 'dataUri';
    texture.source = 'data:image/png;base64,iVBORw0KGgo=';
    sg.textures = [texture];

    const result = await exporter.export(sg);

    expect(result.document.images![0].uri).toContain('data:image/png');
  });

  it('handles all alpha modes', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph();

    sg.materials = [
      { ...createTestMaterial('m1', 'Opaque'), alphaMode: 'opaque' },
      { ...createTestMaterial('m2', 'Mask'), alphaMode: 'mask', alphaCutoff: 0.5 },
      { ...createTestMaterial('m3', 'Blend'), alphaMode: 'blend' },
    ];

    const result = await exporter.export(sg);

    expect(result.document.materials![0].alphaMode).toBe('OPAQUE');
    expect(result.document.materials![1].alphaMode).toBe('MASK');
    expect(result.document.materials![2].alphaMode).toBe('BLEND');
  });

  it('handles deep buffer view references', async () => {
    const exporter = new GLTFExporter();
    const sg = createMinimalSceneGraphWithBuffer();

    const result = await exporter.export(sg);

    expect(result.document.bufferViews!.length).toBeGreaterThanOrEqual(2);
    result.document.bufferViews!.forEach((bv) => {
      expect(bv.buffer).toBe(0);
      expect(bv.byteOffset).toBeGreaterThanOrEqual(0);
      expect(bv.byteLength).toBeGreaterThan(0);
    });
  });

  it('handles accessor min/max values', async () => {
    const exporter = new GLTFExporter();
    const sg = createMinimalSceneGraphWithBuffer();

    const result = await exporter.export(sg);

    const posAccessor = result.document.accessors!.find((a) => a.type === 'VEC3');
    if (posAccessor) {
      expect(posAccessor.min).toBeDefined();
      expect(posAccessor.max).toBeDefined();
    }
  });

  it('produces consistent GLB output for same input', async () => {
    const exporter = new GLTFExporter({ binary: true });
    const sg1 = createTestSceneGraph('ConsistentTest');
    const sg2 = createTestSceneGraph('ConsistentTest');

    const result1 = await exporter.export(sg1);
    const result2 = await exporter.export(sg2);

    expect(result1.glb!.byteLength).toBe(result2.glb!.byteLength);
  });

  it('handles large node count efficiently', async () => {
    const exporter = new GLTFExporter();
    const sg = createTestSceneGraph('Large');

    sg.root.children = [];
    for (let i = 0; i < 20; i++) {
      sg.root.children.push(createTestNode(`Node${i}`));
    }

    const start = performance.now();
    const result = await exporter.export(sg);
    const duration = performance.now() - start;

    expect(result.document.nodes!.length).toBe(21);
    expect(duration).toBeLessThan(1000);
  });
});
