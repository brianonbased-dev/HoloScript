'use client';
/**
 * AgentCyclePanel — uAA2++ 7-Phase Agent Cycle Viewer
 *
 * Visualizes agent protocol cycles with phase progression,
 * timing, PWG knowledge cards, and cycle history.
 * Bridges @holoscript/agent-protocol into the Studio UI.
 */
import React, { useState, useCallback } from 'react';

const PHASES = [
  { id: 0, name: 'INTAKE', icon: '📥', color: '#3b82f6' },
  { id: 1, name: 'REFLECT', icon: '🔍', color: '#8b5cf6' },
  { id: 2, name: 'EXECUTE', icon: '⚡', color: '#f59e0b' },
  { id: 3, name: 'COMPRESS', icon: '📦', color: '#10b981' },
  { id: 4, name: 'REINTAKE', icon: '🔄', color: '#06b6d4' },
  { id: 5, name: 'GROW', icon: '🌱', color: '#22c55e' },
  { id: 6, name: 'EVOLVE', icon: '🧬', color: '#a855f7' },
];

interface DemoCycle {
  id: string;
  task: string;
  status: 'complete' | 'partial' | 'running';
  currentPhase: number;
  phases: { name: string; status: 'success' | 'failure' | 'pending'; durationMs: number }[];
  totalMs: number;
  timestamp: number;
}

function createDemoCycle(task: string): DemoCycle {
  const phases = PHASES.map(p => ({
    name: p.name,
    status: 'success' as const,
    durationMs: Math.floor(Math.random() * 200 + 50),
  }));
  return {
    id: `cycle_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    task,
    status: 'complete',
    currentPhase: 6,
    phases,
    totalMs: phases.reduce((s, p) => s + p.durationMs, 0),
    timestamp: Date.now(),
  };
}

export function AgentCyclePanel() {
  const [cycles, setCycles] = useState<DemoCycle[]>([]);
  const [activeCycle, setActiveCycle] = useState<DemoCycle | null>(null);

  const runCycle = useCallback((task: string) => {
    const cycle = createDemoCycle(task);
    setCycles(prev => [cycle, ...prev].slice(0, 20));
    setActiveCycle(cycle);
  }, []);

  const demoTasks = [
    '🔍 Analyze scene complexity',
    '🔧 Optimize shader pipeline',
    '📊 Profile memory usage',
    '🧪 Validate trait compatibility',
    '🔄 Sync knowledge base',
  ];

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🧠 Agent Cycle</h3>
        <span className="text-[10px] text-studio-muted">{cycles.length} cycles</span>
      </div>

      {/* Quick run buttons */}
      <div className="flex gap-1 flex-wrap">
        {demoTasks.map(task => (
          <button key={task} onClick={() => runCycle(task)}
            className="px-2 py-1 bg-studio-panel/40 text-studio-muted rounded hover:bg-studio-accent/20 hover:text-studio-accent transition text-[10px]">
            {task}
          </button>
        ))}
      </div>

      {/* Phase visualization */}
      {activeCycle && (
        <div className="bg-studio-panel/30 rounded-lg p-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-studio-text font-medium text-[10px]">{activeCycle.task}</span>
            <span className={`text-[10px] px-1.5 rounded ${activeCycle.status === 'complete' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
              {activeCycle.status}
            </span>
          </div>

          {/* Phase progress bar */}
          <div className="flex gap-0.5">
            {PHASES.map((phase, i) => {
              const p = activeCycle.phases[i];
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div
                    className="w-full h-4 rounded-sm flex items-center justify-center text-[8px]"
                    style={{
                      backgroundColor: p?.status === 'success' ? `${phase.color}33` : '#333',
                      color: p?.status === 'success' ? phase.color : '#666',
                    }}
                  >
                    {phase.icon}
                  </div>
                  <span className="text-[7px] text-studio-muted">{p?.durationMs}ms</span>
                </div>
              );
            })}
          </div>

          <div className="text-[10px] text-studio-muted text-center">
            Total: {activeCycle.totalMs}ms · {new Date(activeCycle.timestamp).toLocaleTimeString('en', { hour12: false })}
          </div>
        </div>
      )}

      {/* Cycle history */}
      <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
        {cycles.length === 0 && <p className="text-studio-muted text-center py-3">Run a cycle to see history.</p>}
        {cycles.map(c => (
          <button key={c.id} onClick={() => setActiveCycle(c)}
            className={`w-full flex items-center justify-between px-2 py-1 rounded text-[10px] transition
              ${activeCycle?.id === c.id ? 'bg-studio-accent/15 text-studio-accent' : 'bg-studio-panel/20 text-studio-muted hover:text-studio-text'}`}>
            <span className="truncate">{c.task}</span>
            <span className="flex-shrink-0 ml-2">{c.totalMs}ms</span>
          </button>
        ))}
      </div>
    </div>
  );
}
