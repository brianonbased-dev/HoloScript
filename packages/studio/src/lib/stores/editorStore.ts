'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ─── Editor Store ───────────────────────────────────────────────────────────

type EditorPanel = 'prompt' | 'code' | 'tree';
export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type ArtMode = 'none' | 'sketch' | 'paint' | 'generative';
export type StudioMode = 'creator' | 'artist' | 'filmmaker' | 'expert' | 'character' | 'scenarios';

/** Draft/Mesh/Sim — toolbar pipeline stage (W.080 / FE-1). `sim` maps scene maturity to `final`. */
export type GeometricViewMode = 'draft' | 'mesh' | 'sim';

interface EditorState {
  activePanel: EditorPanel;
  sidebarOpen: boolean;
  showGovernancePanel: boolean;
  showConformancePanel: boolean;
  diffModeHash: string | null;
  spatialBlameTooltip: {
    visible: boolean;
    x: number;
    y: number;
    content: React.ReactNode | null;
  };
  selectedObjectId: string | null;
  selectedObjectName: string | null;
  gizmoMode: GizmoMode;
  artMode: ArtMode;
  studioMode: StudioMode;
  /** Geometric pipeline emphasis: Draft blockout, shaded Mesh, or Sim (final + sim panel). */
  geometricViewMode: GeometricViewMode;
  showBenchmark: boolean;
  showPerfOverlay: boolean;
  setActivePanel: (panel: EditorPanel) => void;
  toggleSidebar: () => void;
  setSelectedObjectId: (id: string | null) => void;
  setSelectedObject: (id: string | null, name: string | null) => void;
  setGizmoMode: (mode: GizmoMode) => void;
  setArtMode: (mode: ArtMode) => void;
  setStudioMode: (mode: StudioMode) => void;
  setGeometricViewMode: (mode: GeometricViewMode) => void;
  setShowGovernancePanel: (v: boolean) => void;
  setShowConformancePanel: (v: boolean) => void;
  setDiffModeHash: (hash: string | null) => void;
  setSpatialBlameTooltip: (
    visible: boolean,
    x?: number,
    y?: number,
    content?: React.ReactNode
  ) => void;
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

const getInitialGeometricViewMode = (): GeometricViewMode => {
  if (typeof window === 'undefined') return 'mesh';
  const saved = window.localStorage.getItem('studio-geometric-view-mode') as GeometricViewMode | null;
  return saved && ['draft', 'mesh', 'sim'].includes(saved) ? saved : 'mesh';
};

export const useEditorStore = create<EditorState>()(
  devtools(
    (set) => ({
      activePanel: 'prompt',
      sidebarOpen: true,
      showGovernancePanel: false,
      showConformancePanel: false,
      diffModeHash: null,
      spatialBlameTooltip: { visible: false, x: 0, y: 0, content: null },
      selectedObjectId: null,
      selectedObjectName: null,
      gizmoMode: 'translate',
      artMode: 'none',
      studioMode: getInitialStudioMode(),
      geometricViewMode: getInitialGeometricViewMode(),
      showBenchmark: false,
      showPerfOverlay: false,
      setActivePanel: (activePanel) => set({ activePanel }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSelectedObjectId: (selectedObjectId) => set({ selectedObjectId }),
      setSelectedObject: (selectedObjectId, selectedObjectName) =>
        set({ selectedObjectId, selectedObjectName }),
      setGizmoMode: (gizmoMode) => set({ gizmoMode }),
      setArtMode: (artMode) => set({ artMode }),
      setShowGovernancePanel: (showGovernancePanel) => set({ showGovernancePanel }),
      setShowConformancePanel: (showConformancePanel) => set({ showConformancePanel }),
      setDiffModeHash: (diffModeHash) => set({ diffModeHash }),
      setSpatialBlameTooltip: (visible, x = 0, y = 0, content = null) =>
        set({ spatialBlameTooltip: { visible, x, y, content } }),
      setStudioMode: (studioMode) => {
        if (typeof window !== 'undefined') window.localStorage.setItem('studio-mode', studioMode);
        set({ studioMode });
      },
      setGeometricViewMode: (geometricViewMode) => {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('studio-geometric-view-mode', geometricViewMode);
        }
        set({ geometricViewMode });
      },
      setShowBenchmark: (showBenchmark) => set({ showBenchmark }),
      togglePerfOverlay: () => set((s) => ({ showPerfOverlay: !s.showPerfOverlay })),
    }),
    { name: 'editor-store' }
  )
);
