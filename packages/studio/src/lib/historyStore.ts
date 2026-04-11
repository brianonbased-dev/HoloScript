/**
 * History-aware Scene Graph Store
 *
 * Wraps the existing sceneGraphStore mutations with zundo's temporal
 * middleware to record a full snapshot on every write.
 *
 * Usage:
 *   import { useHistoryStore, useTemporalStore } from '@/lib/historyStore';
 *
 *   const undo = useTemporalStore(s => s.undo);
 *   const redo = useTemporalStore(s => s.redo);
 *   const past = useTemporalStore(s => s.pastStates);
 *
 * Note: we re-create the sceneGraphStore here with zundo so that regular
 * sceneGraphStore consumers continue to work unchanged (the new store is
 * kept in sync via a subscribe bridge).
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { temporal } from 'zundo';
import type { TemporalState } from 'zundo';
import { useStore } from 'zustand';
import type { TraitConfig, SceneNode } from '@/lib/stores';

// ─── Re-declare the slice type ────────────────────────────────────────────────

export interface HistorySceneState {
  nodes: SceneNode[];
  code: string;

  // Mutation actions — each call produces one history entry
  addNode: (node: SceneNode) => void;
  removeNode: (id: string) => void;
  moveNode: (id: string, parentId: string | null) => void;
  updateNodeTransform: (
    id: string,
    transform: Partial<Pick<SceneNode, 'position' | 'rotation' | 'scale'>>
  ) => void;
  updateNode: (id: string, patch: Partial<SceneNode>) => void;
  addTrait: (nodeId: string, trait: TraitConfig) => void;
  removeTrait: (nodeId: string, traitName: string) => void;
  setTraitProperty: (nodeId: string, traitName: string, key: string, value: unknown) => void;
  setCode: (code: string) => void;
  syncState: (nodes: SceneNode[], code: string) => void;
}

// ─── Label each mutation for the history UI ───────────────────────────────────

let _lastLabel = 'Initial state';

export function setNextHistoryLabel(label: string) {
  _lastLabel = label;
}

export function getLastHistoryLabel() {
  return _lastLabel;
}

// ─── Temporal store ───────────────────────────────────────────────────────────

export const useHistoryStore = create<HistorySceneState>()(
  devtools(
    temporal(
      (set) => ({
        nodes: [],
        code: '',

        addNode: (node) => {
          setNextHistoryLabel(`Add "${node.name}"`);
          set((s) => ({ nodes: [...s.nodes, node] }));
        },

        removeNode: (id) => {
          set((s) => {
            const target = s.nodes.find((n) => n.id === id);
            setNextHistoryLabel(`Remove "${target?.name ?? id}"`);
            return { nodes: s.nodes.filter((n) => n.id !== id) };
          });
        },

        moveNode: (id, parentId) => {
          setNextHistoryLabel(`Reparent node`);
          set((s) => ({
            nodes: s.nodes.map((n) => (n.id === id ? { ...n, parentId } : n)),
          }));
        },

        updateNodeTransform: (id, transform) => {
          setNextHistoryLabel(`Transform "${id}"`);
          set((s) => ({
            nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...transform } : n)),
          }));
        },

        updateNode: (id, patch) => {
          set((s) => ({
            nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
          }));
        },

        addTrait: (nodeId, trait) => {
          setNextHistoryLabel(`Add trait @${trait.name}`);
          set((s) => ({
            nodes: s.nodes.map((n) =>
              n.id === nodeId
                ? { ...n, traits: [...n.traits.filter((t) => t.name !== trait.name), trait] }
                : n
            ),
          }));
        },

        removeTrait: (nodeId, traitName) => {
          setNextHistoryLabel(`Remove trait @${traitName}`);
          set((s) => ({
            nodes: s.nodes.map((n) =>
              n.id === nodeId ? { ...n, traits: n.traits.filter((t) => t.name !== traitName) } : n
            ),
          }));
        },

        setTraitProperty: (nodeId, traitName, key, value) => {
          setNextHistoryLabel(`Set @${traitName}.${key}`);
          set((s) => ({
            nodes: s.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    traits: n.traits.map((t) =>
                      t.name === traitName
                        ? { ...t, properties: { ...t.properties, [key]: value } }
                        : t
                    ),
                  }
                : n
            ),
          }));
        },

        setCode: (code) => {
          set({ code });
        },

        syncState: (nodes, code) => {
          set({ nodes, code });
        },
      }),
      {
        // Track both nodes and code for full semantic undo support
        partialize: (state) => ({ nodes: state.nodes, code: state.code }),
        // Attach a human-readable label to each entry via equality function trick
        equality: (_a, _b) => false, // always record
        limit: 100, // keep up to 100 history entries
      }
    ),
    { name: 'history-scene-store' }
  )
);

// ─── Typed temporal accessor ──────────────────────────────────────────────────

type TemporalStore = TemporalState<Pick<HistorySceneState, 'nodes' | 'code'>>;

export const useTemporalStore = <T>(
  selector: (state: TemporalStore) => T,
  equality?: (a: T, b: T) => boolean
): T => useStore(useHistoryStore.temporal, selector as (state: TemporalStore) => T, equality);
