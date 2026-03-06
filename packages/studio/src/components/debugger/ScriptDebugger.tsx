'use client';

/**
 * ScriptDebugger — Breakpoints, variable watch, call stack, step controls.
 */

import { useState, useCallback } from 'react';
import { Bug, Play, StepForward, StepInto, StepOut, Square, Plus, Trash2, Eye, XCircle } from 'lucide-react';

export interface Breakpoint { id: number; file: string; line: number; enabled: boolean; condition?: string; hitCount: number; }
export interface WatchVariable { id: number; name: string; value: string; type: string; }
export interface CallFrame { id: number; name: string; file: string; line: number; }
export type DebugState = 'idle' | 'running' | 'paused' | 'stepping';

let bpId = 0, wId = 0;

export function ScriptDebugger() {
  const [state, setState] = useState<DebugState>('idle');
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>([]);
  const [watches, setWatches] = useState<WatchVariable[]>([]);
  const [callStack, setCallStack] = useState<CallFrame[]>([]);
  const [watchInput, setWatchInput] = useState('');
  const [bpInput, setBpInput] = useState('');

  const addBreakpoint = useCallback((file: string, line: number, condition?: string) => {
    setBreakpoints(prev => [...prev, { id: bpId++, file, line, enabled: true, condition, hitCount: 0 }]);
  }, []);

  const toggleBp = useCallback((id: number) => {
    setBreakpoints(prev => prev.map(bp => bp.id === id ? { ...bp, enabled: !bp.enabled } : bp));
  }, []);

  const removeBp = useCallback((id: number) => {
    setBreakpoints(prev => prev.filter(bp => bp.id !== id));
  }, []);

  const addWatch = useCallback((name: string) => {
    if (!name.trim()) return;
    setWatches(prev => [...prev, { id: wId++, name, value: 'undefined', type: 'undefined' }]);
    setWatchInput('');
  }, []);

  const removeWatch = useCallback((id: number) => {
    setWatches(prev => prev.filter(w => w.id !== id));
  }, []);

  const stateColors: Record<DebugState, string> = { idle: 'text-studio-muted', running: 'text-emerald-400', paused: 'text-amber-400', stepping: 'text-blue-400' };

  return (
    <div className="flex flex-col overflow-auto">
      {/* Header + Controls */}
      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
        <Bug className="h-4 w-4 text-red-400" />
        <span className="text-sm font-semibold text-studio-text">Debugger</span>
        <span className={`ml-1 text-[10px] ${stateColors[state]}`}>● {state}</span>
        <div className="flex-1" />
        <div className="flex gap-1">
          {state === 'idle' ? (
            <button onClick={() => setState('running')} className="rounded bg-emerald-500/20 p-1 text-emerald-400 hover:bg-emerald-500/30"><Play className="h-3.5 w-3.5 fill-current" /></button>
          ) : (
            <>
              <button onClick={() => setState('paused')} className="rounded bg-amber-500/20 p-1 text-amber-400" title="Pause"><Square className="h-3 w-3 fill-current" /></button>
              <button onClick={() => setState('stepping')} className="rounded bg-blue-500/20 p-1 text-blue-400" title="Step Over"><StepForward className="h-3.5 w-3.5" /></button>
              <button onClick={() => setState('stepping')} className="rounded bg-blue-500/20 p-1 text-blue-400" title="Step Into"><StepInto className="h-3.5 w-3.5" /></button>
              <button onClick={() => setState('stepping')} className="rounded bg-blue-500/20 p-1 text-blue-400" title="Step Out"><StepOut className="h-3.5 w-3.5" /></button>
              <button onClick={() => { setState('idle'); setCallStack([]); }} className="rounded bg-red-500/20 p-1 text-red-400" title="Stop"><XCircle className="h-3.5 w-3.5" /></button>
            </>
          )}
        </div>
      </div>

      {/* Breakpoints */}
      <div className="border-b border-studio-border">
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted">Breakpoints ({breakpoints.length})</span>
        </div>
        {breakpoints.map(bp => (
          <div key={bp.id} className="flex items-center gap-2 px-3 py-1 text-[11px]">
            <button onClick={() => toggleBp(bp.id)} className={`h-2.5 w-2.5 rounded-full ${bp.enabled ? 'bg-red-500' : 'bg-studio-muted/30'}`} />
            <span className="flex-1 font-mono text-studio-text">{bp.file}:{bp.line}</span>
            {bp.condition && <span className="text-[9px] text-amber-400">if: {bp.condition}</span>}
            <span className="text-[9px] text-studio-muted/40">×{bp.hitCount}</span>
            <button onClick={() => removeBp(bp.id)} className="text-studio-muted/40 hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
          </div>
        ))}
        <div className="flex items-center gap-1 px-3 py-1">
          <input type="text" value={bpInput} onChange={e => setBpInput(e.target.value)} placeholder="file:line" onKeyDown={e => {
            if (e.key === 'Enter' && bpInput.includes(':')) { const [f,l] = bpInput.split(':'); addBreakpoint(f, parseInt(l)); setBpInput(''); }
          }} className="flex-1 bg-transparent text-[10px] text-studio-text outline-none font-mono" />
          <button onClick={() => { if (bpInput.includes(':')) { const [f,l] = bpInput.split(':'); addBreakpoint(f, parseInt(l)); setBpInput(''); }}} className="text-studio-muted hover:text-studio-text"><Plus className="h-3 w-3" /></button>
        </div>
      </div>

      {/* Watch */}
      <div className="border-b border-studio-border">
        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-studio-muted">Watch ({watches.length})</div>
        {watches.map(w => (
          <div key={w.id} className="flex items-center gap-2 px-3 py-1 text-[11px]">
            <Eye className="h-3 w-3 text-studio-muted/40" />
            <span className="font-mono text-studio-text">{w.name}</span>
            <span className="text-studio-muted">=</span>
            <span className="flex-1 font-mono text-emerald-400">{w.value}</span>
            <span className="text-[9px] text-studio-muted/40">{w.type}</span>
            <button onClick={() => removeWatch(w.id)} className="text-studio-muted/40 hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
          </div>
        ))}
        <div className="flex items-center gap-1 px-3 py-1">
          <input type="text" value={watchInput} onChange={e => setWatchInput(e.target.value)} placeholder="Add watch..." onKeyDown={e => e.key==='Enter' && addWatch(watchInput)}
            className="flex-1 bg-transparent text-[10px] text-studio-text outline-none font-mono" />
          <button onClick={() => addWatch(watchInput)} className="text-studio-muted hover:text-studio-text"><Plus className="h-3 w-3" /></button>
        </div>
      </div>

      {/* Call Stack */}
      <div>
        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-studio-muted">Call Stack</div>
        {callStack.length === 0 && <div className="px-3 py-2 text-[11px] text-studio-muted/50">Not paused</div>}
        {callStack.map((frame, i) => (
          <div key={frame.id} className={`flex items-center gap-2 px-3 py-1 text-[11px] cursor-pointer ${i === 0 ? 'bg-amber-500/10 text-amber-400' : 'text-studio-muted hover:bg-studio-panel/50'}`}>
            <span className="font-semibold">{frame.name}</span>
            <span className="flex-1" />
            <span className="font-mono text-[9px] text-studio-muted/50">{frame.file}:{frame.line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
