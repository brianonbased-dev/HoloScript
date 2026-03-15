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
  type: 'mesh' | 'light' | 'camera' | 'audio' | 'group' | 'splat' | 'gltfModel';
  parentId: string | null;
  traits: TraitConfig[];
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  /**
   * Asset maturity stage in the Draft→Mesh→Final pipeline.
   * - 'draft': Geometric primitive blockout with collision proxy
   * - 'mesh': Imported/generated mesh, still iterating
   * - 'final': Production-ready with full materials and LOD
   */
  assetMaturity?: 'draft' | 'mesh' | 'final';
}

interface SceneGraphState {
  nodes: SceneNode[];
  addNode: (node: SceneNode) => void;
  removeNode: (id: string) => void;
  moveNode: (id: string, parentId: string | null) => void;
  updateNodeTransform: (
    id: string,
    transform: Partial<Pick<SceneNode, 'position' | 'rotation' | 'scale'>>
  ) => void;
  /** Convenience: update any subset of node fields */
  updateNode: (id: string, patch: Partial<SceneNode>) => void;
  addTrait: (nodeId: string, trait: TraitConfig) => void;
  removeTrait: (nodeId: string, traitName: string) => void;
  setTraitProperty: (nodeId: string, traitName: string, key: string, value: unknown) => void;
  /** Transient references to active Three.js objects for 0-frame latency UI updates */
  nodeRefs: Record<string, any>;
  setNodeRef: (id: string, ref: any) => void;
  applyTransientTransform: (
    id: string,
    transform: Partial<Pick<SceneNode, 'position' | 'rotation' | 'scale'>>
  ) => void;
  applyTransientMaterial: (id: string, materialProps: Record<string, any>) => void;
  /** Export the scene graph as a portable JSON string */
  serializeScene: () => string;
  /** Replace the scene graph with deserialized nodes */
  loadScene: (json: string) => void;
}

export const useSceneGraphStore = create<SceneGraphState>()(
  devtools(
    (set, get) => ({
      nodes: [],
      addNode: (node) => set((s) => ({ nodes: [...s.nodes, node] })),
      removeNode: (id) =>
        set((s) => {
          const nodeRefs = { ...s.nodeRefs };
          delete nodeRefs[id]; // prevent Three.js ref leak when node is deleted
          return { nodes: s.nodes.filter((n) => n.id !== id), nodeRefs };
        }),
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
            n.id === nodeId
              ? { ...n, traits: [...n.traits.filter((t) => t.name !== trait.name), trait] }
              : n
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
                    t.name === traitName
                      ? { ...t, properties: { ...t.properties, [key]: value } }
                      : t
                  ),
                }
              : n
          ),
        })),
      nodeRefs: {},
      setNodeRef: (id, ref) =>
        set((s) => ({
          nodeRefs: { ...s.nodeRefs, [id]: ref },
        })),
      applyTransientTransform: (id, transform) => {
        // Apply instantly to the Three.js object to bypass React 1-frame lag
        set((s) => {
          const ref = s.nodeRefs[id];
          if (ref) {
            if (transform.position) ref.position.fromArray(transform.position);
            // Three.js uses radians internally, but TransformPanel UI might feed Euler arrays if degrees are converted.
            // Wait, R3F props use Euler arrays in radians. TransformPanel feeds data that goes straight into R3F props.
            if (transform.rotation) ref.rotation.fromArray(transform.rotation);
            if (transform.scale) {
               // handle number or array scale
               if (typeof transform.scale === 'number') {
                  ref.scale.setScalar(transform.scale);
               } else {
                  ref.scale.fromArray(transform.scale);
               }
            }
          }
          // Also commit to store for persistence
          return {
            nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...transform } : n)),
          };
        });
      },
      applyTransientMaterial: (id, materialProps) => {
        set((s) => {
          const ref = s.nodeRefs[id];
          if (ref) {
            ref.traverse((child: any) => {
              if (child.isMesh && child.material) {
                const applyProps = (mat: any) => {
                  if (materialProps.albedo !== undefined) mat.color.set(materialProps.albedo);
                  if (materialProps.roughness !== undefined) mat.roughness = materialProps.roughness;
                  if (materialProps.metallic !== undefined) mat.metalness = materialProps.metallic;
                  if (materialProps.opacity !== undefined) {
                    mat.opacity = materialProps.opacity;
                    mat.transparent = materialProps.opacity < 1;
                    mat.depthWrite = materialProps.opacity >= 1;
                  }
                  if (materialProps.emissive !== undefined) mat.emissive.set(materialProps.emissive);
                  if (materialProps.emissiveIntensity !== undefined) mat.emissiveIntensity = materialProps.emissiveIntensity;
                  if (materialProps.tint !== undefined) mat.color.set(materialProps.tint);
                  mat.needsUpdate = true;
                };

                if (Array.isArray(child.material)) {
                  child.material.forEach(applyProps);
                } else {
                  applyProps(child.material);
                }
              }
            });
          }

          return {
            nodes: s.nodes.map((n) => {
              if (n.id !== id) return n;
              const hasMaterial = n.traits.some((t) => t.name === 'material');
              let newTraits = [...n.traits];
              
              if (!hasMaterial) {
                newTraits.push({ name: 'material', properties: materialProps });
              } else {
                newTraits = newTraits.map((t) =>
                  t.name === 'material'
                    ? { ...t, properties: { ...t.properties, ...materialProps } }
                    : t
                );
              }
              return { ...n, traits: newTraits };
            }),
          };
        });
      },
      serializeScene: () => {
        const { nodes } = get();
        return JSON.stringify({ version: 1, nodes }, null, 2);
      },
      loadScene: (json: string) => {
        const parsed = JSON.parse(json);
        const nodes: SceneNode[] = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
        set({ nodes, nodeRefs: {} });
      },
    }),
    { name: 'scene-graph-store' }
  )
);
