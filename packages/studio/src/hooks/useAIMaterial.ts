'use client';

/**
 * useAIMaterial — generates a GLSL fragment shader + HoloScript @material trait
 * from a natural-language prompt via Ollama.
 *
 * Usage:
 *   const { generate, glsl, traits, status, error, reset } = useAIMaterial();
 *   await generate({ prompt: 'lava-like surface', baseColor: '#cc2200' });
 */

import { useState, useCallback } from 'react';

export type AIMaterialStatus = 'idle' | 'generating' | 'done' | 'error';

export interface AIMaterialResult {
  glsl: string;
  traits: string;
}

export interface UseAIMaterialReturn {
  generate: (opts: { prompt: string; baseColor?: string }) => Promise<void>;
  glsl: string;
  traits: string;
  status: AIMaterialStatus;
  error: string | null;
  reset: () => void;
}

export function useAIMaterial(): UseAIMaterialReturn {
  const [glsl, setGlsl] = useState('');
  const [traits, setTraits] = useState('');
  const [status, setStatus] = useState<AIMaterialStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async ({ prompt, baseColor = '#ffffff' }: { prompt: string; baseColor?: string }) => {
      setStatus('generating');
      setError(null);
      setGlsl('');
      setTraits('');

      try {
        const res = await fetch('/api/material/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, baseColor }),
        });

        const data = (await res.json()) as {
          glsl?: string;
          traits?: string;
          error?: string;
        };

        if (!res.ok || data.error) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        setGlsl(data.glsl ?? '');
        setTraits(data.traits ?? '');
        setStatus('done');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
        setStatus('error');
      }
    },
    []
  );

  const reset = useCallback(() => {
    setGlsl('');
    setTraits('');
    setStatus('idle');
    setError(null);
  }, []);

  return { generate, glsl, traits, status, error, reset };
}
