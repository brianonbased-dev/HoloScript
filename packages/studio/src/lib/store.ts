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

interface EditorState {
  activePanel: EditorPanel;
  sidebarOpen: boolean;
  selectedObjectId: string | null;
  gizmoMode: GizmoMode;
  setActivePanel: (panel: EditorPanel) => void;
  toggleSidebar: () => void;
  setSelectedObjectId: (id: string | null) => void;
  setGizmoMode: (mode: GizmoMode) => void;
}

export const useEditorStore = create<EditorState>()(
  devtools(
    (set) => ({
      activePanel: 'prompt',
      sidebarOpen: true,
      selectedObjectId: null,
      gizmoMode: 'translate',
      setActivePanel: (activePanel) => set({ activePanel }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSelectedObjectId: (selectedObjectId) => set({ selectedObjectId }),
      setGizmoMode: (gizmoMode) => set({ gizmoMode }),
    }),
    { name: 'editor-store' }
  )
);
