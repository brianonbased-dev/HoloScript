'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

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
