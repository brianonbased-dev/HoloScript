'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ─── Editor Store ───────────────────────────────────────────────────────────

type EditorPanel = 'prompt' | 'code' | 'tree';
export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type ArtMode = 'none' | 'sketch' | 'paint' | 'generative';
export type StudioMode = 'creator' | 'artist' | 'filmmaker' | 'expert' | 'character' | 'scenarios';

interface EditorState {
  activePanel: EditorPanel;
  sidebarOpen: boolean;
  selectedObjectId: string | null;
  selectedObjectName: string | null;
  gizmoMode: GizmoMode;
  artMode: ArtMode;
  studioMode: StudioMode;
  showBenchmark: boolean;
  showPerfOverlay: boolean;
  setActivePanel: (panel: EditorPanel) => void;
  toggleSidebar: () => void;
  setSelectedObjectId: (id: string | null) => void;
  setSelectedObject: (id: string | null, name: string | null) => void;
  setGizmoMode: (mode: GizmoMode) => void;
  setArtMode: (mode: ArtMode) => void;
  setStudioMode: (mode: StudioMode) => void;
  setShowBenchmark: (v: boolean) => void;
  togglePerfOverlay: () => void;
}

const getInitialStudioMode = (): StudioMode => {
  if (typeof window === 'undefined') return 'creator';
  const saved = window.localStorage.getItem('studio-mode') as StudioMode | null;
  return saved &&
    ['creator', 'artist', 'filmmaker', 'expert', 'character', 'scenarios'].includes(saved)
    ? saved
    : 'creator';
};

export const useEditorStore = create<EditorState>()(
  devtools(
    (set) => ({
      activePanel: 'prompt',
      sidebarOpen: true,
      selectedObjectId: null,
      selectedObjectName: null,
      gizmoMode: 'translate',
      artMode: 'none',
      studioMode: getInitialStudioMode(),
      showBenchmark: false,
      showPerfOverlay: false,
      setActivePanel: (activePanel) => set({ activePanel }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSelectedObjectId: (selectedObjectId) => set({ selectedObjectId }),
      setSelectedObject: (selectedObjectId, selectedObjectName) =>
        set({ selectedObjectId, selectedObjectName }),
      setGizmoMode: (gizmoMode) => set({ gizmoMode }),
      setArtMode: (artMode) => set({ artMode }),
      setStudioMode: (studioMode) => {
        if (typeof window !== 'undefined') window.localStorage.setItem('studio-mode', studioMode);
        set({ studioMode });
      },
      setShowBenchmark: (showBenchmark) => set({ showBenchmark }),
      togglePerfOverlay: () => set((s) => ({ showPerfOverlay: !s.showPerfOverlay })),
    }),
    { name: 'editor-store' }
  )
);
