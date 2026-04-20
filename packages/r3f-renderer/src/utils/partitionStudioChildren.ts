/**
 * Pure scene-graph helpers for batching draft meshes under a group (Studio + net preview).
 */

import type { R3FNode } from '@holoscript/core';

/** Resolve splat URL from @gaussian_splat trait or node props. */
export function resolveGaussianSplatSrc(node: R3FNode): string | null {
  const trait = node.traits?.get('gaussian_splat') as Record<string, unknown> | undefined;
  if (trait) {
    const s = trait.source ?? trait.src ?? trait.url;
    if (typeof s === 'string' && s.length > 0) return s;
  }
  const p = node.props;
  if (typeof p.src === 'string' && p.src) return p.src;
  if (typeof p.source === 'string' && p.source) return p.source;
  return null;
}

/** Draft meshes that can share an InstancedMesh (exclude Gaussian splat drafts). */
export function isBatchableDraftMesh(node: R3FNode): boolean {
  return (
    node.type === 'mesh' &&
    node.assetMaturity === 'draft' &&
    resolveGaussianSplatSrc(node) === null
  );
}

/** Split group children: batchable draft meshes vs everything else (preserves `rest` order). */
export function partitionStudioChildren(children: R3FNode[] | undefined): {
  batchableDraftMeshes: R3FNode[];
  rest: R3FNode[];
} {
  const list = children ?? [];
  const batchableDraftMeshes: R3FNode[] = [];
  const rest: R3FNode[] = [];
  for (const c of list) {
    if (isBatchableDraftMesh(c)) {
      batchableDraftMeshes.push(c);
    } else {
      rest.push(c);
    }
  }
  return { batchableDraftMeshes, rest };
}
