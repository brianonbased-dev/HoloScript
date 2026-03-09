'use client';
/**
 * useCollaboration — Hook for collaborative editing sessions
 */
import { useState, useCallback, useRef } from 'react';
import { CollaborationSession, type SessionPeer, type SessionStats } from '@holoscript/core';

export interface UseCollaborationReturn {
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

export function useCollaboration(): UseCollaborationReturn {
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
