'use client';

/**
 * useSceneCritique — calls /api/critique with current scene code.
 * Returns status + suggestions list.
 */

import { useState, useCallback } from 'react';
import { useSceneStore } from '@/lib/store';

export type CritiqueStatus = 'idle' | 'analyzing' | 'done' | 'error';

export interface CritiqueResult {
  suggestions: string[];
  error?: string;
}

export function useSceneCritique() {
  const code = useSceneStore((s) => s.code);
  const [status, setStatus] = useState<CritiqueStatus>('idle');
  const [result, setResult] = useState<CritiqueResult | null>(null);

  const analyze = useCallback(async () => {
    if (!code?.trim()) {
      setResult({ suggestions: [], error: 'Scene is empty — add some HoloScript code first.' });
      setStatus('error');
      return;
    }

    setStatus('analyzing');
    setResult(null);

    try {
      const res = await fetch('/api/critique', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as { suggestions?: string[]; error?: string };

      if (!res.ok || data.error) {
        setResult({ suggestions: [], error: data.error ?? 'Analysis failed' });
        setStatus('error');
        return;
      }

      setResult({ suggestions: data.suggestions ?? [] });
      setStatus('done');
    } catch (err) {
      setResult({ suggestions: [], error: String(err) });
      setStatus('error');
    }
  }, [code]);

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
  }, []);

  return { status, result, analyze, reset };
}
