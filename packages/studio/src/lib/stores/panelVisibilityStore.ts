'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  DEFAULT_OPEN_STUDIO_VIEW_IDS,
  STUDIO_VIEW_IDS,
  type StudioViewId,
} from '../studio/viewRegistry';

// ─── Panel Visibility Store ──────────────────────────────────────────────────
// Centralises boolean panel states into a single Zustand store. Each panel gets:
//   • a boolean field       — `chatOpen`, `profilerOpen`, etc.
//   • a setter              — `setChatOpen(v: boolean)`
//   • a toggler             — `toggleChatOpen()`
//
// Panels are opened via 3 pathways:
//   1. Preset openPanels — each StudioPreset lists its default open panels
//   2. getExtraPanels/filterByExperience — project specifics add extras
//   3. User interaction — toggles/buttons in the UI
//
// Panels that start open by default: chatOpen, minimapOpen
// Everything else defaults to false.
// ─────────────────────────────────────────────────────────────────────────────

/** All panel keys managed by this store. */
export type PanelKey = StudioViewId;

/** Maps a PanelKey to its boolean field name (e.g. 'chat' -> 'chatOpen'). */
type OpenField<K extends string> = `${K}Open`;

/** Maps a PanelKey to its setter name (e.g. 'chat' -> 'setChatOpen'). */
type SetField<K extends string> = `set${Capitalize<K>}Open`;

/** Maps a PanelKey to its toggler name (e.g. 'chat' -> 'toggleChatOpen'). */
type ToggleField<K extends string> = `toggle${Capitalize<K>}Open`;

// Build the full state + actions interface via mapped types.
type PanelOpenFields = { [K in PanelKey as OpenField<K>]: boolean };
type PanelSetFields = { [K in PanelKey as SetField<K>]: (v: boolean) => void };
type PanelToggleFields = { [K in PanelKey as ToggleField<K>]: () => void };

export interface PanelVisibilityState extends PanelOpenFields, PanelSetFields, PanelToggleFields {
  /** Close all panels (useful for "reset layout"). */
  closeAll: () => void;
  /** Open exactly one panel, closing all others (radio mode). */
  openExclusive: (key: PanelKey) => void;
  /** Batch toggle: close `toClose` panels and toggle `key`. */
  toggleExclusive: (key: PanelKey, toClose: PanelKey[]) => void;
}

// ─── Default Values ─────────────────────────────────────────────────────────

export const PANEL_KEYS: readonly PanelKey[] = STUDIO_VIEW_IDS;

/** Panels that default to *open*. */
const DEFAULTS_OPEN = new Set<PanelKey>(DEFAULT_OPEN_STUDIO_VIEW_IDS);

// ─── Helpers ────────────────────────────────────────────────────────────────

function capitalize<T extends string>(s: T): Capitalize<T> {
  return (s.charAt(0).toUpperCase() + s.slice(1)) as Capitalize<T>;
}

function openFieldName<K extends PanelKey>(key: K): OpenField<K> {
  return `${key}Open` as OpenField<K>;
}

// ─── Store Creation ─────────────────────────────────────────────────────────

export const usePanelVisibilityStore = create<PanelVisibilityState>()(
  devtools(
    (set) => {
      // Build initial open/closed defaults
      const initialOpen: Record<string, boolean> = {};
      for (const key of PANEL_KEYS) {
        initialOpen[openFieldName(key)] = DEFAULTS_OPEN.has(key);
      }

      // Build setters and togglers
      const setters: Record<string, (v: boolean) => void> = {};
      const togglers: Record<string, () => void> = {};

      for (const key of PANEL_KEYS) {
        const field = openFieldName(key);
        const setterName = `set${capitalize(key)}Open`;
        const togglerName = `toggle${capitalize(key)}Open`;

        setters[setterName] = (v: boolean) => set({ [field]: v } as Partial<PanelVisibilityState>);
        togglers[togglerName] = () =>
          set(
            (s) =>
              ({
                [field]: !(s as unknown as Record<string, boolean>)[field],
              }) as Partial<PanelVisibilityState>
          );
      }

      return {
        // Spread defaults
        ...initialOpen,
        // Spread setters + togglers
        ...setters,
        ...togglers,

        // ── Convenience actions ──

        closeAll: () => {
          const patch: Record<string, boolean> = {};
          for (const key of PANEL_KEYS) {
            patch[openFieldName(key)] = false;
          }
          set(patch as Partial<PanelVisibilityState>);
        },

        openExclusive: (key: PanelKey) => {
          const patch: Record<string, boolean> = {};
          for (const k of PANEL_KEYS) {
            patch[openFieldName(k)] = k === key;
          }
          set(patch as Partial<PanelVisibilityState>);
        },

        toggleExclusive: (key: PanelKey, toClose: PanelKey[]) => {
          set((s) => {
            const patch: Record<string, boolean> = {};
            for (const k of toClose) {
              patch[openFieldName(k)] = false;
            }
            const field = openFieldName(key);
            patch[field] = !(s as unknown as Record<string, boolean>)[field];
            return patch as Partial<PanelVisibilityState>;
          });
        },
      } as PanelVisibilityState;
    },
    { name: 'panel-visibility-store' }
  )
);
