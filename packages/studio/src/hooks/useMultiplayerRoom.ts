'use client';

/**
 * useMultiplayerRoom — SSE-based multiplayer room hook.
 * Connects to /api/rooms?room=<id>&user=<name>&color=<hex>
 * Broadcasts cursor, selection, and chat events via POST /api/rooms.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export type RoomEventType = 'join' | 'leave' | 'cursor' | 'select' | 'chat' | 'code';

export interface Peer {
  user: string;
  color: string;
  cursor?: { x: number; y: number };
  selectedObject?: string;
  lastSeen: number;
}

export interface ChatMessage {
  user: string;
  color: string;
  text: string;
  ts: number;
}

interface UseMultiplayerRoomOptions {
  roomId: string;
  userName: string;
  userColor?: string;
  enabled?: boolean;
}

export function useMultiplayerRoom({
  roomId,
  userName,
  userColor = '#a78bfa',
  enabled = true,
}: UseMultiplayerRoomOptions) {
  const [peers, setPeers] = useState<Map<string, Peer>>(new Map());
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  // Maintain peer heartbeat eviction
  const evict = useCallback(() => {
    setPeers((prev) => {
      const now = Date.now();
      const next = new Map(prev);
      for (const [k, v] of next) {
        if (now - v.lastSeen > 30_000) next.delete(k);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const url = `/api/rooms?room=${encodeURIComponent(roomId)}&user=${encodeURIComponent(userName)}&color=${encodeURIComponent(userColor)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data as string) as {
          type?: RoomEventType; user?: string; color?: string;
          payload?: { x?: number; y?: number; objectId?: string; text?: string };
          ts?: number;
        };
        if (!evt.type || !evt.user || evt.user === userName) return;

        if (evt.type === 'leave') {
          setPeers((p) => { const n = new Map(p); n.delete(evt.user!); return n; });
          return;
        }
        if (evt.type === 'chat' && evt.payload?.text) {
          setChat((c) => [...c.slice(-99), { user: evt.user!, color: evt.color ?? '#aaa', text: evt.payload!.text!, ts: evt.ts ?? Date.now() }]);
        }
        setPeers((prev) => {
          const next = new Map(prev);
          const cur = next.get(evt.user!) ?? { user: evt.user!, color: evt.color ?? '#aaa', lastSeen: Date.now() };
          if (evt.type === 'cursor') cur.cursor = { x: evt.payload?.x ?? 0, y: evt.payload?.y ?? 0 };
          if (evt.type === 'select') cur.selectedObject = evt.payload?.objectId;
          cur.lastSeen = Date.now();
          next.set(evt.user!, cur);
          return next;
        });
      } catch { /* ignore malformed */ }
    };

    const evictTimer = setInterval(evict, 10_000);
    return () => { es.close(); esRef.current = null; setConnected(false); clearInterval(evictTimer); };
  }, [enabled, roomId, userName, userColor, evict]);

  const broadcast = useCallback(async (type: RoomEventType, payload?: unknown) => {
    await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: roomId, user: userName, color: userColor, type, payload }),
    });
  }, [roomId, userName, userColor]);

  const sendCursor = useCallback((x: number, y: number) => broadcast('cursor', { x, y }), [broadcast]);
  const sendSelect = useCallback((objectId: string) => broadcast('select', { objectId }), [broadcast]);
  const sendChat = useCallback((text: string) => broadcast('chat', { text }), [broadcast]);

  return { connected, peers: [...peers.values()], chat, sendCursor, sendSelect, sendChat };
}
