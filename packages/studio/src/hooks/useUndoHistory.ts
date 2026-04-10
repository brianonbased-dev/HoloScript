'use client';

/**
 * useUndoHistory — reads undo/redo snapshots from the temporal store.
 * Returns a labeled snapshot list ready for display in the history sidebar.
 */

import { useMemo } from 'react';
import { useTemporalStore } from '@/lib/historyStore';
import { useSceneStore } from '@/lib/stores';

export interface HistoryEntry {
  index: number;
  label: string;
  preview: string; // first 60 chars of scene code at that snapshot
  isCurrent: boolean;
  timestamp?: number;
}

export function useUndoHistory() {
  // The temporal store exposes pastStates and futureStates via zundo
  const temporal = useTemporalStore((s) => s);
  const currentCode = useSceneStore((s) => s.code) ?? '';

  // zundo stores past/future as arrays of partial store states
  const pastStates =
    (temporal as unknown as { pastStates: Array<{ code?: string }> }).pastStates ?? [];
  const futureStates =
    (temporal as unknown as { futureStates: Array<{ code?: string }> }).futureStates ?? [];

  const entries = useMemo<HistoryEntry[]>(() => {
    const result: HistoryEntry[] = [];

    // Past states (oldest to newest)
    pastStates.forEach((s, i) => {
      const code = s.code ?? '';
      const objMatch = code.match(/object\s+"([^"]+)"/g);
      const label = objMatch
        ? `Edit — ${objMatch.length} object${objMatch.length !== 1 ? 's' : ''}`
        : code.split('\n').length > 1
          ? 'Edit — multiline'
          : 'Edit';
      result.push({ index: i, label, preview: code.trim().slice(0, 60), isCurrent: false });
    });

    // Current state
    const nowObjs = currentCode.match(/object\s+"([^"]+)"/g);
    result.push({
      index: pastStates.length,
      label: `Current — ${nowObjs ? `${nowObjs.length} objects` : 'scene'}`,
      preview: currentCode.trim().slice(0, 60),
      isCurrent: true,
    });

    // Future states (next to furthest)
    futureStates.forEach((s, i) => {
      const code = s.code ?? '';
      result.push({
        index: pastStates.length + 1 + i,
        label: `Redo ${i + 1}`,
        preview: code.trim().slice(0, 60),
        isCurrent: false,
      });
    });

    return result;
  }, [pastStates, futureStates, currentCode]);

  const jumpTo = useMemo(() => {
    const { undo, redo } = temporal as unknown as {
      undo?: (steps: number) => void;
      redo?: (steps: number) => void;
    };
    return (targetIndex: number) => {
      const currentIndex = pastStates.length;
      const delta = targetIndex - currentIndex;
      if (delta < 0 && undo) undo(Math.abs(delta));
      else if (delta > 0 && redo) redo(delta);
    };
  }, [temporal, pastStates.length]);

  return { entries, currentIndex: pastStates.length, jumpTo };
}
