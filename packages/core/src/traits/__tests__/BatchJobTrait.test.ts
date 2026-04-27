/**
 * BatchJobTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { batchJobHandler } from '../BatchJobTrait';

const makeNode = () => ({
  id: 'node-1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __batchState: undefined as unknown,
});

const defaultConfig = { max_concurrent: 5 };

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('BatchJobTrait — metadata', () => {
  it('has name "batch_job"', () => {
    expect(batchJobHandler.name).toBe('batch_job');
  });

  it('defaultConfig max_concurrent is 5', () => {
    expect(batchJobHandler.defaultConfig?.max_concurrent).toBe(5);
  });
});

describe('BatchJobTrait — lifecycle', () => {
  it('onAttach initializes jobs map', () => {
    const node = makeNode();
    batchJobHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__batchState as { jobs: Map<string, unknown> };
    expect(state.jobs).toBeInstanceOf(Map);
    expect(state.jobs.size).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    batchJobHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    batchJobHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__batchState).toBeUndefined();
  });
});

describe('BatchJobTrait — onEvent', () => {
  it('batch:submit queues a job and emits batch:queued', () => {
    const node = makeNode();
    batchJobHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    batchJobHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'batch:submit', jobId: 'job-1',
    } as never);
    const state = node.__batchState as { jobs: Map<string, { status: string; progress: number }> };
    expect(state.jobs.get('job-1')?.status).toBe('queued');
    expect(state.jobs.get('job-1')?.progress).toBe(0);
    expect(node.emit).toHaveBeenCalledWith('batch:queued', { jobId: 'job-1' });
  });

  it('batch:progress updates job to running', () => {
    const node = makeNode();
    batchJobHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    batchJobHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'batch:submit', jobId: 'job-2',
    } as never);
    node.emit.mockClear();
    batchJobHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'batch:progress', jobId: 'job-2', progress: 0.5,
    } as never);
    const state = node.__batchState as { jobs: Map<string, { status: string; progress: number }> };
    expect(state.jobs.get('job-2')?.status).toBe('running');
    expect(state.jobs.get('job-2')?.progress).toBe(0.5);
    expect(node.emit).toHaveBeenCalledWith('batch:progress', { jobId: 'job-2', progress: 0.5 });
  });

  it('batch:complete marks job as completed', () => {
    const node = makeNode();
    batchJobHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    batchJobHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'batch:submit', jobId: 'job-3',
    } as never);
    node.emit.mockClear();
    batchJobHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'batch:complete', jobId: 'job-3',
    } as never);
    const state = node.__batchState as { jobs: Map<string, { status: string }> };
    expect(state.jobs.get('job-3')?.status).toBe('completed');
    expect(node.emit).toHaveBeenCalledWith('batch:completed', { jobId: 'job-3' });
  });

  it('multiple jobs tracked independently', () => {
    const node = makeNode();
    batchJobHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    batchJobHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'batch:submit', jobId: 'j-a',
    } as never);
    batchJobHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'batch:submit', jobId: 'j-b',
    } as never);
    batchJobHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'batch:complete', jobId: 'j-a',
    } as never);
    const state = node.__batchState as { jobs: Map<string, { status: string }> };
    expect(state.jobs.get('j-a')?.status).toBe('completed');
    expect(state.jobs.get('j-b')?.status).toBe('queued');
  });
});
