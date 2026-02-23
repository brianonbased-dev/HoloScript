'use client';

/**
 * useDebugger — step-through HoloScript debugger hook.
 * Calls POST /api/debug with action = start|step|continue|reset.
 */

import { useState, useCallback } from 'react';

export interface DebugFrame {
  index: number;
  line: number;
  type: 'scene' | 'object' | 'trait' | 'comment' | 'property';
  label: string;
  detail?: string;
  isBreakpoint: boolean;
}

export interface DebugVar {
  name: string;
  type: string;
  value: string;
  scope: 'global' | 'scene' | 'object';
}

export type DebugAction = 'start' | 'step' | 'continue' | 'reset';
export type DebugStatus = 'idle' | 'running' | 'paused' | 'finished' | 'error';

export function useDebugger() {
  const [frames, setFrames] = useState<DebugFrame[]>([]);
  const [currentFrame, setCurrentFrame] = useState(-1);
  const [variables, setVariables] = useState<DebugVar[]>([]);
  const [breakpoints, setBreakpoints] = useState<number[]>([]);
  const [status, setStatus] = useState<DebugStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(async (code: string, action: DebugAction, frame?: number) => {
    setError(null);
    try {
      const res = await fetch('/api/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, breakpoints, action, currentFrame: frame ?? currentFrame }),
      });
      const data = await res.json() as { frames: DebugFrame[]; currentFrame: number; variables: DebugVar[]; finished: boolean };
      setFrames(data.frames);
      setCurrentFrame(data.currentFrame);
      setVariables(data.variables);
      setStatus(data.finished ? 'finished' : action === 'reset' ? 'idle' : 'paused');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [breakpoints, currentFrame]);

  const start  = useCallback((code: string) => call(code, 'start', -1),   [call]);
  const step   = useCallback((code: string) => call(code, 'step'),         [call]);
  const cont   = useCallback((code: string) => call(code, 'continue'),     [call]);
  const reset  = useCallback((code: string) => call(code, 'reset', -1),   [call]);

  const toggleBreakpoint = useCallback((line: number) => {
    setBreakpoints((prev) =>
      prev.includes(line) ? prev.filter((l) => l !== line) : [...prev, line]
    );
  }, []);

  return { frames, currentFrame, variables, breakpoints, status, error, start, step, cont, reset, toggleBreakpoint };
}
