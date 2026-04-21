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

/** Object-shaped 3-vector for transform TRS (distinct from tuple `Vector3` in SpatialTypes). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

type TransformInput =
  | Partial<Transform3D>
  | {
      x?: number;
      y?: number;
      z?: number;
      sx?: number;
      sy?: number;
      sz?: number;
    }
  /** Local position only; scale defaults to (1,1,1). */
  | readonly [number, number, number];

export interface Transform3D {
  position: Vec3;
  scale: Vec3;
}

interface TransformEntry {
  id: string;
  local: Transform3D;
  worldPosition: Vec3;
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

  addNode(id: string, local?: TransformInput): void {
    const defaultLocal: Transform3D = {
      position: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    };

    if (local !== undefined && Array.isArray(local)) {
      const [x, y, z] = local;
      this.entries.set(id, {
        id,
        local: {
          position: { x, y, z },
          scale: { x: 1, y: 1, z: 1 },
        },
        worldPosition: { x: 0, y: 0, z: 0 },
        parent: null,
        children: [],
        dirty: true,
      });
      return;
    }

    const input = local as Partial<Transform3D> & {
      x?: number;
      y?: number;
      z?: number;
      sx?: number;
      sy?: number;
      sz?: number;
    };

    const position = input?.position
      ? { ...input.position }
      : {
          x: input?.x ?? defaultLocal.position.x,
          y: input?.y ?? defaultLocal.position.y,
          z: input?.z ?? defaultLocal.position.z,
        };

    const scale = input?.scale
      ? { ...input.scale }
      : {
          x: input?.sx ?? defaultLocal.scale.x,
          y: input?.sy ?? defaultLocal.scale.y,
          z: input?.sz ?? defaultLocal.scale.z,
        };

    this.entries.set(id, {
      id,
      local: {
        position,
        scale,
      },
      worldPosition: { x: 0, y: 0, z: 0 },
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
    e.local.position = { x, y, z };
    this.markDirty(id);
  }

  setScale(id: string, sx: number, sy: number, sz: number): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.local.scale = { x: sx, y: sy, z: sz };
    this.markDirty(id);
  }

  getLocalTransform(id: string): Transform3D | null {
    const e = this.entries.get(id);
    return e ? { ...e.local } : null;
  }

  getWorldPosition(id: string): [number, number, number] | null {
    const e = this.entries.get(id);
    if (!e) return null;
    if (e.dirty) this.updateWorld(id);
    const w = e.worldPosition;
    return [w.x, w.y, w.z];
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
      e.worldPosition = {
        x: parent.worldPosition.x + e.local.position.x * parent.local.scale.x,
        y: parent.worldPosition.y + e.local.position.y * parent.local.scale.y,
        z: parent.worldPosition.z + e.local.position.z * parent.local.scale.z,
      };
    } else {
      e.worldPosition = { ...e.local.position };
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
