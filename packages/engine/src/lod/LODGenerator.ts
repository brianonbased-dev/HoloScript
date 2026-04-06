/**
 * @holoscript/core LOD Generator
 *
 * Automatic LOD generation through mesh simplification.
 * Implements Quadric Error Metrics (QEM) and other algorithms
 * for generating multiple LOD levels from a high-poly mesh.
 */

import {
  LODLevel,
  LODConfig,
  LODGenerationOptions,
  LODGenerationResult,
  GeneratedLODLevel,
  SimplificationAlgorithm,
  DEFAULT_GENERATION_OPTIONS,
  createLODLevel,
} from './LODTypes';

// ============================================================================
// Mesh Data Types
// ============================================================================

/**
 * Input mesh data for LOD generation
 */
export interface MeshData {
  /** Vertex positions (x, y, z for each vertex) */
  positions: Float32Array;

  /** Vertex normals (optional) */
  normals?: Float32Array;

  /** Texture coordinates (optional) */
  uvs?: Float32Array;

  /** Triangle indices */
  indices: Uint32Array;

  /** Vertex colors (optional) */
  colors?: Float32Array;
}

/**
 * Validation result for mesh data
 */
export interface MeshValidation {
  valid: boolean;
  vertexCount: number;
  triangleCount: number;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Internal Types for Simplification
// ============================================================================

interface Vertex {
  id: number;
  position: [number, number, number];
  normal?: [number, number, number];
  uv?: [number, number];
  quadric: number[][];
  edges: Set<number>;
  removed: boolean;
}

interface Edge {
  id: number;
  v1: number;
  v2: number;
  error: number;
  optimalPosition: [number, number, number];
  removed: boolean;
}

interface Triangle {
  id: number;
  vertices: [number, number, number];
  normal: [number, number, number];
  removed: boolean;
}

// ============================================================================
// LOD Generator Class
// ============================================================================

/**
 * LOD Generator for creating simplified mesh levels
 */
export class LODGenerator {
  private options: LODGenerationOptions;

  constructor(options?: Partial<LODGenerationOptions>) {
    this.options = { ...DEFAULT_GENERATION_OPTIONS, ...options };
  }

  /**
   * Generate multiple LOD levels from a mesh
   */
  generate(mesh: MeshData): LODGenerationResult {
    const startTime = performance.now();
    const warnings: string[] = [];
    const errors: string[] = [];

    // Validate input mesh
    const validation = this.validateMesh(mesh);
    if (!validation.valid) {
      return {
        success: false,
        levels: [],
        generationTimeMs: performance.now() - startTime,
        warnings: validation.warnings,
        errors: validation.errors,
      };
    }

    warnings.push(...validation.warnings);

    const levels: GeneratedLODLevel[] = [];
    let currentMesh = this.cloneMesh(mesh);
    const originalTriCount = validation.triangleCount;

    // Level 0 is the original mesh
    levels.push({
      level: 0,
      triangleCount: validation.triangleCount,
      vertexCount: validation.vertexCount,
      reductionRatio: 1.0,
      errorMetric: 0,
      positions: mesh.positions,
      normals: mesh.normals,
      uvs: mesh.uvs,
      indices: mesh.indices,
    });

    // Generate subsequent LOD levels
    for (let i = 1; i < this.options.levelCount; i++) {
      const targetRatio = Math.pow(this.options.reductionPerLevel, i);
      const targetTriangles = Math.floor(originalTriCount * targetRatio);

      try {
        const simplified = this.simplifyMesh(currentMesh, targetTriangles, this.options.algorithm);

        const actualTriCount = simplified.indices.length / 3;
        const actualVertCount = simplified.positions.length / 3;

        levels.push({
          level: i,
          triangleCount: actualTriCount,
          vertexCount: actualVertCount,
          reductionRatio: actualTriCount / originalTriCount,
          errorMetric: this.calculateError(mesh, simplified),
          positions: simplified.positions,
          normals: simplified.normals,
          uvs: simplified.uvs,
          indices: simplified.indices,
        });

        currentMesh = simplified;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Level ${i} generation warning: ${message}`);

        // Use previous level as fallback
        if (levels.length > 0) {
          const prev = levels[levels.length - 1];
          levels.push({
            ...prev,
            level: i,
            reductionRatio: prev.reductionRatio,
          });
        }
      }
    }

    return {
      success: true,
      levels,
      generationTimeMs: performance.now() - startTime,
      warnings,
      errors,
    };
  }

  /**
   * Generate a single LOD level at a specific reduction ratio
   */
  generateLevel(mesh: MeshData, targetRatio: number, level: number = 1): GeneratedLODLevel {
    const validation = this.validateMesh(mesh);
    if (!validation.valid) {
      throw new Error(`Invalid mesh: ${validation.errors.join(', ')}`);
    }

    const targetTriangles = Math.floor(validation.triangleCount * targetRatio);
    const simplified = this.simplifyMesh(mesh, targetTriangles, this.options.algorithm);

    return {
      level,
      triangleCount: simplified.indices.length / 3,
      vertexCount: simplified.positions.length / 3,
      reductionRatio: simplified.indices.length / 3 / validation.triangleCount,
      errorMetric: this.calculateError(mesh, simplified),
      positions: simplified.positions,
      normals: simplified.normals,
      uvs: simplified.uvs,
      indices: simplified.indices,
    };
  }

  /**
   * Create LOD configuration from generated levels
   */
  createConfigFromLevels(
    id: string,
    levels: GeneratedLODLevel[],
    baseDistance: number = 10
  ): LODConfig {
    const lodLevels: LODLevel[] = levels.map((level, index) => {
      const distance = index === 0 ? 0 : baseDistance * Math.pow(2, index - 1);

      return createLODLevel(level.level, distance, level.reductionRatio, {
        triangleCount: level.triangleCount,
        textureScale: Math.max(0.25, level.reductionRatio),
      });
    });

    return {
      id,
      strategy: 'distance',
      transition: 'crossfade',
      transitionDuration: 0.3,
      levels: lodLevels,
      hysteresis: 0.1,
      bias: 0,
      fadeEnabled: true,
      enabled: true,
    };
  }

  // ==========================================================================
  // Simplification Algorithms
  // ==========================================================================

  /**
   * Simplify mesh to target triangle count
   */
  private simplifyMesh(
    mesh: MeshData,
    targetTriangles: number,
    algorithm: SimplificationAlgorithm
  ): MeshData {
    switch (algorithm) {
      case 'quadricError':
        return this.simplifyQuadricError(mesh, targetTriangles);
      case 'edgeCollapse':
        return this.simplifyEdgeCollapse(mesh, targetTriangles);
      case 'vertexClustering':
        return this.simplifyVertexClustering(mesh, targetTriangles);
      case 'voxel':
        return this.simplifyVoxel(mesh, targetTriangles);
      default:
        return this.simplifyQuadricError(mesh, targetTriangles);
    }
  }

  /**
   * Quadric Error Metrics simplification (Garland & Heckbert)
   */
  private simplifyQuadricError(mesh: MeshData, targetTriangles: number): MeshData {
    const vertexCount = mesh.positions.length / 3;
    const triangleCount = mesh.indices.length / 3;

    if (targetTriangles >= triangleCount) {
      return this.cloneMesh(mesh);
    }

    // Build vertex and triangle structures
    const vertices: Vertex[] = [];
    const triangles: Triangle[] = [];
    const edges: Edge[] = [];
    const edgeMap = new Map<string, number>();

    // Initialize vertices
    for (let i = 0; i < vertexCount; i++) {
      vertices.push({
        id: i,
        position: [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]],
        normal: mesh.normals
          ? [mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]]
          : undefined,
        uv: mesh.uvs ? [mesh.uvs[i * 2], mesh.uvs[i * 2 + 1]] : undefined,
        quadric: this.createZeroMatrix(4),
        edges: new Set(),
        removed: false,
      });
    }

    // Build triangles and compute quadrics
    for (let i = 0; i < triangleCount; i++) {
      const i0 = mesh.indices[i * 3];
      const i1 = mesh.indices[i * 3 + 1];
      const i2 = mesh.indices[i * 3 + 2];

      const v0 = vertices[i0].position;
      const v1 = vertices[i1].position;
      const v2 = vertices[i2].position;

      // Calculate face normal
      const normal = this.calculateNormal(v0, v1, v2);

      triangles.push({
        id: i,
        vertices: [i0, i1, i2],
        normal,
        removed: false,
      });

      // Calculate plane equation coefficients
      const plane = this.calculatePlane(v0, normal);
      const quadric = this.calculateQuadricFromPlane(plane);

      // Add quadric to each vertex
      this.addMatrices(vertices[i0].quadric, quadric);
      this.addMatrices(vertices[i1].quadric, quadric);
      this.addMatrices(vertices[i2].quadric, quadric);

      // Add edges
      this.addEdge(i0, i1, vertices, edges, edgeMap);
      this.addEdge(i1, i2, vertices, edges, edgeMap);
      this.addEdge(i2, i0, vertices, edges, edgeMap);
    }

    // Calculate initial edge errors
    for (const edge of edges) {
      this.updateEdgeError(edge, vertices);
    }

    // Create priority queue (simple array sorted by error)
    const edgeQueue = edges.filter((e) => !e.removed).sort((a, b) => a.error - b.error);

    // Collapse edges until target is reached
    let currentTriangles = triangleCount;
    const _trianguesToRemove = triangleCount - targetTriangles;

    while (currentTriangles > targetTriangles && edgeQueue.length > 0) {
      // Find minimum error edge
      const minEdge = edgeQueue.shift();
      if (!minEdge || minEdge.removed) continue;

      const v1 = vertices[minEdge.v1];
      const v2 = vertices[minEdge.v2];

      if (v1.removed || v2.removed) continue;

      // Check preservation options
      if (this.shouldPreserveEdge(minEdge, v1, v2, mesh)) {
        continue;
      }

      // Collapse edge: merge v2 into v1
      v1.position = minEdge.optimalPosition;
      this.addMatrices(v1.quadric, v2.quadric);

      // Update triangles
      let removedTris = 0;
      for (const tri of triangles) {
        if (tri.removed) continue;

        const hasV1 = tri.vertices.includes(minEdge.v1);
        const hasV2 = tri.vertices.includes(minEdge.v2);

        if (hasV1 && hasV2) {
          // Degenerate triangle, remove it
          tri.removed = true;
          removedTris++;
        } else if (hasV2) {
          // Replace v2 with v1
          const idx = tri.vertices.indexOf(minEdge.v2);
          tri.vertices[idx] = minEdge.v1;
        }
      }

      currentTriangles -= removedTris;

      // Mark v2 as removed
      v2.removed = true;

      // Update edges connected to v2
      for (const edgeId of v2.edges) {
        const edge = edges[edgeId];
        if (edge && !edge.removed) {
          if (edge.v1 === minEdge.v2) edge.v1 = minEdge.v1;
          if (edge.v2 === minEdge.v2) edge.v2 = minEdge.v1;

          if (edge.v1 === edge.v2) {
            edge.removed = true;
          } else {
            this.updateEdgeError(edge, vertices);
            v1.edges.add(edgeId);
          }
        }
      }

      minEdge.removed = true;

      // Re-sort remaining edges (in production, use a proper priority queue)
      edgeQueue.sort((a, b) => a.error - b.error);
    }

    // Rebuild mesh data
    return this.rebuildMesh(vertices, triangles, mesh);
  }

  /**
   * Simple edge collapse simplification
   */
  private simplifyEdgeCollapse(mesh: MeshData, targetTriangles: number): MeshData {
    // Simplified version using random edge collapse
    // In production, this would use a more sophisticated approach
    return this.simplifyQuadricError(mesh, targetTriangles);
  }

  /**
   * Vertex clustering simplification
   */
  private simplifyVertexClustering(mesh: MeshData, targetTriangles: number): MeshData {
    const vertexCount = mesh.positions.length / 3;
    const triangleCount = mesh.indices.length / 3;

    if (targetTriangles >= triangleCount) {
      return this.cloneMesh(mesh);
    }

    // Calculate grid size based on target reduction
    const reduction = targetTriangles / triangleCount;
    const gridResolution = Math.ceil(Math.pow(vertexCount * reduction, 1 / 3));

    // Find bounding box
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    for (let i = 0; i < vertexCount; i++) {
      const x = mesh.positions[i * 3];
      const y = mesh.positions[i * 3 + 1];
      const z = mesh.positions[i * 3 + 2];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }

    const cellSizeX = (maxX - minX) / gridResolution;
    const cellSizeY = (maxY - minY) / gridResolution;
    const cellSizeZ = (maxZ - minZ) / gridResolution;

    // Map vertices to grid cells
    const cellVertices = new Map<string, number[]>();
    const vertexToCellRepresentative = new Map<number, number>();

    for (let i = 0; i < vertexCount; i++) {
      const x = mesh.positions[i * 3];
      const y = mesh.positions[i * 3 + 1];
      const z = mesh.positions[i * 3 + 2];

      const cellX = Math.floor((x - minX) / cellSizeX);
      const cellY = Math.floor((y - minY) / cellSizeY);
      const cellZ = Math.floor((z - minZ) / cellSizeZ);

      const key = `${cellX},${cellY},${cellZ}`;

      if (!cellVertices.has(key)) {
        cellVertices.set(key, []);
      }
      cellVertices.get(key)!.push(i);
    }

    // Create representative vertex for each cell
    const newPositions: number[] = [];
    const newNormals: number[] = [];
    const newUVs: number[] = [];
    let newVertexIndex = 0;

    for (const [, vertices] of cellVertices) {
      // Average position
      let avgX = 0,
        avgY = 0,
        avgZ = 0;
      let avgNx = 0,
        avgNy = 0,
        avgNz = 0;
      let avgU = 0,
        avgV = 0;

      for (const vi of vertices) {
        avgX += mesh.positions[vi * 3];
        avgY += mesh.positions[vi * 3 + 1];
        avgZ += mesh.positions[vi * 3 + 2];

        if (mesh.normals) {
          avgNx += mesh.normals[vi * 3];
          avgNy += mesh.normals[vi * 3 + 1];
          avgNz += mesh.normals[vi * 3 + 2];
        }

        if (mesh.uvs) {
          avgU += mesh.uvs[vi * 2];
          avgV += mesh.uvs[vi * 2 + 1];
        }

        vertexToCellRepresentative.set(vi, newVertexIndex);
      }

      const count = vertices.length;
      newPositions.push(avgX / count, avgY / count, avgZ / count);

      if (mesh.normals) {
        const len = Math.sqrt(avgNx * avgNx + avgNy * avgNy + avgNz * avgNz);
        newNormals.push(avgNx / len, avgNy / len, avgNz / len);
      }

      if (mesh.uvs) {
        newUVs.push(avgU / count, avgV / count);
      }

      newVertexIndex++;
    }

    // Rebuild triangles with new indices
    const newIndices: number[] = [];

    for (let i = 0; i < triangleCount; i++) {
      const i0 = vertexToCellRepresentative.get(mesh.indices[i * 3])!;
      const i1 = vertexToCellRepresentative.get(mesh.indices[i * 3 + 1])!;
      const i2 = vertexToCellRepresentative.get(mesh.indices[i * 3 + 2])!;

      // Skip degenerate triangles
      if (i0 !== i1 && i1 !== i2 && i2 !== i0) {
        newIndices.push(i0, i1, i2);
      }
    }

    return {
      positions: new Float32Array(newPositions),
      normals: mesh.normals ? new Float32Array(newNormals) : undefined,
      uvs: mesh.uvs ? new Float32Array(newUVs) : undefined,
      indices: new Uint32Array(newIndices),
    };
  }

  /**
   * Voxelization-based simplification
   */
  private simplifyVoxel(mesh: MeshData, targetTriangles: number): MeshData {
    // Use vertex clustering as a simpler approximation
    return this.simplifyVertexClustering(mesh, targetTriangles);
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Validate mesh data
   */
  validateMesh(mesh: MeshData): MeshValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!mesh.positions || mesh.positions.length === 0) {
      errors.push('Mesh has no position data');
    }

    if (!mesh.indices || mesh.indices.length === 0) {
      errors.push('Mesh has no index data');
    }

    if (mesh.indices && mesh.indices.length % 3 !== 0) {
      errors.push('Index count must be divisible by 3');
    }

    const vertexCount = mesh.positions ? mesh.positions.length / 3 : 0;
    const triangleCount = mesh.indices ? mesh.indices.length / 3 : 0;

    // Check for out of range indices
    if (mesh.indices) {
      for (let i = 0; i < mesh.indices.length; i++) {
        if (mesh.indices[i] >= vertexCount) {
          errors.push(`Index ${i} (${mesh.indices[i]}) is out of range`);
          break;
        }
      }
    }

    if (mesh.normals && mesh.normals.length !== mesh.positions?.length) {
      warnings.push('Normal count does not match vertex count');
    }

    if (mesh.uvs && mesh.uvs.length !== vertexCount * 2) {
      warnings.push('UV count does not match vertex count');
    }

    if (triangleCount < 4) {
      warnings.push('Mesh has very few triangles');
    }

    return {
      valid: errors.length === 0,
      vertexCount,
      triangleCount,
      errors,
      warnings,
    };
  }

  /**
   * Clone mesh data
   */
  private cloneMesh(mesh: MeshData): MeshData {
    return {
      positions: new Float32Array(mesh.positions),
      normals: mesh.normals ? new Float32Array(mesh.normals) : undefined,
      uvs: mesh.uvs ? new Float32Array(mesh.uvs) : undefined,
      indices: new Uint32Array(mesh.indices),
      colors: mesh.colors ? new Float32Array(mesh.colors) : undefined,
    };
  }

  /**
   * Calculate face normal
   */
  private calculateNormal(
    v0: [number, number, number],
    v1: [number, number, number],
    v2: [number, number, number]
  ): [number, number, number] {
    const e1: [number, number, number] = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const e2: [number, number, number] = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];

    const nx = e1[1] * e2[2] - e1[2] * e2[1];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];

    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    return len > 0 ? [nx / len, ny / len, nz / len] : [0, 1, 0];
  }

  /**
   * Calculate plane equation from point and normal
   */
  private calculatePlane(
    point: [number, number, number],
    normal: [number, number, number]
  ): [number, number, number, number] {
    const d = -(normal[0] * point[0] + normal[1] * point[1] + normal[2] * point[2]);
    return [normal[0], normal[1], normal[2], d];
  }

  /**
   * Calculate quadric matrix from plane equation
   */
  private calculateQuadricFromPlane(plane: [number, number, number, number]): number[][] {
    const [a, b, c, d] = plane;
    return [
      [a * a, a * b, a * c, a * d],
      [a * b, b * b, b * c, b * d],
      [a * c, b * c, c * c, c * d],
      [a * d, b * d, c * d, d * d],
    ];
  }

  /**
   * Create zero 4x4 matrix
   */
  private createZeroMatrix(size: number): number[][] {
    return Array(size)
      .fill(null)
      .map(() => Array(size).fill(0));
  }

  /**
   * Add matrices in place
   */
  private addMatrices(a: number[][], b: number[][]): void {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        a[i][j] += b[i][j];
      }
    }
  }

  /**
   * Add edge to edge list
   */
  private addEdge(
    v1: number,
    v2: number,
    vertices: Vertex[],
    edges: Edge[],
    edgeMap: Map<string, number>
  ): void {
    const key = v1 < v2 ? `${v1}-${v2}` : `${v2}-${v1}`;

    if (!edgeMap.has(key)) {
      const edgeId = edges.length;
      edges.push({
        id: edgeId,
        v1: Math.min(v1, v2),
        v2: Math.max(v1, v2),
        error: 0,
        optimalPosition: [0, 0, 0],
        removed: false,
      });
      edgeMap.set(key, edgeId);
      vertices[v1].edges.add(edgeId);
      vertices[v2].edges.add(edgeId);
    }
  }

  /**
   * Update edge error using quadric metrics
   */
  private updateEdgeError(edge: Edge, vertices: Vertex[]): void {
    const v1 = vertices[edge.v1];
    const v2 = vertices[edge.v2];

    if (v1.removed || v2.removed) {
      edge.removed = true;
      return;
    }

    // Combine quadrics
    const Q: number[][] = this.createZeroMatrix(4);
    this.addMatrices(Q, v1.quadric);
    this.addMatrices(Q, v2.quadric);

    // Try to find optimal position by solving linear system
    // Simplified: use midpoint
    edge.optimalPosition = [
      (v1.position[0] + v2.position[0]) / 2,
      (v1.position[1] + v2.position[1]) / 2,
      (v1.position[2] + v2.position[2]) / 2,
    ];

    // Calculate error at optimal position
    const p = edge.optimalPosition;
    const v = [p[0], p[1], p[2], 1];

    let error = 0;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        error += v[i] * Q[i][j] * v[j];
      }
    }

    edge.error = Math.abs(error);
  }

  /**
   * Check if edge should be preserved
   */
  private shouldPreserveEdge(edge: Edge, v1: Vertex, v2: Vertex, _mesh: MeshData): boolean {
    // Preserve UV seams
    if (this.options.preserveUVSeams && v1.uv && v2.uv) {
      const uvDist = Math.sqrt(Math.pow(v1.uv[0] - v2.uv[0], 2) + Math.pow(v1.uv[1] - v2.uv[1], 2));
      if (uvDist > 0.5) return true;
    }

    // Preserve hard edges (normal discontinuity)
    if (this.options.preserveHardEdges && v1.normal && v2.normal) {
      const dot =
        v1.normal[0] * v2.normal[0] + v1.normal[1] * v2.normal[1] + v1.normal[2] * v2.normal[2];
      if (dot < 0.5) return true;
    }

    return false;
  }

  /**
   * Rebuild mesh from simplified data
   */
  private rebuildMesh(vertices: Vertex[], triangles: Triangle[], originalMesh: MeshData): MeshData {
    // Map old vertex indices to new
    const vertexMap = new Map<number, number>();
    const newPositions: number[] = [];
    const newNormals: number[] = [];
    const newUVs: number[] = [];
    let newIndex = 0;

    for (const vertex of vertices) {
      if (!vertex.removed) {
        vertexMap.set(vertex.id, newIndex);
        newPositions.push(...vertex.position);

        if (vertex.normal) {
          newNormals.push(...vertex.normal);
        }

        if (vertex.uv) {
          newUVs.push(...vertex.uv);
        }

        newIndex++;
      }
    }

    // Rebuild indices
    const newIndices: number[] = [];

    for (const tri of triangles) {
      if (!tri.removed) {
        const i0 = vertexMap.get(tri.vertices[0]);
        const i1 = vertexMap.get(tri.vertices[1]);
        const i2 = vertexMap.get(tri.vertices[2]);

        if (i0 !== undefined && i1 !== undefined && i2 !== undefined) {
          newIndices.push(i0, i1, i2);
        }
      }
    }

    return {
      positions: new Float32Array(newPositions),
      normals: originalMesh.normals ? new Float32Array(newNormals) : undefined,
      uvs: originalMesh.uvs ? new Float32Array(newUVs) : undefined,
      indices: new Uint32Array(newIndices),
    };
  }

  /**
   * Calculate visual error between two meshes
   */
  private calculateError(original: MeshData, simplified: MeshData): number {
    // Simplified error metric: ratio of vertices removed
    const originalVerts = original.positions.length / 3;
    const simplifiedVerts = simplified.positions.length / 3;
    return 1 - simplifiedVerts / originalVerts;
  }

  /**
   * Update generator options
   */
  setOptions(options: Partial<LODGenerationOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current options
   */
  getOptions(): LODGenerationOptions {
    return { ...this.options };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create LOD generator with default options
 */
export function createLODGenerator(options?: Partial<LODGenerationOptions>): LODGenerator {
  return new LODGenerator(options);
}

/**
 * Generate LOD levels for a mesh with default settings
 */
export function generateLODs(mesh: MeshData, levelCount: number = 3): LODGenerationResult {
  const generator = new LODGenerator({ levelCount });
  return generator.generate(mesh);
}

/**
 * Create a simple cube mesh for testing
 */
export function createTestCube(): MeshData {
  // Simple cube with 8 vertices, 12 triangles
  const positions = new Float32Array([
    // Front face
    -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
    // Back face
    -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1, -1,
    // Top face
    -1, 1, -1, -1, 1, 1, 1, 1, 1, 1, 1, -1,
    // Bottom face
    -1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1,
    // Right face
    1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1,
    // Left face
    -1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1,
  ]);

  const indices = new Uint32Array([
    0,
    1,
    2,
    0,
    2,
    3, // front
    4,
    5,
    6,
    4,
    6,
    7, // back
    8,
    9,
    10,
    8,
    10,
    11, // top
    12,
    13,
    14,
    12,
    14,
    15, // bottom
    16,
    17,
    18,
    16,
    18,
    19, // right
    20,
    21,
    22,
    20,
    22,
    23, // left
  ]);

  return { positions, indices };
}

/**
 * Create a higher-poly sphere for testing
 */
export function createTestSphere(segments: number = 16): MeshData {
  const positions: number[] = [];
  const indices: number[] = [];

  // Generate sphere vertices
  for (let lat = 0; lat <= segments; lat++) {
    const theta = (lat * Math.PI) / segments;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let lon = 0; lon <= segments; lon++) {
      const phi = (lon * 2 * Math.PI) / segments;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      positions.push(cosPhi * sinTheta, cosTheta, sinPhi * sinTheta);
    }
  }

  // Generate indices
  for (let lat = 0; lat < segments; lat++) {
    for (let lon = 0; lon < segments; lon++) {
      const first = lat * (segments + 1) + lon;
      const second = first + segments + 1;

      indices.push(first, second, first + 1);
      indices.push(second, second + 1, first + 1);
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}
