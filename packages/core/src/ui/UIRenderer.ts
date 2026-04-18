/**
 * UIRenderer.ts
 *
 * Retained-mode UI tree: node hierarchy, hit testing,
 * focus/tab management, visibility, and rendering order.
 *
 * @module ui
 */

// =============================================================================
// TYPES
// =============================================================================

export type UINodeType =
  | 'container'
  | 'text'
  | 'image'
  | 'button'
  | 'slider'
  | 'toggle'
  | 'input'
  | 'dropdown'
  | 'progress'
  | 'custom';

export interface UIRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UIStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  visible?: boolean;
  pointerEvents?: boolean;
}

export interface UINode {
  id: string;
  type: UINodeType;
  rect: UIRect;
  style: UIStyle;
  children: UINode[];
  parent: UINode | null;
  data: Record<string, unknown>;
  interactive: boolean;
  focusable: boolean;
  zIndex: number;
  tag?: string;
}

export interface UIHitResult {
  node: UINode;
  localX: number;
  localY: number;
}

// =============================================================================
// UI RENDERER
// =============================================================================

let _uiNodeId = 0;

export class UIRenderer {
  private root: UINode;
  private nodeMap: Map<string, UINode> = new Map();
  private focusedNodeId: string | null = null;
  private focusOrder: string[] = [];
  private dirtyNodes: Set<string> = new Set();

  constructor() {
    this.root = this.createNode('container');
    this.root.rect = { x: 0, y: 0, width: 1920, height: 1080 };
  }

  // ---------------------------------------------------------------------------
  // Node Creation
  // ---------------------------------------------------------------------------

  createNode(type: UINodeType, tag?: string): UINode {
    const node: UINode = {
      id: `ui_${_uiNodeId++}`,
      type,
      rect: { x: 0, y: 0, width: 100, height: 30 },
      style: { visible: true, opacity: 1, pointerEvents: true },
      children: [],
      parent: null,
      data: {},
      interactive: type !== 'container' && type !== 'text' && type !== 'image',
      focusable: ['button', 'slider', 'toggle', 'input', 'dropdown'].includes(type),
      zIndex: 0,
      tag,
    };
    this.nodeMap.set(node.id, node);
    return node;
  }

  // ---------------------------------------------------------------------------
  // Hierarchy
  // ---------------------------------------------------------------------------

  addChild(parent: UINode, child: UINode): void {
    if (child.parent) this.removeChild(child.parent, child);
    child.parent = parent;
    parent.children.push(child);
    parent.children.sort((a, b) => a.zIndex - b.zIndex);
    this.rebuildFocusOrder();
    this.markDirty(parent.id);
  }

  removeChild(parent: UINode, child: UINode): void {
    const idx = parent.children.indexOf(child);
    if (idx >= 0) {
      parent.children.splice(idx, 1);
      child.parent = null;
      this.rebuildFocusOrder();
      this.markDirty(parent.id);
    }
  }

  removeNode(nodeId: string): boolean {
    const node = this.nodeMap.get(nodeId);
    if (!node) return false;
    if (node.parent) this.removeChild(node.parent, node);
    // Remove all descendants
    const removeDescendants = (n: UINode) => {
      for (const c of n.children) {
        removeDescendants(c);
        this.nodeMap.delete(c.id);
      }
    };
    removeDescendants(node);
    this.nodeMap.delete(nodeId);
    return true;
  }

  getRoot(): UINode {
    return this.root;
  }
  getNode(id: string): UINode | undefined {
    return this.nodeMap.get(id);
  }
  getNodeCount(): number {
    return this.nodeMap.size;
  }

  findByTag(tag: string): UINode | undefined {
    for (const node of this.nodeMap.values()) {
      if (node.tag === tag) return node;
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Hit Testing
  // ---------------------------------------------------------------------------

  hitTest(x: number, y: number): UIHitResult | null {
    return this.hitTestNode(this.root, x, y);
  }

  private hitTestNode(node: UINode, x: number, y: number): UIHitResult | null {
    if (node.style.visible === false || node.style.opacity === 0) return null;
    if (node.style.pointerEvents === false) return null;

    // Check children in reverse order (top-most first)
    for (let i = node.children.length - 1; i >= 0; i--) {
      const childResult = this.hitTestNode(node.children[i], x, y);
      if (childResult) return childResult;
    }

    // Check this node
    const r = this.getWorldRect(node);
    if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
      if (node.interactive) {
        return { node, localX: x - r.x, localY: y - r.y };
      }
    }

    return null;
  }

  getWorldRect(node: UINode): UIRect {
    let x = node.rect.x;
    let y = node.rect.y;
    let p = node.parent;
    while (p) {
      x += p.rect.x;
      y += p.rect.y;
      p = p.parent;
    }
    return { x, y, width: node.rect.width, height: node.rect.height };
  }

  // ---------------------------------------------------------------------------
  // Focus Management
  // ---------------------------------------------------------------------------

  setFocus(nodeId: string): boolean {
    const node = this.nodeMap.get(nodeId);
    if (!node || !node.focusable) return false;
    this.focusedNodeId = nodeId;
    return true;
  }

  getFocusedNode(): UINode | null {
    return this.focusedNodeId ? (this.nodeMap.get(this.focusedNodeId) ?? null) : null;
  }

  focusNext(): UINode | null {
    if (this.focusOrder.length === 0) return null;
    const currentIdx = this.focusedNodeId ? this.focusOrder.indexOf(this.focusedNodeId) : -1;
    const nextIdx = (currentIdx + 1) % this.focusOrder.length;
    this.focusedNodeId = this.focusOrder[nextIdx];
    return this.nodeMap.get(this.focusedNodeId) ?? null;
  }

  focusPrevious(): UINode | null {
    if (this.focusOrder.length === 0) return null;
    const currentIdx = this.focusedNodeId ? this.focusOrder.indexOf(this.focusedNodeId) : 0;
    const prevIdx = (currentIdx - 1 + this.focusOrder.length) % this.focusOrder.length;
    this.focusedNodeId = this.focusOrder[prevIdx];
    return this.nodeMap.get(this.focusedNodeId) ?? null;
  }

  clearFocus(): void {
    this.focusedNodeId = null;
  }

  private rebuildFocusOrder(): void {
    this.focusOrder = [];
    const walk = (node: UINode) => {
      if (node.focusable && node.style.visible !== false) {
        this.focusOrder.push(node.id);
      }
      for (const c of node.children) walk(c);
    };
    walk(this.root);
  }

  // ---------------------------------------------------------------------------
  // Dirty Tracking
  // ---------------------------------------------------------------------------

  markDirty(nodeId: string): void {
    this.dirtyNodes.add(nodeId);
  }
  getDirtyNodes(): string[] {
    return [...this.dirtyNodes];
  }
  clearDirty(): void {
    this.dirtyNodes.clear();
  }
}
