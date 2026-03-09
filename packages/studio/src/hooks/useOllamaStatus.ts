'use client';

import { useEffect } from 'react';
import { useAIStore } from '@/lib/stores';
import { checkOllamaHealth } from '@/lib/api';

/**
 * Polls Ollama health status every 10 seconds and updates the AI store.
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
    const interval = setInterval(check, 10_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [setOllamaStatus]);
}
