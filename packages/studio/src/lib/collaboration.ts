/**
 * Collaboration layer — Yjs + y-websocket
 *
 * Creates a shared Y.Doc per room (scene ID).
 * Syncs the sceneGraph nodes array via Y.Array<SceneNode>.
 * Awareness: tracks cursor color + display name per peer.
 *
 * Usage:
 *   import { useCollaboration } from '@/lib/collaboration';
 *   // In a component:
 *   const {  connected, peers, room } = useCollaboration();
 *
 * The hook:
 *  1. Creates a Y.Doc + WebsocketProvider keyed on scene ID
 *  2. Bridges the Y.Array to the sceneGraphStore (bidirectional sync)
 *  3. Exposes awareness state (peers list)
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { useSceneStore, useSceneGraphStore } from '@/lib/stores';
import type { SceneNode } from '@/lib/stores';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Peer {
  clientId: number;
  name: string;
  color: string;
  selectedId: string | null;
}

// ─── Default WS server ────────────────────────────────────────────────────────
// In production replace with your own y-websocket server URL.
const DEFAULT_WS_SERVER = process.env.NEXT_PUBLIC_COLLAB_WS ?? 'wss://demos.yjs.dev/ws';

// ─── Per-user color palette ───────────────────────────────────────────────────
const PALETTE = [
  '#6366f1',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#14b8a6',
  '#8b5cf6',
  '#f97316',
  '#06b6d4',
  '#a3e635',
];

let _localName = `User-${Math.floor(Math.random() * 9000 + 1000)}`;
let _localColor = PALETTE[Math.floor(Math.random() * PALETTE.length)];

export function setLocalName(name: string) {
  _localName = name;
}
export function setLocalColor(color: string) {
  _localColor = color;
}
export function getLocalName() {
  return _localName;
}
export function getLocalColor() {
  return _localColor;
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useCollaboration(enabled = true) {
  const sceneId = useSceneStore((s) => s.metadata.id);
  const nodes = useSceneGraphStore((s) => s.nodes);
  const addNode = useSceneGraphStore((s) => s.addNode);
  const updateNode = useSceneGraphStore((s) => s.updateNode);
  const removeNode = useSceneGraphStore((s) => s.removeNode);

  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [room, setRoom] = useState('');

  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const yNodesRef = useRef<Y.Array<SceneNode> | null>(null);
  const isSyncingFromRemote = useRef(false);

  useEffect(() => {
    if (!enabled || !sceneId) return;

    const roomId = `holoscript-${sceneId}`;
    setRoom(roomId);

    // Create Y.Doc
    const doc = new Y.Doc();
    docRef.current = doc;

    // Shared nodes array
    const yNodes = doc.getArray<SceneNode>('sceneNodes');
    yNodesRef.current = yNodes;

    // Connect WebSocket provider
    const provider = new WebsocketProvider(DEFAULT_WS_SERVER, roomId, doc, {
      connect: true,
    });
    providerRef.current = provider;

    // Set local awareness
    provider.awareness.setLocalStateField('user', {
      name: _localName,
      color: _localColor,
      selectedId: null,
    });

    // Presence tracking
    const handleAwareness = () => {
      const states = Array.from(provider.awareness.getStates().entries());
      const peers: Peer[] = states
        .filter(([clientId]) => clientId !== doc.clientID)
        .map(([clientId, state]) => ({
          clientId,
          name: (state.user as { name: string })?.name ?? `User-${clientId}`,
          color: (state.user as { color: string })?.color ?? '#6366f1',
          selectedId: (state.user as { selectedId: string | null })?.selectedId ?? null,
        }));
      setPeers(peers);
    };
    provider.awareness.on('change', handleAwareness);

    // Status tracking
    provider.on('status', ({ status }: { status: string }) => {
      setConnected(status === 'connected');
    });

    // Remote → local sync: when remote yNodes changes, update store
    yNodes.observe(() => {
      if (isSyncingFromRemote.current) return;
      isSyncingFromRemote.current = true;
      const remoteNodes = yNodes.toArray();
      for (const rNode of remoteNodes) {
        const existing = nodes.find((n) => n.id === rNode.id);
        if (!existing) {
          addNode(rNode);
        } else if (JSON.stringify(existing) !== JSON.stringify(rNode)) {
          updateNode(rNode.id, rNode);
        }
      }
      // Handle removals
      const remoteIds = new Set(remoteNodes.map((n) => n.id));
      for (const n of nodes) {
        if (!remoteIds.has(n.id)) removeNode(n.id);
      }
      isSyncingFromRemote.current = false;
    });

    return () => {
      provider.awareness.off('change', handleAwareness);
      provider.destroy();
      doc.destroy();
      docRef.current = null;
      providerRef.current = null;
      yNodesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps, @typescript-eslint/no-unused-vars
  }, [enabled, sceneId]);

  // Local → remote sync: when local nodes change, push to Y.Array
  useEffect(() => {
    const yNodes = yNodesRef.current;
    if (!yNodes || isSyncingFromRemote.current) return;

    const doc = docRef.current;
    if (!doc) return;

    doc.transact(() => {
      yNodes.delete(0, yNodes.length);
      yNodes.insert(0, nodes);
    });
  }, [nodes]);

  return { connected, peers, room };
}
