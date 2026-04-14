import type { Vector3 } from '@holoscript/core';
/**
 * TransformGraph.ts
 *
 * Transform hierarchy independent of scene graph: manages
 * parent/child transform chains, world matrix caching,
 * dirty flag propagation, and batch updates.
 *
 * @module spatial
 */

// =============================================================================
// TYPES
// =============================================================================

import { Vector3 } from './SpatialTypes';

export interface Transform3D {
  position: Vector3;
  scale: Vector3;
}

interface TransformEntry {
  id: string;
  local: Transform3D;
  worldPosition: Vector3;
  parent: string | null;
  children: string[];
  dirty: boolean;
}

// =============================================================================
// TRANSFORM GRAPH
// =============================================================================

export class TransformGraph {
  private entries: Map<string, TransformEntry> = new Map();

  // ---------------------------------------------------------------------------
  // Node Management
  // ---------------------------------------------------------------------------

  addNode(id: string, local?: Partial<Transform3D>): void {
    const defaultLocal: Transform3D = {
      position: [0, 0, 0],
      scale: [1, 1, 1],
    };

    this.entries.set(id, {
      id,
      local: {
        position: local?.position ? [...local.position] : [...defaultLocal.position],
        scale: local?.scale ? [...local.scale] : [...defaultLocal.scale],
      },
      worldPosition: [0, 0, 0],
      parent: null,
      children: [],
      dirty: true,
    });
  }

  removeNode(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;

    // Unparent children
    for (const childId of entry.children) {
      const child = this.entries.get(childId);
      if (child) child.parent = null;
    }

    // Remove from parent's children
    if (entry.parent) {
      const parent = this.entries.get(entry.parent);
      if (parent) parent.children = parent.children.filter((c) => c !== id);
    }

    this.entries.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Hierarchy
  // ---------------------------------------------------------------------------

  setParent(childId: string, parentId: string | null): void {
    const child = this.entries.get(childId);
    if (!child) return;

    // Remove from old parent
    if (child.parent) {
      const oldParent = this.entries.get(child.parent);
      if (oldParent) oldParent.children = oldParent.children.filter((c) => c !== childId);
    }

    child.parent = parentId;

    // Add to new parent
    if (parentId) {
      const newParent = this.entries.get(parentId);
      if (newParent) newParent.children.push(childId);
    }

    this.markDirty(childId);
  }

  getChildren(id: string): string[] {
    return this.entries.get(id)?.children ?? [];
  }
  getParent(id: string): string | null {
    return this.entries.get(id)?.parent ?? null;
  }

  // ---------------------------------------------------------------------------
  // Transform Updates
  // ---------------------------------------------------------------------------

  setPosition(id: string, x: number, y: number, z: number): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.local.position = [x, y, z];
    this.markDirty(id);
  }

  setScale(id: string, sx: number, sy: number, sz: number): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.local.scale = [sx, sy, sz];
    this.markDirty(id);
  }

  getLocalTransform(id: string): Transform3D | null {
    const e = this.entries.get(id);
    return e ? { ...e.local } : null;
  }

  getWorldPosition(id: string): Vector3 | null {
    const e = this.entries.get(id);
    if (!e) return null;
    if (e.dirty) this.updateWorld(id);
    return [...e.worldPosition];
  }

  // ---------------------------------------------------------------------------
  // Batch Update
  // ---------------------------------------------------------------------------

  updateAll(): void {
    // Process roots first, then propagate
    for (const entry of this.entries.values()) {
      if (entry.parent === null && entry.dirty) this.updateWorld(entry.id);
    }
  }

  private updateWorld(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;

    if (e.parent) {
      const parent = this.entries.get(e.parent)!;
      if (parent.dirty) this.updateWorld(e.parent);
      e.worldPosition = [
        parent.worldPosition[0] + e.local.position[0] * parent.local.scale[0],
        parent.worldPosition[1] + e.local.position[1] * parent.local.scale[1],
        parent.worldPosition[2] + e.local.position[2] * parent.local.scale[2],
      ];
    } else {
      e.worldPosition = [...e.local.position];
    }

    e.dirty = false;

    for (const childId of e.children) this.updateWorld(childId);
  }

  // ---------------------------------------------------------------------------
  // Dirty Propagation
  // ---------------------------------------------------------------------------

  private markDirty(id: string): void {
    const e = this.entries.get(id);
    if (!e || e.dirty) return;
    e.dirty = true;
    for (const childId of e.children) this.markDirty(childId);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getNodeCount(): number {
    return this.entries.size;
  }
  getRoots(): string[] {
    return [...this.entries.values()].filter((e) => !e.parent).map((e) => e.id);
  }
}
