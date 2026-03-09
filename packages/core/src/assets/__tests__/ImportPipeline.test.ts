import { describe, it, expect, beforeEach } from 'vitest';
import { ImportPipeline } from '../ImportPipeline';

describe('ImportPipeline', () => {
  let pipeline: ImportPipeline;

  beforeEach(() => {
    pipeline = new ImportPipeline();
  });

  // ---- Job Queue ----

  it('addModelJob queues a job', () => {
    const id = pipeline.addModelJob('model.gltf', 'data');
    expect(id).toBeDefined();
    expect(pipeline.getJobCount()).toBe(1);
    expect(pipeline.getJob(id)!.status).toBe('queued');
  });

  it('addTextureJob queues a texture job', () => {
    const id = pipeline.addTextureJob('tex.png', {
      id: 't',
      name: 'T',
      width: 64,
      height: 64,
      format: 'rgba8',
      sizeBytes: 16384,
    });
    expect(pipeline.getJob(id)!.type).toBe('texture');
  });

  it('multiple jobs get unique IDs', () => {
    const a = pipeline.addModelJob('a.gltf', 'data');
    const b = pipeline.addModelJob('b.obj', 'data');
    expect(a).not.toBe(b);
    expect(pipeline.getJobCount()).toBe(2);
  });

  // ---- Run ----

  it('runAll completes valid model jobs', () => {
    pipeline.addModelJob('scene.gltf', 'data');
    const stats = pipeline.runAll();
    expect(stats.completed).toBe(1);
    expect(stats.failed).toBe(0);
  });

  it('runAll handles unsupported format as failure', () => {
    pipeline.addModelJob('file.xyz', 'data');
    const stats = pipeline.runAll();
    expect(stats.failed).toBe(1);
  });

  it('runAll sets result on completed job', () => {
    const id = pipeline.addModelJob('model.gltf', 'data');
    pipeline.runAll();
    const job = pipeline.getJob(id)!;
    expect(job.status).toBe('completed');
    expect(job.result).toBeDefined();
  });

  it('runAll does not re-run already completed jobs', () => {
    const id = pipeline.addModelJob('a.gltf', 'data');
    pipeline.runAll();
    pipeline.addModelJob('b.gltf', 'more');
    const stats = pipeline.runAll();
    // Only the new job runs
    expect(stats.completed).toBe(2);
  });

  // ---- Stats ----

  it('getStats returns correct counts', () => {
    pipeline.addModelJob('a.gltf', 'data');
    pipeline.addModelJob('b.xyz', 'data');
    pipeline.runAll();
    const stats = pipeline.getStats();
    expect(stats.totalJobs).toBe(2);
    expect(stats.completed).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.queued).toBe(0);
  });

  // ---- Clear ----

  it('clear removes all jobs', () => {
    pipeline.addModelJob('a.gltf', 'data');
    pipeline.clear();
    expect(pipeline.getJobCount()).toBe(0);
  });

  // ---- Texture Jobs ----

  it('texture job runs successfully', () => {
    pipeline.addTextureJob('t.png', {
      id: 'tx',
      name: 'Tex',
      width: 128,
      height: 128,
      format: 'rgba8',
      sizeBytes: 65536,
    });
    const stats = pipeline.runAll();
    expect(stats.completed).toBe(1);
  });
});
