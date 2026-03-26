/**
 * useOrchestrationHistory - Undo/Redo for orchestration editors
 *
 * Snapshot-based history management for workflows and behavior trees.
 * Max 50 snapshots to prevent memory issues.
 *
 * Usage:
 * ```tsx
 * const { undo, redo, canUndo, canRedo, pushSnapshot } = useOrchestrationHistory(
 *   () => workflow,
 *   (snapshot) => setWorkflow(snapshot)
 * );
 * ```
 */

import { useState, useCallback, useEffect, useRef } from 'react';

const MAX_HISTORY_SIZE = 50;

export interface HistoryState<T> {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  pushSnapshot: (snapshot: T) => void;
  clearHistory: () => void;
  currentIndex: number;
  historyLength: number;
}

export function useOrchestrationHistory<T>(
  getter: () => T,
  setter: (value: T) => void,
  options?: {
    maxSize?: number;
    debounceMs?: number;
  }
): HistoryState<T> {
  const maxSize = options?.maxSize ?? MAX_HISTORY_SIZE;
  const debounceMs = options?.debounceMs ?? 0;

  const [history, setHistory] = useState<T[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Initialize with first snapshot
  useEffect(() => {
    if (history.length === 0) {
      const initial = getter();
      setHistory([initial]);
      setCurrentIndex(0);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pushSnapshot = useCallback(
    (snapshot: T) => {
      if (debounceMs > 0) {
        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current);
        }
        debounceTimer.current = setTimeout(() => {
          pushSnapshotInternal(snapshot);
        }, debounceMs);
      } else {
        pushSnapshotInternal(snapshot);
      }
    },
    [debounceMs] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const pushSnapshotInternal = (snapshot: T) => {
    setHistory((prev) => {
      // Discard all history after current index (branching)
      const newHistory = prev.slice(0, currentIndex + 1);

      // Add new snapshot
      newHistory.push(snapshot);

      // Trim if exceeds max size
      if (newHistory.length > maxSize) {
        newHistory.shift();
        setCurrentIndex((idx) => idx - 1);
      }

      return newHistory;
    });

    setCurrentIndex((idx) => {
      const newIdx = idx + 1;
      return newIdx >= maxSize ? maxSize - 1 : newIdx;
    });
  };

  const undo = useCallback(() => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      setter(history[newIndex]);
    }
  }, [currentIndex, history, setter]);

  const redo = useCallback(() => {
    if (currentIndex < history.length - 1) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      setter(history[newIndex]);
    }
  }, [currentIndex, history, setter]);

  const clearHistory = useCallback(() => {
    const current = getter();
    setHistory([current]);
    setCurrentIndex(0);
  }, [getter]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return {
    undo,
    redo,
    canUndo: currentIndex > 0,
    canRedo: currentIndex < history.length - 1,
    pushSnapshot,
    clearHistory,
    currentIndex,
    historyLength: history.length,
  };
}

/**
 * Keyboard shortcuts hook for undo/redo
 *
 * Usage:
 * ```tsx
 * useOrchestrationKeyboardShortcuts({
 *   onUndo: history.undo,
 *   onRedo: history.redo,
 *   enabled: true,
 * });
 * ```
 */
export function useOrchestrationKeyboardShortcuts(handlers: {
  onUndo?: () => void;
  onRedo?: () => void;
  enabled?: boolean;
}) {
  const { onUndo, onRedo, enabled = true } = handlers;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z or Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        onUndo?.();
      }

      // Ctrl+Shift+Z or Cmd+Shift+Z for redo
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        onRedo?.();
      }

      // Also support Ctrl+Y for redo (Windows convention)
      if (e.ctrlKey && !e.shiftKey && e.key === 'y') {
        e.preventDefault();
        onRedo?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onUndo, onRedo, enabled]);
}
