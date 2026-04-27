/**
 * FacetedSearchTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { facetedSearchHandler } from '../FacetedSearchTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __facetState: undefined as unknown,
});

const defaultConfig = { max_facets: 20 };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('FacetedSearchTrait — metadata', () => {
  it('has name "faceted_search"', () => {
    expect(facetedSearchHandler.name).toBe('faceted_search');
  });

  it('defaultConfig max_facets is 20', () => {
    expect(facetedSearchHandler.defaultConfig?.max_facets).toBe(20);
  });
});

describe('FacetedSearchTrait — lifecycle', () => {
  it('onAttach initializes empty facets map', () => {
    const node = makeNode();
    facetedSearchHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__facetState as { facets: Map<string, Set<string>> };
    expect(state.facets).toBeInstanceOf(Map);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    facetedSearchHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    facetedSearchHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__facetState).toBeUndefined();
  });
});

describe('FacetedSearchTrait — onEvent', () => {
  it('facet:add creates facet and emits facet:added', () => {
    const node = makeNode();
    facetedSearchHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    facetedSearchHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'facet:add', facet: 'color', value: 'red',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('facet:added', expect.objectContaining({
      facet: 'color',
      values: expect.arrayContaining(['red']),
    }));
  });

  it('facet:add accumulates values for same facet', () => {
    const node = makeNode();
    facetedSearchHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    facetedSearchHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'facet:add', facet: 'size', value: 'small',
    } as never);
    facetedSearchHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'facet:add', facet: 'size', value: 'large',
    } as never);
    const state = node.__facetState as { facets: Map<string, Set<string>> };
    expect(state.facets.get('size')?.size).toBe(2);
  });

  it('facet:filter emits facet:filtered with all current facets', () => {
    const node = makeNode();
    facetedSearchHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    facetedSearchHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'facet:add', facet: 'brand', value: 'HoloTech',
    } as never);
    node.emit.mockClear();
    facetedSearchHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'facet:filter',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('facet:filtered', expect.objectContaining({
      facets: expect.objectContaining({ brand: expect.arrayContaining(['HoloTech']) }),
    }));
  });
});
