'use client';

/**
 * useSceneGenerator — calls POST /api/generate to turn natural language into HoloScript.
 */

import { useState, useCallback } from 'react';

export type GeneratorStatus = 'idle' | 'generating' | 'done' | 'error';

export function useSceneGenerator() {
  const [status, setStatus] = useState<GeneratorStatus>('idle');
  const [generatedCode, setGeneratedCode] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (prompt: string, existingCode?: string) => {
    if (!prompt.trim()) return;
    setStatus('generating');
    setError(null);
    setWarning(null);
    setGeneratedCode('');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, existingCode }),
      });
      const data = (await res.json()) as {
        code?: string;
        success?: boolean;
        error?: string;
        warning?: string;
        source?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setGeneratedCode(data.code ?? '');
      if (data.warning || data.source === 'mock') {
        setWarning(data.warning ?? 'Using template fallback (cloud AI unavailable)');
      }
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setGeneratedCode('');
    setError(null);
    setWarning(null);
  }, []);

  return { status, generatedCode, warning, error, generate, reset };
}
