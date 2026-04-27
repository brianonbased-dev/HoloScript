/**
 * BlobStoreTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { blobStoreHandler } from '../BlobStoreTrait';

const makeNode = () => ({
  id: 'node-1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __blobState: undefined as unknown,
});

const defaultConfig = { max_blob_mb: 500 };

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('BlobStoreTrait — metadata', () => {
  it('has name "blob_store"', () => {
    expect(blobStoreHandler.name).toBe('blob_store');
  });

  it('defaultConfig max_blob_mb is 500', () => {
    expect(blobStoreHandler.defaultConfig?.max_blob_mb).toBe(500);
  });
});

describe('BlobStoreTrait — lifecycle', () => {
  it('onAttach initializes blobs map', () => {
    const node = makeNode();
    blobStoreHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__blobState as { blobs: Map<string, number> };
    expect(state.blobs).toBeInstanceOf(Map);
    expect(state.blobs.size).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    blobStoreHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    blobStoreHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__blobState).toBeUndefined();
  });
});

describe('BlobStoreTrait — onEvent', () => {
  it('blob:put stores blob and emits blob:stored', () => {
    const node = makeNode();
    blobStoreHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    blobStoreHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'blob:put', blobId: 'file-1', size: 1024,
    } as never);
    const state = node.__blobState as { blobs: Map<string, number> };
    expect(state.blobs.get('file-1')).toBe(1024);
    expect(node.emit).toHaveBeenCalledWith('blob:stored', { blobId: 'file-1', total: 1 });
  });

  it('blob:put multiple items increments total', () => {
    const node = makeNode();
    blobStoreHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    blobStoreHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'blob:put', blobId: 'a', size: 100,
    } as never);
    blobStoreHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'blob:put', blobId: 'b', size: 200,
    } as never);
    expect(node.emit).toHaveBeenLastCalledWith('blob:stored', { blobId: 'b', total: 2 });
  });

  it('blob:get returns exists=true for known blob', () => {
    const node = makeNode();
    blobStoreHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    blobStoreHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'blob:put', blobId: 'img-1', size: 512,
    } as never);
    node.emit.mockClear();
    blobStoreHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'blob:get', blobId: 'img-1',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('blob:retrieved', { blobId: 'img-1', exists: true });
  });

  it('blob:get returns exists=false for unknown blob', () => {
    const node = makeNode();
    blobStoreHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    blobStoreHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'blob:get', blobId: 'missing',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('blob:retrieved', { blobId: 'missing', exists: false });
  });
});
