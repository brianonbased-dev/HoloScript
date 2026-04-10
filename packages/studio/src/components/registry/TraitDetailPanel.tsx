import React from 'react';
import { TraitMatrixEntry } from './types';

export function TraitDetailPanel({ trait }: { trait: TraitMatrixEntry }) {
  return (
    <div className="px-4 py-3 bg-studio-bg/50 border-t border-studio-border space-y-3">
      {/* Properties */}
      {trait.properties.length > 0 && (
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-studio-muted mb-1.5">
            Properties
          </div>
          <div className="grid grid-cols-2 gap-1 lg:grid-cols-3">
            {trait.properties.map((p) => (
              <div
                key={p.name}
                className="rounded border border-studio-border bg-studio-panel/50 px-2 py-1"
              >
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono font-semibold text-studio-text">
                    {p.name}
                  </span>
                  {p.required && (
                    <span className="text-[7px] bg-red-900/40 text-red-300 rounded px-1">REQ</span>
                  )}
                </div>
                <div className="text-[9px] text-studio-muted">
                  <span className="text-cyan-400/70">{p.type}</span>
                  {p.default !== undefined && (
                    <span className="ml-1">= {JSON.stringify(p.default)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Features */}
      {trait.features.length > 0 && (
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-studio-muted mb-1">
            Features
          </div>
          <div className="flex flex-wrap gap-1">
            {trait.features.map((f) => (
              <span
                key={f}
                className="rounded bg-studio-accent/10 px-1.5 py-0.5 text-[9px] font-mono text-studio-accent"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Dependencies */}
      <div className="flex gap-6">
        {trait.requires.length > 0 && (
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-studio-muted mb-1">
              Requires
            </div>
            <div className="flex flex-wrap gap-1">
              {trait.requires.map((r) => (
                <span
                  key={r}
                  className="rounded bg-amber-900/30 px-1.5 py-0.5 text-[9px] font-mono text-amber-300"
                >
                  @{r}
                </span>
              ))}
            </div>
          </div>
        )}
        {trait.conflicts.length > 0 && (
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-studio-muted mb-1">
              Conflicts
            </div>
            <div className="flex flex-wrap gap-1">
              {trait.conflicts.map((c) => (
                <span
                  key={c}
                  className="rounded bg-red-900/30 px-1.5 py-0.5 text-[9px] font-mono text-red-300"
                >
                  @{c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
