'use client';
/**
 * useReactiveState — Hook for reactive state with undo/redo
 */
import { useState, useCallback, useRef } from 'react';
import { ReactiveState } from '@holoscript/core';

export interface UseReactiveStateReturn {
  state: Record<string, unknown>;
  changes: number;
  set: (key: string, value: unknown) => void;
  undo: () => void;
  redo: () => void;
  buildDemo: () => void;
  reset: () => void;
}

export function useReactiveState(): UseReactiveStateReturn {
  const rs = useRef(new ReactiveState<Record<string, unknown>>({}));
  const [state, setState] = useState<Record<string, unknown>>({});
  const [changes, setChanges] = useState(0);
  const changeCount = useRef(0);

  const sync = useCallback(() => { setState({ ...rs.current.getSnapshot() }); setChanges(changeCount.current); }, []);

  const set = useCallback((key: string, value: unknown) => {
    rs.current.set(key as any, value as any);
    changeCount.current++;
    sync();
  }, [sync]);

  const undo = useCallback(() => { rs.current.undo(); sync(); }, [sync]);
  const redo = useCallback(() => { rs.current.redo(); sync(); }, [sync]);

  const buildDemo = useCallback(() => {
    rs.current = new ReactiveState<Record<string, unknown>>({ playerName: 'Hero', health: 100, gold: 50, level: 1, xp: 0 });
    changeCount.current = 0;
    sync();
  }, [sync]);

  const reset = useCallback(() => { rs.current = new ReactiveState<Record<string, unknown>>({}); changeCount.current = 0; sync(); }, [sync]);

  return { state, changes, set, undo, redo, buildDemo, reset };
}
