/**
 * QueryTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { queryHandler } from '../QueryTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __queryState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { default_limit: 50, max_limit: 1000 };

describe('QueryTrait', () => {
  it('has name "query"', () => {
    expect(queryHandler.name).toBe('query');
  });

  it('query:execute emits query:result', () => {
    const node = makeNode();
    queryHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    queryHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'query:execute', collection: 'users', limit: 10,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('query:result', expect.objectContaining({
      collection: 'users', limit: 10,
    }));
  });

  it('respects max_limit', () => {
    const node = makeNode();
    queryHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    queryHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'query:execute', collection: 'users', limit: 9999,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('query:result', expect.objectContaining({ limit: 1000 }));
  });
});
