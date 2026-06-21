import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCollabStore } from '../collabStore';

describe('collabStore collaborative world state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    useCollabStore.setState({
      selfId: 'alice',
      selfName: 'Alice',
      selfColor: '#00d4ff',
      cursors: {},
      sceneCursors: {},
      objectLocks: {},
      transformOps: [],
      localLamport: 0,
      connected: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks scene-space cursors separately from viewport cursors', () => {
    useCollabStore.getState().upsertSceneCursor({
      userId: 'bob',
      name: 'Bob',
      color: '#51cf66',
      position: [1, 2, 3],
      direction: [0, 0, -1],
      selectedId: 'tree',
      lastSeen: 10_000,
    });

    expect(useCollabStore.getState().sceneCursors.bob).toEqual(
      expect.objectContaining({
        position: [1, 2, 3],
        direction: [0, 0, -1],
        selectedId: 'tree',
      })
    );
    expect(useCollabStore.getState().cursors.bob).toBeUndefined();
  });

  it('acquires object locks that allow the owner and block other users', () => {
    const lock = useCollabStore.getState().acquireObjectLock('cube', 5000, 'exclusive');

    expect(lock).toEqual(
      expect.objectContaining({
        objectId: 'cube',
        userId: 'alice',
        mode: 'exclusive',
        acquiredAt: 10_000,
        expiresAt: 15_000,
      })
    );
    expect(useCollabStore.getState().canEditObject('cube', 'alice', 12_000)).toBe(true);
    expect(useCollabStore.getState().canEditObject('cube', 'bob', 12_000)).toBe(false);
    expect(useCollabStore.getState().canEditObject('cube', 'bob', 15_001)).toBe(true);
  });

  it('does not let non-owners release an active object lock', () => {
    useCollabStore.getState().acquireObjectLock('cube', 5000);

    useCollabStore.getState().releaseObjectLock('cube', 'bob');
    expect(useCollabStore.getState().objectLocks.cube).toBeDefined();

    useCollabStore.getState().releaseObjectLock('cube', 'alice');
    expect(useCollabStore.getState().objectLocks.cube).toBeUndefined();
  });

  it('records Lamport-ordered transform operations with optional lock IDs', () => {
    const lock = useCollabStore.getState().acquireObjectLock('cube', 5000);
    const op1 = useCollabStore
      .getState()
      .recordTransformOperation('cube', 'position', [1, 0, 0], lock.lockId);
    const op2 = useCollabStore
      .getState()
      .recordTransformOperation('cube', 'rotation', [0, 1, 0], lock.lockId);

    expect(op1.lamport).toBe(1);
    expect(op2.lamport).toBe(2);
    expect(useCollabStore.getState().transformOps).toEqual([
      expect.objectContaining({ field: 'position', lockId: lock.lockId }),
      expect.objectContaining({ field: 'rotation', lockId: lock.lockId }),
    ]);
  });

  it('prunes stale viewport cursors, scene cursors, and expired locks together', () => {
    useCollabStore.getState().upsertCursor({
      userId: 'stale-2d',
      name: 'Stale 2D',
      color: '#fff',
      x: 0.2,
      y: 0.4,
      selectedId: null,
      lastSeen: 1,
    });
    useCollabStore.getState().upsertSceneCursor({
      userId: 'fresh-3d',
      name: 'Fresh 3D',
      color: '#fff',
      position: [0, 0, 0],
      selectedId: null,
      lastSeen: 9500,
    });
    useCollabStore.getState().upsertObjectLock({
      objectId: 'expired',
      userId: 'bob',
      name: 'Bob',
      color: '#fff',
      lockId: 'expired-lock',
      mode: 'transform',
      acquiredAt: 1,
      expiresAt: 2,
    });

    useCollabStore.getState().pruneStale(1000);

    expect(useCollabStore.getState().cursors).toEqual({});
    expect(Object.keys(useCollabStore.getState().sceneCursors)).toEqual(['fresh-3d']);
    expect(useCollabStore.getState().objectLocks).toEqual({});
  });
});
