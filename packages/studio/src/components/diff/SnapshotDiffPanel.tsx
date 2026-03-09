'use client';

/**
 * SnapshotDiffPanel — side-by-side diff viewer between any two undo snapshots.
 */

import { X, GitCompare } from 'lucide-react';
import { useSnapshotDiff, type DiffLine } from '@/hooks/useSnapshotDiff';

const LINE_BG: Record<string, string> = {
  added: 'bg-green-950/60 border-l-2 border-green-500',
  removed: 'bg-red-950/60 border-l-2 border-red-500',
  same: '',
};
const LINE_COLOR: Record<string, string> = {
  added: 'text-green-300',
  removed: 'text-red-300',
  same: 'text-studio-muted/80',
};
const LINE_PREFIX: Record<string, string> = {
  added: '+',
  removed: '-',
  same: ' ',
};

function DiffRow({ line }: { line: DiffLine }) {
  return (
    <tr className={LINE_BG[line.type]}>
      <td className="select-none w-8 pr-2 text-right font-mono text-[8px] text-studio-muted/40">
        {line.type !== 'added' ? (line.lineA ?? '') : ''}
      </td>
      <td className="select-none w-8 pr-2 text-right font-mono text-[8px] text-studio-muted/40">
        {line.type !== 'removed' ? (line.lineB ?? '') : ''}
      </td>
      <td className={`select-none w-3 font-mono text-[9px] ${LINE_COLOR[line.type]}`}>
        {LINE_PREFIX[line.type]}
      </td>
      <td className={`whitespace-pre font-mono text-[9px] ${LINE_COLOR[line.type]}`}>
        {line.text}
      </td>
    </tr>
  );
}

interface SnapshotDiffPanelProps {
  onClose: () => void;
}

export function SnapshotDiffPanel({ onClose }: SnapshotDiffPanelProps) {
  const { diff, stats, allCodes, currentIndex, indexA, indexB, setIndexA, setIndexB } =
    useSnapshotDiff();

  const snapshotLabel = (i: number) => {
    if (i === currentIndex) return 'Current';
    if (i < currentIndex) return `Past ${currentIndex - i}`;
    return `Redo ${i - currentIndex}`;
  };

  return (
    <div className="flex h-full flex-col bg-[#0a0a12] text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border bg-studio-panel px-3 py-2.5">
        <GitCompare className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Snapshot Diff</span>
        <div className="ml-2 flex items-center gap-1">
          <span className="rounded-full bg-red-900/40 px-1.5 py-0.5 text-[8px] text-red-400">
            −{stats.removed}
          </span>
          <span className="rounded-full bg-green-900/40 px-1.5 py-0.5 text-[8px] text-green-400">
            +{stats.added}
          </span>
        </div>
        <button
          onClick={onClose}
          className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Snapshot selectors */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border bg-studio-panel px-3 py-2">
        <div className="flex flex-1 items-center gap-1.5">
          <span className="text-[8px] text-red-400">A (before)</span>
          <select
            value={indexA}
            onChange={(e) => setIndexA(Number(e.target.value))}
            className="flex-1 rounded-lg border border-studio-border bg-studio-surface px-1.5 py-1 text-[9px] text-studio-text outline-none"
          >
            {allCodes.map((_, i) => (
              <option key={i} value={i}>
                {snapshotLabel(i)}
              </option>
            ))}
          </select>
        </div>
        <span className="text-[9px] text-studio-muted">→</span>
        <div className="flex flex-1 items-center gap-1.5">
          <span className="text-[8px] text-green-400">B (after)</span>
          <select
            value={indexB}
            onChange={(e) => setIndexB(Number(e.target.value))}
            className="flex-1 rounded-lg border border-studio-border bg-studio-surface px-1.5 py-1 text-[9px] text-studio-text outline-none"
          >
            {allCodes.map((_, i) => (
              <option key={i} value={i}>
                {snapshotLabel(i)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Diff output */}
      <div className="flex-1 overflow-auto">
        {diff.length === 0 && (
          <p className="py-8 text-center text-[10px] text-studio-muted">
            No differences to show. Make some edits to the scene.
          </p>
        )}
        {diff.every((d) => d.type === 'same') && diff.length > 0 && (
          <p className="py-4 text-center text-[10px] text-green-500/80">
            ✓ Snapshots are identical
          </p>
        )}
        <table className="w-full border-collapse">
          <tbody>
            {diff.map((line, i) => (
              <DiffRow key={i} line={line} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
