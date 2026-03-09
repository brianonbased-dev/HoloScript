'use client';
/**
 * useCollaboration — WebSocket-based real-time cursor collaboration hook
 *
 * Connects to a collaboration server via WebSocket and syncs cursor positions
 * with remote peers. Uses useCollabStore for presence state management.
 */
import { useEffect, useCallback, useRef } from 'react';
import { useCollabStore } from '@/lib/collabStore';

// ─── Old session-based hook (used by CollaborationPanel) ───────────────────
import { useState } from 'react';
import { CollaborationSession, type SessionPeer, type SessionStats } from '@holoscript/core';

export interface UseCollaborationSessionReturn {
  session: CollaborationSession;
  peers: SessionPeer[];
  documents: string[];
  stats: SessionStats | null;
  addPeer: (name: string, platform?: 'vr' | 'ide' | 'web' | 'mobile') => void;
  removePeer: (peerId: string) => void;
  openDocument: (path: string) => void;
  closeDocument: (path: string) => void;
  buildDemoSession: () => void;
  reset: () => void;
}

const PEER_COLORS = ['#00d4ff', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8', '#ff922b'];

export function useCollaborationSession(): UseCollaborationSessionReturn {
  const sessRef = useRef(
    new CollaborationSession({
      sessionId: 'studio-collab',
      workspaceId: 'holoscript-studio',
      localPeer: { peerId: 'local', displayName: 'You', color: '#00d4ff', platform: 'ide' },
    })
  );
  const [peers, setPeers] = useState<SessionPeer[]>([]);
  const [documents, setDocuments] = useState<string[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const peerCounter = useRef(0);

  const sync = useCallback(() => {
    setPeers(sessRef.current.getPeers());
    setDocuments(sessRef.current.getOpenDocuments());
    setStats(sessRef.current.getStats());
  }, []);

  const addPeer = useCallback(
    (name: string, platform: 'vr' | 'ide' | 'web' | 'mobile' = 'ide') => {
      const id = `peer-${peerCounter.current++}`;
      sessRef.current.addPeer({
        peerId: id,
        displayName: name,
        color: PEER_COLORS[peerCounter.current % PEER_COLORS.length],
        openDocuments: [],
        connectionQuality: 0.8 + Math.random() * 0.2,
        platform,
        joinedAt: Date.now(),
      });
      sync();
    },
    [sync]
  );

  const removePeer = useCallback(
    (peerId: string) => {
      sessRef.current.removePeer(peerId);
      sync();
    },
    [sync]
  );

  const openDocument = useCallback(
    (path: string) => {
      sessRef.current.openDocument(path, `// ${path}\n`);
      sync();
    },
    [sync]
  );

  const closeDocument = useCallback(
    (path: string) => {
      sessRef.current.closeDocument(path);
      sync();
    },
    [sync]
  );

  const buildDemoSession = useCallback(() => {
    sessRef.current = new CollaborationSession({
      sessionId: 'demo-session',
      workspaceId: 'holoscript-studio',
      localPeer: { peerId: 'local', displayName: 'You', color: '#00d4ff', platform: 'ide' },
    });
    peerCounter.current = 0;
    sessRef.current.addPeer({
      peerId: 'peer-vr',
      displayName: 'Alice (VR)',
      color: '#ff6b6b',
      openDocuments: ['main.holo'],
      connectionQuality: 0.95,
      platform: 'vr',
      joinedAt: Date.now(),
    });
    sessRef.current.addPeer({
      peerId: 'peer-web',
      displayName: 'Bob (Web)',
      color: '#51cf66',
      openDocuments: ['scene.holo'],
      connectionQuality: 0.82,
      platform: 'web',
      joinedAt: Date.now(),
    });
    sessRef.current.openDocument(
      'main.holo',
      'world "Demo" {\n  orb "Sun" { position: [0, 10, 0] }\n}\n'
    );
    sessRef.current.openDocument('scene.holo', 'trait Glowing { emission: 1.0 }\n');
    sync();
  }, [sync]);

  const reset = useCallback(() => {
    sessRef.current = new CollaborationSession({
      sessionId: 'studio-collab',
      workspaceId: 'holoscript-studio',
      localPeer: { peerId: 'local', displayName: 'You', color: '#00d4ff', platform: 'ide' },
    });
    peerCounter.current = 0;
    sync();
  }, [sync]);

  return {
    session: sessRef.current,
    peers,
    documents,
    stats,
    addPeer,
    removePeer,
    openDocument,
    closeDocument,
    buildDemoSession,
    reset,
  };
}

// ─── WebSocket-based cursor collaboration hook ─────────────────────────────

const DEFAULT_WS_URL = 'ws://localhost:4999/collab';
const PING_INTERVAL = 25_000;
const PRUNE_INTERVAL = 5_000;
const WS_OPEN = 1;

export interface UseCollaborationReturn {
  sendCursorPosition: (x: number, y: number, selectedId?: string) => void;
}

/**
 * Real-time cursor collaboration via WebSocket.
 *
 * Connects to `ws://<host>/collab?room=<roomId>`, sends cursor positions,
 * and keeps alive with 25s pings. Stale remote cursors are pruned every 5s.
 */
export function useCollaboration(roomId: string): UseCollaborationReturn {
  const store = useCollabStore();
  const storeRef = useRef(store);
  storeRef.current = store;

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!roomId) return;
    if (typeof WebSocket === 'undefined') return;

    const baseUrl = process.env.NEXT_PUBLIC_COLLAB_WS_URL || DEFAULT_WS_URL;

    const ws = new WebSocket(`${baseUrl}?room=${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      const s = storeRef.current;
      s.setConnected(true);
      ws.send(
        JSON.stringify({
          type: 'join',
          userId: s.selfId,
          name: s.selfName,
          color: s.selfColor,
        }),
      );
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'cursor') {
          storeRef.current.upsertCursor(msg);
        } else if (msg.type === 'leave') {
          storeRef.current.removeCursor(msg.userId);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      storeRef.current.setConnected(false);
    };

    ws.onerror = () => {
      // Error handling — onclose will follow
    };

    // Keep-alive ping every 25s
    const pingId = setInterval(() => {
      if (ws.readyState === WS_OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, PING_INTERVAL);

    // Prune stale remote cursors every 5s
    const pruneId = setInterval(() => {
      storeRef.current.pruneStale();
    }, PRUNE_INTERVAL);

    return () => {
      clearInterval(pingId);
      clearInterval(pruneId);
      ws.onopen = null;
      ws.onclose = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.close();
      wsRef.current = null;
      storeRef.current.setConnected(false);
    };
  }, [roomId]);

  const sendCursorPosition = useCallback(
    (x: number, y: number, selectedId?: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WS_OPEN) return;
      const s = storeRef.current;
      ws.send(
        JSON.stringify({
          type: 'cursor',
          userId: s.selfId,
          name: s.selfName,
          color: s.selfColor,
          x,
          y,
          selectedId: selectedId ?? null,
          lastSeen: Date.now(),
        }),
      );
    },
    [],
  );

  return { sendCursorPosition };
}
