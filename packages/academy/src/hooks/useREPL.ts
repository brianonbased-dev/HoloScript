'use client';

/**
 * useREPL — manages REPL state for the HoloScript execution trace panel.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export interface TraceEntry {
  step: number;
  type: 'scene' | 'object' | 'trait' | 'error' | 'info';
  name?: string;
  trait?: string;
  props?: Record<string, string>;
  message: string;
  timeMs: number;
}

export type REPLStatus = 'idle' | 'running' | 'error';

export function useREPL(options?: { autoRunMs?: number }) {
  const [code, setCode] = useState('');
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const [status, setStatus] = useState<REPLStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const run = useCallback(async (src: string) => {
    setStatus('running');
    setError(null);
    try {
      const res = await fetch('/api/repl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: src }),
      });
      const data = (await res.json()) as { trace?: TraceEntry[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'REPL error');
      setTrace(data.trace ?? []);
      setStatus('idle');
    } catch (e) {
      setError(String(e));
      setStatus('error');
    }
  }, []);

  // Auto-run debounced when autoRunMs is set
  useEffect(() => {
    if (!options?.autoRunMs) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => run(code), options.autoRunMs);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [code, options?.autoRunMs, run]);

  return { code, setCode, trace, status, error, run };
}
