'use client';
/** CompilerPanel — Multi-target compilation dashboard */
import React from 'react';
import { useCompiler } from '../../hooks/useCompiler';

export function CompilerPanel() {
  const {
    targets,
    selectedTargets,
    results,
    isCompiling,
    toggleTarget,
    selectAll,
    clearAll,
    compile,
    clearResults,
  } = useCompiler();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🔨 Compiler</h3>
        <span className="text-[10px] text-studio-muted">
          {selectedTargets.size}/{targets.length} targets
        </span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={compile}
          disabled={isCompiling || selectedTargets.size === 0}
          className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition disabled:opacity-50"
        >
          {isCompiling ? '⏳ Compiling...' : '🔨 Compile'}
        </button>
        <button
          onClick={selectAll}
          className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
        >
          All
        </button>
        <button
          onClick={clearAll}
          className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
        >
          None
        </button>
        {results.length > 0 && (
          <button
            onClick={clearResults}
            className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
          >
            ↺
          </button>
        )}
      </div>

      {/* Target grid */}
      <div className="grid grid-cols-3 gap-1">
        {targets.map((t) => (
          <button
            key={t.id}
            onClick={() => toggleTarget(t.id)}
            className={`px-1.5 py-1 rounded text-[10px] text-center transition-all ${selectedTargets.has(t.id) ? 'bg-studio-accent/20 text-studio-accent ring-1 ring-studio-accent/30' : 'bg-studio-panel/30 text-studio-muted hover:text-studio-text'}`}
          >
            {t.icon} {t.name}
          </button>
        ))}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-0.5 max-h-[100px] overflow-y-auto">
          {results.map((r, i) => (
            <div
              key={i}
              className={`flex items-center justify-between rounded px-2 py-0.5 text-[10px] ${r.success ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}
            >
              <div className="flex items-center gap-1 truncate">
                <span>{r.success ? '✓' : '✗'}</span>
                <span className={r.success ? 'text-emerald-400' : 'text-red-400'}>{r.target}</span>
                <span className="text-studio-muted truncate">{r.output}</span>
              </div>
              <span className="text-studio-muted font-mono">{r.time.toFixed(0)}ms</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
