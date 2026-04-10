/**
 * SceneQuery.ts
 *
 * Scene queries: frustum culling, spatial range queries,
 * tag/layer filtering, and visitor pattern.
 *
 * @module scene
 */

import { SceneNode } from './SceneNode';

// =============================================================================
// TYPES
// =============================================================================

export interface Frustum {
  position: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  fov: number; // Degrees
  near: number;
  far: number;
}

export type NodeVisitor = (node: SceneNode) => boolean; // return false to stop

// =============================================================================
// SCENE QUERY
// =============================================================================

export class SceneQuery {
  // ---------------------------------------------------------------------------
  // Tag/Layer Filtering
  // ---------------------------------------------------------------------------

  static findByTag(root: SceneNode, tag: string): SceneNode[] {
    const results: SceneNode[] = [];
    root.traverse((node) => {
      if (node.tags.has(tag)) results.push(node);
    });
    return results;
  }

  static findByLayer(root: SceneNode, layer: number): SceneNode[] {
    const results: SceneNode[] = [];
    root.traverse((node) => {
      if (node.layer === layer) results.push(node);
    });
    return results;
  }

  static findByName(root: SceneNode, name: string): SceneNode | null {
    let found: SceneNode | null = null;
    root.traverse((node) => {
      if (node.name === name) found = node;
    });
    return found;
  }

  // ---------------------------------------------------------------------------
  // Spatial Queries
  // ---------------------------------------------------------------------------

  static findInRadius(
    root: SceneNode,
    center: { x: number; y: number; z: number },
    radius: number
  ): SceneNode[] {
    const results: SceneNode[] = [];
    root.traverse((node) => {
      const wp = node.getWorldPosition();
      const dx = wp.x - center.x,
        dy = wp.y - center.y,
        dz = wp.z - center.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= radius) results.push(node);
    });
    return results;
  }

  // ---------------------------------------------------------------------------
  // Frustum Culling (simplified cone check)
  // ---------------------------------------------------------------------------

  static frustumCull(root: SceneNode, frustum: Frustum): SceneNode[] {
    const results: SceneNode[] = [];
    const dir = SceneQuery.normalize(frustum.direction);
    const halfFovRad = ((frustum.fov / 2) * Math.PI) / 180;
    const cosHalfFov = Math.cos(halfFovRad);

    root.traverse((node) => {
      if (!node.visible) return;

      const wp = node.getWorldPosition();
      const dx = wp.x - frustum.position.x;
      const dy = wp.y - frustum.position.y;
      const dz = wp.z - frustum.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < frustum.near || dist > frustum.far) return;

      // Angle check
      if (dist > 0) {
        const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / dist;
        if (dot >= cosHalfFov) results.push(node);
      }
    });

    return results;
  }

  // ---------------------------------------------------------------------------
  // Visitor Pattern
  // ---------------------------------------------------------------------------

  static visit(root: SceneNode, visitor: NodeVisitor): void {
    const queue: SceneNode[] = [root];
    while (queue.length > 0) {
      const node = queue.shift()!;
      const cont = visitor(node);
      if (cont === false) return;
      queue.push(...node.getChildren());
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private static normalize(v: { x: number; y: number; z: number }): {
    x: number;
    y: number;
    z: number;
  } {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }
}

