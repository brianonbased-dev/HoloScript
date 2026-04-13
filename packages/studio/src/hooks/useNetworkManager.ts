// @ts-nocheck
'use client';
/**
 * useNetworkManager — Hook for multiplayer networking simulation
 */
import { useState, useCallback, useRef } from 'react';
import { NetworkManager } from "@holoscript/mesh";

export interface UseNetworkManagerReturn {
  connected: boolean;
  peerId: string;
  peers: { id: string; displayName: string; latency: number }[];
  messageCount: number;
  latency: number;
  connect: () => void;
  disconnect: () => void;
  addPeer: (name: string) => void;
  removePeer: (id: string) => void;
  broadcast: (payload: string) => void;
  setLatency: (ms: number) => void;
  buildDemo: () => void;
  reset: () => void;
}

export function useNetworkManager(): UseNetworkManagerReturn {
  const mgr = useRef(new NetworkManager('local-player'));
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState<{ id: string; displayName: string; latency: number }[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [latency, setLatencyVal] = useState(0);
  const peerCounter = useRef(0);
  const msgCount = useRef(0);

  const sync = useCallback(() => {
    setConnected(mgr.current.isConnected());
    setPeers(
      mgr.current
        .getPeers()
        .map((p) => ({ id: p.id, displayName: p.displayName, latency: p.latency }))
    );
    setLatencyVal(mgr.current.getSimulatedLatency());
    setMessageCount(msgCount.current);
  }, []);

  const connect = useCallback(() => {
    mgr.current.connect();
    sync();
  }, [sync]);
  const disconnect = useCallback(() => {
    mgr.current.disconnect();
    sync();
  }, [sync]);
  const addPeer = useCallback(
    (name: string) => {
      mgr.current.addPeer(`peer-${peerCounter.current++}`, name);
      sync();
    },
    [sync]
  );
  const removePeer = useCallback(
    (id: string) => {
      mgr.current.removePeer(id);
      sync();
    },
    [sync]
  );
  const broadcast = useCallback(
    (payload: string) => {
      mgr.current.broadcast('state_sync', { data: payload });
      msgCount.current++;
      sync();
    },
    [sync]
  );
  const setLatency = useCallback(
    (ms: number) => {
      mgr.current.setSimulatedLatency(ms);
      sync();
    },
    [sync]
  );

  const buildDemo = useCallback(() => {
    mgr.current = new NetworkManager('local-player');
    peerCounter.current = 0;
    msgCount.current = 0;
    mgr.current.connect();
    mgr.current.addPeer('peer-0', 'Alice');
    mgr.current.addPeer('peer-1', 'Bob');
    mgr.current.addPeer('peer-2', 'Charlie');
    mgr.current.setSimulatedLatency(50);
    peerCounter.current = 3;
    sync();
  }, [sync]);

  const reset = useCallback(() => {
    mgr.current = new NetworkManager('local-player');
    peerCounter.current = 0;
    msgCount.current = 0;
    sync();
  }, [sync]);

  return {
    connected,
    peerId: 'local-player',
    peers,
    messageCount,
    latency,
    connect,
    disconnect,
    addPeer,
    removePeer,
    broadcast,
    setLatency,
    buildDemo,
    reset,
  };
}
