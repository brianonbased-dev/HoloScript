/**
 * useSpatialSync - React hook for R3F spatial CRDT synchronization
 *
 * Integrates the SpatialCRDTBridge and LoroWebSocketProvider into a
 * React Three Fiber application. Provides a simple hook API for
 * synchronized spatial transforms across peers.
 *
 * @module @holoscript/crdt-spatial
 */

// Note: React is a peer dependency - this file only works when React is available
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

import { SpatialCRDTBridge } from './SpatialCRDTBridge.js';
import { LoroWebSocketProvider } from './LoroWebSocketProvider.js';
import { MeshNodeIntegrator } from './MeshNodeIntegrator.js';

import type {
  Vec3,
  EulerDelta,
  SpatialTransform,
  AwarenessState,
  UseSpatialSyncOptions,
  UseSpatialSyncReturn,
} from './types.js';

import { ConnectionState } from './types.js';

/**
 * React hook for spatial CRDT synchronization in React Three Fiber.
 *
 * @example
 * ```tsx
 * import { useSpatialSync } from '@holoscript/crdt-spatial';
 *
 * function SyncedScene() {
 *   const {
 *     connectionState,
 *     peerCount,
 *     setPosition,
 *     applyRotationDelta,
 *     getTransform,
 *     registerNode,
 *   } = useSpatialSync({
 *     serverUrl: 'wss://sync.example.com',
 *     roomId: 'my-scene',
 *     peerId: 'user-1',
 *   });
 *
 *   useEffect(() => {
 *     registerNode('cube-1');
 *   }, [registerNode]);
 *
 *   // In your frame loop:
 *   useFrame(() => {
 *     const transform = getTransform('cube-1');
 *     if (transform) {
 *       meshRef.current.position.set(
 *         transform.position.x,
 *         transform.position.y,
 *         transform.position.z,
 *       );
 *       meshRef.current.quaternion.set(
 *         transform.rotation.x,
 *         transform.rotation.y,
 *         transform.rotation.z,
 *         transform.rotation.w,
 *       );
 *     }
 *   });
 *
 *   return <mesh ref={meshRef}><boxGeometry /><meshStandardMaterial /></mesh>;
 * }
 * ```
 */
export function useSpatialSync(options: UseSpatialSyncOptions): UseSpatialSyncReturn {
  const {
    serverUrl,
    roomId,
    peerId,
    syncIntervalMs = 50,
    checkpointIntervalMs = 30_000,
    autoConnect = true,
    teamId,
    apiKey,
    useWebRTC = false,
  } = options;

  // State
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected
  );
  const [peerCount, setPeerCount] = useState(1);
  const [awareness, setAwareness] = useState<Map<string, AwarenessState>>(new Map());

  // Refs for stable references
  const bridgeRef = useRef<SpatialCRDTBridge | null>(null);
  const providerRef = useRef<LoroWebSocketProvider | null>(null);
  const meshIntegratorRef = useRef<MeshNodeIntegrator | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize bridge and provider
  useEffect(() => {
    const bridge = new SpatialCRDTBridge({
      peerId,
      syncIntervalMs,
      checkpointIntervalMs,
    });

    const provider = new LoroWebSocketProvider(bridge, {
      url: serverUrl,
      roomId,
    });

    let meshIntegrator: MeshNodeIntegrator | null = null;
    if (useWebRTC && teamId && apiKey) {
      meshIntegrator = new MeshNodeIntegrator(roomId, teamId, apiKey);
      if (autoConnect) {
        meshIntegrator.connect();
      }
    }

    // Wire up events
    provider.onStateChange((state) => setConnectionState(state));
    provider.onPeerCountChange((count) => setPeerCount(count));
    provider.onAwarenessChange((peers) => setAwareness(new Map(peers)));

    // Start checkpoint timer
    bridge.start();

    bridgeRef.current = bridge;
    providerRef.current = provider;
    meshIntegratorRef.current = meshIntegrator;

    // Auto-connect if enabled
    if (autoConnect) {
      provider.connect();
    }

    // Start periodic sync (send updates at syncIntervalMs)
    syncTimerRef.current = setInterval(() => {
      provider.sendUpdate();
    }, syncIntervalMs);

    // Cleanup
    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      provider.disconnect();
      bridge.dispose();
      bridgeRef.current = null;
      providerRef.current = null;
    };
  }, [serverUrl, roomId, peerId, syncIntervalMs, checkpointIntervalMs, autoConnect, useWebRTC, teamId, apiKey]);

  // Stable callbacks
  const setPosition = useCallback((nodeId: string, position: Vec3) => {
    bridgeRef.current?.setPosition(nodeId, position);
  }, []);

  const applyRotationDelta = useCallback((nodeId: string, delta: EulerDelta) => {
    bridgeRef.current?.applyRotationDelta(nodeId, delta);
  }, []);

  const setScale = useCallback((nodeId: string, scale: Vec3) => {
    bridgeRef.current?.setScale(nodeId, scale);
  }, []);

  const getTransform = useCallback((nodeId: string): SpatialTransform | null => {
    return bridgeRef.current?.getTransform(nodeId) ?? null;
  }, []);

  const registerNode = useCallback((nodeId: string, initialTransform?: SpatialTransform) => {
    bridgeRef.current?.registerNode(nodeId, initialTransform);
  }, []);

  const unregisterNode = useCallback((nodeId: string) => {
    bridgeRef.current?.unregisterNode(nodeId);
  }, []);

  const forceCheckpoint = useCallback((nodeId: string) => {
    bridgeRef.current?.checkpoint(nodeId);
  }, []);

  const setAwarenessState = useCallback((state: Partial<AwarenessState>) => {
    providerRef.current?.setAwareness(state);
  }, []);

  const connect = useCallback(() => {
    providerRef.current?.connect();
  }, []);

  const disconnect = useCallback(() => {
    providerRef.current?.disconnect();
  }, []);

  return useMemo(
    () => ({
      connectionState,
      peerCount,
      setPosition,
      applyRotationDelta,
      setScale,
      getTransform,
      registerNode,
      unregisterNode,
      forceCheckpoint,
      awareness,
      setAwareness: setAwarenessState,
      connect,
      disconnect,
    }),
    [
      connectionState,
      peerCount,
      setPosition,
      applyRotationDelta,
      setScale,
      getTransform,
      registerNode,
      unregisterNode,
      forceCheckpoint,
      awareness,
      setAwarenessState,
      connect,
      disconnect,
    ]
  );
}
