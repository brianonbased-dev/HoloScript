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
import { useSceneGraphStore } from '@/lib/stores/sceneGraphStore';

/** Traits whose edits must snapshot immutably for zundo + mirror from scene graph → history. */
export const SPATIAL_TRAIT_NAMES = new Set([
  'gcode_slicer',
  'volumetric',
  'gaussian_splat',
  'nerf',
  'cinematic_camera'
]);

function cloneSerializable(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return value;
  }
}

/** Guard: scene graph is being overwritten from undo/redo — skip forward bridge. */
let _historyReplayDepth = 0;

export function beginHistoryReplay(): void {
  _historyReplayDepth++;
}

export function endHistoryReplay(): void {
  _historyReplayDepth = Math.max(0, _historyReplayDepth - 1);
}

export function isHistoryReplayActive(): boolean {
  return _historyReplayDepth > 0;
}

function spatialTraitsFingerprint(nodes: SceneNode[]): string {
  return JSON.stringify(
    nodes.map((n) => ({
      id: n.id,
      spatial: n.traits
        .filter((t) => SPATIAL_TRAIT_NAMES.has(t.name))
        .map((t) => ({ name: t.name, properties: t.properties }))
    }))
  );
}

/**
 * When the scene graph mutates spatial trait properties (e.g. TraitInspector → sceneGraphStore),
 * push a matching snapshot into the temporal history store so Undo/Redo stays coherent.
 */
export function installSpatialTraitHistoryBridge(): () => void {
  let prev = spatialTraitsFingerprint(useSceneGraphStore.getState().nodes);
  return useSceneGraphStore.subscribe((state) => {
    if (isHistoryReplayActive()) {
      prev = spatialTraitsFingerprint(state.nodes);
      return;
    }
    const next = spatialTraitsFingerprint(state.nodes);
    if (next === prev) return;
    prev = next;
    setNextHistoryLabel('Spatial trait (volumetric / GCode / camera)');
    const code = useHistoryStore.getState().code;
    useHistoryStore.getState().syncState(structuredClone(state.nodes) as SceneNode[], code);
  });
}

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
          const stored = SPATIAL_TRAIT_NAMES.has(traitName) ? cloneSerializable(value) : value;
          setNextHistoryLabel(
            SPATIAL_TRAIT_NAMES.has(traitName)
              ? `[Spatial] @${traitName}.${key}`
              : `Set @${traitName}.${key}`
          );
          set((s) => ({
            nodes: s.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    traits: n.traits.map((t) =>
                      t.name === traitName
                        ? { ...t, properties: { ...t.properties, [key]: stored } }
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
