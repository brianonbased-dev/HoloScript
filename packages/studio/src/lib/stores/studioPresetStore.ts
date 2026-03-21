'use client';

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { usePanelVisibilityStore } from './panelVisibilityStore';
import { useEditorStore } from './editorStore';
import type { PanelKey } from './panelVisibilityStore';
import type { PanelTab } from '../../types/panels';
import {
  STUDIO_PRESETS,
  getExtraPanels,
  filterByExperience,
} from '../presets/studioPresets';
import type { ExperienceLevel, ProjectSpecifics } from '../presets/studioPresets';
import { StudioEvents } from '../analytics';

// ─── Store Interface ──────────────────────────────────────────────────────────

interface StudioPresetState {
  activePresetId: string | null;
  experienceLevel: ExperienceLevel;
  projectSpecifics: ProjectSpecifics | null;
  wizardCompleted: boolean;
  customPanelOverrides: PanelKey[];

  applyPreset: (
    presetId: string,
    specifics: ProjectSpecifics,
    level: ExperienceLevel,
  ) => void;
  setExperienceLevel: (level: ExperienceLevel) => void;
  setProjectSpecifics: (specifics: ProjectSpecifics) => void;
  setWizardCompleted: (v: boolean) => void;
  addCustomPanel: (key: PanelKey) => void;
  removeCustomPanel: (key: PanelKey) => void;
  reset: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Open a specific panel by key via the panelVisibility store. */
function openPanel(key: PanelKey) {
  const setter = `set${capitalize(key)}Open` as keyof typeof usePanelVisibilityStore;
  const store = usePanelVisibilityStore.getState();
  const fn = (store as Record<string, unknown>)[`set${capitalize(key)}Open`];
  if (typeof fn === 'function') {
    (fn as (v: boolean) => void)(true);
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useStudioPresetStore = create<StudioPresetState>()(
  devtools(
    persist(
      (set, get) => ({
        activePresetId: null,
        experienceLevel: 'intermediate',
        projectSpecifics: null,
        wizardCompleted: false,
        customPanelOverrides: [],

        applyPreset: (presetId, specifics, level) => {
          const preset = STUDIO_PRESETS.find((p) => p.id === presetId);
          if (!preset) return;

          // 1. Compute final panel list
          const extraPanels = getExtraPanels(specifics);
          const finalPanels = filterByExperience(preset.openPanels, extraPanels, level);

          // 2. Close all panels
          usePanelVisibilityStore.getState().closeAll();

          // 3. Open each computed panel
          for (const key of finalPanels) {
            openPanel(key);
          }

          // 4. Set studio mode
          useEditorStore.getState().setStudioMode(preset.studioMode);

          // 5. Save domain profile to localStorage
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('holoscript-domain-profile', preset.domainProfile);
          }

          // 6. Save sidebar tabs to localStorage
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(
              'holoscript-studio-favorites',
              JSON.stringify(preset.sidebarTabs),
            );
          }

          // 7. Track analytics
          const prevPresetId = get().activePresetId;
          if (prevPresetId && prevPresetId !== presetId) {
            StudioEvents.presetSwitched(prevPresetId, presetId);
          }

          // 8. Persist in store
          set({
            activePresetId: presetId,
            projectSpecifics: specifics,
            experienceLevel: level,
            wizardCompleted: true,
            customPanelOverrides: [],
          });
        },

        setExperienceLevel: (experienceLevel) => set({ experienceLevel }),

        setProjectSpecifics: (projectSpecifics) => set({ projectSpecifics }),

        setWizardCompleted: (wizardCompleted) => set({ wizardCompleted }),

        addCustomPanel: (key) =>
          set((s) => ({
            customPanelOverrides: s.customPanelOverrides.includes(key)
              ? s.customPanelOverrides
              : [...s.customPanelOverrides, key],
          })),

        removeCustomPanel: (key) =>
          set((s) => ({
            customPanelOverrides: s.customPanelOverrides.filter((k) => k !== key),
          })),

        reset: () =>
          set({
            activePresetId: null,
            experienceLevel: 'intermediate',
            projectSpecifics: null,
            wizardCompleted: false,
            customPanelOverrides: [],
          }),
      }),
      {
        name: 'studio-preset-store',
        partialize: (state) => ({
          activePresetId: state.activePresetId,
          experienceLevel: state.experienceLevel,
          projectSpecifics: state.projectSpecifics,
          wizardCompleted: state.wizardCompleted,
          customPanelOverrides: state.customPanelOverrides,
        }),
      },
    ),
    { name: 'studio-preset-store' },
  ),
);
