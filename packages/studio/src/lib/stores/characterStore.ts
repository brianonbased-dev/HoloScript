'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { RecordedClip } from '../animationBuilder';

// Re-export wardrobe types for backward compatibility (now live in wardrobeStore)
export type { WardrobeSlot, WardrobeItem } from './wardrobeStore';

// ─── Character Store ─────────────────────────────────────────────────────────
// Shared state between the R3F canvas (GlbViewer) and DOM panels (SkeletonPanel etc.)
// Wardrobe state extracted to wardrobeStore.ts (Sprint 13 P1)

interface CharacterState {
  /** Object URL of the loaded .glb file */
  glbUrl: string | null;
  /** Bone names extracted from the skeleton */
  boneNames: string[];
  /** Currently selected bone index (null = none) */
  selectedBoneIndex: number | null;
  /** Whether to display the SkeletonHelper overlay */
  showSkeleton: boolean;
  /** Whether live recording is in progress */
  isRecording: boolean;
  /** All user-recorded animation clips */
  recordedClips: RecordedClip[];
  /** Name of the currently playing clip (null = stopped) */
  activeClipId: string | null;
  /** Built-in animations from the loaded .glb */
  builtinAnimations: Array<{ name: string; duration: number }>;
  /** Name of the currently playing built-in animation (null = none) */
  activeBuiltinAnimation: string | null;
  /** Clip ID currently being exported (null = not exporting) */
  exportingClipId: string | null;

  // ── Character Customizer (Phase 1) ────────────────────────────────────────
  /** Morph target weights: name → 0..1 */
  morphTargets: Record<string, number>;
  /** Skin color hex string */
  skinColor: string;
  /** Whether customize mode is active (sliders vs skeleton) */
  customizeMode: boolean;
  /** Active panel mode for the character layout */
  panelMode: 'skeleton' | 'customize' | 'wardrobe';

  // Actions
  setGlbUrl: (url: string | null) => void;
  setBoneNames: (names: string[]) => void;
  setSelectedBoneIndex: (index: number | null) => void;
  setShowSkeleton: (v: boolean) => void;
  setIsRecording: (v: boolean) => void;
  addRecordedClip: (clip: RecordedClip) => void;
  removeRecordedClip: (id: string) => void;
  renameRecordedClip: (id: string, name: string) => void;
  setActiveClipId: (id: string | null) => void;
  setBuiltinAnimations: (list: Array<{ name: string; duration: number }>) => void;
  setActiveBuiltinAnimation: (name: string | null) => void;
  setExportingClipId: (id: string | null) => void;
  setMorphTarget: (name: string, value: number) => void;
  resetMorphTargets: () => void;
  setSkinColor: (color: string) => void;
  setCustomizeMode: (v: boolean) => void;
  setPanelMode: (mode: 'skeleton' | 'customize' | 'wardrobe') => void;
}

export const useCharacterStore = create<CharacterState>()(
  devtools(
    (set) => ({
      glbUrl: null,
      boneNames: [],
      selectedBoneIndex: null,
      showSkeleton: true,
      isRecording: false,
      recordedClips: [],
      activeClipId: null,
      builtinAnimations: [],
      activeBuiltinAnimation: null,
      exportingClipId: null,
      morphTargets: {},
      skinColor: '#e8beac',
      customizeMode: false,
      panelMode: 'skeleton' as const,

      setGlbUrl: (glbUrl) =>
        set({
          glbUrl,
          boneNames: [],
          selectedBoneIndex: null,
          builtinAnimations: [],
          activeBuiltinAnimation: null,
        }),
      setBoneNames: (boneNames) => set({ boneNames }),
      setSelectedBoneIndex: (selectedBoneIndex) => set({ selectedBoneIndex }),
      setShowSkeleton: (showSkeleton) => set({ showSkeleton }),
      setIsRecording: (isRecording) => set({ isRecording }),
      addRecordedClip: (clip) => set((s) => ({ recordedClips: [...s.recordedClips, clip].slice(-50) })),
      removeRecordedClip: (id) =>
        set((s) => ({ recordedClips: s.recordedClips.filter((c) => c.id !== id) })),
      renameRecordedClip: (id, name) =>
        set((s) => ({
          recordedClips: s.recordedClips.map((c) => (c.id === id ? { ...c, name } : c)),
        })),
      setActiveClipId: (activeClipId) => set({ activeClipId }),
      setBuiltinAnimations: (builtinAnimations) => set({ builtinAnimations }),
      setActiveBuiltinAnimation: (activeBuiltinAnimation) => set({ activeBuiltinAnimation }),
      setExportingClipId: (exportingClipId) => set({ exportingClipId }),
      setMorphTarget: (name, value) =>
        set((s) => ({ morphTargets: { ...s.morphTargets, [name]: value } })),
      resetMorphTargets: () => set({ morphTargets: {} }),
      setSkinColor: (skinColor) => set({ skinColor }),
      setCustomizeMode: (customizeMode) =>
        set({ customizeMode, panelMode: customizeMode ? 'customize' : 'skeleton' }),
      setPanelMode: (panelMode) => set({ panelMode, customizeMode: panelMode === 'customize' }),
    }),
    { name: 'character-store' }
  )
);
