/**
 * ImportPipeline — Assimp wiring tests
 */
import { describe, it, expect } from 'vitest';
import { ImportPipeline } from '../ImportPipeline';
import type { AssimpScene } from '../AssimpAdapter';

function assimpScene(): AssimpScene {
  return {
    source_format: 'fbx',
    root: {
      name: 'root',
      children: [
        { name: 'body', mesh_indices: [0] },
        { name: 'wheel', mesh_indices: [1] },
      ],
    },
    mesh_count: 2,
    material_count: 1,
  };
}

describe('ImportPipeline Assimp wiring', () => {
  it('addAssimpJob returns an id', () => {
    const pipe = new ImportPipeline();
    const id = pipe.addAssimpJob('car.fbx', assimpScene());
    expect(id).toMatch(/^job_/);
  });

  it('runAll processes Assimp scene into ImportResult', () => {
    const pipe = new ImportPipeline();
    pipe.addAssimpJob('car.fbx', assimpScene());
    const stats = pipe.runAll();
    expect(stats.completed).toBe(1);
    expect(stats.failed).toBe(0);

    const job = pipe.getJob('job_0');
    expect(job).toBeDefined();
    expect(job!.status).toBe('completed');
    expect(job!.result).toBeDefined();
    const result = job!.result as { meshes: unknown[]; materials: unknown[] };
    expect(result.meshes.length).toBe(2);
    expect(result.materials.length).toBe(1);
  });

  it('mixed model + Assimp jobs both complete', () => {
    const pipe = new ImportPipeline();
    pipe.addModelJob('a.gltf', 'fake-gltf-data');
    pipe.addAssimpJob('b.fbx', assimpScene());
    pipe.runAll();
    const stats = pipe.getStats();
    expect(stats.completed).toBe(2);
    expect(stats.failed).toBe(0);
  });
});
