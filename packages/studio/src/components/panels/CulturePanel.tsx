'use client';
/** CulturePanel — Cultural norm and memory runtime */
import React from 'react';
import { useCulture } from '../../hooks/useCulture';

const SEVERITY_COLORS = {
  info: 'text-blue-400',
  warning: 'text-amber-400',
  critical: 'text-red-400',
};
const TYPE_ICONS: Record<string, string> = {
  violation: '⚠️',
  norm_adopted: '✅',
  norm_proposed: '📋',
  sop_formed: '🧠',
  cultural_shift: '🌍',
  trace_reinforced: '📌',
};

export function CulturePanel() {
  const {
    health,
    agentCount,
    events,
    tickCount,
    joinAgent,
    leaveAgent,
    tick,
    tickN,
    buildDemo,
    reset,
  } = useCulture();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🏛️ Culture</h3>
        <span
          className={`text-[10px] font-mono ${health > 0.7 ? 'text-emerald-400' : health > 0.4 ? 'text-amber-400' : 'text-red-400'}`}
        >
          ❤️ {(health * 100).toFixed(0)}% · {agentCount} agents · T{tickCount}
        </span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={buildDemo}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          🏛️ Demo
        </button>
        <button
          onClick={tick}
          className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
        >
          ⏱ Tick
        </button>
        <button
          onClick={() => tickN(10)}
          className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
        >
          ⏩ ×10
        </button>
        <button
          onClick={() => joinAgent(`agent-${Date.now()}`)}
          className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
        >
          + Agent
        </button>
        <button
          onClick={reset}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺
        </button>
      </div>

      {/* Health bar */}
      <div className="w-full bg-studio-panel rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${health > 0.7 ? 'bg-emerald-400' : health > 0.4 ? 'bg-amber-400' : 'bg-red-400'}`}
          style={{ width: `${Math.max(0, health * 100)}%` }}
        />
      </div>

      {/* Events */}
      <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
        {events.length === 0 && (
          <p className="text-studio-muted text-center py-2">
            Load demo and tick to see culture events.
          </p>
        )}
        {events.map((e, i) => (
          <div
            key={i}
            className={`flex items-start gap-1.5 rounded px-1.5 py-0.5 text-[10px] bg-studio-panel/20 ${SEVERITY_COLORS[e.severity as keyof typeof SEVERITY_COLORS]}`}
          >
            <span>{TYPE_ICONS[e.type as keyof typeof TYPE_ICONS] || '💬'}</span>
            <div className="flex-1 truncate">
              <span className="font-mono">{e.agentId}</span>: {e.details}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
