/**
 * useHotReload — React hook that wires the HotReloadPipeline into the
 * Studio's React lifecycle.
 *
 * Bridges:
 *   - Code editor text changes → HotReloadPipeline.processCodeUpdate
 *   - LiveUpdateProtocol messages → preview renderer via transport
 *   - Transport messages → StudioBridge mutations (when receiving from
 *     an external editor or collaborative session)
 *
 * Usage:
 *   const { pipeline, liveUpdate, isConnected } = useHotReload(bridge, {
 *     transport: { kind: 'broadcast' },
 *   });
 *   // On code editor change:
 *   pipeline.processCodeUpdate(newCode);
 *
 * @package @holoscript/studio
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { StudioBridge, ASTMutation } from '../StudioBridge';
import { HotReloadPipeline, type HotReloadPipelineOptions } from './HotReloadPipeline';
import { type LiveUpdateMessage, type MutationBatchMessage } from './LiveUpdateProtocol';
import { createTransport, type Transport, type TransportFactoryOptions } from './LiveUpdateTransport';

export interface UseHotReloadOptions {
  /** Pipeline options (filePath, debounceMs, etc.) */
  pipeline?: HotReloadPipelineOptions;
  /** Transport configuration */
  transport?: TransportFactoryOptions;
  /** Called when live-update messages arrive from the transport */
  onRemoteUpdate?: (msg: LiveUpdateMessage) => void;
  /** If true, apply remote mutation batches to the local bridge (default: false for editor, true for preview) */
  applyRemoteToBridge?: boolean;
}

export interface UseHotReloadResult {
  /** The pipeline instance (stable reference) */
  pipeline: HotReloadPipeline;
  /** Last live-update message sent or received */
  lastLiveUpdate: LiveUpdateMessage | null;
  /** Whether the transport is connected */
  isConnected: boolean;
  /** Manually push a full-scene refresh */
  pushFullScene: () => void;
  /** Send a ping to measure latency */
  ping: () => void;
  /** Current round-trip latency in ms (updated on pong) */
  latencyMs: number | null;
}

export function useHotReload(
  bridge: StudioBridge,
  options: UseHotReloadOptions = {}
): UseHotReloadResult {
  const { pipeline: pipelineOpts, transport: transportOpts, onRemoteUpdate, applyRemoteToBridge } =
    options;

  const pipelineRef = useRef<HotReloadPipeline | null>(null);
  const transportRef = useRef<Transport | null>(null);
  const [lastLiveUpdate, setLastLiveUpdate] = useState<LiveUpdateMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // Create pipeline once
  if (!pipelineRef.current) {
    pipelineRef.current = new HotReloadPipeline(bridge, pipelineOpts);
  }
  const pipeline = pipelineRef.current;

  // Wire transport
  useEffect(() => {
    if (!transportOpts) return;

    const transport = createTransport(transportOpts);
    transportRef.current = transport;

    // Forward pipeline messages → transport
    pipeline.onLiveUpdate = (msg) => {
      transport.send(msg);
      setLastLiveUpdate(msg);
    };

    // Forward transport messages → pipeline / bridge
    const unsub = transport.onMessage((msg) => {
      setLastLiveUpdate(msg);
      onRemoteUpdate?.(msg);

      if (msg.type === 'mutationBatch' && applyRemoteToBridge) {
        const batch = msg as MutationBatchMessage;
        for (const m of batch.mutations) {
          bridge.apply(m);
        }
      }

      if (msg.type === 'fullScene' && applyRemoteToBridge) {
        bridge.reset(msg.scene as Parameters<typeof bridge.reset>[0]);
      }

      if (msg.type === 'pong') {
        const rtt = Date.now() - msg.timestamp;
        setLatencyMs(rtt);
      }

      if (msg.type === 'ping') {
        transport.send({ type: 'pong', timestamp: msg.timestamp });
      }
    });

    // Connection polling
    const interval = setInterval(() => {
      setIsConnected(transport.connected);
    }, 1000);

    return () => {
      clearInterval(interval);
      unsub();
      transport.dispose();
      transportRef.current = null;
      pipeline.onLiveUpdate = null;
    };
  }, [bridge, pipeline, transportOpts?.kind, transportOpts?.wsUrl, applyRemoteToBridge, onRemoteUpdate]);

  const pushFullScene = useCallback(() => {
    const ast = bridge.getAST();
    pipeline.pushMessage({
      type: 'fullScene',
      scene: ast,
      timestamp: Date.now(),
    });
  }, [bridge, pipeline]);

  const ping = useCallback(() => {
    transportRef.current?.send({ type: 'ping', timestamp: Date.now() });
  }, []);

  return {
    pipeline,
    lastLiveUpdate,
    isConnected,
    pushFullScene,
    ping,
    latencyMs,
  };
}

export default useHotReload;
