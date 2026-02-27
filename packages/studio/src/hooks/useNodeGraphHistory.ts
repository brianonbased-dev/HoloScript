/**
 * useNodeGraphHistory — Snapshot-based undo/redo for the visual shader node graph.
 *
 * Maintains a stack of { nodes, edges } snapshots so the user can undo/redo
 * any graph mutation (add node, delete node, connect, disconnect, move).
 *
 * Design:
 *  - `record(nodes, edges)` — call BEFORE mutating state to push a snapshot
 *  - `undo()` / `redo()` — restore snapshots, returns the target state
 *  - `canUndo` / `canRedo` — reactive booleans
 *  - Max 50 snapshots kept in memory
 */

'use client';

import { useState, useCallback } from 'react';
import type { GNode, GEdge } from '@/lib/nodeGraphStore';

export interface GraphSnapshot {
  nodes: GNode[];
  edges: GEdge[];
}

const MAX_HISTORY = 50;

export function useNodeGraphHistory() {
  // past[past.length-1] is the most recent undoable snapshot
  const [past,   setPast]   = useState<GraphSnapshot[]>([]);
  const [future, setFuture] = useState<GraphSnapshot[]>([]);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  /**
   * Record a snapshot BEFORE mutating nodes/edges.
   * Clears the redo stack (new branch).
   */
  const record = useCallback((nodes: GNode[], edges: GEdge[]) => {
    setPast((prev) => {
      const next = [...prev, { nodes, edges }];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
    setFuture([]);
  }, []);

  /**
   * Undo: restores the previous snapshot.
   * Caller is responsible for applying the returned state to the store.
   * Returns null if nothing to undo.
   */
  const undo = useCallback((current: GraphSnapshot): GraphSnapshot | null => {
    if (past.length === 0) return null;
    const prev = past[past.length - 1]!;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [current, ...f]);
    return prev;
  }, [past]);

  /**
   * Redo: restores the next snapshot.
   * Returns null if nothing to redo.
   */
  const redo = useCallback((current: GraphSnapshot): GraphSnapshot | null => {
    if (future.length === 0) return null;
    const next = future[0]!;
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, current]);
    return next;
  }, [future]);

  /** Clears all history */
  const clear = useCallback(() => {
    setPast([]);
    setFuture([]);
  }, []);

  /** Stack descriptions for a potential history panel */
  const historyList = past.map((s, i) => ({
    index: i,
    nodeCount: s.nodes.length,
    edgeCount: s.edges.length,
  }));

  return { canUndo, canRedo, record, undo, redo, clear, historyList };
}
