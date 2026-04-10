import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ObjectDiff } from '../types';
import { STATUS_BG, STATUS_BADGE } from '../constants';

interface ObjectDiffCardProps {
  diff: ObjectDiff;
  expanded: boolean;
  onToggle: () => void;
}

export function ObjectDiffCard({ diff, expanded, onToggle }: ObjectDiffCardProps) {
  const changedCount =
    diff.traitDiffs.filter((d) => d.status !== 'unchanged').length +
    diff.propDiffs.filter((d) => d.status !== 'unchanged').length;

  return (
    <div className={`rounded-lg border ${STATUS_BG[diff.status]} mb-2`}>
      {/* Object header */}
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-studio-muted flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-studio-muted flex-shrink-0" />
        )}
        <span className="text-xs font-semibold text-studio-text font-mono">{diff.name}</span>
        <span
          className={`ml-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase ${STATUS_BADGE[diff.status]}`}
        >
          {diff.status}
        </span>
        {changedCount > 0 && diff.status !== 'added' && diff.status !== 'removed' && (
          <span className="text-[8px] text-studio-muted ml-auto">
            {changedCount} change{changedCount > 1 ? 's' : ''}
          </span>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 space-y-1.5">
          {/* Traits */}
          {diff.traitDiffs.length > 0 && (
            <div>
              <div className="text-[8px] font-semibold uppercase tracking-wider text-studio-muted mb-1">
                Traits
              </div>
              <div className="flex flex-wrap gap-1">
                {diff.traitDiffs.map((t) => (
                  <span
                    key={t.name}
                    className={`rounded px-1.5 py-0.5 text-[9px] font-mono ${STATUS_BADGE[t.status]}`}
                  >
                    @{t.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Properties */}
          {diff.propDiffs.length > 0 && (
            <div>
              <div className="text-[8px] font-semibold uppercase tracking-wider text-studio-muted mb-1">
                Properties
              </div>
              <div className="space-y-0.5">
                {diff.propDiffs.map((p) => (
                  <div
                    key={p.key}
                    className={`flex items-center gap-2 rounded px-2 py-0.5 text-[9px] font-mono ${STATUS_BADGE[p.status]}`}
                  >
                    <span className="font-semibold">{p.key}:</span>
                    {p.status === 'modified' ? (
                      <span>
                        <span className="text-red-300 line-through mr-1">{p.valueA}</span>
                        <span className="text-green-300">{p.valueB}</span>
                      </span>
                    ) : (
                      <span>{p.valueA || p.valueB}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
