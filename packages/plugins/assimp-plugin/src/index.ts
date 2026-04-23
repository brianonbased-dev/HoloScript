/**
 * @holoscript/assimp-plugin — Assimp multi-format mesh import stub.
 *
 * Research: ai-ecosystem/research/2026-04-21_assimp-fbx-obj-gltf-pipeline.md
 * Universal-IR matrix: docs/universal-ir-coverage.md (legacy-format import column)
 *
 * Status: STUB. Binding to assimp.js / native Assimp + texture atlasing is
 * future work. Scope declares the scene-tree shape per Assimp's
 * aiNode/aiMesh/aiMaterial schema.
 */

export interface AssimpNode {
  name: string;
  mesh_indices?: number[];
  children?: AssimpNode[];
  transform?: number[]; // 4x4 row-major
}

export interface AssimpScene {
  source_format: 'fbx' | 'obj' | 'gltf' | 'collada' | 'other';
  root: AssimpNode;
  mesh_count: number;
  material_count: number;
  animation_count?: number;
}

export interface HoloSceneEmission {
  traits: Array<{ kind: '@mesh_node'; target_id: string; params: Record<string, unknown> }>;
  stats: {
    total_nodes: number;
    meshed_nodes: number;
    max_depth: number;
  };
  format: AssimpScene['source_format'];
}

function walk(node: AssimpNode, depth: number, out: HoloSceneEmission['traits'], stats: HoloSceneEmission['stats']): void {
  stats.total_nodes++;
  if (depth > stats.max_depth) stats.max_depth = depth;
  if (node.mesh_indices?.length) {
    stats.meshed_nodes++;
    out.push({
      kind: '@mesh_node',
      target_id: node.name,
      params: { mesh_indices: node.mesh_indices, depth, transform: node.transform ?? null },
    });
  }
  for (const c of node.children ?? []) walk(c, depth + 1, out, stats);
}

export function importAssimp(scene: AssimpScene): HoloSceneEmission {
  const traits: HoloSceneEmission['traits'] = [];
  const stats = { total_nodes: 0, meshed_nodes: 0, max_depth: 0 };
  walk(scene.root, 0, traits, stats);
  return { traits, stats, format: scene.source_format };
}
