/**
 * FullTextSearchTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { fullTextSearchHandler } from '../FullTextSearchTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __ftsState: undefined as unknown,
});

const defaultConfig = { max_results: 50 };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('FullTextSearchTrait — metadata', () => {
  it('has name "full_text_search"', () => {
    expect(fullTextSearchHandler.name).toBe('full_text_search');
  });

  it('defaultConfig max_results is 50', () => {
    expect(fullTextSearchHandler.defaultConfig?.max_results).toBe(50);
  });
});

describe('FullTextSearchTrait — lifecycle', () => {
  it('onAttach initializes empty index map', () => {
    const node = makeNode();
    fullTextSearchHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__ftsState as { index: Map<string, string> };
    expect(state.index).toBeInstanceOf(Map);
    expect(state.index.size).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    fullTextSearchHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fullTextSearchHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__ftsState).toBeUndefined();
  });
});

describe('FullTextSearchTrait — onEvent', () => {
  it('fts:index stores document and emits fts:indexed', () => {
    const node = makeNode();
    fullTextSearchHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fullTextSearchHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'fts:index', docId: 'doc-1', content: 'HoloScript is a spatial programming language',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('fts:indexed', { docId: 'doc-1', size: 1 });
    const state = node.__ftsState as { index: Map<string, string> };
    expect(state.index.get('doc-1')).toContain('spatial');
  });

  it('fts:search returns matching documents', () => {
    const node = makeNode();
    fullTextSearchHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fullTextSearchHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'fts:index', docId: 'd1', content: 'apple fruit tree' } as never);
    fullTextSearchHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'fts:index', docId: 'd2', content: 'banana fruit' } as never);
    fullTextSearchHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'fts:index', docId: 'd3', content: 'vegetable carrot' } as never);
    node.emit.mockClear();
    fullTextSearchHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'fts:search', query: 'fruit',
    } as never);
    const call = node.emit.mock.calls.find(([t]) => t === 'fts:results');
    expect(call?.[1]?.hits).toContain('d1');
    expect(call?.[1]?.hits).toContain('d2');
    expect(call?.[1]?.hits).not.toContain('d3');
    expect(call?.[1]?.total).toBe(2);
  });

  it('fts:search is case-insensitive', () => {
    const node = makeNode();
    fullTextSearchHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fullTextSearchHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'fts:index', docId: 'doc-a', content: 'HOLOSCRIPT RUNTIME engine',
    } as never);
    node.emit.mockClear();
    fullTextSearchHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'fts:search', query: 'holoscript',
    } as never);
    const call = node.emit.mock.calls.find(([t]) => t === 'fts:results');
    expect(call?.[1]?.hits).toContain('doc-a');
  });

  it('fts:search returns empty hits for no-match query', () => {
    const node = makeNode();
    fullTextSearchHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fullTextSearchHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'fts:index', docId: 'x', content: 'abc' } as never);
    node.emit.mockClear();
    fullTextSearchHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'fts:search', query: 'zzz',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('fts:results', expect.objectContaining({ total: 0 }));
  });
});
