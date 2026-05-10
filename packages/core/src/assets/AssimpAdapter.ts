/**
 * AssimpAdapter — bridge @holoscript/assimp-plugin to ModelImporter pipeline
 *
 * Converts an AssimpScene (from the plugin) into the ImportResult shape used
 * by ImportPipeline and downstream compilers.
 */

import { importAssimp, type AssimpScene, type AssimpNode } from '@holoscript/assimp-plugin';
import type { ImportResult, ImportedMesh, ImportedMaterial } from './ModelImporter';

function computeBoundsFromTransform(node: AssimpNode): { min: [number, number, number]; max: [number, number, number] } {
  // If a 4x4 transform is present, extract translation as centroid and
  // use a default 1m box; otherwise return a unit box at origin.
  if (node.transform && node.transform.length === 16) {
    const tx = node.transform[12] ?? 0;
    const ty = node.transform[13] ?? 0;
    const tz = node.transform[14] ?? 0;
    return { min: [tx - 1, ty - 1, tz - 1], max: [tx + 1, ty + 1, tz + 1] };
  }
  return { min: [-1, -1, -1], max: [1, 1, 1] };
}

/**
 * Convert an Assimp scene (as produced by a real Assimp parser or test fixture)
 * into the ImportResult consumed by HoloScript's asset pipeline.
 */
export function convertAssimpSceneToImportResult(scene: AssimpScene): ImportResult {
  const emission = importAssimp(scene);
  const meshes: ImportedMesh[] = [];
  const materials: ImportedMaterial[] = [];
  const warnings: string[] = [];

  // Build one ImportedMesh per @mesh_node trait emitted by importAssimp.
  for (const trait of emission.traits) {
    const nodeName = trait.target_id;
    const meshIndices = (trait.params.mesh_indices as number[]) ?? [];
    // Find the original node to grab transform for bounds
    const findNode = (n: AssimpNode): AssimpNode | null => {
      if (n.name === nodeName) return n;
      for (const c of n.children ?? []) {
        const found = findNode(c);
        if (found) return found;
      }
      return null;
    };
    const sourceNode = findNode(scene.root) ?? scene.root;
    const bounds = computeBoundsFromTransform(sourceNode);

    meshes.push({
      id: `mesh_${nodeName}`,
      name: nodeName,
      vertexCount: meshIndices.length * 3, // placeholder: 3 verts per mesh index entry
      indexCount: meshIndices.length * 3,
      materialId: meshIndices.length > 0 ? 'mat_0' : null,
      bounds,
    });
  }

  // Emit a single placeholder material when any mesh references one.
  if (meshes.some((m) => m.materialId !== null)) {
    materials.push({
      id: 'mat_0',
      name: 'Assimp_Material',
      baseColor: { r: 0.8, g: 0.8, b: 0.8, a: 1 },
      metallic: 0,
      roughness: 0.5,
      textures: [],
    });
  }

  if (scene.source_format === 'obj') {
    warnings.push('OBJ format does not support PBR materials via Assimp adapter');
  }

  return {
    meshes,
    materials,
    warnings,
    errors: [],
    fileSize: 0,
    importTimeMs: 0,
  };
}

export { type AssimpScene };
