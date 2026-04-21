'use client';

/**
 * DebuggerPanel — right-rail HoloScript step-through debugger.
 */

import { useState } from 'react';
import {
  Bug,
  X,
  Play,
  StepForward,
  RotateCcw,
  FastForward,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { useDebugger, type DebugFrame, type DebugVar } from '@/hooks/useDebugger';
import { useSceneStore } from '@/lib/stores';

interface DebuggerPanelProps {
  onClose: () => void;
}

const FRAME_COLORS: Record<string, string> = {
  scene: 'text-violet-400',
  object: 'text-blue-400',
  trait: 'text-emerald-400',
  property: 'text-studio-muted',
};

const TYPE_BG: Record<string, string> = {
  scene: 'border-violet-500/30 bg-violet-500/10',
  object: 'border-blue-500/30 bg-blue-500/10',
  trait: 'border-emerald-500/30 bg-emerald-500/10',
  property: 'border-studio-border bg-studio-surface',
};

export function DebuggerPanel({ onClose }: DebuggerPanelProps) {
  const code = useSceneStore((s) => s.code) ?? '';
  const {
    frames,
    currentFrame,
    variables,
    status,
    error,
    start,
    step,
    cont,
    reset,
    toggleBreakpoint,
  } = useDebugger();
  const [varFilter, setVarFilter] = useState('');

  const filteredVars = varFilter
    ? variables.filter((v) => v.name.toLowerCase().includes(varFilter.toLowerCase()))
    : variables;

  const scopeGroups = {
    global: filteredVars.filter((v) => v.scope === 'global'),
    scene: filteredVars.filter((v) => v.scope === 'scene'),
    object: filteredVars.filter((v) => v.scope === 'object'),
  } as const;

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Bug className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Debugger</span>
        <div className="ml-auto flex items-center gap-1">
          {status === 'finished' && <CheckCircle className="h-3.5 w-3.5 text-green-400" />}
          {status === 'error' && <AlertCircle className="h-3.5 w-3.5 text-red-400" />}
          <button
            onClick={onClose}
            aria-label="Close debugger panel"
            title="Close debugger panel"
            className="rounded p-1 text-studio-muted hover:text-studio-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Control bar */}
        <div className="flex gap-1.5">
          <button
            onClick={() => start(code)}
            title="Start / Restart"
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-studio-accent py-1.5 text-[10px] font-semibold text-white hover:brightness-110"
          >
            <Play className="h-3 w-3" /> Start
          </button>
          <button
            onClick={() => step(code)}
            disabled={status !== 'paused'}
            title="Step"
            className="rounded-xl border border-studio-border px-3 py-1.5 text-studio-muted hover:text-studio-text disabled:opacity-40"
          >
            <StepForward className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => cont(code)}
            disabled={status !== 'paused'}
            title="Continue to next breakpoint"
            className="rounded-xl border border-studio-border px-3 py-1.5 text-studio-muted hover:text-studio-text disabled:opacity-40"
          >
            <FastForward className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => reset(code)}
            title="Reset"
            className="rounded-xl border border-studio-border px-3 py-1.5 text-studio-muted hover:text-red-400"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 text-[10px] text-red-400">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </div>
        )}

        {/* Execution frame waterfall */}
        {frames.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] text-studio-muted">Execution frames ({frames.length})</p>
            <div className="max-h-56 overflow-y-auto space-y-0.5 pr-1">
              {frames.map((f) => (
                <button
                  key={f.index}
                  onClick={() => toggleBreakpoint(f.line)}
                  className={`flex w-full items-start gap-2 rounded-lg border p-1.5 text-left transition ${
                    f.index === currentFrame ? 'ring-1 ring-studio-accent ' : ''
                  }${TYPE_BG[f.type] ?? 'border-studio-border bg-studio-surface'} ${f.isBreakpoint ? 'border-red-500/40' : ''}`}
                >
                  <span
                    className={`mt-0.5 text-[9px] font-mono ${FRAME_COLORS[f.type] ?? 'text-studio-muted'}`}
                  >
                    {f.isBreakpoint ? '🔴' : f.index === currentFrame ? '▶' : ' '} L{f.line}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-medium truncate block">{f.label}</span>
                    {f.detail && (
                      <span className="text-[9px] text-studio-muted truncate block">
                        {f.detail}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Variable watch */}
        {variables.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-studio-muted">Variables</p>
              <input
                value={varFilter}
                onChange={(e) => setVarFilter(e.target.value)}
                placeholder="Filter…"
                className="ml-auto w-24 rounded border border-studio-border bg-studio-surface px-1.5 py-0.5 text-[9px] outline-none focus:border-studio-accent"
              />
            </div>
            {Object.entries(scopeGroups).map(([scope, vars]) =>
              vars.length > 0 ? (
                <div key={scope}>
                  <p className="mb-1 text-[9px] text-studio-muted capitalize">{scope} scope</p>
                  <div className="rounded-xl border border-studio-border overflow-hidden">
                    {(vars as DebugVar[]).map((v, i) => (
                      <div
                        key={v.name}
                        className={`flex gap-2 px-2 py-1 text-[10px] ${i % 2 === 0 ? 'bg-studio-surface' : 'bg-studio-panel'}`}
                      >
                        <span className="text-studio-muted font-mono truncate flex-1">
                          {v.name}
                        </span>
                        <span className="shrink-0 text-[9px] text-violet-400">{v.type}</span>
                        <span className="shrink-0 font-mono text-studio-text max-w-[80px] truncate">
                          {v.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        )}

        {/* Status messages */}
        {status === 'idle' && frames.length === 0 && (
          <p className="py-4 text-center text-[10px] text-studio-muted">
            Press ▶ Start to begin debugging your scene.
            <br />
            Click any frame to toggle a breakpoint (🔴).
          </p>
        )}
        {status === 'finished' && (
          <div className="rounded-xl border border-green-500/20 bg-green-500/8 p-3 text-center text-[10px] text-green-400">
            ✅ Execution complete — {frames.length} frames processed
          </div>
        )}
      </div>
    </div>
  );
}
