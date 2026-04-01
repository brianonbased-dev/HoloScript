'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { AIStatus, OllamaStatus, PromptEntry } from '@/types';

// ─── AI Store ───────────────────────────────────────────────────────────────

interface AIState {
  status: AIStatus;
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
      model: 'brittney-qwen-v23:latest',
      promptHistory: [],
      setStatus: (status) => set({ status }),
      setOllamaStatus: (ollamaStatus) => set({ ollamaStatus }),
      setModel: (model) => set({ model }),
      addPrompt: (entry) => set((s) => ({ promptHistory: [...s.promptHistory, entry].slice(-100) })),
      clearHistory: () => set({ promptHistory: [] }),
    }),
    { name: 'ai-store' }
  )
);
