/**
 * collabStore — real-time collaboration presence state
 *
 * Tracks remote cursors (and in the future: selection, locks, chat)
 * from a lightweight SSE or WebSocket stream.
 */

import { create } from 'zustand';

export interface RemoteCursor {
  userId: string;
  name: string;
  color: string;
  /** Normalized [0..1, 0..1] viewport position */
  x: number;
  y: number;
  /** Currently selected object ID */
  selectedId: string | null;
  lastSeen: number;
}

export type CollaborativeTransformField = 'position' | 'rotation' | 'scale';
export type CollaborativeLockMode = 'selection' | 'transform' | 'exclusive';
export type Vec3 = [number, number, number];

export interface RemoteSceneCursor {
  userId: string;
  name: string;
  color: string;
  /** World-space cursor/ray origin for 3D authoring presence */
  position: Vec3;
  /** Optional world-space pointing direction */
  direction?: Vec3;
  selectedId: string | null;
  lastSeen: number;
}

export interface ObjectSelectionLock {
  objectId: string;
  userId: string;
  name: string;
  color: string;
  lockId: string;
  mode: CollaborativeLockMode;
  acquiredAt: number;
  expiresAt: number;
}

export interface CollaborativeTransformOperation {
  objectId: string;
  userId: string;
  field: CollaborativeTransformField;
  value: Vec3;
  lamport: number;
  timestamp: number;
  lockId?: string;
}

interface CollabState {
  /** Own user identity */
  selfId: string;
  selfName: string;
  selfColor: string;
  /** Remote cursors keyed by userId */
  cursors: Record<string, RemoteCursor>;
  /** Scene-space 3D presence cursors keyed by userId */
  sceneCursors: Record<string, RemoteSceneCursor>;
  /** Active per-object selection/transform locks keyed by objectId */
  objectLocks: Record<string, ObjectSelectionLock>;
  /** Recent local/remote transform operations for CRDT bridge plumbing */
  transformOps: CollaborativeTransformOperation[];
  /** Local Lamport counter for transform operations */
  localLamport: number;
  /** Whether the collab connection is active */
  connected: boolean;

  setSelf: (id: string, name: string, color: string) => void;
  setConnected: (v: boolean) => void;
  upsertCursor: (cursor: RemoteCursor) => void;
  upsertSceneCursor: (cursor: RemoteSceneCursor) => void;
  removeCursor: (userId: string) => void;
  upsertObjectLock: (lock: ObjectSelectionLock) => void;
  acquireObjectLock: (
    objectId: string,
    ttlMs?: number,
    mode?: CollaborativeLockMode
  ) => ObjectSelectionLock;
  releaseObjectLock: (objectId: string, userId?: string) => void;
  canEditObject: (objectId: string, userId?: string, now?: number) => boolean;
  recordTransformOperation: (
    objectId: string,
    field: CollaborativeTransformField,
    value: Vec3,
    lockId?: string
  ) => CollaborativeTransformOperation;
  pruneStale: (maxAgeMs?: number) => void;
}

function randomColor() {
  const hues = [0, 30, 60, 120, 180, 210, 270, 300, 330];
  const h = hues[Math.floor(Math.random() * hues.length)];
  return `hsl(${h},80%,65%)`;
}

export const useCollabStore = create<CollabState>()((set, get) => ({
  selfId: `user-${Math.random().toString(36).slice(2, 8)}`,
  selfName: 'You',
  selfColor: randomColor(),
  cursors: {},
  sceneCursors: {},
  objectLocks: {},
  transformOps: [],
  localLamport: 0,
  connected: false,

  setSelf: (selfId, selfName, selfColor) => set({ selfId, selfName, selfColor }),
  setConnected: (connected) => set({ connected }),

  upsertCursor: (cursor) =>
    set((s) => ({
      cursors: { ...s.cursors, [cursor.userId]: cursor },
    })),

  upsertSceneCursor: (cursor) =>
    set((s) => ({
      sceneCursors: { ...s.sceneCursors, [cursor.userId]: cursor },
    })),

  removeCursor: (userId) =>
    set((s) => {
      const next = { ...s.cursors };
      const nextScene = { ...s.sceneCursors };
      delete next[userId];
      delete nextScene[userId];
      return { cursors: next, sceneCursors: nextScene };
    }),

  upsertObjectLock: (lock) =>
    set((s) => ({
      objectLocks: { ...s.objectLocks, [lock.objectId]: lock },
    })),

  acquireObjectLock: (objectId, ttlMs = 3000, mode = 'transform') => {
    const s = get();
    const acquiredAt = Date.now();
    const lock: ObjectSelectionLock = {
      objectId,
      userId: s.selfId,
      name: s.selfName,
      color: s.selfColor,
      lockId: `${s.selfId}:${objectId}:${acquiredAt}`,
      mode,
      acquiredAt,
      expiresAt: acquiredAt + ttlMs,
    };
    set((state) => ({
      objectLocks: { ...state.objectLocks, [objectId]: lock },
    }));
    return lock;
  },

  releaseObjectLock: (objectId, userId) =>
    set((s) => {
      const lock = s.objectLocks[objectId];
      const owner = userId ?? s.selfId;
      if (lock && lock.userId !== owner) return {};
      const next = { ...s.objectLocks };
      delete next[objectId];
      return { objectLocks: next };
    }),

  canEditObject: (objectId, userId, now = Date.now()) => {
    const s = get();
    const lock = s.objectLocks[objectId];
    if (!lock || lock.expiresAt <= now) return true;
    return lock.userId === (userId ?? s.selfId);
  },

  recordTransformOperation: (objectId, field, value, lockId) => {
    const s = get();
    const op: CollaborativeTransformOperation = {
      objectId,
      userId: s.selfId,
      field,
      value,
      lamport: s.localLamport + 1,
      timestamp: Date.now(),
      lockId,
    };
    set((state) => ({
      localLamport: op.lamport,
      transformOps: [...state.transformOps.slice(-255), op],
    }));
    return op;
  },

  pruneStale: (maxAgeMs = 10_000) =>
    set((s) => {
      const now = Date.now();
      const next: Record<string, RemoteCursor> = {};
      for (const [k, c] of Object.entries(s.cursors)) {
        if (now - c.lastSeen < maxAgeMs) next[k] = c;
      }
      const nextScene: Record<string, RemoteSceneCursor> = {};
      for (const [k, c] of Object.entries(s.sceneCursors)) {
        if (now - c.lastSeen < maxAgeMs) nextScene[k] = c;
      }
      const nextLocks: Record<string, ObjectSelectionLock> = {};
      for (const [k, lock] of Object.entries(s.objectLocks)) {
        if (lock.expiresAt > now) nextLocks[k] = lock;
      }
      return { cursors: next, sceneCursors: nextScene, objectLocks: nextLocks };
    }),
}));
