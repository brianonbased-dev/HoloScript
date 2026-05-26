/**
 * useVolumetricRenderUpdate — React hook bridging VolumetricTrait events to
 * renderer reactive state.
 *
 * Listens for `volumetric_render_update` on the provided event bus and
 * returns the latest sorted `indices` + `opacity` for the given node.
 *
 * @see VolumetricRenderUpdateConsumer.ts for the underlying event consumer.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  VolumetricRenderUpdateConsumer,
  VolumetricRenderState,
  VolumetricEventBus,
} from '../volumetric/VolumetricRenderUpdateConsumer';

export interface UseVolumetricRenderUpdateOptions {
  bus: VolumetricEventBus;
  nodeId?: string;
}

export interface UseVolumetricRenderUpdateResult {
  /** Latest draw-order indices (back-to-front for alpha blending) */
  indices: Uint32Array | null;
  /** Latest opacity value [0,1] */
  opacity: number;
  /** Milliseconds since last update */
  ageMs: number;
  /** Whether at least one update has been received */
  hasUpdate: boolean;
}

export function useVolumetricRenderUpdate(
  options: UseVolumetricRenderUpdateOptions
): UseVolumetricRenderUpdateResult {
  const { bus, nodeId } = options;
  const consumerRef = useRef<VolumetricRenderUpdateConsumer | null>(null);
  const [state, setState] = useState<VolumetricRenderState | null>(null);

  useEffect(() => {
    const consumer = new VolumetricRenderUpdateConsumer({ bus });
    consumer.start();
    consumerRef.current = consumer;

    // Poll-less update: wrap the bus emit so we also refresh local state.
    // In production the trait emit and bus emit are the same call; here we
    // intercept to trigger a React re-render.
    const originalEmit = bus.emit.bind(bus);
    const wrappedEmit: typeof bus.emit = (event, payload) => {
      originalEmit(event, payload);
      if (event === 'volumetric_render_update' && payload && typeof payload === 'object') {
        const p = payload as { node?: unknown };
        const id = nodeIdFor(p.node);
        if (!nodeId || id === nodeId) {
          setState(consumer.getState(p.node) ?? null);
        }
      }
    };
    // Only mutate emit on the bus instance if it isn't frozen
    try {
      (bus as any).emit = wrappedEmit;
    } catch {
      // Bus is sealed; rely on the consumer's internal state being
      // up-to-date on the next render trigger from the real emitter.
    }

    return () => {
      consumer.stop();
      try {
        (bus as any).emit = originalEmit;
      } catch {
        // ignore
      }
    };
  }, [bus, nodeId]);

  // Also expose a manual refresh for imperative callers (tests, frame loops)
  const refresh = useCallback(() => {
    if (!nodeId || !consumerRef.current) return;
    const latest = consumerRef.current.getState({ id: nodeId });
    if (latest) setState(latest);
  }, [nodeId]);

  useEffect(() => {
    if (!nodeId) return;
    refresh();
  }, [nodeId, refresh]);

  return {
    indices: state?.indices ?? null,
    opacity: state?.opacity ?? 1.0,
    ageMs: state ? Date.now() - state.updatedAt : Infinity,
    hasUpdate: state !== null,
  };
}

function nodeIdFor(node: unknown): string {
  if (typeof node === 'string') return node;
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (typeof record.id === 'string') return record.id;
    if (typeof record.name === 'string') return record.name;
  }
  return 'unknown-node';
}
