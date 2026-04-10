'use client';

import { useEffect } from 'react';
import { useAIStore } from '@/lib/stores';
import { checkOllamaHealth } from '@/lib/api';

/**
 * Polls AI provider health status every 30 seconds and updates the AI store.
 * Cloud-first: checks for any configured provider (OpenRouter, Anthropic, OpenAI, Ollama).
 * Name kept as useOllamaStatus for backward compatibility.
 */
export function useOllamaStatus() {
  const setOllamaStatus = useAIStore((s) => s.setOllamaStatus);

  useEffect(() => {
    let mounted = true;

    async function check() {
      const ok = await checkOllamaHealth();
      if (mounted) {
        setOllamaStatus(ok ? 'connected' : 'disconnected');
      }
    }

    check();
    // Cloud providers are stable — no need to poll every 10s
    const interval = setInterval(check, 30_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [setOllamaStatus]);
}
