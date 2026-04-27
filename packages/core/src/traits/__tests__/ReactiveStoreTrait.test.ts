/**
 * ReactiveStoreTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { reactiveStoreHandler } from '../ReactiveStoreTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __storeState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_keys: 500 };

describe('ReactiveStoreTrait', () => {
  it('has name "reactive_store"', () => {
    expect(reactiveStoreHandler.name).toBe('reactive_store');
  });

  it('store:set emits store:changed', () => {
    const node = makeNode();
    reactiveStoreHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    reactiveStoreHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'store:set', key: 'x', value: 42,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('store:changed', { key: 'x', value: 42, previous: undefined });
  });

  it('store:get emits store:value', () => {
    const node = makeNode();
    reactiveStoreHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    reactiveStoreHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'store:get', key: 'y',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('store:value', expect.objectContaining({ exists: false }));
  });
});
