'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { AIStatus, OllamaStatus, PromptEntry } from '@/types';

// ─── AI Store ───────────────────────────────────────────────────────────────
// Cloud-first: ollamaStatus now tracks any AI provider availability,
// not just Ollama. Name kept for backward compatibility with components.

interface AIState {
  status: AIStatus;
  /** @deprecated Renamed conceptually to "AI provider status". Checks cloud API keys, not Ollama. */
  ollamaStatus: OllamaStatus;
  model: string;
  promptHistory: PromptEntry[];
  setStatus: (status: AIStatus) => void;
  setOllamaStatus: (status: OllamaStatus) => void;
  setModel: (model: string) => void;
  addPrompt: (entry: PromptEntry) => void;
  clearHistory: () => void;
}

export const useAIStore = create<AIState>()(
  devtools(
    (set) => ({
      status: 'idle',
      ollamaStatus: 'checking',
      model: 'auto',
      promptHistory: [],
      setStatus: (status) => set({ status }),
      setOllamaStatus: (ollamaStatus) => set({ ollamaStatus }),
      setModel: (model) => set({ model }),
      addPrompt: (entry) => set((s) => ({ promptHistory: [...s.promptHistory, entry] })),
      clearHistory: () => set({ promptHistory: [] }),
    }),
    { name: 'ai-store' }
  )
);
