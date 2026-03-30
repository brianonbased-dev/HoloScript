'use client';

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { usePanelVisibilityStore } from './panelVisibilityStore';
import { useEditorStore } from './editorStore';
import type { PanelKey } from './panelVisibilityStore';
import type { PanelTab } from '../../types/panels';
import { STUDIO_PRESETS, getExtraPanels, filterByExperience } from '../presets/studioPresets';
import type { ExperienceLevel, ProjectSpecifics } from '../presets/studioPresets';
import { StudioEvents } from '../analytics';

// ─── Export Format ────────────────────────────────────────────────────────────

export interface PresetExportData {
  version: 1;
  presetId: string;
  experienceLevel: ExperienceLevel;
  projectSpecifics: ProjectSpecifics;
  customPanelOverrides: PanelKey[];
  exportedAt: string;
}

// ─── Store Interface ──────────────────────────────────────────────────────────

interface StudioPresetState {
  activePresetId: string | null;
  experienceLevel: ExperienceLevel;
  projectSpecifics: ProjectSpecifics | null;
  wizardCompleted: boolean;
  customPanelOverrides: PanelKey[];

  applyPreset: (presetId: string, specifics: ProjectSpecifics, level: ExperienceLevel) => void;
  setExperienceLevel: (level: ExperienceLevel) => void;
  setProjectSpecifics: (specifics: ProjectSpecifics) => void;
  setWizardCompleted: (v: boolean) => void;
  addCustomPanel: (key: PanelKey) => void;
  removeCustomPanel: (key: PanelKey) => void;
  reset: () => void;
  exportPreset: () => PresetExportData | null;
  importPreset: (json: string) => { success: boolean; error?: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Open a specific panel by key via the panelVisibility store. */
function openPanel(key: PanelKey) {
  const setter = `set${capitalize(key)}Open` as keyof typeof usePanelVisibilityStore;
  const store = usePanelVisibilityStore.getState();
  const fn = (store as unknown as Record<string, unknown>)[`set${capitalize(key)}Open`];
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
              JSON.stringify(preset.sidebarTabs)
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

        exportPreset: () => {
          const { activePresetId, experienceLevel, projectSpecifics, customPanelOverrides } = get();
          if (!activePresetId || !projectSpecifics) return null;
          return {
            version: 1 as const,
            presetId: activePresetId,
            experienceLevel,
            projectSpecifics,
            customPanelOverrides,
            exportedAt: new Date().toISOString(),
          };
        },

        importPreset: (json: string) => {
          try {
            const data = JSON.parse(json);
            if (data.version !== 1) return { success: false, error: 'Unsupported version' };
            if (!data.presetId || typeof data.presetId !== 'string') {
              return { success: false, error: 'Missing presetId' };
            }
            if (!STUDIO_PRESETS.find((p) => p.id === data.presetId)) {
              return { success: false, error: `Unknown preset: ${data.presetId}` };
            }
            const validLevels = ['beginner', 'intermediate', 'advanced'];
            if (!validLevels.includes(data.experienceLevel)) {
              return { success: false, error: 'Invalid experience level' };
            }
            if (!data.projectSpecifics || typeof data.projectSpecifics !== 'object') {
              return { success: false, error: 'Missing projectSpecifics' };
            }
            get().applyPreset(data.presetId, data.projectSpecifics, data.experienceLevel);
            if (Array.isArray(data.customPanelOverrides)) {
              for (const key of data.customPanelOverrides) {
                get().addCustomPanel(key);
                openPanel(key);
              }
            }
            return { success: true };
          } catch {
            return { success: false, error: 'Invalid JSON' };
          }
        },
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
      }
    ),
    { name: 'studio-preset-store' }
  )
);
