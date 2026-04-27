/**
 * EtlTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { etlHandler } from '../EtlTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __etlState: undefined as unknown,
});

const defaultConfig = { max_batch_size: 10000 };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('EtlTrait — metadata', () => {
  it('has name "etl"', () => {
    expect(etlHandler.name).toBe('etl');
  });

  it('defaultConfig max_batch_size is 10000', () => {
    expect(etlHandler.defaultConfig?.max_batch_size).toBe(10000);
  });
});

describe('EtlTrait — lifecycle', () => {
  it('onAttach initializes empty pipelines map', () => {
    const node = makeNode();
    etlHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__etlState as { pipelines: Map<string, unknown> };
    expect(state.pipelines).toBeInstanceOf(Map);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    etlHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    etlHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__etlState).toBeUndefined();
  });
});

describe('EtlTrait — onEvent', () => {
  it('etl:extract creates pipeline and emits etl:extracted', () => {
    const node = makeNode();
    etlHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    etlHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'etl:extract', pipelineId: 'pipe-1', records: 500,
    } as never);
    const state = node.__etlState as { pipelines: Map<string, { phase: string; records: number }> };
    expect(state.pipelines.get('pipe-1')?.phase).toBe('extract');
    expect(state.pipelines.get('pipe-1')?.records).toBe(500);
    expect(node.emit).toHaveBeenCalledWith('etl:extracted', { pipelineId: 'pipe-1' });
  });

  it('etl:transform advances phase and emits etl:transformed', () => {
    const node = makeNode();
    etlHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    etlHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'etl:extract', pipelineId: 'pipe-2', records: 100,
    } as never);
    node.emit.mockClear();
    etlHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'etl:transform', pipelineId: 'pipe-2',
    } as never);
    const state = node.__etlState as { pipelines: Map<string, { phase: string }> };
    expect(state.pipelines.get('pipe-2')?.phase).toBe('transform');
    expect(node.emit).toHaveBeenCalledWith('etl:transformed', { pipelineId: 'pipe-2' });
  });

  it('etl:load completes pipeline and emits etl:loaded with records', () => {
    const node = makeNode();
    etlHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    etlHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'etl:extract', pipelineId: 'pipe-3', records: 750,
    } as never);
    etlHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'etl:transform', pipelineId: 'pipe-3',
    } as never);
    node.emit.mockClear();
    etlHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'etl:load', pipelineId: 'pipe-3',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('etl:loaded', expect.objectContaining({
      pipelineId: 'pipe-3', records: 750,
    }));
  });
});
