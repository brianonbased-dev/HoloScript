'use client';

/**
 * SceneDiffPanel — side-by-side diff viewer between two HoloScript code versions.
 *
 * Shows a unified-diff style view: red for removed lines, green for added lines.
 * Accepts an "original" code string prop + reads current code from useSceneStore.
 *
 * Used when loading a template or shared scene to preview what will change.
 */

import { useMemo } from 'react';
import { GitCompare, X, Check, Minus, Plus } from 'lucide-react';
import { useSceneStore } from '@/lib/store';

interface DiffLine {
  type: 'same' | 'add' | 'remove';
  content: string;
  lineNo?: number;
}

function computeDiff(before: string, after: string): DiffLine[] {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  // Simple LCS-based line diff (greedy match)
  const result: DiffLine[] = [];
  let i = 0, j = 0;

  while (i < beforeLines.length || j < afterLines.length) {
    const b = beforeLines[i];
    const a = afterLines[j];

    if (i >= beforeLines.length) {
      result.push({ type: 'add', content: a, lineNo: j + 1 });
      j++;
    } else if (j >= afterLines.length) {
      result.push({ type: 'remove', content: b, lineNo: i + 1 });
      i++;
    } else if (b === a) {
      result.push({ type: 'same', content: b, lineNo: i + 1 });
      i++; j++;
    } else {
      // Look ahead to find the next match
      const lookAhead = 4;
      let matchB = -1, matchA = -1;

      for (let di = 1; di <= lookAhead && matchB === -1; di++) {
        for (let dj = 1; dj <= lookAhead && matchB === -1; dj++) {
          if (beforeLines[i + di] === afterLines[j + dj]) {
            matchB = di; matchA = dj;
          }
        }
      }

      if (matchB !== -1 && matchA !== -1) {
        for (let x = 0; x < matchB; x++) {
          result.push({ type: 'remove', content: beforeLines[i + x], lineNo: i + x + 1 });
        }
        for (let x = 0; x < matchA; x++) {
          result.push({ type: 'add', content: afterLines[j + x], lineNo: j + x + 1 });
        }
        i += matchB; j += matchA;
      } else {
        result.push({ type: 'remove', content: b, lineNo: i + 1 });
        result.push({ type: 'add', content: a, lineNo: j + 1 });
        i++; j++;
      }
    }
  }
  return result;
}

interface SceneDiffPanelProps {
  /** The "before" code to compare against. Defaults to current scene store code. */
  beforeCode?: string;
  /** The "after" code to compare (the incoming template/shared scene). */
  afterCode: string;
  afterLabel?: string;
  onAccept?: () => void;
  onClose: () => void;
}

export function SceneDiffPanel({
  beforeCode,
  afterCode,
  afterLabel = 'Incoming',
  onAccept,
  onClose,
}: SceneDiffPanelProps) {
  const currentCode = useSceneStore((s) => s.code);
  const before = beforeCode ?? currentCode ?? '';
  const diff = useMemo(() => computeDiff(before, afterCode), [before, afterCode]);

  const adds = diff.filter((l) => l.type === 'add').length;
  const removes = diff.filter((l) => l.type === 'remove').length;

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <GitCompare className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Scene Diff</span>
        <div className="ml-2 flex items-center gap-2 text-[10px]">
          <span className="text-green-400">+{adds}</span>
          <span className="text-red-400">−{removes}</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {onAccept && (
            <button
              onClick={onAccept}
              title="Accept changes"
              className="flex items-center gap-1 rounded-lg bg-studio-accent px-2 py-1 text-[11px] text-white hover:brightness-110"
            >
              <Check className="h-3 w-3" /> Accept
            </button>
          )}
          <button onClick={onClose} className="rounded p-1 text-studio-muted hover:text-studio-text">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Label strip */}
      <div className="flex shrink-0 border-b border-studio-border text-[9px] text-studio-muted">
        <div className="flex-1 border-r border-studio-border px-3 py-1.5">Current Scene</div>
        <div className="flex-1 px-3 py-1.5">{afterLabel}</div>
      </div>

      {/* Diff body */}
      <div className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed">
        {diff.map((line, i) => {
          const bg =
            line.type === 'add'
              ? 'bg-green-500/10'
              : line.type === 'remove'
              ? 'bg-red-500/10'
              : '';
          const text =
            line.type === 'add'
              ? 'text-green-400'
              : line.type === 'remove'
              ? 'text-red-400'
              : 'text-studio-muted/80';

          return (
            <div key={i} className={`flex items-start px-3 py-0.5 ${bg}`}>
              <span className="mr-2 w-4 shrink-0 opacity-40">
                {line.type === 'add' ? (
                  <Plus className="h-3 w-3 text-green-400" />
                ) : line.type === 'remove' ? (
                  <Minus className="h-3 w-3 text-red-400" />
                ) : (
                  <span className="text-[9px] text-studio-muted/30">{line.lineNo}</span>
                )}
              </span>
              <pre className={`flex-1 whitespace-pre-wrap break-all ${text}`}>{line.content}</pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
