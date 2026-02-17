import { describe, it, expect, beforeEach } from 'vitest';
import { LODGenerator } from '../LODGenerator';
import type { MeshData } from '../LODGenerator';

/** Build a simple 2-triangle quad mesh */
function makeQuadMesh(): MeshData {
  return {
    positions: new Float32Array([
      0, 0, 0,  1, 0, 0,  1, 1, 0,
      0, 0, 0,  1, 1, 0,  0, 1, 0,
    ]),
    normals: new Float32Array([
      0, 0, 1,  0, 0, 1,  0, 0, 1,
      0, 0, 1,  0, 0, 1,  0, 0, 1,
    ]),
    indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
  };
}

/** Build a higher-poly grid mesh for actual simplification */
function makeGridMesh(gridSize: number = 8): MeshData {
  const vertCount = (gridSize + 1) * (gridSize + 1);
  const triCount = gridSize * gridSize * 2;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const indices = new Uint32Array(triCount * 3);

  let vIdx = 0;
  for (let y = 0; y <= gridSize; y++) {
    for (let x = 0; x <= gridSize; x++) {
      positions[vIdx * 3] = x;
      positions[vIdx * 3 + 1] = y;
      positions[vIdx * 3 + 2] = 0;
      normals[vIdx * 3] = 0;
      normals[vIdx * 3 + 1] = 0;
      normals[vIdx * 3 + 2] = 1;
      vIdx++;
    }
  }

  let iIdx = 0;
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const i = y * (gridSize + 1) + x;
      indices[iIdx++] = i;
      indices[iIdx++] = i + 1;
      indices[iIdx++] = i + gridSize + 1;
      indices[iIdx++] = i + 1;
      indices[iIdx++] = i + gridSize + 2;
      indices[iIdx++] = i + gridSize + 1;
    }
  }

  return { positions, normals, indices };
}

describe('LODGenerator', () => {
  let generator: LODGenerator;

  beforeEach(() => {
    generator = new LODGenerator();
  });

  // ===========================================================================
  // Construction
  // ===========================================================================
  describe('construction', () => {
    it('creates with defaults', () => {
      expect(generator).toBeDefined();
    });

    it('accepts custom options', () => {
      const g = new LODGenerator({ levelCount: 4 });
      expect(g.getOptions().levelCount).toBe(4);
    });

    it('getOptions returns current options', () => {
      const opts = generator.getOptions();
      expect(opts).toBeDefined();
      expect(typeof opts.levelCount).toBe('number');
    });

    it('setOptions updates options', () => {
      generator.setOptions({ levelCount: 6 });
      expect(generator.getOptions().levelCount).toBe(6);
    });
  });

  // ===========================================================================
  // Mesh Validation
  // ===========================================================================
  describe('validateMesh', () => {
    it('validates a correct mesh', () => {
      const result = generator.validateMesh(makeQuadMesh());
      expect(result.valid).toBe(true);
      expect(result.vertexCount).toBeGreaterThan(0);
      expect(result.triangleCount).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('reports errors for empty mesh', () => {
      const result = generator.validateMesh({
        positions: new Float32Array(0),
        indices: new Uint32Array(0),
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('reports errors for invalid index count (not multiple of 3)', () => {
      const result = generator.validateMesh({
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]),
        indices: new Uint32Array([0, 1]),
      });
      expect(result.valid).toBe(false);
    });
  });

  // ===========================================================================
  // LOD Generation
  // ===========================================================================
  describe('generate', () => {
    it('generates LOD levels from a mesh', () => {
      const mesh = makeGridMesh(8);
      const result = generator.generate(mesh);
      expect(result).toBeDefined();
      expect(result.levels).toBeDefined();
      expect(result.levels.length).toBeGreaterThan(0);
    });

    it('each level has fewer or equal triangles than previous', () => {
      const mesh = makeGridMesh(10);
      const result = generator.generate(mesh);
      for (let i = 1; i < result.levels.length; i++) {
        const prevTris = result.levels[i - 1].indices.length / 3;
        const currTris = result.levels[i].indices.length / 3;
        expect(currTris).toBeLessThanOrEqual(prevTris);
      }
    });
  });

  // ===========================================================================
  // Single Level Generation
  // ===========================================================================
  describe('generateLevel', () => {
    it('generates a single LOD level at 50% reduction', () => {
      const mesh = makeGridMesh(8);
      const level = generator.generateLevel(mesh, 0.5, 1);
      expect(level).toBeDefined();
      expect(level.positions).toBeDefined();
      expect(level.indices.length).toBeLessThan(mesh.indices.length);
    });

    it('level at 1.0 ratio keeps all triangles', () => {
      const mesh = makeGridMesh(4);
      const level = generator.generateLevel(mesh, 1.0, 0);
      expect(level.indices.length / 3).toBe(mesh.indices.length / 3);
    });
  });

  // ===========================================================================
  // Mesh Cloning
  // ===========================================================================
  describe('cloneMesh', () => {
    it('clones mesh data without shared references', () => {
      const mesh = makeQuadMesh();
      const clone = generator.cloneMesh(mesh);
      expect(clone.positions.length).toBe(mesh.positions.length);
      expect(clone.indices.length).toBe(mesh.indices.length);
      clone.positions[0] = 999;
      expect(mesh.positions[0]).toBe(0);
    });
  });

  // ===========================================================================
  // LOD Config Creation
  // ===========================================================================
  describe('createConfigFromLevels', () => {
    it('creates LOD config from generated levels', () => {
      const mesh = makeGridMesh(8);
      const result = generator.generate(mesh);
      const config = generator.createConfigFromLevels('test-lod', result.levels, 10);
      expect(config).toBeDefined();
      expect(config.id).toBe('test-lod');
    });
  });

  // ===========================================================================
  // Error Calculation
  // ===========================================================================
  describe('calculateError', () => {
    it('returns 0 for identical meshes', () => {
      const mesh = makeQuadMesh();
      const error = generator.calculateError(mesh, mesh);
      expect(error).toBe(0);
    });
  });
});
