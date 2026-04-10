/**
 * OctreeSystem.ts
 *
 * Octree spatial partitioning: insert/remove objects,
 * range queries, ray queries, and automatic subdivision.
 *
 * @module spatial
 */

// =============================================================================
// TYPES
// =============================================================================

export interface OctreeEntry {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
}

interface OctreeNode {
  cx: number;
  cy: number;
  cz: number; // Center
  halfSize: number;
  entries: OctreeEntry[];
  children: OctreeNode[] | null;
  depth: number;
}

// =============================================================================
// OCTREE
// =============================================================================

export class OctreeSystem {
  private root: OctreeNode;
  private maxEntriesPerNode = 8;
  private maxDepth = 8;
  private entryCount = 0;

  constructor(centerX: number, centerY: number, centerZ: number, halfSize: number) {
    this.root = {
      cx: centerX,
      cy: centerY,
      cz: centerZ,
      halfSize,
      entries: [],
      children: null,
      depth: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Insert / Remove
  // ---------------------------------------------------------------------------

  insert(entry: OctreeEntry): boolean {
    const inserted = this.insertIntoNode(this.root, entry);
    if (inserted) this.entryCount++;
    return inserted;
  }

  private insertIntoNode(node: OctreeNode, entry: OctreeEntry): boolean {
    if (!this.containsPoint(node, entry.x, entry.y, entry.z)) return false;

    if (node.children === null) {
      node.entries.push(entry);
      if (node.entries.length > this.maxEntriesPerNode && node.depth < this.maxDepth) {
        this.subdivide(node);
      }
      return true;
    }

    for (const child of node.children) {
      if (this.insertIntoNode(child, entry)) return true;
    }

    // Doesn't fit in any child — store in this node
    node.entries.push(entry);
    return true;
  }

  remove(id: string): boolean {
    const removed = this.removeFromNode(this.root, id);
    if (removed) this.entryCount--;
    return removed;
  }

  private removeFromNode(node: OctreeNode, id: string): boolean {
    const idx = node.entries.findIndex((e) => e.id === id);
    if (idx >= 0) {
      node.entries.splice(idx, 1);
      return true;
    }

    if (node.children) {
      for (const child of node.children) {
        if (this.removeFromNode(child, id)) return true;
      }
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  queryRadius(x: number, y: number, z: number, radius: number): OctreeEntry[] {
    const results: OctreeEntry[] = [];
    this.queryRadiusNode(this.root, x, y, z, radius, results);
    return results;
  }

  private queryRadiusNode(
    node: OctreeNode,
    x: number,
    y: number,
    z: number,
    radius: number,
    results: OctreeEntry[]
  ): void {
    // Quick reject: check if sphere overlaps the node AABB
    if (!this.sphereOverlapsNode(node, x, y, z, radius)) return;

    for (const entry of node.entries) {
      const dx = entry.x - x,
        dy = entry.y - y,
        dz = entry.z - z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= radius + entry.radius) {
        results.push(entry);
      }
    }

    if (node.children) {
      for (const child of node.children) {
        this.queryRadiusNode(child, x, y, z, radius, results);
      }
    }
  }

  private sphereOverlapsNode(
    node: OctreeNode,
    x: number,
    y: number,
    z: number,
    radius: number
  ): boolean {
    const dx = Math.max(0, Math.abs(x - node.cx) - node.halfSize);
    const dy = Math.max(0, Math.abs(y - node.cy) - node.halfSize);
    const dz = Math.max(0, Math.abs(z - node.cz) - node.halfSize);
    return dx * dx + dy * dy + dz * dz <= radius * radius;
  }

  // ---------------------------------------------------------------------------
  // Subdivision
  // ---------------------------------------------------------------------------

  private subdivide(node: OctreeNode): void {
    const hs = node.halfSize / 2;
    node.children = [];

    for (let x = -1; x <= 1; x += 2) {
      for (let y = -1; y <= 1; y += 2) {
        for (let z = -1; z <= 1; z += 2) {
          node.children.push({
            cx: node.cx + x * hs,
            cy: node.cy + y * hs,
            cz: node.cz + z * hs,
            halfSize: hs,
            entries: [],
            children: null,
            depth: node.depth + 1,
          });
        }
      }
    }

    // Redistribute entries
    const entries = [...node.entries];
    node.entries = [];
    for (const entry of entries) {
      let placed = false;
      for (const child of node.children) {
        if (this.containsPoint(child, entry.x, entry.y, entry.z)) {
          child.entries.push(entry);
          placed = true;
          break;
        }
      }
      if (!placed) node.entries.push(entry); // Keep in parent if doesn't fit
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private containsPoint(node: OctreeNode, x: number, y: number, z: number): boolean {
    return (
      Math.abs(x - node.cx) <= node.halfSize &&
      Math.abs(y - node.cy) <= node.halfSize &&
      Math.abs(z - node.cz) <= node.halfSize
    );
  }

  getEntryCount(): number {
    return this.entryCount;
  }
  clear(): void {
    this.root.entries = [];
    this.root.children = null;
    this.entryCount = 0;
  }
}
