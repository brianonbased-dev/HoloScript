/**
 * VectorSearchTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { vectorSearchHandler } from '../VectorSearchTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __vectorSearchState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { default_top_k: 10, max_collections: 20 };

describe('VectorSearchTrait', () => {
  it('has name "vector_search"', () => {
    expect(vectorSearchHandler.name).toBe('vector_search');
  });

  it('vsearch:query emits vsearch:result', () => {
    const node = makeNode();
    vectorSearchHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    vectorSearchHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'vsearch:index', collection: 'docs', docId: 'd1', vector: [0.1, 0.2],
    } as never);
    node.emit.mockClear();
    vectorSearchHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'vsearch:query', collection: 'docs', vector: [0.1, 0.2], topK: 5,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('vsearch:result', expect.objectContaining({ collection: 'docs' }));
  });
});
