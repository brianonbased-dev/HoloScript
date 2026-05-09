/**
 * StaticMeshBatcher.ts
 *
 * Scene-wide static mesh batching system.
 * Merges geometries that share the same material into a single draw call,
 * dramatically reducing draw calls for static scene geometry.
 *
 * Key differences from InstancedMeshManager:
 * - InstancedMeshManager: many copies of the SAME geometry (GPU instancing).
 * - StaticMeshBatcher: many DIFFERENT geometries merged by material (geometry
 *   merging). This is ideal for architectural elements, terrain chunks, and
 *   any static scene geometry where instances are not identical.
 *
 * Performance Impact:
 * - Without batching: 1,000 unique static meshes = 1,000 draw calls.
 * - With batching: 1,000 unique static meshes sharing 5 materials = 5 draw calls.
 *
 * Usage:
 *   const batcher = new StaticMeshBatcher(scene);
 *   batcher.addMesh({ id: 'wall-01', geometry: wallGeo, material: brickMat,
 *                   position: [0, 0, 0] });
 *   batcher.addMesh({ id: 'wall-02', geometry: wallGeo, material: brickMat,
 *                   position: [2, 0, 0] });
 *   batcher.rebuild(); // produces one merged mesh for brickMat
 */

import * as THREE from 'three';

export interface StaticMeshEntry {
  /** Unique identifier for this mesh instance */
  id: string;
  /** Source geometry (read-only; original is never modified) */
  geometry: THREE.BufferGeometry;
  /** Material to render with */
  material: THREE.Material;
  /** World position */
  position?: [number, number, number];
  /** Euler rotation in radians */
  rotation?: [number, number, number];
  /** Uniform or non-uniform scale */
  scale?: [number, number, number];
}

export interface BatchGroup {
  /** Group key (material-based, with split suffix when oversized) */
  key: string;
  /** Shared material */
  material: THREE.Material;
  /** The merged mesh added to the scene */
  mesh: THREE.Mesh;
  /** IDs of source meshes baked into this batch */
  sourceIds: string[];
}

export interface StaticMeshBatcherStats {
  /** Number of source meshes registered */
  totalSourceMeshes: number;
  /** Number of batch groups (one per material or split) */
  totalBatchGroups: number;
  /** Draw calls after batching */
  totalDrawCalls: number;
  /** Total vertices across all batches */
  totalVertices: number;
  /** Total triangles across all batches */
  totalTriangles: number;
  /** Estimated GPU memory usage in MB */
  estimatedMemoryMB: number;
  /** Human-readable reduction summary */
  drawCallReduction: string;
}

interface PendingEntry extends StaticMeshEntry {
  _matrix: THREE.Matrix4;
  _normalMatrix: THREE.Matrix3;
}

/**
 * Scene-wide static mesh batcher.
 *
 * Collects arbitrary static meshes, groups them by material,
 * merges their geometries with baked world transforms, and produces
 * one merged {@link THREE.Mesh} per material group.
 *
 * Rebuild is explicit (offline) — add/remove are cheap, but `rebuild()`
 * recomputes merged geometry. Designed for level-load or streaming
 * boundaries, not per-frame mutation.
 */
export class StaticMeshBatcher {
  private readonly entries = new Map<string, PendingEntry>();
  private readonly batches = new Map<string, BatchGroup>();
  private readonly scene: THREE.Scene;
  private readonly maxVerticesPerBatch: number;

  constructor(scene: THREE.Scene, options?: { maxVerticesPerBatch?: number }) {
    this.scene = scene;
    // 500k vertices is well within Uint32 index limits and tuned for
    // modern mobile/desktop GPUs. Lower if targeting very old hardware.
    this.maxVerticesPerBatch = options?.maxVerticesPerBatch ?? 500_000;
  }

  /** Register a static mesh for batching. Does NOT rebuild automatically. */
  addMesh(entry: StaticMeshEntry): void {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3(
      entry.position?.[0] ?? 0,
      entry.position?.[1] ?? 0,
      entry.position?.[2] ?? 0
    );
    const rotation = new THREE.Euler(
      entry.rotation?.[0] ?? 0,
      entry.rotation?.[1] ?? 0,
      entry.rotation?.[2] ?? 0
    );
    const scale = new THREE.Vector3(
      entry.scale?.[0] ?? 1,
      entry.scale?.[1] ?? 1,
      entry.scale?.[2] ?? 1
    );
    matrix.compose(position, new THREE.Quaternion().setFromEuler(rotation), scale);

    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);

    this.entries.set(entry.id, {
      ...entry,
      _matrix: matrix,
      _normalMatrix: normalMatrix,
    });
  }

  /** Remove a mesh by ID. Does NOT rebuild automatically. */
  removeMesh(id: string): boolean {
    return this.entries.delete(id);
  }

  /** Clear all registered meshes and remove batched meshes from the scene. */
  clear(): void {
    this.disposeBatches();
    this.entries.clear();
  }

  /**
   * Rebuild all batch groups from registered entries.
   *
   * This is the expensive operation:
   * 1. Groups entries by material UUID.
   * 2. Splits groups that exceed `maxVerticesPerBatch`.
   * 3. Merges geometries per group with baked transforms.
   * 4. Adds merged meshes to the scene.
   */
  rebuild(): void {
    this.disposeBatches();

    // 1. Group by material key
    const groups = new Map<string, PendingEntry[]>();
    for (const entry of this.entries.values()) {
      const key = this.materialKey(entry.material);
      const list = groups.get(key) ?? [];
      list.push(entry);
      groups.set(key, list);
    }

    // 2. Merge each group (splitting when vertex count exceeds limit)
    let batchIndex = 0;
    for (const [matKey, list] of groups) {
      const material = list[0].material;
      const chunks = this.splitIntoChunks(list);

      for (const chunk of chunks) {
        const mergedGeometry = this.mergeChunk(chunk);
        const mesh = new THREE.Mesh(mergedGeometry, material);
        mesh.frustumCulled = true;

        const batchKey = `${matKey}_${batchIndex++}`;
        this.scene.add(mesh);
        this.batches.set(batchKey, {
          key: batchKey,
          material,
          mesh,
          sourceIds: chunk.map((e) => e.id),
        });
      }
    }
  }

  /** Get current batch statistics. Safe to call at any time. */
  getStats(): StaticMeshBatcherStats {
    let totalVertices = 0;
    let totalTriangles = 0;
    let estimatedMemory = 0;

    for (const group of this.batches.values()) {
      const geo = group.mesh.geometry as THREE.BufferGeometry;
      const pos = geo.attributes.position;
      if (pos) {
        totalVertices += pos.count;
        const idx = geo.index;
        totalTriangles += idx ? idx.count / 3 : pos.count / 3;
        // Rough memory budget: position (12 B) + normal (12 B) + uv (8 B)
        estimatedMemory += pos.count * 32;
      }
    }

    const totalSourceMeshes = this.entries.size;
    const totalBatchGroups = this.batches.size;
    const totalDrawCalls = totalBatchGroups;
    const estimatedMemoryMB = parseFloat((estimatedMemory / (1024 * 1024)).toFixed(2));
    const reduction =
      totalSourceMeshes > 0
        ? `${totalSourceMeshes} → ${totalDrawCalls} (${(
            (1 - totalDrawCalls / totalSourceMeshes) *
            100
          ).toFixed(1)}% reduction)`
        : '0 → 0';

    return {
      totalSourceMeshes,
      totalBatchGroups,
      totalDrawCalls,
      totalVertices: Math.floor(totalVertices),
      totalTriangles: Math.floor(totalTriangles),
      estimatedMemoryMB,
      drawCallReduction: reduction,
    };
  }

  /** Get a batch group by key. */
  getBatchGroup(key: string): BatchGroup | undefined {
    return this.batches.get(key);
  }

  /** Get all batch keys. */
  getBatchKeys(): string[] {
    return Array.from(this.batches.keys());
  }

  /** Iterate over all active batch groups. */
  *iterBatches(): Generator<BatchGroup> {
    for (const group of this.batches.values()) {
      yield group;
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private materialKey(material: THREE.Material): string {
    // Material UUID groups identical material *instances*.
    // Future enhancement: deep-equality key to merge truly identical
    // but distinct material objects (e.g. cloned standard materials).
    return material.uuid;
  }

  private disposeBatches(): void {
    for (const group of this.batches.values()) {
      this.scene.remove(group.mesh);
      group.mesh.geometry.dispose();
      // NOTE: we do NOT dispose the material here — it is owned by the caller.
    }
    this.batches.clear();
  }

  private splitIntoChunks(entries: PendingEntry[]): PendingEntry[][] {
    const chunks: PendingEntry[][] = [];
    let currentChunk: PendingEntry[] = [];
    let currentVertices = 0;

    for (const entry of entries) {
      const vertCount = entry.geometry.attributes.position?.count ?? 0;
      if (
        currentVertices + vertCount > this.maxVerticesPerBatch &&
        currentChunk.length > 0
      ) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentVertices = 0;
      }
      currentChunk.push(entry);
      currentVertices += vertCount;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  private mergeChunk(entries: PendingEntry[]): THREE.BufferGeometry {
    const merged = new THREE.BufferGeometry();

    // Collect attribute names and count totals
    const attrNames = new Set<string>();
    let totalVertices = 0;
    let totalIndices = 0;

    for (const entry of entries) {
      const geo = entry.geometry;
      for (const name of Object.keys(geo.attributes)) {
        attrNames.add(name);
      }
      const pos = geo.attributes.position;
      if (pos) {
        totalVertices += pos.count;
        totalIndices += geo.index ? geo.index.count : pos.count;
      }
    }

    if (totalVertices === 0) {
      return merged;
    }

    // Choose index type based on vertex count
    const useUint32 = totalVertices > 65535;
    const IndexArray = useUint32 ? Uint32Array : Uint16Array;
    const mergedIndex = new IndexArray(totalIndices);
    let indexOffset = 0;
    let vertexOffset = 0;

    // Pre-allocate merged attribute arrays
    const mergedAttributes: Record<string, Float32Array> = {};
    for (const name of attrNames) {
      const itemSize = this.inferItemSize(entries, name);
      mergedAttributes[name] = new Float32Array(totalVertices * itemSize);
    }

    // Reusable scratch vectors to avoid per-vertex allocations
    const scratchVec3 = new THREE.Vector3();
    const scratchQuat = new THREE.Quaternion();

    for (const entry of entries) {
      const geo = entry.geometry;
      const posAttr = geo.attributes.position as THREE.BufferAttribute | undefined;
      if (!posAttr) continue;

      const entryVertexCount = posAttr.count;

      for (const name of attrNames) {
        const srcAttr = geo.attributes[name] as THREE.BufferAttribute | undefined;
        const dstArray = mergedAttributes[name];
        const itemSize = dstArray.length / totalVertices;

        if (!srcAttr) {
          // Missing attribute on this geometry — leave zeros (init default)
          continue;
        }

        const srcArray = srcAttr.array as number[] | Float32Array;
        const isPosition = name === 'position';
        const isNormal = name === 'normal';

        for (let i = 0; i < entryVertexCount; i++) {
          const srcIdx = i * itemSize;
          const dstIdx = (vertexOffset + i) * itemSize;

          if (isPosition && itemSize >= 3) {
            scratchVec3.set(
              srcArray[srcIdx],
              srcArray[srcIdx + 1],
              srcArray[srcIdx + 2]
            );
            scratchVec3.applyMatrix4(entry._matrix);
            dstArray[dstIdx] = scratchVec3.x;
            dstArray[dstIdx + 1] = scratchVec3.y;
            dstArray[dstIdx + 2] = scratchVec3.z;
          } else if (isNormal && itemSize >= 3) {
            scratchVec3.set(
              srcArray[srcIdx],
              srcArray[srcIdx + 1],
              srcArray[srcIdx + 2]
            );
            scratchVec3.applyMatrix3(entry._normalMatrix);
            scratchVec3.normalize();
            dstArray[dstIdx] = scratchVec3.x;
            dstArray[dstIdx + 1] = scratchVec3.y;
            dstArray[dstIdx + 2] = scratchVec3.z;
          } else {
            for (let c = 0; c < itemSize; c++) {
              dstArray[dstIdx + c] = srcArray[srcIdx + c];
            }
          }
        }
      }

      // Concatenate indices with vertex offset
      if (geo.index) {
        const srcIndex = geo.index.array as Uint16Array | Uint32Array;
        for (let i = 0; i < srcIndex.length; i++) {
          mergedIndex[indexOffset + i] = srcIndex[i] + vertexOffset;
        }
        indexOffset += srcIndex.length;
      } else {
        for (let i = 0; i < entryVertexCount; i++) {
          mergedIndex[indexOffset + i] = vertexOffset + i;
        }
        indexOffset += entryVertexCount;
      }

      vertexOffset += entryVertexCount;
    }

    // Attach merged attributes
    for (const name of attrNames) {
      const itemSize = mergedAttributes[name].length / totalVertices;
      merged.setAttribute(
        name,
        new THREE.BufferAttribute(mergedAttributes[name], itemSize)
      );
    }

    if (totalIndices > 0) {
      merged.setIndex(new THREE.BufferAttribute(mergedIndex, 1));
    }

    merged.computeBoundingSphere();
    merged.computeBoundingBox();

    return merged;
  }

  private inferItemSize(entries: PendingEntry[], name: string): number {
    for (const entry of entries) {
      const attr = entry.geometry.attributes[name] as
        | THREE.BufferAttribute
        | undefined;
      if (attr) return attr.itemSize;
    }
    return 3; // safe fallback
  }
}
