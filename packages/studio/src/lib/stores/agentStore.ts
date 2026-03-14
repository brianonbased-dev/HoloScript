'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ─── Agent Store ────────────────────────────────────────────────────────────
// Tracks the live execution state of the uAA2++ 7-Phase agent cycle.
// Used by AgentMonitorPanel and any future telemetry/logging consumers.
//
// Phase names follow the uAA2++ protocol:
//   0 INTAKE → 1 REFLECT → 2 EXECUTE → 3 COMPRESS
//   4 REINTAKE → 5 GROW → 6 EVOLVE → 7 AUTONOMIZE

export type AgentPhase =
  | 'idle'
  | 'intake'
  | 'reflect'
  | 'execute'
  | 'compress'
  | 'reintake'
  | 'grow'
  | 'evolve'
  | 'autonomize';

export interface AgentCycleEntry {
  cycleId: number;
  phase: AgentPhase;
  action: string;
  startedAt: number; // Date.now()
  durationMs?: number;
  status: 'running' | 'done' | 'error';
}

interface AgentState {
  /** Whether any agent is actively running */
  isRunning: boolean;
  /** Current phase of the active cycle */
  currentPhase: AgentPhase;
  /** Human-readable label for what the agent is doing right now */
  currentAction: string;
  /** Total completed cycle count */
  cycleCount: number;
  /** Recent cycle log (capped at 50) */
  recentCycles: AgentCycleEntry[];
  /** Errors from the last cycle */
  lastError: string | null;

  // Actions
  startCycle: (cycleId: number) => void;
  setPhase: (phase: AgentPhase, action?: string) => void;
  completeCycle: (cycleId: number, durationMs: number) => void;
  failCycle: (cycleId: number, error: string) => void;
  stopAgent: () => void;
  clearHistory: () => void;
}

export const useAgentStore = create<AgentState>()(
  devtools(
    (set, get) => ({
      isRunning: false,
      currentPhase: 'idle',
      currentAction: '',
      cycleCount: 0,
      recentCycles: [],
      lastError: null,

      startCycle: (cycleId) => {
        const entry: AgentCycleEntry = {
          cycleId,
          phase: 'intake',
          action: 'Starting cycle...',
          startedAt: Date.now(),
          status: 'running',
        };
        set((s) => ({
          isRunning: true,
          currentPhase: 'intake',
          currentAction: 'Starting cycle...',
          lastError: null,
          recentCycles: [entry, ...s.recentCycles].slice(0, 50),
        }));
      },

      setPhase: (phase, action = '') => {
        set((s) => ({
          currentPhase: phase,
          currentAction: action,
          recentCycles: s.recentCycles.map((c, i) =>
            i === 0 && c.status === 'running' ? { ...c, phase, action } : c
          ),
        }));
      },

      completeCycle: (cycleId, durationMs) => {
        set((s) => ({
          isRunning: false,
          currentPhase: 'idle',
          currentAction: '',
          cycleCount: s.cycleCount + 1,
          recentCycles: s.recentCycles.map((c) =>
            c.cycleId === cycleId ? { ...c, status: 'done', durationMs } : c
          ),
        }));
      },

      failCycle: (cycleId, error) => {
        set((s) => ({
          isRunning: false,
          currentPhase: 'idle',
          currentAction: '',
          lastError: error,
          recentCycles: s.recentCycles.map((c) =>
            c.cycleId === cycleId ? { ...c, status: 'error', durationMs: Date.now() - c.startedAt } : c
          ),
        }));
      },

      stopAgent: () => {
        set({ isRunning: false, currentPhase: 'idle', currentAction: '' });
      },

      clearHistory: () => {
        set({ recentCycles: [], cycleCount: 0, lastError: null });
      },
    }),
    { name: 'agent-store' }
  )
);
