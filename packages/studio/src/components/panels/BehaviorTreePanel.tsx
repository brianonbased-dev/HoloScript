'use client';
/**
 * BehaviorTreePanel — Visual BT editor and debugger
 */
import React, { useState } from 'react';
import { useBehaviorTree, type _BTTraceEntry } from '../../hooks/useBehaviorTree';

const STATUS_COLORS: Record<string, string> = {
  success: 'text-emerald-400',
  failure: 'text-red-400',
  running: 'text-amber-400',
  ready: 'text-studio-muted',
};

const STATUS_ICONS: Record<string, string> = {
  success: '✓',
  failure: '✗',
  running: '⟳',
  ready: '○',
};

export function BehaviorTreePanel() {
  const { trees, trace, lastStatus, createTree, tick, tickAll, abort, remove, reset } =
    useBehaviorTree();
  const [treeType, setTreeType] = useState<'patrol' | 'guard' | 'idle'>('patrol');

  const createDemo = () => {
    const id = `tree-${Date.now()}`;
    createTree(id, treeType, 'npc-agent');
  };

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🧠 Behavior Tree</h3>
        <span className={`text-[10px] font-medium ${STATUS_COLORS[lastStatus]}`}>
          {STATUS_ICONS[lastStatus]} {lastStatus}
        </span>
      </div>

      {/* Create controls */}
      <div className="flex gap-1.5">
        <select
          value={treeType}
          onChange={(e) => setTreeType(e.target.value as 'patrol' | 'guard' | 'idle')}
          className="bg-studio-panel border border-studio-border rounded px-1.5 py-1 text-studio-text text-[10px] flex-1"
        >
          <option value="patrol">🚶 Patrol</option>
          <option value="guard">🛡️ Guard</option>
          <option value="idle">😴 Idle</option>
        </select>
        <button
          onClick={createDemo}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          + Create
        </button>
        <button
          onClick={() => tickAll()}
          className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
        >
          ⟳ Tick All
        </button>
        <button
          onClick={reset}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺
        </button>
      </div>

      {/* Tree list */}
      <div className="space-y-1">
        {trees.length === 0 && <p className="text-studio-muted">No trees. Create one above.</p>}
        {trees.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between bg-studio-panel/30 rounded px-2 py-1.5"
          >
            <div>
              <span className="text-studio-text font-medium">{t.id}</span>
              <span className="text-studio-muted ml-2">tick #{t.tickCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`${STATUS_COLORS[t.status]}`}>{STATUS_ICONS[t.status]}</span>
              <button
                onClick={() => tick(t.id)}
                className="text-studio-accent hover:opacity-80 transition"
                title="Tick"
              >
                ⟳
              </button>
              <button
                onClick={() => abort(t.id)}
                className="text-amber-400 hover:opacity-80 transition"
                title="Abort"
              >
                ⏹
              </button>
              <button
                onClick={() => remove(t.id)}
                className="text-red-400 hover:opacity-80 transition"
                title="Remove"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Trace log */}
      {trace.length > 0 && (
        <div>
          <h4 className="text-studio-muted font-medium mb-1">Debug Trace</h4>
          <div className="space-y-0.5 max-h-[150px] overflow-y-auto font-mono text-[10px]">
            {trace
              .slice(-20)
              .reverse()
              .map((t, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-studio-panel/20 rounded px-1.5 py-0.5"
                >
                  <span className="text-studio-muted w-8">#{t.tick}</span>
                  <span className="text-studio-text flex-1 truncate">{t.node}</span>
                  <span className={STATUS_COLORS[t.status]}>{t.status}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
