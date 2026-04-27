/**
 * OfflineSyncTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { offlineSyncHandler } from '../OfflineSyncTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __syncState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { sync_interval_ms: 5000 };

describe('OfflineSyncTrait', () => {
  it('has name "offline_sync"', () => {
    expect(offlineSyncHandler.name).toBe('offline_sync');
  });

  it('onAttach initializes pending=[]', () => {
    const node = makeNode();
    offlineSyncHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__syncState as { pending: unknown[] };
    expect(state.pending).toHaveLength(0);
  });

  it('sync:queue adds item and emits sync:queued', () => {
    const node = makeNode();
    offlineSyncHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    offlineSyncHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'sync:queue', payload: { id: 1 },
    } as never);
    expect(node.emit).toHaveBeenCalledWith('sync:queued', { pending: 1 });
  });

  it('sync:flush clears queue and emits sync:flushed', () => {
    const node = makeNode();
    offlineSyncHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    offlineSyncHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'sync:queue', payload: { id: 1 },
    } as never);
    node.emit.mockClear();
    offlineSyncHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'sync:flush',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('sync:flushed', { synced: 1, totalSynced: 1 });
  });
});
