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

/** Naive LCS-based line diff */
function diffLines(aLines: string[], bLines: string[]): DiffLine[] {
  // Build LCS table
  const m = aLines.length,
    n = bLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        aLines[i] === bLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
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
    } else if (j < n && (i >= m || dp[i + 1]?.[j] <= dp[i]?.[j + 1])) {
      result.push({ type: 'added', text: bLines[j], lineB: lineB++ });
      j++;
    } else {
      result.push({ type: 'removed', text: aLines[i], lineA: lineA++ });
      i++;
    }
  }
  return result;
}

const MAX_LINES_FOR_DIFF = 500;

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
