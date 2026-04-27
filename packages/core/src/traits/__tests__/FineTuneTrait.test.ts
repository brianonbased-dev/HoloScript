/**
 * FineTuneTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { fineTuneHandler } from '../FineTuneTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __fineTuneState: undefined as unknown,
});

const defaultConfig = { max_concurrent: 2 };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('FineTuneTrait — metadata', () => {
  it('has name "fine_tune"', () => {
    expect(fineTuneHandler.name).toBe('fine_tune');
  });

  it('defaultConfig max_concurrent is 2', () => {
    expect(fineTuneHandler.defaultConfig?.max_concurrent).toBe(2);
  });
});

describe('FineTuneTrait — lifecycle', () => {
  it('onAttach initializes empty jobs map', () => {
    const node = makeNode();
    fineTuneHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__fineTuneState as { jobs: Map<string, unknown> };
    expect(state.jobs).toBeInstanceOf(Map);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    fineTuneHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fineTuneHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__fineTuneState).toBeUndefined();
  });
});

describe('FineTuneTrait — onEvent', () => {
  it('finetune:start creates a job and emits finetune:status with running', () => {
    const node = makeNode();
    fineTuneHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fineTuneHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'finetune:start', modelId: 'gpt-4o-mini', dataset: 'ds-001',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('finetune:status', expect.objectContaining({
      modelId: 'gpt-4o-mini', status: 'running', progress: 0,
    }));
    const state = node.__fineTuneState as { jobs: Map<string, { status: string }> };
    expect(state.jobs.size).toBe(1);
  });

  it('finetune:start emits finetune:error when max_concurrent exceeded', () => {
    const node = makeNode();
    const cfg1 = { max_concurrent: 1 };
    fineTuneHandler.onAttach!(node as never, cfg1, makeCtx(node) as never);
    fineTuneHandler.onEvent!(node as never, cfg1, makeCtx(node) as never, {
      type: 'finetune:start', modelId: 'model-0', dataset: 'ds',
    } as never);
    node.emit.mockClear();
    fineTuneHandler.onEvent!(node as never, cfg1, makeCtx(node) as never, {
      type: 'finetune:start', modelId: 'model-overflow', dataset: 'ds',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('finetune:error', { error: 'max_concurrent_exceeded' });
  });

  it('finetune:get_status emits current job status', () => {
    const node = makeNode();
    fineTuneHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fineTuneHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'finetune:start', modelId: 'gpt-4o', dataset: 'ds-2',
    } as never);
    const statusCall = node.emit.mock.calls.find(([t]) => t === 'finetune:status');
    const jobId = statusCall?.[1]?.jobId as string;
    node.emit.mockClear();
    fineTuneHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'finetune:get_status', jobId,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('finetune:status', expect.objectContaining({
      jobId, status: 'running',
    }));
  });
});
