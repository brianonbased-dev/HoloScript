/**
 * HierarchyPanel — Scene hierarchy tree view for the editor
 *
 * Provides tree navigation, drag-reparenting, search/filter,
 * and visibility toggles for the scene graph.
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export interface HierarchyNode {
  id: string;
  name: string;
  parentId: string | null;
  childIds: string[];
  visible: boolean;
  locked: boolean;
  expanded: boolean;
  type: 'entity' | 'group' | 'prefab' | 'light' | 'camera';
  icon?: string;
}

export interface HierarchyFilter {
  query?: string;
  types?: HierarchyNode['type'][];
  visibleOnly?: boolean;
  unlockedOnly?: boolean;
}

export interface ReparentOperation {
  nodeId: string;
  oldParentId: string | null;
  newParentId: string | null;
  index: number;
}

// =============================================================================
// HIERARCHY PANEL
// =============================================================================

export class HierarchyPanel {
  private nodes: Map<string, HierarchyNode> = new Map();
  private selectedIds: Set<string> = new Set();
  private undoStack: ReparentOperation[] = [];
  private redoStack: ReparentOperation[] = [];

  /**
   * Add a node to the hierarchy
   */
  addNode(node: HierarchyNode): void {
    this.nodes.set(node.id, { ...node });

    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent && !parent.childIds.includes(node.id)) {
        parent.childIds.push(node.id);
      }
    }
  }

  /**
   * Remove a node and reparent its children to its parent
   */
  removeNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    // Reparent children
    for (const childId of node.childIds) {
      const child = this.nodes.get(childId);
      if (child) {
        child.parentId = node.parentId;
        if (node.parentId) {
          const parent = this.nodes.get(node.parentId);
          if (parent) parent.childIds.push(childId);
        }
      }
    }

    // Remove from parent
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        parent.childIds = parent.childIds.filter((id) => id !== nodeId);
      }
    }

    this.selectedIds.delete(nodeId);
    this.nodes.delete(nodeId);
  }

  /**
   * Reparent a node (drag-and-drop)
   */
  reparent(nodeId: string, newParentId: string | null, index: number = -1): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    if (nodeId === newParentId) return;

    // Prevent reparenting into own descendants
    if (newParentId && this.isDescendant(newParentId, nodeId)) return;

    const oldParentId = node.parentId;

    // Store for undo
    this.undoStack.push({ nodeId, oldParentId, newParentId, index });
    this.redoStack = [];

    // Remove from old parent
    if (oldParentId) {
      const oldParent = this.nodes.get(oldParentId);
      if (oldParent) {
        oldParent.childIds = oldParent.childIds.filter((id) => id !== nodeId);
      }
    }

    // Add to new parent
    node.parentId = newParentId;
    if (newParentId) {
      const newParent = this.nodes.get(newParentId);
      if (newParent) {
        if (index >= 0 && index < newParent.childIds.length) {
          newParent.childIds.splice(index, 0, nodeId);
        } else {
          newParent.childIds.push(nodeId);
        }
      }
    }
  }

  /**
   * Check if a node is a descendant of another
   */
  isDescendant(nodeId: string, ancestorId: string): boolean {
    let current = this.nodes.get(nodeId);
    while (current) {
      if (current.parentId === ancestorId) return true;
      current = current.parentId ? this.nodes.get(current.parentId) : undefined;
    }
    return false;
  }

  /**
   * Toggle node visibility
   */
  toggleVisibility(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) node.visible = !node.visible;
  }

  /**
   * Toggle node locked state
   */
  toggleLocked(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) node.locked = !node.locked;
  }

  /**
   * Toggle node expanded state
   */
  toggleExpanded(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) node.expanded = !node.expanded;
  }

  /**
   * Select a node (multi-select with additive flag)
   */
  select(nodeId: string, additive: boolean = false): void {
    if (!additive) this.selectedIds.clear();
    this.selectedIds.add(nodeId);
  }

  /**
   * Deselect a node
   */
  deselect(nodeId: string): void {
    this.selectedIds.delete(nodeId);
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.selectedIds.clear();
  }

  /**
   * Get selected node IDs
   */
  getSelection(): string[] {
    return [...this.selectedIds];
  }

  /**
   * Filter nodes by search query and criteria
   */
  filter(filter: HierarchyFilter): HierarchyNode[] {
    let results = [...this.nodes.values()];

    if (filter.query) {
      const q = filter.query.toLowerCase();
      results = results.filter((n) => n.name.toLowerCase().includes(q));
    }

    if (filter.types && filter.types.length > 0) {
      results = results.filter((n) => filter.types!.includes(n.type));
    }

    if (filter.visibleOnly) {
      results = results.filter((n) => n.visible);
    }

    if (filter.unlockedOnly) {
      results = results.filter((n) => !n.locked);
    }

    return results;
  }

  /**
   * Get root nodes (no parent)
   */
  getRoots(): HierarchyNode[] {
    return [...this.nodes.values()].filter((n) => n.parentId === null);
  }

  /**
   * Get children of a node
   */
  getChildren(nodeId: string): HierarchyNode[] {
    const node = this.nodes.get(nodeId);
    if (!node) return [];
    return node.childIds.map((id) => this.nodes.get(id)!).filter(Boolean);
  }

  /**
   * Get node by ID
   */
  getNode(nodeId: string): HierarchyNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get total node count
   */
  getCount(): number {
    return this.nodes.size;
  }

  /**
   * Get flattened visible tree (DFS with expand/collapse)
   */
  getFlatTree(): HierarchyNode[] {
    const result: HierarchyNode[] = [];
    const visit = (nodeId: string) => {
      const node = this.nodes.get(nodeId);
      if (!node) return;
      result.push(node);
      if (node.expanded) {
        for (const childId of node.childIds) {
          visit(childId);
        }
      }
    };
    for (const root of this.getRoots()) {
      visit(root.id);
    }
    return result;
  }

  /**
   * Undo last reparent
   */
  undo(): void {
    const op = this.undoStack.pop();
    if (!op) return;
    this.redoStack.push(op);
    this.reparentInternal(op.nodeId, op.oldParentId);
  }

  /**
   * Get undo stack size
   */
  getUndoCount(): number {
    return this.undoStack.length;
  }

  private reparentInternal(nodeId: string, targetParentId: string | null): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    if (node.parentId) {
      const oldParent = this.nodes.get(node.parentId);
      if (oldParent) {
        oldParent.childIds = oldParent.childIds.filter((id) => id !== nodeId);
      }
    }

    node.parentId = targetParentId;
    if (targetParentId) {
      const newParent = this.nodes.get(targetParentId);
      if (newParent) newParent.childIds.push(nodeId);
    }
  }
}
