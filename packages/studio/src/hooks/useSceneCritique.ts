'use client';

/**
 * useSceneCritique — fetches and manages AI scene critique results.
 */

import { useState, useCallback } from 'react';
import { useSceneStore } from '@/lib/store';
import type { CritiqueResult } from '@/app/api/critique/route';

export function useSceneCritique() {
  const code = useSceneStore((s) => s.code) ?? '';
  const [result, setResult] = useState<CritiqueResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAnalysedLen, setLastAnalysedLen] = useState(0);

  const analyse = useCallback(async () => {
    if (!code.trim()) { setError('No code to analyse.'); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/critique', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: CritiqueResult = await res.json();
      setResult(data);
      setLastAnalysedLen(code.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [code]);

  const isStale = result !== null && code.length !== lastAnalysedLen;

  return { result, loading, error, analyse, isStale };
}
