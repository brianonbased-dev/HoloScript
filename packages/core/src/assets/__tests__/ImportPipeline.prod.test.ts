/**
 * ImportPipeline — Production Tests
 *
 * Tests addModelJob, addTextureJob, runAll (stats), getJob (lifecycle),
 * per-job status (completed/failed), and clear.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ImportPipeline } from '../ImportPipeline';
import type { TextureInput } from '../TextureProcessor';

function makeTex(id = 'tex1'): TextureInput {
  return { id, name: id, width: 256, height: 256, format: 'rgba8', sizeBytes: 262144 };
}

describe('ImportPipeline — addModelJob', () => {
  let pipe: ImportPipeline;
  beforeEach(() => {
    pipe = new ImportPipeline();
  });

  it('returns a job id string with job_ prefix', () => {
    const id = pipe.addModelJob('model.gltf', 'data');
    expect(id.startsWith('job_')).toBe(true);
  });

  it('each call returns unique id', () => {
    const id1 = pipe.addModelJob('a.gltf', '');
    const id2 = pipe.addModelJob('b.gltf', '');
    expect(id1).not.toBe(id2);
  });

  it('queued job is retrievable via getJob', () => {
    const id = pipe.addModelJob('hero.glb', 'blob');
    const job = pipe.getJob(id);
    expect(job).toBeDefined();
    expect(job!.status).toBe('queued');
    expect(job!.type).toBe('model');
  });

  it('job has correct filename', () => {
    const id = pipe.addModelJob('mesh.obj', '');
    expect(pipe.getJob(id)!.filename).toBe('mesh.obj');
  });
});

describe('ImportPipeline — addTextureJob', () => {
  let pipe: ImportPipeline;
  beforeEach(() => {
    pipe = new ImportPipeline();
  });

  it('returns a job id with job_ prefix', () => {
    const id = pipe.addTextureJob('sprite.png', makeTex());
    expect(id.startsWith('job_')).toBe(true);
  });

  it('job is of type texture', () => {
    const id = pipe.addTextureJob('sprite.png', makeTex());
    expect(pipe.getJob(id)!.type).toBe('texture');
  });

  it('job starts with status queued', () => {
    const id = pipe.addTextureJob('sprite.png', makeTex());
    expect(pipe.getJob(id)!.status).toBe('queued');
  });
});

describe('ImportPipeline — runAll', () => {
  let pipe: ImportPipeline;
  beforeEach(() => {
    pipe = new ImportPipeline();
  });

  it('runAll on no jobs returns empty stats', () => {
    const stats = pipe.runAll();
    expect(stats.totalJobs).toBe(0);
    expect(stats.completed).toBe(0);
    expect(stats.failed).toBe(0);
    expect(stats.queued).toBe(0);
  });

  it('successful model job is marked completed', () => {
    pipe.addModelJob('model.gltf', '{}');
    const stats = pipe.runAll();
    expect(stats.completed).toBeGreaterThanOrEqual(1);
  });

  it('successful texture job is marked completed', () => {
    pipe.addTextureJob('sprite.png', makeTex());
    const stats = pipe.runAll();
    expect(stats.completed).toBeGreaterThanOrEqual(1);
  });

  it('unsupported format model job is marked failed', () => {
    pipe.addModelJob('model.unknown', 'data');
    const stats = pipe.runAll();
    expect(stats.failed).toBeGreaterThanOrEqual(1);
  });

  it('mixed jobs tracked correctly in stats', () => {
    pipe.addModelJob('good.gltf', 'data');
    pipe.addModelJob('bad.zip', 'data'); // unsupported
    pipe.addTextureJob('tex.png', makeTex());
    const stats = pipe.runAll();
    expect(stats.totalJobs).toBe(3);
    expect(stats.completed).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.queued).toBe(0);
  });

  it('already-run jobs are not re-run', () => {
    const id = pipe.addModelJob('a.gltf', 'data');
    pipe.runAll();
    pipe.runAll(); // second call
    expect(pipe.getJob(id)!.status).toBe('completed'); // not changed
    // Stats still count same job once
    expect(pipe.getStats().completed).toBe(1);
  });
});

describe('ImportPipeline — job results', () => {
  let pipe: ImportPipeline;
  beforeEach(() => {
    pipe = new ImportPipeline();
  });

  it('completed model job has a result', () => {
    const id = pipe.addModelJob('model.gltf', 'data');
    pipe.runAll();
    expect(pipe.getJob(id)!.result).toBeDefined();
  });

  it('completed texture job has a result', () => {
    const id = pipe.addTextureJob('tex.png', makeTex());
    pipe.runAll();
    expect(pipe.getJob(id)!.result).toBeDefined();
  });

  it('failed job has error message set', () => {
    const id = pipe.addModelJob('model.unknown', 'data');
    pipe.runAll();
    const job = pipe.getJob(id)!;
    expect(job.status).toBe('failed');
    expect(typeof job.error).toBe('string');
    expect(job.error!.length).toBeGreaterThan(0);
  });

  it('failed job has no error for unsupported format — error message contains filename token', () => {
    const id = pipe.addModelJob('weird.xyz', 'data');
    pipe.runAll();
    expect(pipe.getJob(id)!.error).toContain('weird.xyz');
  });

  it('gltf model result has meshes', () => {
    const id = pipe.addModelJob('hero.gltf', 'data');
    pipe.runAll();
    const result = pipe.getJob(id)!.result as any;
    expect(result.meshes).toBeDefined();
    expect(result.meshes.length).toBeGreaterThan(0);
  });

  it('obj model result has warnings about PBR', () => {
    const id = pipe.addModelJob('mesh.obj', 'data');
    pipe.runAll();
    const result = pipe.getJob(id)!.result as any;
    expect(result.warnings.some((w: string) => w.toLowerCase().includes('pbr'))).toBe(true);
  });
});

describe('ImportPipeline — getStats / clear / getJobCount', () => {
  let pipe: ImportPipeline;
  beforeEach(() => {
    pipe = new ImportPipeline();
  });

  it('getJobCount after adding jobs', () => {
    pipe.addModelJob('a.gltf', '');
    pipe.addTextureJob('b.png', makeTex());
    expect(pipe.getJobCount()).toBe(2);
  });

  it('getStats.queued counts unrun jobs', () => {
    pipe.addModelJob('a.gltf', '');
    expect(pipe.getStats().queued).toBe(1);
  });

  it('clear removes all jobs', () => {
    pipe.addModelJob('a.gltf', '');
    pipe.addTextureJob('b.png', makeTex());
    pipe.clear();
    expect(pipe.getJobCount()).toBe(0);
  });

  it('getJob returns undefined for cleared jobs', () => {
    const id = pipe.addModelJob('a.gltf', '');
    pipe.clear();
    expect(pipe.getJob(id)).toBeUndefined();
  });
});
