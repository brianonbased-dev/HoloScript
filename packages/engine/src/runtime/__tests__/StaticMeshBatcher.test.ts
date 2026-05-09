/**
 * StaticMeshBatcher Tests
 *
 * Coverage:
 *   - Same-material meshes merge into one batch (draw-call reduction)
 *   - Different materials create separate batches
 *   - Transforms are baked into merged geometry positions/normals
 *   - removeMesh + rebuild excludes the removed mesh
 *   - clear wipes all entries and batches
 *   - Stats report correct counts and reduction ratio
 *   - Vertex overflow splits into multiple batch groups
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { StaticMeshBatcher } from '../StaticMeshBatcher';

function makeScene() {
  return new THREE.Scene();
}

function makeBoxGeo(): THREE.BoxGeometry {
  return new THREE.BoxGeometry(1, 1, 1);
}

function makeSphereGeo(): THREE.SphereGeometry {
  return new THREE.SphereGeometry(0.5, 8, 8);
}

function makeMat(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color });
}

describe('StaticMeshBatcher', () => {
  it('rebuild merges same-material meshes into one batch', () => {
    const scene = makeScene();
    const batcher = new StaticMeshBatcher(scene);

    const matA = makeMat(0xff0000);
    batcher.addMesh({ id: 'box1', geometry: makeBoxGeo(), material: matA });
    batcher.addMesh({ id: 'box2', geometry: makeBoxGeo(), material: matA });
    batcher.rebuild();

    const stats = batcher.getStats();
    expect(stats.totalBatchGroups).toBe(1);
    expect(stats.totalDrawCalls).toBe(1);
    expect(stats.totalSourceMeshes).toBe(2);
  });

  it('rebuild splits different materials into separate batches', () => {
    const scene = makeScene();
    const batcher = new StaticMeshBatcher(scene);

    batcher.addMesh({
      id: 'box1',
      geometry: makeBoxGeo(),
      material: makeMat(0xff0000),
    });
    batcher.addMesh({
      id: 'box2',
      geometry: makeBoxGeo(),
      material: makeMat(0x00ff00),
    });
    batcher.rebuild();

    const stats = batcher.getStats();
    expect(stats.totalBatchGroups).toBe(2);
    expect(stats.totalDrawCalls).toBe(2);
  });

  it('bakes position transform into merged geometry', () => {
    const scene = makeScene();
    const batcher = new StaticMeshBatcher(scene);

    const geo = makeBoxGeo();
    const mat = makeMat(0xffffff);
    batcher.addMesh({
      id: 'moved-box',
      geometry: geo,
      material: mat,
      position: [10, 0, 0],
    });
    batcher.rebuild();

    const keys = batcher.getBatchKeys();
    expect(keys.length).toBe(1);

    const group = batcher.getBatchGroup(keys[0])!;
    const mergedGeo = group.mesh.geometry as THREE.BufferGeometry;
    const posAttr = mergedGeo.attributes.position as THREE.BufferAttribute;

    let minX = Infinity;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      if (x < minX) minX = x;
    }

    // Unit box centered at origin, translated by +10 on X,
    // should have minimum X at approximately 9.5 (center 10 - half-size 0.5)
    expect(minX).toBeGreaterThanOrEqual(9.4);
  });

  it('bakes scale transform into merged geometry', () => {
    const scene = makeScene();
    const batcher = new StaticMeshBatcher(scene);

    const geo = makeBoxGeo();
    const mat = makeMat(0xffffff);
    batcher.addMesh({
      id: 'scaled-box',
      geometry: geo,
      material: mat,
      scale: [2, 2, 2],
    });
    batcher.rebuild();

    const group = batcher.getBatchGroup(batcher.getBatchKeys()[0])!;
    const posAttr = group.mesh.geometry.attributes.position as THREE.BufferAttribute;

    let maxX = -Infinity;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      if (x > maxX) maxX = x;
    }

    // Unit box scaled by 2 => max X should be ~1.0 (half-size 0.5 * 2)
    expect(maxX).toBeGreaterThanOrEqual(0.9);
  });

  it('preserves normals after transform bake', () => {
    const scene = makeScene();
    const batcher = new StaticMeshBatcher(scene);

    const geo = makeBoxGeo();
    const mat = makeMat(0xffffff);
    batcher.addMesh({
      id: 'rotated-box',
      geometry: geo,
      material: mat,
      rotation: [0, Math.PI / 2, 0],
    });
    batcher.rebuild();

    const group = batcher.getBatchGroup(batcher.getBatchKeys()[0])!;
    const normAttr = group.mesh.geometry.attributes.normal as THREE.BufferAttribute;

    // Normals should still be unit length after normal-matrix transform
    let allUnit = true;
    for (let i = 0; i < normAttr.count; i++) {
      const x = normAttr.getX(i);
      const y = normAttr.getY(i);
      const z = normAttr.getZ(i);
      const len = Math.sqrt(x * x + y * y + z * z);
      if (Math.abs(len - 1.0) > 0.01) {
        allUnit = false;
        break;
      }
    }
    expect(allUnit).toBe(true);
  });

  it('removeMesh excludes the mesh after rebuild', () => {
    const scene = makeScene();
    const batcher = new StaticMeshBatcher(scene);

    const mat = makeMat(0xff0000);
    batcher.addMesh({ id: 'box1', geometry: makeBoxGeo(), material: mat });
    batcher.addMesh({ id: 'box2', geometry: makeBoxGeo(), material: mat });
    batcher.rebuild();

    expect(batcher.getStats().totalSourceMeshes).toBe(2);

    batcher.removeMesh('box1');
    batcher.rebuild();

    expect(batcher.getStats().totalSourceMeshes).toBe(1);
    expect(batcher.getStats().totalBatchGroups).toBe(1);
  });

  it('clear removes all batches and entries', () => {
    const scene = makeScene();
    const batcher = new StaticMeshBatcher(scene);

    batcher.addMesh({
      id: 'box1',
      geometry: makeBoxGeo(),
      material: makeMat(0xff0000),
    });
    batcher.rebuild();

    expect(batcher.getStats().totalBatchGroups).toBe(1);

    batcher.clear();
    expect(batcher.getStats().totalBatchGroups).toBe(0);
    expect(batcher.getStats().totalSourceMeshes).toBe(0);
    expect(batcher.getBatchKeys()).toEqual([]);
  });

  it('stats report correct reduction ratio', () => {
    const scene = makeScene();
    const batcher = new StaticMeshBatcher(scene);

    const mat = makeMat(0xff0000);
    for (let i = 0; i < 10; i++) {
      batcher.addMesh({
        id: `box${i}`,
        geometry: makeBoxGeo(),
        material: mat,
      });
    }
    batcher.rebuild();

    const stats = batcher.getStats();
    expect(stats.totalSourceMeshes).toBe(10);
    expect(stats.totalDrawCalls).toBe(1);
    expect(stats.drawCallReduction).toContain('90.0% reduction');
  });

  it('splits batches when vertex count exceeds maxVerticesPerBatch', () => {
    const scene = makeScene();
    // Force a very low vertex budget so two boxes must split
    const batcher = new StaticMeshBatcher(scene, {
      maxVerticesPerBatch: 10,
    });

    const mat = makeMat(0xff0000);
    // Each BoxGeometry has 24 vertices (6 faces * 4 corner verts).
    // 2 boxes = 48 vertices, well above the 10-vertex limit.
    batcher.addMesh({ id: 'box1', geometry: makeBoxGeo(), material: mat });
    batcher.addMesh({ id: 'box2', geometry: makeBoxGeo(), material: mat });
    batcher.rebuild();

    const stats = batcher.getStats();
    expect(stats.totalBatchGroups).toBeGreaterThanOrEqual(2);
  });

  it('handles mixed geometry types in one batch', () => {
    const scene = makeScene();
    const batcher = new StaticMeshBatcher(scene);

    const mat = makeMat(0x0000ff);
    batcher.addMesh({ id: 'box', geometry: makeBoxGeo(), material: mat });
    batcher.addMesh({ id: 'sphere', geometry: makeSphereGeo(), material: mat });
    batcher.rebuild();

    const stats = batcher.getStats();
    expect(stats.totalBatchGroups).toBe(1);
    expect(stats.totalSourceMeshes).toBe(2);
  });

  it('iterBatches yields all active groups', () => {
    const scene = makeScene();
    const batcher = new StaticMeshBatcher(scene);

    const mat = makeMat(0xff00ff);
    batcher.addMesh({ id: 'a', geometry: makeBoxGeo(), material: mat });
    batcher.addMesh({ id: 'b', geometry: makeBoxGeo(), material: makeMat(0x00ff00) });
    batcher.rebuild();

    const groups = Array.from(batcher.iterBatches());
    expect(groups.length).toBe(2);
    expect(groups.some((g) => g.sourceIds.includes('a'))).toBe(true);
    expect(groups.some((g) => g.sourceIds.includes('b'))).toBe(true);
  });
});
