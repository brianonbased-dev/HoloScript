/**
 * DataLineageTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { dataLineageHandler } from '../DataLineageTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __lineageState: undefined as unknown,
});

const defaultConfig = { max_depth: 50 };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('DataLineageTrait — metadata', () => {
  it('has name "data_lineage"', () => {
    expect(dataLineageHandler.name).toBe('data_lineage');
  });

  it('defaultConfig max_depth is 50', () => {
    expect(dataLineageHandler.defaultConfig?.max_depth).toBe(50);
  });
});

describe('DataLineageTrait — lifecycle', () => {
  it('onAttach initializes empty graph', () => {
    const node = makeNode();
    dataLineageHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__lineageState as { graph: Map<string, unknown> };
    expect(state.graph).toBeInstanceOf(Map);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    dataLineageHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    dataLineageHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__lineageState).toBeUndefined();
  });
});

describe('DataLineageTrait — onEvent', () => {
  it('lineage:register adds entry and emits lineage:registered', () => {
    const node = makeNode();
    dataLineageHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    dataLineageHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'lineage:register', datasetId: 'ds1', source: 'warehouse',
    } as never);
    const state = node.__lineageState as { graph: Map<string, { source: string; transforms: string[] }> };
    expect(state.graph.get('ds1')?.source).toBe('warehouse');
    expect(node.emit).toHaveBeenCalledWith('lineage:registered', { datasetId: 'ds1' });
  });

  it('lineage:transform appends transform and emits lineage:updated', () => {
    const node = makeNode();
    dataLineageHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    dataLineageHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'lineage:register', datasetId: 'ds2', source: 'raw',
    } as never);
    node.emit.mockClear();
    dataLineageHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'lineage:transform', datasetId: 'ds2', transform: 'normalize',
    } as never);
    const state = node.__lineageState as { graph: Map<string, { transforms: string[] }> };
    expect(state.graph.get('ds2')?.transforms).toContain('normalize');
    expect(node.emit).toHaveBeenCalledWith('lineage:updated', { datasetId: 'ds2', depth: 1 });
  });

  it('lineage:trace emits full trace for registered dataset', () => {
    const node = makeNode();
    dataLineageHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    dataLineageHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'lineage:register', datasetId: 'ds3', source: 'stream',
    } as never);
    node.emit.mockClear();
    dataLineageHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'lineage:trace', datasetId: 'ds3',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('lineage:traced', expect.objectContaining({
      datasetId: 'ds3', source: 'stream', exists: true,
    }));
  });

  it('lineage:trace emits exists=false for unknown dataset', () => {
    const node = makeNode();
    dataLineageHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    dataLineageHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'lineage:trace', datasetId: 'ghost',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('lineage:traced', expect.objectContaining({
      exists: false,
    }));
  });
});
