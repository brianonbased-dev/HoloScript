'use client';
/**
 * useTraitState — subscribe to runtime trait state for a scene node.
 *
 * Usage (mirrors TrajectoryVisualizer docstring):
 *   const trajectory = useTraitState(nodeId, 'neural_animation', s => s.locomotion?.trajectory);
 *
 * The hook manages a local state map keyed by `${nodeId}/${traitName}` that is
 * updated whenever the global `holoTrait:stateUpdate` CustomEvent fires for that
 * node+trait pair. Components (or the engine bridge) emit updates via the
 * exported `emitTraitStateUpdate` helper.
 *
 * When no runtime is connected, or no update has arrived yet, the selector
 * receives `undefined` and the hook returns the default value (default: undefined).
 *
 * Thread safety: all writes happen on the main thread (React micro-task queue),
 * consistent with zustand + React.useState contracts.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// ─── Global trait-state map ──────────────────────────────────────────────────
// Stored outside React so multiple hook instances for the same key share state.

type TraitStateMap = Map<string, unknown>;
const traitStateRegistry: TraitStateMap = new Map();

/** Listeners keyed by `${nodeId}/${traitName}` */
const listeners: Map<string, Set<() => void>> = new Map();

function getKey(nodeId: string, traitName: string): string {
  return `${nodeId}/${traitName}`;
}

/**
 * Emit a trait state update from outside React (e.g., from an engine bridge
 * or a test harness). Notifies all subscribed hook instances.
 */
export function emitTraitStateUpdate(
  nodeId: string,
  traitName: string,
  state: Record<string, unknown>
): void {
  const key = getKey(nodeId, traitName);
  traitStateRegistry.set(key, state);
  const subs = listeners.get(key);
  if (subs) {
    for (const fn of subs) fn();
  }
  // Also fire the DOM CustomEvent so non-React consumers can listen.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('holoTrait:stateUpdate', { detail: { nodeId, traitName, state } })
    );
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Subscribe to trait state for a scene node.
 *
 * @param nodeId     Scene node ID (from SceneGraphStore).
 * @param traitName  Trait name without '@' prefix (e.g. 'neural_animation').
 * @param selector   Extracts a slice from the trait state object.
 * @param defaultValue Returned when no state is available yet. Defaults to undefined.
 */
export function useTraitState<T = unknown>(
  nodeId: string | null | undefined,
  traitName: string,
  selector: (state: Record<string, unknown>) => T,
  defaultValue?: T
): T | undefined {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const getSnapshot = useCallback((): T | undefined => {
    if (!nodeId) return defaultValue;
    const key = getKey(nodeId, traitName);
    const raw = traitStateRegistry.get(key);
    if (raw === undefined) return defaultValue;
    try {
      return selectorRef.current(raw as Record<string, unknown>);
    } catch {
      return defaultValue;
    }
  }, [nodeId, traitName, defaultValue]);

  const [value, setValue] = useState<T | undefined>(getSnapshot);

  useEffect(() => {
    if (!nodeId) return;
    const key = getKey(nodeId, traitName);

    // Initial read in case an update fired before mount.
    setValue(getSnapshot());

    const notify = () => setValue(getSnapshot());

    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(notify);

    return () => {
      listeners.get(key)?.delete(notify);
    };
  }, [nodeId, traitName, getSnapshot]);

  return value;
}
