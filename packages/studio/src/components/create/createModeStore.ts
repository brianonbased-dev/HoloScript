'use client';

/**
 * createModeStore — mode param + landing prompt state for /create.
 *
 * Consumed by:
 *   - /create page (writes mode + clears landing prompt from sessionStorage)
 *   - Part-panel agent (phase 2): reads `createMode === 'part'` to mount part tools rail
 *   - Any panel that wants to react to mode (e.g. SceneGeneratorPanel can filter suggestions)
 *   - BrittneyChatPanel: takes the landing prompt and sends it as the person's
 *     first message (the home page's idea box goes straight to Brittney)
 *
 * Query param contract:
 *   /create?mode=world|part|app|sim|game|avatar  — sets createMode (defaults to 'world')
 *   /create?intake=repo|scan     — accepted and ignored gracefully (no crash)
 *
 * Landing prompt contract:
 *   sessionStorage key `studio.landing.prompt` — read on mount, cleared, stored here.
 *   Brittney's panel consumes it with takeLandingPrompt(), exactly once.
 */

import { create } from 'zustand';

export type CreateMode = 'world' | 'part' | 'app' | 'sim' | 'game' | 'avatar';

export interface CreateModeState {
  /** Active creation mode — set from ?mode= on mount. */
  createMode: CreateMode;
  setCreateMode: (mode: CreateMode) => void;

  /**
   * The idea the person typed into the home page's idea box, seeded from
   * sessionStorage `studio.landing.prompt` on mount (and cleared there).
   */
  landingPrompt: string;
  setLandingPrompt: (prompt: string) => void;
  clearLandingPrompt: () => void;
  /**
   * Hand the idea to whoever will act on it, once: returns it and clears it in
   * the same step, so a remount or a second panel cannot send it again.
   */
  takeLandingPrompt: () => string;
}

export const useCreateModeStore = create<CreateModeState>()((set, get) => ({
  createMode: 'world',
  setCreateMode: (mode) => set({ createMode: mode }),

  landingPrompt: '',
  setLandingPrompt: (prompt) => set({ landingPrompt: prompt }),
  clearLandingPrompt: () => set({ landingPrompt: '' }),
  takeLandingPrompt: () => {
    const prompt = get().landingPrompt;
    if (prompt) set({ landingPrompt: '' });
    return prompt;
  },
}));
