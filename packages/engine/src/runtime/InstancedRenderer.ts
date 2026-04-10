/**
 * InstancedRenderer.ts
 *
 * GPU instanced rendering system for massive object counts.
 * Allows rendering 10,000+ similar objects with minimal draw calls.
 *
 * Features:
 * - Automatic batching by geometry type and material
 * - GPU instancing (1 draw call per batch vs 1 per object)
 * - Dynamic instance management (add/remove/update)
 * - Transform matrix updates (position, rotation, scale)
 * - Material variation support
 * - Performance monitoring
 */

/** Typed accessor for globally-loaded Three.js. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getThree(): Record<string, any> | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as unknown as { THREE?: Record<string, any> }).THREE;
}

export interface InstancedObject {
  /** Unique instance ID */
  id: string;
  /** Batch key (geometry + material) */
  batchKey: string;
  /** Instance index in batch */
  instanceIndex: number;
  /** Transform matrix (16 floats) */
  matrix: Float32Array;
  /** Material color override */
  color?: [number, number, number];
  /** Visibility flag */
  visible: boolean;
}

export interface InstanceBatch {
  /** Batch identifier */
  key: string;
  /** Geometry type */
  geometryType: string;
  /** Material type */
  materialType: string;
  /** Three.js InstancedMesh */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instancedMesh: any;
  /** Maximum instances */
  maxInstances: number;
  /** Current instance count */
  count: number;
  /** Instance ID → Index mapping */
  instanceMap: Map<string, number>;
  /** Free instance indices (for reuse) */
  freeIndices: number[];
  /** Needs matrix update */
  needsUpdate: boolean;
}

export interface InstancedRenderingStats {
  /** Total batches */
  batchCount: number;
  /** Total instances across all batches */
  totalInstances: number;
  /** Draw calls (one per batch) */
  drawCalls: number;
  /** Memory usage (approximate, MB) */
  memoryUsage: number;
  /** Performance improvement vs non-instanced */
  improvement: string;
}

/**
 * Instanced Rendering Manager
 * Automatically batches similar objects for GPU instancing
 */
export class InstancedRenderer {
  private batches = new Map<string, InstanceBatch>();
  private objects = new Map<string, InstancedObject>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private scene: any; // THREE.Scene
  private maxInstancesPerBatch = 1000; // Configurable
  private enabled = true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(scene: any, maxInstancesPerBatch: number = 1000) {
    this.scene = scene;
    this.maxInstancesPerBatch = maxInstancesPerBatch;
  }

  /**
   * Add object to instanced rendering
   */
  public addInstance(
    id: string,
    geometryType: string,
    materialType: string,
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
    color?: [number, number, number]
  ): boolean {
    if (!this.enabled) return false;

    const batchKey = `${geometryType}_${materialType}`;

    // Get or create batch
    let batch = this.batches.get(batchKey);
    if (!batch) {
      const newBatch = this.createBatch(batchKey, geometryType, materialType);
      if (!newBatch) return false;
      batch = newBatch;
    }

    // Check if batch is full
    if (batch.count >= batch.maxInstances && batch.freeIndices.length === 0) {
      console.warn(
        `[InstancedRenderer] Batch ${batchKey} is full (${batch.maxInstances} instances)`
      );
      return false;
    }

    // Get instance index (reuse free index or use next available)
    const instanceIndex = batch.freeIndices.length > 0 ? batch.freeIndices.pop()! : batch.count++;

    // Create transform matrix
    const matrix = this.createTransformMatrix(position, rotation, scale);

    // Create instance object
    const instance: InstancedObject = {
      id,
      batchKey,
      instanceIndex,
      matrix,
      color,
      visible: true,
    };

    // Store instance
    this.objects.set(id, instance);
    batch.instanceMap.set(id, instanceIndex);

    // Update instanced mesh matrix
    batch.instancedMesh.setMatrixAt(instanceIndex, this.arrayToMatrix4(matrix));

    // Update color if provided
    if (color && batch.instancedMesh.instanceColor) {
      const THREE = getThree()!;
      batch.instancedMesh.setColorAt(instanceIndex, new THREE.Color(color[0], color[1], color[2]));
    }

    batch.needsUpdate = true;

    return true;
  }

  /**
   * Remove instance from rendering
   */
  public removeInstance(id: string): boolean {
    const instance = this.objects.get(id);
    if (!instance) return false;

    const batch = this.batches.get(instance.batchKey);
    if (!batch) return false;

    // Mark instance as invisible (hide by moving far away)
    const matrix = this.createTransformMatrix([999999, 999999, 999999], [0, 0, 0], [0, 0, 0]);
    batch.instancedMesh.setMatrixAt(instance.instanceIndex, this.arrayToMatrix4(matrix));
    batch.needsUpdate = true;

    // Add index to free list for reuse
    batch.freeIndices.push(instance.instanceIndex);
    batch.instanceMap.delete(id);

    // Remove from objects
    this.objects.delete(id);

    return true;
  }

  /**
   * Update instance transform
   */
  public updateInstance(
    id: string,
    position?: [number, number, number],
    rotation?: [number, number, number],
    scale?: [number, number, number]
  ): boolean {
    const instance = this.objects.get(id);
    if (!instance) return false;

    const batch = this.batches.get(instance.batchKey);
    if (!batch) return false;

    // Extract current transform from matrix
    const current = this.matrixToTransform(instance.matrix);

    // Apply updates
    const newPosition = position || current.position;
    const newRotation = rotation || current.rotation;
    const newScale = scale || current.scale;

    // Create new matrix
    const matrix = this.createTransformMatrix(newPosition, newRotation, newScale);
    instance.matrix = matrix;

    // Update instanced mesh
    batch.instancedMesh.setMatrixAt(instance.instanceIndex, this.arrayToMatrix4(matrix));
    batch.needsUpdate = true;

    return true;
  }

  /**
   * Update instance color
   */
  public updateInstanceColor(id: string, color: [number, number, number]): boolean {
    const instance = this.objects.get(id);
    if (!instance) return false;

    const batch = this.batches.get(instance.batchKey);
    if (!batch || !batch.instancedMesh.instanceColor) return false;

    const THREE = getThree()!;
    batch.instancedMesh.setColorAt(
      instance.instanceIndex,
      new THREE.Color(color[0], color[1], color[2])
    );

    instance.color = color;
    batch.needsUpdate = true;

    return true;
  }

  /**
   * Update all batches (call once per frame)
   */
  public update(): void {
    for (const batch of this.batches.values()) {
      if (batch.needsUpdate) {
        batch.instancedMesh.instanceMatrix.needsUpdate = true;
        if (batch.instancedMesh.instanceColor) {
          batch.instancedMesh.instanceColor.needsUpdate = true;
        }
        batch.needsUpdate = false;
      }
    }
  }

  /**
   * Create a new batch
   */
  private createBatch(
    key: string,
    geometryType: string,
    materialType: string
  ): InstanceBatch | null {
    if (!getThree()) return null;

    const THREE = getThree()!;

    // Create geometry
    const geometry = this.createGeometry(geometryType);
    if (!geometry) return null;

    // Create material
    const material = this.createMaterial(materialType);
    if (!material) return null;

    // Create instanced mesh
    const instancedMesh = new THREE.InstancedMesh(geometry, material, this.maxInstancesPerBatch);
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    // Enable per-instance colors
    instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(this.maxInstancesPerBatch * 3),
      3
    );

    // Add to scene
    this.scene.add(instancedMesh);

    // Create batch
    const batch: InstanceBatch = {
      key,
      geometryType,
      materialType,
      instancedMesh,
      maxInstances: this.maxInstancesPerBatch,
      count: 0,
      instanceMap: new Map(),
      freeIndices: [],
      needsUpdate: false,
    };

    this.batches.set(key, batch);

    return batch;
  }

  /**
   * Create geometry by type
   */
  private createGeometry(type: string): unknown {
    const THREE = getThree()!;

    const geometryMap: Record<string, () => unknown> = {
      // ===== CORE PRIMITIVES =====
      box: () => new THREE.BoxGeometry(1, 1, 1),
      sphere: () => new THREE.SphereGeometry(0.5, 16, 16),
      cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
      cone: () => new THREE.ConeGeometry(0.5, 1, 16),
      plane: () => new THREE.PlaneGeometry(1, 1),
      torus: () => new THREE.TorusGeometry(0.5, 0.2, 16, 50),
      ring: () => new THREE.RingGeometry(0.25, 0.5, 16),
      circle: () => new THREE.CircleGeometry(0.5, 16),

      // ===== ADVANCED GEOMETRIES =====
      capsule: () => new THREE.CapsuleGeometry(0.25, 0.5, 4, 8),
      torusknot: () => new THREE.TorusKnotGeometry(0.5, 0.15, 64, 8, 2, 3),

      // ===== POLYHEDRONS =====
      dodecahedron: () => new THREE.DodecahedronGeometry(0.5, 0),
      icosahedron: () => new THREE.IcosahedronGeometry(0.5, 0),
      octahedron: () => new THREE.OctahedronGeometry(0.5, 0),
      tetrahedron: () => new THREE.TetrahedronGeometry(0.5, 0),
    };

    return geometryMap[type]?.() || new THREE.BoxGeometry(1, 1, 1);
  }

  /**
   * Create material by type
   */
  private createMaterial(_type: string): unknown {
    const THREE = getThree()!;

    // Basic material with per-instance color support
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.7,
      metalness: 0.3,
      vertexColors: true, // Enable per-instance colors
    });
  }

  /**
   * Create transform matrix from position, rotation, scale
   */
  private createTransformMatrix(
    position: [number, number, number],
    rotation: [number, number, number],
    scale: [number, number, number]
  ): Float32Array {
    const matrix = new Float32Array(16);

    // Create rotation matrix from Euler angles
    const cx = Math.cos(rotation[0]);
    const sx = Math.sin(rotation[0]);
    const cy = Math.cos(rotation[1]);
    const sy = Math.sin(rotation[1]);
    const cz = Math.cos(rotation[2]);
    const sz = Math.sin(rotation[2]);

    // Combined rotation + scale matrix
    matrix[0] = cy * cz * scale[0];
    matrix[1] = cy * sz * scale[0];
    matrix[2] = -sy * scale[0];
    matrix[3] = 0;

    matrix[4] = (sx * sy * cz - cx * sz) * scale[1];
    matrix[5] = (sx * sy * sz + cx * cz) * scale[1];
    matrix[6] = sx * cy * scale[1];
    matrix[7] = 0;

    matrix[8] = (cx * sy * cz + sx * sz) * scale[2];
    matrix[9] = (cx * sy * sz - sx * cz) * scale[2];
    matrix[10] = cx * cy * scale[2];
    matrix[11] = 0;

    // Translation
    matrix[12] = position[0];
    matrix[13] = position[1];
    matrix[14] = position[2];
    matrix[15] = 1;

    return matrix;
  }

  /**
   * Convert Float32Array to THREE.Matrix4
   */
  private arrayToMatrix4(array: Float32Array): any {
    const THREE = getThree()!;
    const matrix = new THREE.Matrix4();
    matrix.fromArray(array);
    return matrix;
  }

  /**
   * Extract transform from matrix
   */
  private matrixToTransform(matrix: Float32Array): {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  } {
    const THREE = getThree();
    if (THREE) {
      const m = new THREE.Matrix4().fromArray(matrix);
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl = new THREE.Vector3();

      m.decompose(pos, quat, scl);
      const euler = new THREE.Euler().setFromQuaternion(quat, 'XYZ');

      return {
        position: [pos.x, pos.y, pos.z],
        rotation: [euler.x, euler.y, euler.z],
        scale: [scl.x, scl.y, scl.z],
      };
    }

    // Fallback if THREE is somehow unavailable (though it should be)
    const position: [number, number, number] = [matrix[12], matrix[13], matrix[14]];
    const sx = Math.sqrt(matrix[0] * matrix[0] + matrix[1] * matrix[1] + matrix[2] * matrix[2]);
    const sy = Math.sqrt(matrix[4] * matrix[4] + matrix[5] * matrix[5] + matrix[6] * matrix[6]);
    const sz = Math.sqrt(matrix[8] * matrix[8] + matrix[9] * matrix[9] + matrix[10] * matrix[10]);
    const scale: [number, number, number] = [sx, sy, sz];

    // Fallback rotation extraction using basic math
    let rx = 0,
      ry = 0,
      rz = 0;
    if (sx !== 0 && sy !== 0 && sz !== 0) {
      const m13 = matrix[8] / sz;
      ry = Math.asin(Math.max(-1, Math.min(1, m13)));
      if (Math.abs(m13) < 0.999999) {
        rx = Math.atan2(-matrix[9] / sz, matrix[10] / sz);
        rz = Math.atan2(-matrix[4] / sy, matrix[0] / sx);
      } else {
        rx = Math.atan2(matrix[6] / sy, matrix[5] / sy);
        rz = 0;
      }
    }
    const rotation: [number, number, number] = [rx, ry, rz];

    return { position, rotation, scale };
  }

  /**
   * Get statistics
   */
  public getStatistics(): InstancedRenderingStats {
    let totalInstances = 0;
    let memoryUsage = 0;

    for (const batch of this.batches.values()) {
      totalInstances += batch.count - batch.freeIndices.length;
      // Estimate: matrix (64 bytes) + color (12 bytes) per instance
      memoryUsage += (batch.count * 76) / (1024 * 1024); // MB
    }

    const drawCalls = this.batches.size;
    const nonInstancedDrawCalls = totalInstances;
    const improvement =
      nonInstancedDrawCalls > 0
        ? `${((1 - drawCalls / nonInstancedDrawCalls) * 100).toFixed(1)}% fewer draw calls`
        : 'N/A';

    return {
      batchCount: this.batches.size,
      totalInstances,
      drawCalls,
      memoryUsage: parseFloat(memoryUsage.toFixed(2)),
      improvement,
    };
  }

  /**
   * Enable/disable instanced rendering
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Clear all batches
   */
  public clear(): void {
    for (const batch of this.batches.values()) {
      this.scene.remove(batch.instancedMesh);
      batch.instancedMesh.geometry.dispose();
      batch.instancedMesh.material.dispose();
    }
    this.batches.clear();
    this.objects.clear();
  }

  /**
   * Get batch for inspection
   */
  public getBatch(key: string): InstanceBatch | undefined {
    return this.batches.get(key);
  }

  /**
   * Get all batch keys
   */
  public getBatchKeys(): string[] {
    return Array.from(this.batches.keys());
  }
}
