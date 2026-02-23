'use client';

/**
 * useCollaboration — connects to the collab WebSocket and maintains presence.
 *
 * Transport: native WebSocket → ws://localhost:4999/collab (configurable via env)
 * Protocol (JSON messages):
 *   → { type:'join', userId, name, color }
 *   → { type:'cursor', userId, x, y, selectedId }
 *   → { type:'leave', userId }
 *   ← same shape for remote peers
 *
 * Call `sendCursorPosition(x, y)` on mousemove in the viewport.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useCollabStore } from '@/lib/collabStore';

const WS_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_COLLAB_WS_URL ?? 'ws://localhost:4999/collab')
    : '';

export function useCollaboration(roomId: string) {
  const ws = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pruneRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { selfId, selfName, selfColor, setConnected, upsertCursor, removeCursor, pruneStale } =
    useCollabStore();

  // Send cursor position (throttled externally by the caller)
  const sendCursorPosition = useCallback(
    (x: number, y: number, selectedId: string | null = null) => {
      if (ws.current?.readyState !== WebSocket.OPEN) return;
      ws.current.send(
        JSON.stringify({ type: 'cursor', userId: selfId, x, y, selectedId })
      );
    },
    [selfId]
  );

  useEffect(() => {
    if (!WS_URL || !roomId) return;

    let mounted = true;

    const connect = () => {
      try {
        const socket = new WebSocket(`${WS_URL}?room=${encodeURIComponent(roomId)}`);
        ws.current = socket;

        socket.onopen = () => {
          if (!mounted) return;
          setConnected(true);
          socket.send(
            JSON.stringify({ type: 'join', userId: selfId, name: selfName, color: selfColor })
          );
          // Keep-alive ping every 25 s
          pingRef.current = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'ping', userId: selfId }));
            }
          }, 25_000);
        };

        socket.onmessage = (event) => {
          if (!mounted) return;
          try {
            const msg = JSON.parse(event.data as string) as {
              type: string;
              userId: string;
              name?: string;
              color?: string;
              x?: number;
              y?: number;
              selectedId?: string | null;
            };
            if (msg.userId === selfId) return; // ignore own messages echoed back

            switch (msg.type) {
              case 'join':
              case 'cursor':
                upsertCursor({
                  userId: msg.userId,
                  name: msg.name ?? msg.userId,
                  color: msg.color ?? '#ffffff',
                  x: msg.x ?? 0,
                  y: msg.y ?? 0,
                  selectedId: msg.selectedId ?? null,
                  lastSeen: Date.now(),
                });
                break;
              case 'leave':
                removeCursor(msg.userId);
                break;
            }
          } catch {
            // parse error — ignore
          }
        };

        socket.onclose = () => {
          if (!mounted) return;
          setConnected(false);
          if (pingRef.current) clearInterval(pingRef.current);
          // Reconnect after 3 s
          setTimeout(() => { if (mounted) connect(); }, 3_000);
        };

        socket.onerror = () => {
          socket.close();
        };
      } catch {
        // WebSocket not available (SSR guard)
      }
    };

    connect();

    // Prune stale cursors every 5 s
    pruneRef.current = setInterval(() => pruneStale(), 5_000);

    return () => {
      mounted = false;
      if (pingRef.current) clearInterval(pingRef.current);
      if (pruneRef.current) clearInterval(pruneRef.current);
      if (ws.current) {
        ws.current.send(JSON.stringify({ type: 'leave', userId: selfId }));
        ws.current.close();
      }
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  return { sendCursorPosition };
}
