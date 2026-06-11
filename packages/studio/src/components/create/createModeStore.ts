'use client';

/**
 * createModeStore — mode param + landing prompt state for /create.
 *
 * Consumed by:
 *   - /create page (writes mode + clears landing prompt from sessionStorage)
 *   - Part-panel agent (phase 2): reads `createMode === 'part'` to mount part tools rail
 *   - Any panel that wants to react to mode (e.g. SceneGeneratorPanel can filter suggestions)
 *
 * Query param contract:
 *   /create?mode=world|part|app|sim  — sets createMode (defaults to 'world')
 *   /create?intake=repo|scan     — accepted and ignored gracefully (no crash)
 *
 * Landing prompt contract:
 *   sessionStorage key `studio.landing.prompt` — read on mount, cleared, stored here.
 *   Phase-2 wires BrittneyChatPanel (or a future prop) to consume `landingPrompt`.
 */

import { create } from 'zustand';

export type CreateMode = 'world' | 'part' | 'app' | 'sim';

export interface CreateModeState {
  /** Active creation mode — set from ?mode= on mount. */
  createMode: CreateMode;
  setCreateMode: (mode: CreateMode) => void;

  /**
   * Prompt seeded from sessionStorage `studio.landing.prompt` on mount.
   * Cleared from sessionStorage immediately after read.
   * Phase-2 wires this into BrittneyChatPanel input / auto-send.
   */
  landingPrompt: string;
  setLandingPrompt: (prompt: string) => void;
  clearLandingPrompt: () => void;
}

export const useCreateModeStore = create<CreateModeState>()((set) => ({
  createMode: 'world',
  setCreateMode: (mode) => set({ createMode: mode }),

  landingPrompt: '',
  setLandingPrompt: (prompt) => set({ landingPrompt: prompt }),
  clearLandingPrompt: () => set({ landingPrompt: '' }),
}));
