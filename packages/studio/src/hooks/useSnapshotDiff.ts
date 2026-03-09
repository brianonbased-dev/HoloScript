'use client';

/**
 * useSnapshotDiff — computes a line diff between two undo snapshot indices.
 */

import { useMemo, useState } from 'react';
import { useTemporalStore } from '@/lib/historyStore';
import { useSceneStore } from '@/lib/stores';

export type DiffLineType = 'same' | 'added' | 'removed';

export interface DiffLine {
  type: DiffLineType;
  text: string;
  lineA?: number;
  lineB?: number;
}

const MAX_LINES_FOR_DIFF = 500;

// Global zero-allocation buffer for hot-path diffing
// Enough for 501 x 501, reusing memory to prevent GC stutter
const SHARED_DP_BUFFER = new Int32Array((MAX_LINES_FOR_DIFF + 1) * (MAX_LINES_FOR_DIFF + 1));

/** Naive LCS-based line diff optimized with zero-allocation flat buffer */
function diffLines(aLines: string[], bLines: string[]): DiffLine[] {
  const m = aLines.length;
  const n = bLines.length;
  const cols = n + 1;

  const getDP = (i: number, j: number) => SHARED_DP_BUFFER[i * cols + j];
  const setDP = (i: number, j: number, val: number) => {
    SHARED_DP_BUFFER[i * cols + j] = val;
  };

  // Clear the used portion of the DP table
  for (let i = 0; i <= m; i++) {
    for (let j = 0; j <= n; j++) {
      setDP(i, j, 0);
    }
  }

  // Build LCS table backwards
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (aLines[i] === bLines[j]) {
        setDP(i, j, getDP(i + 1, j + 1) + 1);
      } else {
        setDP(i, j, Math.max(getDP(i + 1, j), getDP(i, j + 1)));
      }
    }
  }

  const result: DiffLine[] = [];
  let i = 0,
    j = 0,
    lineA = 1,
    lineB = 1;

  while (i < m || j < n) {
    if (i < m && j < n && aLines[i] === bLines[j]) {
      result.push({ type: 'same', text: aLines[i], lineA: lineA++, lineB: lineB++ });
      i++;
      j++;
    } else if (j < n && (i >= m || getDP(i + 1, j) <= getDP(i, j + 1))) {
      result.push({ type: 'added', text: bLines[j], lineB: lineB++ });
      j++;
    } else {
      result.push({ type: 'removed', text: aLines[i], lineA: lineA++ });
      i++;
    }
  }
  return result;
}

export function useSnapshotDiff() {
  const temporal = useTemporalStore((s) => s) as unknown as {
    pastStates: Array<{ code?: string }>;
    futureStates: Array<{ code?: string }>;
  };
  const currentCode = useSceneStore((s) => s.code) ?? '';

  const allCodes = useMemo(() => {
    const past = (temporal.pastStates ?? []).map((s) => s.code ?? '');
    const future = (temporal.futureStates ?? []).map((s) => s.code ?? '');
    return [...past, currentCode, ...future];
  }, [temporal, currentCode]);

  const currentIndex = (temporal.pastStates ?? []).length;
  const [indexA, setIndexA] = useState<number>(Math.max(0, currentIndex - 1));
  const [indexB, setIndexB] = useState<number>(currentIndex);

  const diff = useMemo<DiffLine[]>(() => {
    const a = (allCodes[indexA] ?? '').split('\n').slice(0, MAX_LINES_FOR_DIFF);
    const b = (allCodes[indexB] ?? '').split('\n').slice(0, MAX_LINES_FOR_DIFF);
    return diffLines(a, b);
  }, [allCodes, indexA, indexB]);

  const stats = useMemo(
    () => ({
      added: diff.filter((d) => d.type === 'added').length,
      removed: diff.filter((d) => d.type === 'removed').length,
    }),
    [diff]
  );

  return { diff, stats, allCodes, currentIndex, indexA, indexB, setIndexA, setIndexB };
}
