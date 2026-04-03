'use client';
/**
 * useStudioBus — Cross-panel event bus for reactive panel communication
 *
 * Singleton pub/sub bus allowing panels to react to changes in other panels.
 * Example: Terrain changes → LOD recalculates → Lighting updates
 *
 * Channels:
 *   terrain:changed  — heightmap/layer edits
 *   lighting:changed — light added/removed/updated
 *   camera:moved     — camera position/mode/FOV change
 *   lod:updated      — LOD level changes
 *   scene:saved      — scene save/load events
 *   physics:stepped  — physics simulation tick
 *   compile:done     — compilation completed
 *   state:changed    — reactive state mutation
 */
import { useCallback, useEffect, useRef } from 'react';

type BusCallback = (data: unknown) => void;

class StudioBus {
  private listeners = new Map<string, Set<BusCallback>>();
  private history: { channel: string; data: unknown; timestamp: number }[] = [];
  private maxHistory = 50;

  emit(channel: string, data: unknown = {}) {
    this.history.push({ channel, data, timestamp: Date.now() });
    if (this.history.length > this.maxHistory) this.history.shift();

    const cbs = this.listeners.get(channel);
    if (cbs)
      cbs.forEach((cb) => {
        try {
          cb(data);
        } catch (_) {
          // intentionally swallowed: bus listener errors must not crash other listeners
        }
      });
  }

  on(channel: string, cb: BusCallback) {
    if (!this.listeners.has(channel)) this.listeners.set(channel, new Set());
    this.listeners.get(channel)!.add(cb);
    return () => this.off(channel, cb);
  }

  off(channel: string, cb: BusCallback) {
    this.listeners.get(channel)?.delete(cb);
  }

  getHistory() {
    return [...this.history];
  }
  clear() {
    this.history = [];
  }
}

// Singleton instance shared across all panels
let _bus: StudioBus | null = null;
function getBus(): StudioBus {
  if (!_bus) _bus = new StudioBus();
  return _bus;
}

export interface UseStudioBusReturn {
  emit: (channel: string, data?: unknown) => void;
  on: (channel: string, cb: BusCallback) => () => void;
  getHistory: () => { channel: string; data: unknown; timestamp: number }[];
}

export function useStudioBus(): UseStudioBusReturn {
  const bus = getBus();
  const subscriptions = useRef<Array<() => void>>([]);

  // Cleanup on unmount
  useEffect(() => () => subscriptions.current.forEach((unsub) => unsub()), []);

  const emit = useCallback((channel: string, data?: unknown) => bus.emit(channel, data), [bus]);

  const on = useCallback(
    (channel: string, cb: BusCallback) => {
      const unsub = bus.on(channel, cb);
      subscriptions.current.push(unsub);
      return unsub;
    },
    [bus]
  );

  return { emit, on, getHistory: () => bus.getHistory() };
}

// Re-export for testing
export { StudioBus, getBus };
