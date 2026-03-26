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

interface CollabState {
  /** Own user identity */
  selfId: string;
  selfName: string;
  selfColor: string;
  /** Remote cursors keyed by userId */
  cursors: Record<string, RemoteCursor>;
  /** Whether the collab connection is active */
  connected: boolean;

  setSelf: (id: string, name: string, color: string) => void;
  setConnected: (v: boolean) => void;
  upsertCursor: (cursor: RemoteCursor) => void;
  removeCursor: (userId: string) => void;
  pruneStale: (maxAgeMs?: number) => void;
}

function randomColor() {
  const hues = [0, 30, 60, 120, 180, 210, 270, 300, 330];
  const h = hues[Math.floor(Math.random() * hues.length)];
  return `hsl(${h},80%,65%)`;
}

export const useCollabStore = create<CollabState>()((set) => ({
  selfId: `user-${Math.random().toString(36).slice(2, 8)}`,
  selfName: 'You',
  selfColor: randomColor(),
  cursors: {},
  connected: false,

  setSelf: (selfId, selfName, selfColor) => set({ selfId, selfName, selfColor }),
  setConnected: (connected) => set({ connected }),

  upsertCursor: (cursor) =>
    set((s) => ({
      cursors: { ...s.cursors, [cursor.userId]: cursor },
    })),

  removeCursor: (userId) =>
    set((s) => {
      const next = { ...s.cursors };
      delete next[userId];
      return { cursors: next };
    }),

  pruneStale: (maxAgeMs = 10_000) =>
    set((s) => {
      const now = Date.now();
      const next: Record<string, RemoteCursor> = {};
      for (const [k, c] of Object.entries(s.cursors)) {
        if (now - c.lastSeen < maxAgeMs) next[k] = c;
      }
      return { cursors: next };
    }),
}));
