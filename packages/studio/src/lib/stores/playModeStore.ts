'use client';

/**
 * usePlayMode — Zustand store for Play Mode runtime state
 *
 * State machine: EDITING → PLAYING → PAUSED → EDITING
 *
 * When entering PLAY mode:
 *  1. Snapshot the current scene state (for stop/revert)
 *  2. Start the game loop (requestAnimationFrame)
 *  3. Enable game input (WASD, mouse look, interactions)
 *  4. Initialize the GameState (score, lives, etc.)
 *
 * When STOPPING:
 *  1. Stop the game loop
 *  2. Restore the scene snapshot
 *  3. Re-enable editor controls
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlayState = 'editing' | 'playing' | 'paused';

export interface GameState {
  score: number;
  lives: number;
  level: number;
  timer: number;
  inventory: Record<string, number>;
  variables: Record<string, unknown>;
}

export interface PlayModeState {
  // State machine
  playState: PlayState;
  elapsed: number;
  fps: number;
  frameCount: number;

  // Game state
  gameState: GameState;

  // Snapshot for revert-on-stop
  sceneSnapshot: string | null;

  // Config
  showHUD: boolean;
  showFPS: boolean;
  botCount: number;

  // Actions
  play: (sceneCode: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => string | null; // returns snapshot to restore
  reset: () => void;
  tick: (dt: number) => void;

  // Game state mutations
  addScore: (points: number) => void;
  setScore: (score: number) => void;
  loseLife: () => void;
  setLives: (lives: number) => void;
  nextLevel: () => void;
  setLevel: (level: number) => void;
  addItem: (item: string, count?: number) => void;
  removeItem: (item: string, count?: number) => void;
  setVariable: (key: string, value: unknown) => void;
  getVariable: (key: string) => unknown;

  // Config
  setShowHUD: (v: boolean) => void;
  setShowFPS: (v: boolean) => void;
  setBotCount: (n: number) => void;
}

const INITIAL_GAME_STATE: GameState = {
  score: 0,
  lives: 3,
  level: 1,
  timer: 0,
  inventory: {},
  variables: {},
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePlayMode = create<PlayModeState>()(
  devtools(
    (set, get) => ({
      // State
      playState: 'editing',
      elapsed: 0,
      fps: 0,
      frameCount: 0,
      gameState: { ...INITIAL_GAME_STATE },
      sceneSnapshot: null,
      showHUD: true,
      showFPS: true,
      botCount: 0,

      // ── Actions ──

      play: (sceneCode: string) => {
        set({
          playState: 'playing',
          elapsed: 0,
          fps: 0,
          frameCount: 0,
          gameState: { ...INITIAL_GAME_STATE },
          sceneSnapshot: sceneCode,
        });
      },

      pause: () => {
        if (get().playState === 'playing') {
          set({ playState: 'paused' });
        }
      },

      resume: () => {
        if (get().playState === 'paused') {
          set({ playState: 'playing' });
        }
      },

      stop: () => {
        const snapshot = get().sceneSnapshot;
        set({
          playState: 'editing',
          elapsed: 0,
          fps: 0,
          frameCount: 0,
          gameState: { ...INITIAL_GAME_STATE },
          sceneSnapshot: null,
        });
        return snapshot;
      },

      reset: () => {
        set({
          gameState: { ...INITIAL_GAME_STATE },
          elapsed: 0,
          frameCount: 0,
        });
      },

      tick: (dt: number) => {
        const state = get();
        if (state.playState !== 'playing') return;
        const newElapsed = state.elapsed + dt;
        const newFrameCount = state.frameCount + 1;
        set({
          elapsed: newElapsed,
          frameCount: newFrameCount,
          fps: Math.round(1 / dt),
          gameState: {
            ...state.gameState,
            timer: Math.floor(newElapsed),
          },
        });
      },

      // ── Game State Mutations ──

      addScore: (points) =>
        set((s) => ({
          gameState: { ...s.gameState, score: s.gameState.score + points },
        })),

      setScore: (score) =>
        set((s) => ({
          gameState: { ...s.gameState, score },
        })),

      loseLife: () =>
        set((s) => ({
          gameState: { ...s.gameState, lives: Math.max(0, s.gameState.lives - 1) },
        })),

      setLives: (lives) =>
        set((s) => ({
          gameState: { ...s.gameState, lives },
        })),

      nextLevel: () =>
        set((s) => ({
          gameState: { ...s.gameState, level: s.gameState.level + 1 },
        })),

      setLevel: (level) =>
        set((s) => ({
          gameState: { ...s.gameState, level },
        })),

      addItem: (item, count = 1) =>
        set((s) => {
          const isNewItem = !(item in s.gameState.inventory);
          if (isNewItem && Object.keys(s.gameState.inventory).length >= 100) {
            return s; // Inventory full, don't allow Unbounded State Growth
          }
          const newCount = Math.min(999, (s.gameState.inventory[item] ?? 0) + count);
          return {
            gameState: {
              ...s.gameState,
              inventory: { ...s.gameState.inventory, [item]: newCount },
            },
          };
        }),

      removeItem: (item, count = 1) =>
        set((s) => {
          const current = s.gameState.inventory[item] ?? 0;
          const newCount = Math.max(0, current - count);
          const inventory = { ...s.gameState.inventory };
          if (newCount === 0) delete inventory[item];
          else inventory[item] = newCount;
          return { gameState: { ...s.gameState, inventory } };
        }),

      setVariable: (key, value) =>
        set((s) => ({
          gameState: {
            ...s.gameState,
            variables: { ...s.gameState.variables, [key]: value },
          },
        })),

      getVariable: (key) => get().gameState.variables[key],

      // ── Config ──
      setShowHUD: (showHUD) => set({ showHUD }),
      setShowFPS: (showFPS) => set({ showFPS }),
      setBotCount: (botCount) => set({ botCount }),
    }),
    { name: 'play-mode' }
  )
);
