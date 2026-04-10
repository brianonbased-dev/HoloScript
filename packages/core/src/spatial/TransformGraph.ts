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

export interface Transform3D {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

interface TransformEntry {
  id: string;
  local: Transform3D;
  worldX: number;
  worldY: number;
  worldZ: number;
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
    this.entries.set(id, {
      id,
      local: { x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, ...local },
      worldX: 0,
      worldY: 0,
      worldZ: 0,
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
    e.local.x = x;
    e.local.y = y;
    e.local.z = z;
    this.markDirty(id);
  }

  setScale(id: string, sx: number, sy: number, sz: number): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.local.sx = sx;
    e.local.sy = sy;
    e.local.sz = sz;
    this.markDirty(id);
  }

  getLocalTransform(id: string): Transform3D | null {
    const e = this.entries.get(id);
    return e ? { ...e.local } : null;
  }

  getWorldPosition(id: string): { x: number; y: number; z: number } | null {
    const e = this.entries.get(id);
    if (!e) return null;
    if (e.dirty) this.updateWorld(id);
    return { x: e.worldX, y: e.worldY, z: e.worldZ };
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
      e.worldX = parent.worldX + e.local.x * parent.local.sx;
      e.worldY = parent.worldY + e.local.y * parent.local.sy;
      e.worldZ = parent.worldZ + e.local.z * parent.local.sz;
    } else {
      e.worldX = e.local.x;
      e.worldY = e.local.y;
      e.worldZ = e.local.z;
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
