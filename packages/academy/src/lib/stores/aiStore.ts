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

  /** BYOK (Bring Your Own Key) — user-provided API keys, stored client-side only. */
  openrouterKey: string;
  anthropicKey: string;
  openaiKey: string;

  setStatus: (status: AIStatus) => void;
  setOllamaStatus: (status: OllamaStatus) => void;
  setModel: (model: string) => void;
  addPrompt: (entry: PromptEntry) => void;
  clearHistory: () => void;

  /** Set a BYOK key. Provider: 'openrouter' | 'anthropic' | 'openai'. */
  setByokKey: (provider: 'openrouter' | 'anthropic' | 'openai', key: string) => void;
  /** Clear all BYOK keys. */
  clearByokKeys: () => void;
  /** Get headers object to attach to AI API requests. */
  getByokHeaders: () => Record<string, string>;
}

export const useAIStore = create<AIState>()(
  devtools(
    (set, get) => ({
      status: 'idle',
      ollamaStatus: 'checking',
      model: 'auto',
      promptHistory: [],
      openrouterKey: '',
      anthropicKey: '',
      openaiKey: '',
      setStatus: (status) => set({ status }),
      setOllamaStatus: (ollamaStatus) => set({ ollamaStatus }),
      setModel: (model) => set({ model }),
      addPrompt: (entry) => set((s) => ({ promptHistory: [...s.promptHistory, entry] })),
      clearHistory: () => set({ promptHistory: [] }),
      setByokKey: (provider, key) => {
        if (provider === 'openrouter') set({ openrouterKey: key });
        else if (provider === 'anthropic') set({ anthropicKey: key });
        else if (provider === 'openai') set({ openaiKey: key });
      },
      clearByokKeys: () => set({ openrouterKey: '', anthropicKey: '', openaiKey: '' }),
      getByokHeaders: () => {
        const state = get();
        const headers: Record<string, string> = {};
        if (state.openrouterKey) headers['x-openrouter-key'] = state.openrouterKey;
        if (state.anthropicKey) headers['x-anthropic-key'] = state.anthropicKey;
        if (state.openaiKey) headers['x-openai-key'] = state.openaiKey;
        return headers;
      },
    }),
    { name: 'ai-store' }
  )
);
