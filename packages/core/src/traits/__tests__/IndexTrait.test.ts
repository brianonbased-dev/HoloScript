/**
 * IndexTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { indexHandler } from '../IndexTrait';

const makeNode = () => ({
  id: 'n1', traits: new Set<string>(), emit: vi.fn(),
  __indexState: undefined as unknown,
});
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});
const defaultConfig = { max_indices: 50 };

describe('IndexTrait', () => {
  it('has name "index"', () => {
    expect(indexHandler.name).toBe('index');
  });

  it('defaultConfig max_indices=50', () => {
    expect(indexHandler.defaultConfig?.max_indices).toBe(50);
  });

  it('onAttach initializes empty indices', () => {
    const node = makeNode();
    indexHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__indexState as { indices: Map<string, unknown> };
    expect(state.indices.size).toBe(0);
  });

  it('index:add stores doc without emitting', () => {
    const node = makeNode();
    indexHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    indexHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'index:add', indexName: 'byColor', key: 'red', docId: 'doc-1',
    } as never);
    expect(node.emit).not.toHaveBeenCalled();
  });

  it('index:lookup returns matching docIds', () => {
    const node = makeNode();
    indexHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    indexHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'index:add', indexName: 'byColor', key: 'blue', docId: 'doc-2',
    } as never);
    node.emit.mockClear();
    indexHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'index:lookup', indexName: 'byColor', key: 'blue',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('index:result', expect.objectContaining({
      indexName: 'byColor', key: 'blue', docIds: expect.arrayContaining(['doc-2']),
    }));
  });

  it('index:remove deletes docId (lookup returns empty after removal)', () => {
    const node = makeNode();
    indexHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    indexHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'index:add', indexName: 'idx', key: 'k', docId: 'doc-x',
    } as never);
    indexHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'index:remove', indexName: 'idx', key: 'k', docId: 'doc-x',
    } as never);
    node.emit.mockClear();
    indexHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'index:lookup', indexName: 'idx', key: 'k',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('index:result', expect.objectContaining({ docIds: [] }));
  });
});
