'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { R3FNode } from '@holoscript/core';
import type { AIStatus, OllamaStatus, PromptEntry, SceneMetadata } from '@/types';

// ─── Scene Store ────────────────────────────────────────────────────────────

interface SceneState {
  code: string;
  r3fTree: R3FNode | null;
  errors: Array<{ message: string; line?: number }>;
  metadata: SceneMetadata;
  isDirty: boolean;
  setCode: (code: string) => void;
  setR3FTree: (tree: R3FNode | null) => void;
  setErrors: (errors: Array<{ message: string; line?: number }>) => void;
  setMetadata: (partial: Partial<SceneMetadata>) => void;
  markClean: () => void;
  reset: () => void;
}

const defaultMetadata: SceneMetadata = {
  id: '',
  name: 'Untitled Scene',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const useSceneStore = create<SceneState>()(
  devtools(
    (set) => ({
      code: '',
      r3fTree: null,
      errors: [],
      metadata: { ...defaultMetadata },
      isDirty: false,
      setCode: (code) =>
        set({
          code,
          isDirty: true,
          metadata: { ...defaultMetadata, updatedAt: new Date().toISOString() },
        }),
      setR3FTree: (r3fTree) => set({ r3fTree }),
      setErrors: (errors) => set({ errors }),
      setMetadata: (partial) => set((s) => ({ metadata: { ...s.metadata, ...partial } })),
      markClean: () => set({ isDirty: false }),
      reset: () =>
        set({
          code: '',
          r3fTree: null,
          errors: [],
          metadata: { ...defaultMetadata },
          isDirty: false,
        }),
    }),
    { name: 'scene-store' }
  )
);

// ─── AI Store ───────────────────────────────────────────────────────────────

interface AIState {
  status: AIStatus;
  ollamaStatus: OllamaStatus;
  model: string;
  promptHistory: PromptEntry[];
  setStatus: (status: AIStatus) => void;
  setOllamaStatus: (status: OllamaStatus) => void;
  setModel: (model: string) => void;
  addPrompt: (entry: PromptEntry) => void;
  clearHistory: () => void;
}

export const useAIStore = create<AIState>()(
  devtools(
    (set) => ({
      status: 'idle',
      ollamaStatus: 'checking',
      model: 'brittney-qwen-v23:latest',
      promptHistory: [],
      setStatus: (status) => set({ status }),
      setOllamaStatus: (ollamaStatus) => set({ ollamaStatus }),
      setModel: (model) => set({ model }),
      addPrompt: (entry) => set((s) => ({ promptHistory: [...s.promptHistory, entry] })),
      clearHistory: () => set({ promptHistory: [] }),
    }),
    { name: 'ai-store' }
  )
);

<<<<<<< HEAD
// ─── Scene Graph Store ───────────────────────────────────────────────────────

export interface TraitConfig {
  name: string;
  properties: Record<string, unknown>;
}

export interface SceneNode {
  id: string;
  name: string;
  type: 'mesh' | 'light' | 'camera' | 'audio' | 'group' | 'splat';
  parentId: string | null;
  traits: TraitConfig[];
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

interface SceneGraphState {
  nodes: SceneNode[];
  addNode: (node: SceneNode) => void;
  removeNode: (id: string) => void;
  moveNode: (id: string, parentId: string | null) => void;
  updateNodeTransform: (id: string, transform: Partial<Pick<SceneNode, 'position' | 'rotation' | 'scale'>>) => void;
  /** Convenience: update any subset of node fields */
  updateNode: (id: string, patch: Partial<SceneNode>) => void;
  addTrait: (nodeId: string, trait: TraitConfig) => void;
  removeTrait: (nodeId: string, traitName: string) => void;
  setTraitProperty: (nodeId: string, traitName: string, key: string, value: unknown) => void;
}

export const useSceneGraphStore = create<SceneGraphState>()(
  devtools(
    (set) => ({
      nodes: [],
      addNode: (node) => set((s) => ({ nodes: [...s.nodes, node] })),
      removeNode: (id) => set((s) => ({ nodes: s.nodes.filter((n) => n.id !== id) })),
      moveNode: (id, parentId) =>
        set((s) => ({
          nodes: s.nodes.map((n) => (n.id === id ? { ...n, parentId } : n)),
        })),
      updateNodeTransform: (id, transform) =>
        set((s) => ({
          nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...transform } : n)),
        })),
      updateNode: (id, patch) =>
        set((s) => ({
          nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
        })),
      addTrait: (nodeId, trait) =>
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === nodeId ? { ...n, traits: [...n.traits.filter((t) => t.name !== trait.name), trait] } : n
          ),
        })),
      removeTrait: (nodeId, traitName) =>
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === nodeId ? { ...n, traits: n.traits.filter((t) => t.name !== traitName) } : n
          ),
        })),
      setTraitProperty: (nodeId, traitName, key, value) =>
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  traits: n.traits.map((t) =>
                    t.name === traitName ? { ...t, properties: { ...t.properties, [key]: value } } : t
                  ),
                }
              : n
          ),
        })),
    }),
    { name: 'scene-graph-store' }
  )
);

// ─── Editor Store ───────────────────────────────────────────────────────────

type EditorPanel = 'prompt' | 'code' | 'tree';
export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type ArtMode = 'none' | 'sketch' | 'paint' | 'generative';
export type StudioMode = 'creator' | 'artist' | 'filmmaker' | 'expert' | 'character';
=======
// ─── Editor Store ───────────────────────────────────────────────────────────

type EditorPanel = 'prompt' | 'code' | 'tree';
>>>>>>> feature/docs-examples-misc

interface EditorState {
  activePanel: EditorPanel;
  sidebarOpen: boolean;
  selectedObjectId: string | null;
<<<<<<< HEAD
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
  return (saved && ['creator', 'artist', 'filmmaker', 'expert', 'character'].includes(saved)) ? saved : 'creator';
};

=======
  setActivePanel: (panel: EditorPanel) => void;
  toggleSidebar: () => void;
  setSelectedObjectId: (id: string | null) => void;
}

>>>>>>> feature/docs-examples-misc
export const useEditorStore = create<EditorState>()(
  devtools(
    (set) => ({
      activePanel: 'prompt',
      sidebarOpen: true,
      selectedObjectId: null,
<<<<<<< HEAD
      selectedObjectName: null,
      gizmoMode: 'translate',
      artMode: 'none',
      studioMode: getInitialStudioMode(),
      showBenchmark: false,
      showPerfOverlay: false,
      setActivePanel: (activePanel) => set({ activePanel }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSelectedObjectId: (selectedObjectId) => set({ selectedObjectId }),
      setSelectedObject: (selectedObjectId, selectedObjectName) => set({ selectedObjectId, selectedObjectName }),
      setGizmoMode: (gizmoMode) => set({ gizmoMode }),
      setArtMode: (artMode) => set({ artMode }),
      setStudioMode: (studioMode) => {
        if (typeof window !== 'undefined') window.localStorage.setItem('studio-mode', studioMode);
        set({ studioMode });
      },
      setShowBenchmark: (showBenchmark) => set({ showBenchmark }),
      togglePerfOverlay: () => set((s) => ({ showPerfOverlay: !s.showPerfOverlay })),
=======
      setActivePanel: (activePanel) => set({ activePanel }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSelectedObjectId: (selectedObjectId) => set({ selectedObjectId }),
>>>>>>> feature/docs-examples-misc
    }),
    { name: 'editor-store' }
  )
);
<<<<<<< HEAD

// ─── Character Store ─────────────────────────────────────────────────────────
// Shared state between the R3F canvas (GlbViewer) and DOM panels (SkeletonPanel etc.)

import type { RecordedClip } from './animationBuilder';

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

      setGlbUrl: (glbUrl) => set({ glbUrl, boneNames: [], selectedBoneIndex: null, builtinAnimations: [], activeBuiltinAnimation: null }),
      setBoneNames: (boneNames) => set({ boneNames }),
      setSelectedBoneIndex: (selectedBoneIndex) => set({ selectedBoneIndex }),
      setShowSkeleton: (showSkeleton) => set({ showSkeleton }),
      setIsRecording: (isRecording) => set({ isRecording }),
      addRecordedClip: (clip) => set((s) => ({ recordedClips: [...s.recordedClips, clip] })),
      removeRecordedClip: (id) => set((s) => ({ recordedClips: s.recordedClips.filter((c) => c.id !== id) })),
      renameRecordedClip: (id, name) => set((s) => ({ recordedClips: s.recordedClips.map((c) => c.id === id ? { ...c, name } : c) })),
      setActiveClipId: (activeClipId) => set({ activeClipId }),
      setBuiltinAnimations: (builtinAnimations) => set({ builtinAnimations }),
      setActiveBuiltinAnimation: (activeBuiltinAnimation) => set({ activeBuiltinAnimation }),
      setExportingClipId: (exportingClipId) => set({ exportingClipId }),
    }),
    { name: 'character-store' }
  )
);
=======
>>>>>>> feature/docs-examples-misc
