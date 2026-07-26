import { describe, expect, it, vi } from 'vitest';
import {
  localCollectionHandler,
  type LocalCollectionConfig,
  type LocalCollectionState,
} from '../LocalCollectionTrait';

const config: LocalCollectionConfig = {
  item_type: 'url',
  capacity: 2,
  ordering: 'most_recent',
  deduplicate: true,
  storage: 'device_private',
  backup: false,
};

const makeHarness = () => {
  const node = { id: 'saved-links', __localCollectionState: undefined as unknown };
  const emit = vi.fn();
  const context = { emit };
  localCollectionHandler.onAttach!(node as never, config, context as never);
  return { node, emit, context };
};

describe('LocalCollectionTrait', () => {
  it('deduplicates, prepends, and enforces its declared capacity', () => {
    const { node, context } = makeHarness();
    for (const value of ['https://one.example', 'https://two.example', 'https://one.example']) {
      localCollectionHandler.onEvent!(
        node as never,
        config,
        context as never,
        { type: 'local_collection:add', payload: { value } } as never
      );
    }
    expect((node.__localCollectionState as LocalCollectionState).items).toEqual([
      'https://one.example',
      'https://two.example',
    ]);

    localCollectionHandler.onEvent!(
      node as never,
      config,
      context as never,
      { type: 'local_collection:add', value: 'https://three.example' } as never
    );
    expect((node.__localCollectionState as LocalCollectionState).items).toEqual([
      'https://three.example',
      'https://one.example',
    ]);
  });

  it('supports oldest-first ordering without deduplication', () => {
    const { node, context } = makeHarness();
    const oldestFirst = {
      ...config,
      item_type: 'string',
      ordering: 'oldest_first' as const,
      deduplicate: false,
    };
    for (const value of ['a', 'a', 'b']) {
      localCollectionHandler.onEvent!(
        node as never,
        oldestFirst,
        context as never,
        { type: 'local_collection:add', value } as never
      );
    }
    expect((node.__localCollectionState as LocalCollectionState).items).toEqual(['a', 'a']);
  });

  it('removes and returns a defensive query snapshot', () => {
    const { node, emit, context } = makeHarness();
    localCollectionHandler.onEvent!(
      node as never,
      config,
      context as never,
      { type: 'local_collection:add', value: 'https://saved.example' } as never
    );
    localCollectionHandler.onEvent!(
      node as never,
      config,
      context as never,
      { type: 'local_collection:query', queryId: 'q1' } as never
    );
    expect(emit).toHaveBeenCalledWith(
      'local_collection:result',
      expect.objectContaining({
        queryId: 'q1',
        items: ['https://saved.example'],
        storage: 'device_private',
      })
    );

    localCollectionHandler.onEvent!(
      node as never,
      config,
      context as never,
      { type: 'local_collection:remove', value: 'https://saved.example' } as never
    );
    expect((node.__localCollectionState as LocalCollectionState).items).toEqual([]);
  });

  it('rejects values that violate the language-declared item type', () => {
    const { node, emit, context } = makeHarness();
    localCollectionHandler.onEvent!(
      node as never,
      config,
      context as never,
      { type: 'local_collection:add', value: 'not a URL\nhttps://split.example' } as never
    );
    expect((node.__localCollectionState as LocalCollectionState).items).toEqual([]);
    expect(emit).toHaveBeenCalledWith(
      'local_collection:rejected',
      expect.objectContaining({ itemType: 'url', reason: 'item_type' })
    );
  });
});
