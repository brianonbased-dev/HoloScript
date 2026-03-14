/**
 * DragDropSceneEditor.ts
 *
 * Viewport for drag-and-drop scene composition in HoloScript.
 * Provides raycasting for object selection, transform gizmos
 * (translate/rotate/scale), snap-to-grid, undo/redo stack,
 * multi-select, and grouping.
 *
 * This editor operates on a scene graph represented as EditorNode objects,
 * independent of any specific 3D engine. The consuming platform provides
 * a renderer adapter to bridge editor operations to actual scene updates.
 *
 * @module DragDropSceneEditor
 */

// =============================================================================
// Types & Interfaces
// =============================================================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface BoundingBox {
  min: Vec3;
  max: Vec3;
}

export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

export interface RaycastHit {
  nodeId: string;
  point: Vec3;
  normal: Vec3;
  distance: number;
}

export type TransformMode = 'translate' | 'rotate' | 'scale';
export type TransformSpace = 'local' | 'world';
export type GizmoAxis = 'x' | 'y' | 'z' | 'xy' | 'xz' | 'yz' | 'xyz';

export interface EditorNode {
  id: string;
  name: string;
  parentId: string | null;
  position: Vec3;
  rotation: Vec3;  // Euler angles in radians
  scale: Vec3;
  visible: boolean;
  locked: boolean;
  boundingBox: BoundingBox;
  metadata: Record<string, unknown>;
  children: string[];
}

export interface EditorGroup {
  id: string;
  name: string;
  nodeIds: string[];
  locked: boolean;
  visible: boolean;
}

export interface SnapConfig {
  /** Enable position snapping */
  positionSnap: boolean;
  /** Position snap increment */
  positionIncrement: number;
  /** Enable rotation snapping */
  rotationSnap: boolean;
  /** Rotation snap increment in degrees */
  rotationIncrement: number;
  /** Enable scale snapping */
  scaleSnap: boolean;
  /** Scale snap increment */
  scaleIncrement: number;
  /** Snap to surface normals */
  surfaceSnap: boolean;
  /** Snap to other objects */
  objectSnap: boolean;
  /** Object snap distance threshold */
  objectSnapDistance: number;
}

export interface GizmoConfig {
  /** Gizmo size in screen pixels */
  size: number;
  /** Gizmo line thickness */
  lineWidth: number;
  /** Axis colors */
  colors: {
    x: string;
    y: string;
    z: string;
    hover: string;
    active: string;
  };
  /** Show axis labels */
  showLabels: boolean;
  /** Gizmo opacity */
  opacity: number;
}

export interface EditorConfig {
  /** Maximum undo/redo history depth */
  maxUndoHistory?: number;
  /** Enable multi-select */
  multiSelect?: boolean;
  /** Enable grouping */
  grouping?: boolean;
  /** Grid visibility */
  showGrid?: boolean;
  /** Grid size */
  gridSize?: number;
  /** Grid divisions */
  gridDivisions?: number;
  /** Selection highlight color */
  selectionColor?: string;
  /** Multi-selection highlight color */
  multiSelectionColor?: string;
  /** Default snap configuration */
  snap?: Partial<SnapConfig>;
  /** Default gizmo configuration */
  gizmo?: Partial<GizmoConfig>;
}

// =============================================================================
// Undo/Redo System
// =============================================================================

export type CommandType =
  | 'transform'
  | 'add'
  | 'delete'
  | 'group'
  | 'ungroup'
  | 'reparent'
  | 'rename'
  | 'visibility'
  | 'lock'
  | 'property';

export interface EditorCommand {
  type: CommandType;
  description: string;
  timestamp: number;
  data: CommandData;
}

export interface TransformData {
  nodeIds: string[];
  before: { position: Vec3; rotation: Vec3; scale: Vec3 }[];
  after: { position: Vec3; rotation: Vec3; scale: Vec3 }[];
}

export interface AddDeleteData {
  nodes: EditorNode[];
}

export interface GroupData {
  groupId: string;
  nodeIds: string[];
  groupName: string;
}

export interface ReparentData {
  nodeId: string;
  oldParentId: string | null;
  newParentId: string | null;
}

export interface RenameData {
  nodeId: string;
  oldName: string;
  newName: string;
}

export interface VisibilityData {
  nodeIds: string[];
  oldVisible: boolean[];
  newVisible: boolean[];
}

export interface LockData {
  nodeIds: string[];
  oldLocked: boolean[];
  newLocked: boolean[];
}

export interface PropertyData {
  nodeId: string;
  property: string;
  oldValue: unknown;
  newValue: unknown;
}

export type CommandData =
  | TransformData
  | AddDeleteData
  | GroupData
  | ReparentData
  | RenameData
  | VisibilityData
  | LockData
  | PropertyData;

// =============================================================================
// Event Types
// =============================================================================

export type EditorEventType =
  | 'selection-changed'
  | 'transform-start'
  | 'transform-update'
  | 'transform-end'
  | 'node-added'
  | 'node-deleted'
  | 'node-renamed'
  | 'group-created'
  | 'group-dissolved'
  | 'undo'
  | 'redo'
  | 'mode-changed'
  | 'snap-changed'
  | 'drag-enter'
  | 'drag-over'
  | 'drop';

export interface EditorEvent {
  type: EditorEventType;
  timestamp: number;
  data?: unknown;
}

type EventHandler = (event: EditorEvent) => void;

// =============================================================================
// Renderer Adapter Interface
// =============================================================================

/**
 * Platform-specific rendering adapter.
 * The consuming engine (Three.js, Babylon, etc.) implements this interface
 * to bridge the editor's logical operations to the actual scene.
 */
export interface RendererAdapter {
  /** Perform a ray-scene intersection */
  raycast(ray: Ray): RaycastHit[];
  /** Convert screen coordinates to a ray */
  screenToRay(screenX: number, screenY: number, canvasWidth: number, canvasHeight: number): Ray;
  /** Update a node's transform in the renderer */
  updateTransform(nodeId: string, position: Vec3, rotation: Vec3, scale: Vec3): void;
  /** Add a highlight to a node */
  setHighlight(nodeId: string, color: string, opacity: number): void;
  /** Remove highlight from a node */
  clearHighlight(nodeId: string): void;
  /** Render a transform gizmo at a position */
  renderGizmo(position: Vec3, rotation: Vec3, mode: TransformMode, activeAxis: GizmoAxis | null): void;
  /** Hide the transform gizmo */
  hideGizmo(): void;
  /** Check which gizmo axis is under the cursor */
  hitTestGizmo(ray: Ray): GizmoAxis | null;
  /** Get node's current bounding box */
  getBoundingBox(nodeId: string): BoundingBox | null;
  /** Create a node in the renderer */
  createNode(node: EditorNode): void;
  /** Remove a node from the renderer */
  removeNode(nodeId: string): void;
  /** Show/hide selection box for multi-select */
  renderSelectionBox(startX: number, startY: number, endX: number, endY: number): void;
  /** Hide selection box */
  hideSelectionBox(): void;
}

// =============================================================================
// Utility Functions
// =============================================================================

function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vec3Scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function vec3Copy(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

function vec3Equals(a: Vec3, b: Vec3, epsilon: number = 0.0001): boolean {
  return (
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon &&
    Math.abs(a.z - b.z) < epsilon
  );
}

function snapValue(value: number, increment: number): number {
  if (increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

function snapVec3(v: Vec3, increment: number): Vec3 {
  return {
    x: snapValue(v.x, increment),
    y: snapValue(v.y, increment),
    z: snapValue(v.z, increment),
  };
}

function generateId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function radToDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

function boxCenter(box: BoundingBox): Vec3 {
  return {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  };
}

// =============================================================================
// DragDropSceneEditor
// =============================================================================

/**
 * DragDropSceneEditor provides a complete scene editing viewport with
 * object selection, transform gizmos, snap-to-grid, undo/redo, multi-select,
 * and grouping support.
 */
export class DragDropSceneEditor {
  // Scene graph
  private nodes: Map<string, EditorNode> = new Map();
  private groups: Map<string, EditorGroup> = new Map();

  // Selection
  private selectedNodeIds: Set<string> = new Set();
  private hoveredNodeId: string | null = null;

  // Transform state
  private transformMode: TransformMode = 'translate';
  private transformSpace: TransformSpace = 'world';
  private activeAxis: GizmoAxis | null = null;
  private isTransforming: boolean = false;
  private transformStartPositions: Map<string, Vec3> = new Map();
  private transformStartRotations: Map<string, Vec3> = new Map();
  private transformStartScales: Map<string, Vec3> = new Map();
  private lastMouseRay: Ray | null = null;
  private transformDragStartPoint: Vec3 | null = null;

  // Multi-select box
  private isBoxSelecting: boolean = false;
  private boxSelectStart: { x: number; y: number } = { x: 0, y: 0 };
  private boxSelectEnd: { x: number; y: number } = { x: 0, y: 0 };

  // Snap configuration
  private snapConfig: SnapConfig;

  // Gizmo configuration
  private gizmoConfig: GizmoConfig;

  // Undo/Redo
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];
  private maxUndoHistory: number;

  // Clipboard
  private clipboard: EditorNode[] = [];

  // Configuration
  private multiSelectEnabled: boolean;
  private groupingEnabled: boolean;
  private selectionColor: string;
  private multiSelectionColor: string;

  // Renderer adapter
  private renderer: RendererAdapter | null = null;

  // Events
  private eventHandlers: Map<EditorEventType, Set<EventHandler>> = new Map();

  constructor(config: EditorConfig = {}) {
    this.maxUndoHistory = config.maxUndoHistory ?? 100;
    this.multiSelectEnabled = config.multiSelect ?? true;
    this.groupingEnabled = config.grouping ?? true;
    this.selectionColor = config.selectionColor ?? '#4488ff';
    this.multiSelectionColor = config.multiSelectionColor ?? '#88aaff';

    this.snapConfig = {
      positionSnap: config.snap?.positionSnap ?? false,
      positionIncrement: config.snap?.positionIncrement ?? 0.5,
      rotationSnap: config.snap?.rotationSnap ?? false,
      rotationIncrement: config.snap?.rotationIncrement ?? 15,
      scaleSnap: config.snap?.scaleSnap ?? false,
      scaleIncrement: config.snap?.scaleIncrement ?? 0.1,
      surfaceSnap: config.snap?.surfaceSnap ?? false,
      objectSnap: config.snap?.objectSnap ?? false,
      objectSnapDistance: config.snap?.objectSnapDistance ?? 0.5,
    };

    this.gizmoConfig = {
      size: config.gizmo?.size ?? 80,
      lineWidth: config.gizmo?.lineWidth ?? 3,
      colors: config.gizmo?.colors ?? {
        x: '#ff4444',
        y: '#44ff44',
        z: '#4444ff',
        hover: '#ffff44',
        active: '#ffffff',
      },
      showLabels: config.gizmo?.showLabels ?? true,
      opacity: config.gizmo?.opacity ?? 0.8,
    };
  }

  // ===========================================================================
  // Renderer Adapter
  // ===========================================================================

  /**
   * Attach the renderer adapter.
   */
  setRenderer(renderer: RendererAdapter): void {
    this.renderer = renderer;
  }

  // ===========================================================================
  // Scene Graph Operations
  // ===========================================================================

  /**
   * Add a node to the scene.
   */
  addNode(node: EditorNode, recordUndo: boolean = true): void {
    this.nodes.set(node.id, { ...node, children: [...node.children] });

    // Update parent's children list
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent && !parent.children.includes(node.id)) {
        parent.children.push(node.id);
      }
    }

    this.renderer?.createNode(node);

    if (recordUndo) {
      this.pushCommand({
        type: 'add',
        description: `Add "${node.name}"`,
        timestamp: Date.now(),
        data: { nodes: [{ ...node }] } as AddDeleteData,
      });
    }

    this.emitEvent('node-added', { nodeId: node.id, name: node.name });
  }

  /**
   * Remove a node from the scene.
   */
  deleteNode(nodeId: string, recordUndo: boolean = true): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    // Prevent deleting locked nodes
    if (node.locked) {
      console.warn(`[Editor] Cannot delete locked node "${node.name}".`);
      return;
    }

    // Recursively collect children for undo
    const deletedNodes: EditorNode[] = [];
    this.collectSubtree(nodeId, deletedNodes);

    // Remove from selection
    this.selectedNodeIds.delete(nodeId);

    // Remove from parent
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        parent.children = parent.children.filter((id) => id !== nodeId);
      }
    }

    // Remove from groups
    for (const group of this.groups.values()) {
      group.nodeIds = group.nodeIds.filter((id) => id !== nodeId);
    }

    // Remove node and children from the map
    for (const deleted of deletedNodes) {
      this.nodes.delete(deleted.id);
      this.renderer?.removeNode(deleted.id);
      this.renderer?.clearHighlight(deleted.id);
    }

    if (recordUndo) {
      this.pushCommand({
        type: 'delete',
        description: `Delete "${node.name}"`,
        timestamp: Date.now(),
        data: { nodes: deletedNodes } as AddDeleteData,
      });
    }

    this.emitEvent('node-deleted', { nodeId, name: node.name });
    this.emitEvent('selection-changed', { selectedIds: Array.from(this.selectedNodeIds) });
  }

  /**
   * Recursively collect a node and its subtree.
   */
  private collectSubtree(nodeId: string, result: EditorNode[]): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    result.push({ ...node, children: [...node.children] });
    for (const childId of node.children) {
      this.collectSubtree(childId, result);
    }
  }

  /**
   * Get a node by ID.
   */
  getNode(nodeId: string): EditorNode | undefined {
    const node = this.nodes.get(nodeId);
    return node ? { ...node } : undefined;
  }

  /**
   * Get all nodes.
   */
  getAllNodes(): EditorNode[] {
    return Array.from(this.nodes.values()).map((n) => ({ ...n }));
  }

  /**
   * Get root nodes (no parent).
   */
  getRootNodes(): EditorNode[] {
    return Array.from(this.nodes.values())
      .filter((n) => n.parentId === null)
      .map((n) => ({ ...n }));
  }

  /**
   * Rename a node.
   */
  renameNode(nodeId: string, newName: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    const oldName = node.name;
    node.name = newName;

    this.pushCommand({
      type: 'rename',
      description: `Rename "${oldName}" to "${newName}"`,
      timestamp: Date.now(),
      data: { nodeId, oldName, newName } as RenameData,
    });

    this.emitEvent('node-renamed', { nodeId, oldName, newName });
  }

  /**
   * Reparent a node.
   */
  reparentNode(nodeId: string, newParentId: string | null): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    const oldParentId = node.parentId;

    // Remove from old parent
    if (oldParentId) {
      const oldParent = this.nodes.get(oldParentId);
      if (oldParent) {
        oldParent.children = oldParent.children.filter((id) => id !== nodeId);
      }
    }

    // Add to new parent
    node.parentId = newParentId;
    if (newParentId) {
      const newParent = this.nodes.get(newParentId);
      if (newParent && !newParent.children.includes(nodeId)) {
        newParent.children.push(nodeId);
      }
    }

    this.pushCommand({
      type: 'reparent',
      description: `Reparent "${node.name}"`,
      timestamp: Date.now(),
      data: { nodeId, oldParentId, newParentId } as ReparentData,
    });
  }

  // ===========================================================================
  // Selection
  // ===========================================================================

  /**
   * Select a single node. Deselects all others unless additive is true.
   */
  select(nodeId: string, additive: boolean = false): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    if (!additive || !this.multiSelectEnabled) {
      // Clear current selection highlights
      for (const id of this.selectedNodeIds) {
        this.renderer?.clearHighlight(id);
      }
      this.selectedNodeIds.clear();
    }

    this.selectedNodeIds.add(nodeId);

    // Apply highlight
    const color = this.selectedNodeIds.size > 1 ? this.multiSelectionColor : this.selectionColor;
    for (const id of this.selectedNodeIds) {
      this.renderer?.setHighlight(id, color, 0.4);
    }

    this.updateGizmo();
    this.emitEvent('selection-changed', { selectedIds: Array.from(this.selectedNodeIds) });
  }

  /**
   * Deselect a specific node.
   */
  deselect(nodeId: string): void {
    if (!this.selectedNodeIds.has(nodeId)) return;

    this.selectedNodeIds.delete(nodeId);
    this.renderer?.clearHighlight(nodeId);

    this.updateGizmo();
    this.emitEvent('selection-changed', { selectedIds: Array.from(this.selectedNodeIds) });
  }

  /**
   * Deselect all nodes.
   */
  deselectAll(): void {
    for (const id of this.selectedNodeIds) {
      this.renderer?.clearHighlight(id);
    }
    this.selectedNodeIds.clear();
    this.renderer?.hideGizmo();
    this.emitEvent('selection-changed', { selectedIds: [] });
  }

  /**
   * Select all nodes.
   */
  selectAll(): void {
    this.selectedNodeIds.clear();
    for (const [id, node] of this.nodes) {
      if (!node.locked) {
        this.selectedNodeIds.add(id);
        this.renderer?.setHighlight(id, this.multiSelectionColor, 0.4);
      }
    }
    this.updateGizmo();
    this.emitEvent('selection-changed', { selectedIds: Array.from(this.selectedNodeIds) });
  }

  /**
   * Get the currently selected node IDs.
   */
  getSelection(): string[] {
    return Array.from(this.selectedNodeIds);
  }

  /**
   * Check if a node is selected.
   */
  isSelected(nodeId: string): boolean {
    return this.selectedNodeIds.has(nodeId);
  }

  // ===========================================================================
  // Transform Gizmo
  // ===========================================================================

  /**
   * Set the transform mode (translate/rotate/scale).
   */
  setTransformMode(mode: TransformMode): void {
    this.transformMode = mode;
    this.updateGizmo();
    this.emitEvent('mode-changed', { mode });
  }

  /**
   * Get the current transform mode.
   */
  getTransformMode(): TransformMode {
    return this.transformMode;
  }

  /**
   * Set the transform space (local/world).
   */
  setTransformSpace(space: TransformSpace): void {
    this.transformSpace = space;
    this.updateGizmo();
  }

  /**
   * Toggle the transform space between local and world.
   */
  toggleTransformSpace(): void {
    this.transformSpace = this.transformSpace === 'world' ? 'local' : 'world';
    this.updateGizmo();
  }

  /**
   * Update the gizmo position and rendering.
   */
  private updateGizmo(): void {
    if (this.selectedNodeIds.size === 0) {
      this.renderer?.hideGizmo();
      return;
    }

    const center = this.getSelectionCenter();
    const rotation = this.getSelectionRotation();

    this.renderer?.renderGizmo(center, rotation, this.transformMode, this.activeAxis);
  }

  /**
   * Get the center point of all selected nodes.
   */
  private getSelectionCenter(): Vec3 {
    if (this.selectedNodeIds.size === 0) return vec3(0, 0, 0);

    let sum = vec3(0, 0, 0);
    for (const id of this.selectedNodeIds) {
      const node = this.nodes.get(id);
      if (node) {
        sum = vec3Add(sum, node.position);
      }
    }

    return vec3Scale(sum, 1 / this.selectedNodeIds.size);
  }

  /**
   * Get the rotation for the gizmo (first selected node's rotation in local space).
   */
  private getSelectionRotation(): Vec3 {
    if (this.transformSpace === 'world' || this.selectedNodeIds.size === 0) {
      return vec3(0, 0, 0);
    }

    const firstId = Array.from(this.selectedNodeIds)[0];
    const node = this.nodes.get(firstId);
    return node ? vec3Copy(node.rotation) : vec3(0, 0, 0);
  }

  // ===========================================================================
  // Mouse/Pointer Input Handling
  // ===========================================================================

  /**
   * Handle pointer down event.
   *
   * @param screenX Cursor X position
   * @param screenY Cursor Y position
   * @param canvasWidth Canvas width
   * @param canvasHeight Canvas height
   * @param shiftKey Whether shift is held (for additive selection)
   */
  onPointerDown(
    screenX: number,
    screenY: number,
    canvasWidth: number,
    canvasHeight: number,
    shiftKey: boolean = false,
  ): void {
    if (!this.renderer) return;

    const ray = this.renderer.screenToRay(screenX, screenY, canvasWidth, canvasHeight);
    this.lastMouseRay = ray;

    // Check gizmo hit first
    if (this.selectedNodeIds.size > 0) {
      const gizmoAxis = this.renderer.hitTestGizmo(ray);
      if (gizmoAxis) {
        this.startTransform(gizmoAxis, ray);
        return;
      }
    }

    // Raycast scene
    const hits = this.renderer.raycast(ray);
    const validHits = hits.filter((h) => {
      const node = this.nodes.get(h.nodeId);
      return node && !node.locked;
    });

    if (validHits.length > 0) {
      const closest = validHits[0];
      if (shiftKey && this.multiSelectEnabled) {
        if (this.selectedNodeIds.has(closest.nodeId)) {
          this.deselect(closest.nodeId);
        } else {
          this.select(closest.nodeId, true);
        }
      } else {
        this.select(closest.nodeId, false);
      }
    } else if (!shiftKey) {
      // Begin box selection or deselect
      this.isBoxSelecting = true;
      this.boxSelectStart = { x: screenX, y: screenY };
      this.boxSelectEnd = { x: screenX, y: screenY };
      this.deselectAll();
    }
  }

  /**
   * Handle pointer move event.
   */
  onPointerMove(
    screenX: number,
    screenY: number,
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    if (!this.renderer) return;

    const ray = this.renderer.screenToRay(screenX, screenY, canvasWidth, canvasHeight);

    if (this.isTransforming && this.lastMouseRay) {
      this.updateTransform(ray);
      this.lastMouseRay = ray;
      return;
    }

    if (this.isBoxSelecting) {
      this.boxSelectEnd = { x: screenX, y: screenY };
      this.renderer.renderSelectionBox(
        this.boxSelectStart.x,
        this.boxSelectStart.y,
        screenX,
        screenY,
      );
      return;
    }

    // Hover detection
    const gizmoAxis = this.selectedNodeIds.size > 0 ? this.renderer.hitTestGizmo(ray) : null;
    if (gizmoAxis) {
      this.activeAxis = gizmoAxis;
      this.updateGizmo();
      return;
    } else if (this.activeAxis) {
      this.activeAxis = null;
      this.updateGizmo();
    }

    // Hover highlight
    const hits = this.renderer.raycast(ray);
    const validHits = hits.filter((h) => {
      const node = this.nodes.get(h.nodeId);
      return node && !node.locked;
    });

    const newHoveredId = validHits.length > 0 ? validHits[0].nodeId : null;
    if (newHoveredId !== this.hoveredNodeId) {
      // Clear old hover (only if not selected)
      if (this.hoveredNodeId && !this.selectedNodeIds.has(this.hoveredNodeId)) {
        this.renderer.clearHighlight(this.hoveredNodeId);
      }
      // Set new hover
      if (newHoveredId && !this.selectedNodeIds.has(newHoveredId)) {
        this.renderer.setHighlight(newHoveredId, this.selectionColor, 0.2);
      }
      this.hoveredNodeId = newHoveredId;
    }

    this.lastMouseRay = ray;
  }

  /**
   * Handle pointer up event.
   */
  onPointerUp(
    screenX: number,
    screenY: number,
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    if (this.isTransforming) {
      this.endTransform();
    }

    if (this.isBoxSelecting) {
      this.isBoxSelecting = false;
      this.renderer?.hideSelectionBox();
      this.performBoxSelect(canvasWidth, canvasHeight);
    }
  }

  // ===========================================================================
  // Transform Operations
  // ===========================================================================

  /**
   * Begin a transform operation.
   */
  private startTransform(axis: GizmoAxis, ray: Ray): void {
    this.isTransforming = true;
    this.activeAxis = axis;
    this.transformDragStartPoint = this.getSelectionCenter();

    // Store initial transforms
    this.transformStartPositions.clear();
    this.transformStartRotations.clear();
    this.transformStartScales.clear();

    for (const id of this.selectedNodeIds) {
      const node = this.nodes.get(id);
      if (node) {
        this.transformStartPositions.set(id, vec3Copy(node.position));
        this.transformStartRotations.set(id, vec3Copy(node.rotation));
        this.transformStartScales.set(id, vec3Copy(node.scale));
      }
    }

    this.emitEvent('transform-start', {
      mode: this.transformMode,
      axis,
      nodeIds: Array.from(this.selectedNodeIds),
    });
  }

  /**
   * Update the ongoing transform based on pointer movement.
   */
  private updateTransform(ray: Ray): void {
    if (!this.transformDragStartPoint || !this.lastMouseRay) return;

    // Compute delta in world space (simplified planar projection)
    const delta = this.computeTransformDelta(this.lastMouseRay, ray);

    for (const id of this.selectedNodeIds) {
      const node = this.nodes.get(id);
      if (!node) continue;

      const startPos = this.transformStartPositions.get(id);
      const startRot = this.transformStartRotations.get(id);
      const startScale = this.transformStartScales.get(id);
      if (!startPos || !startRot || !startScale) continue;

      switch (this.transformMode) {
        case 'translate': {
          let newPos = vec3Add(startPos, delta);
          if (this.snapConfig.positionSnap) {
            newPos = snapVec3(newPos, this.snapConfig.positionIncrement);
          }
          node.position = newPos;
          break;
        }
        case 'rotate': {
          let rotDelta = delta;
          if (this.snapConfig.rotationSnap) {
            const increment = degToRad(this.snapConfig.rotationIncrement);
            rotDelta = snapVec3(rotDelta, increment);
          }
          node.rotation = vec3Add(startRot, rotDelta);
          break;
        }
        case 'scale': {
          let scaleDelta = vec3(
            1 + delta.x * 0.01,
            1 + delta.y * 0.01,
            1 + delta.z * 0.01,
          );
          if (this.snapConfig.scaleSnap) {
            scaleDelta = snapVec3(scaleDelta, this.snapConfig.scaleIncrement);
          }
          node.scale = {
            x: startScale.x * scaleDelta.x,
            y: startScale.y * scaleDelta.y,
            z: startScale.z * scaleDelta.z,
          };
          break;
        }
      }

      this.renderer?.updateTransform(id, node.position, node.rotation, node.scale);
    }

    this.updateGizmo();
    this.emitEvent('transform-update', {
      mode: this.transformMode,
      axis: this.activeAxis,
      delta,
    });
  }

  /**
   * Compute the transform delta between two rays, constrained to the active axis.
   */
  private computeTransformDelta(prevRay: Ray, currentRay: Ray): Vec3 {
    // Simplified: use ray direction differences scaled by distance
    const sensitivity = 5;
    const dx = (currentRay.direction.x - prevRay.direction.x) * sensitivity;
    const dy = (currentRay.direction.y - prevRay.direction.y) * sensitivity;
    const dz = (currentRay.direction.z - prevRay.direction.z) * sensitivity;

    switch (this.activeAxis) {
      case 'x':
        return vec3(dx, 0, 0);
      case 'y':
        return vec3(0, dy, 0);
      case 'z':
        return vec3(0, 0, dz);
      case 'xy':
        return vec3(dx, dy, 0);
      case 'xz':
        return vec3(dx, 0, dz);
      case 'yz':
        return vec3(0, dy, dz);
      case 'xyz':
        return vec3(dx, dy, dz);
      default:
        return vec3(dx, dy, dz);
    }
  }

  /**
   * End the transform and push to undo stack.
   */
  private endTransform(): void {
    if (!this.isTransforming) return;

    const nodeIds = Array.from(this.selectedNodeIds);
    const before: { position: Vec3; rotation: Vec3; scale: Vec3 }[] = [];
    const after: { position: Vec3; rotation: Vec3; scale: Vec3 }[] = [];

    for (const id of nodeIds) {
      const startPos = this.transformStartPositions.get(id);
      const startRot = this.transformStartRotations.get(id);
      const startScale = this.transformStartScales.get(id);
      const node = this.nodes.get(id);

      if (startPos && startRot && startScale && node) {
        before.push({
          position: vec3Copy(startPos),
          rotation: vec3Copy(startRot),
          scale: vec3Copy(startScale),
        });
        after.push({
          position: vec3Copy(node.position),
          rotation: vec3Copy(node.rotation),
          scale: vec3Copy(node.scale),
        });
      }
    }

    // Only record if something actually changed
    const hasChanged = before.some((b, i) => {
      const a = after[i];
      return !vec3Equals(b.position, a.position) ||
             !vec3Equals(b.rotation, a.rotation) ||
             !vec3Equals(b.scale, a.scale);
    });

    if (hasChanged) {
      this.pushCommand({
        type: 'transform',
        description: `${this.transformMode} ${nodeIds.length} node(s)`,
        timestamp: Date.now(),
        data: { nodeIds, before, after } as TransformData,
      });
    }

    this.isTransforming = false;
    this.activeAxis = null;
    this.transformDragStartPoint = null;
    this.transformStartPositions.clear();
    this.transformStartRotations.clear();
    this.transformStartScales.clear();

    this.updateGizmo();
    this.emitEvent('transform-end', { mode: this.transformMode });
  }

  /**
   * Perform a box selection based on the recorded box coordinates.
   */
  private performBoxSelect(canvasWidth: number, canvasHeight: number): void {
    if (!this.renderer) return;

    const minX = Math.min(this.boxSelectStart.x, this.boxSelectEnd.x);
    const maxX = Math.max(this.boxSelectStart.x, this.boxSelectEnd.x);
    const minY = Math.min(this.boxSelectStart.y, this.boxSelectEnd.y);
    const maxY = Math.max(this.boxSelectStart.y, this.boxSelectEnd.y);

    // Skip if box is too small (likely a click, not a drag)
    if (maxX - minX < 5 && maxY - minY < 5) return;

    // Sample rays across the selection box
    const stepX = Math.max((maxX - minX) / 10, 1);
    const stepY = Math.max((maxY - minY) / 10, 1);
    const hitNodeIds = new Set<string>();

    for (let x = minX; x <= maxX; x += stepX) {
      for (let y = minY; y <= maxY; y += stepY) {
        const ray = this.renderer.screenToRay(x, y, canvasWidth, canvasHeight);
        const hits = this.renderer.raycast(ray);
        for (const hit of hits) {
          const node = this.nodes.get(hit.nodeId);
          if (node && !node.locked) {
            hitNodeIds.add(hit.nodeId);
          }
        }
      }
    }

    for (const id of hitNodeIds) {
      this.select(id, true);
    }
  }

  // ===========================================================================
  // Snap Configuration
  // ===========================================================================

  /**
   * Configure snapping.
   */
  setSnapConfig(config: Partial<SnapConfig>): void {
    Object.assign(this.snapConfig, config);
    this.emitEvent('snap-changed', { snap: { ...this.snapConfig } });
  }

  /**
   * Get the current snap configuration.
   */
  getSnapConfig(): SnapConfig {
    return { ...this.snapConfig };
  }

  /**
   * Toggle position snapping.
   */
  togglePositionSnap(): void {
    this.snapConfig.positionSnap = !this.snapConfig.positionSnap;
    this.emitEvent('snap-changed', { snap: { ...this.snapConfig } });
  }

  /**
   * Toggle rotation snapping.
   */
  toggleRotationSnap(): void {
    this.snapConfig.rotationSnap = !this.snapConfig.rotationSnap;
    this.emitEvent('snap-changed', { snap: { ...this.snapConfig } });
  }

  // ===========================================================================
  // Grouping
  // ===========================================================================

  /**
   * Group the currently selected nodes.
   */
  groupSelected(groupName?: string): string | null {
    if (!this.groupingEnabled) return null;
    if (this.selectedNodeIds.size < 2) {
      console.warn('[Editor] Need at least 2 nodes to create a group.');
      return null;
    }

    const groupId = `group_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nodeIds = Array.from(this.selectedNodeIds);
    const name = groupName ?? `Group ${this.groups.size + 1}`;

    const group: EditorGroup = {
      id: groupId,
      name,
      nodeIds: [...nodeIds],
      locked: false,
      visible: true,
    };

    this.groups.set(groupId, group);

    this.pushCommand({
      type: 'group',
      description: `Group ${nodeIds.length} nodes as "${name}"`,
      timestamp: Date.now(),
      data: { groupId, nodeIds, groupName: name } as GroupData,
    });

    this.emitEvent('group-created', { groupId, name, nodeIds });
    return groupId;
  }

  /**
   * Dissolve a group (ungroup).
   */
  dissolveGroup(groupId: string): void {
    const group = this.groups.get(groupId);
    if (!group) return;

    this.pushCommand({
      type: 'ungroup',
      description: `Ungroup "${group.name}"`,
      timestamp: Date.now(),
      data: { groupId, nodeIds: [...group.nodeIds], groupName: group.name } as GroupData,
    });

    this.groups.delete(groupId);
    this.emitEvent('group-dissolved', { groupId, name: group.name });
  }

  /**
   * Get all groups.
   */
  getGroups(): EditorGroup[] {
    return Array.from(this.groups.values()).map((g) => ({ ...g, nodeIds: [...g.nodeIds] }));
  }

  /**
   * Select all nodes in a group.
   */
  selectGroup(groupId: string): void {
    const group = this.groups.get(groupId);
    if (!group) return;

    this.deselectAll();
    for (const id of group.nodeIds) {
      this.select(id, true);
    }
  }

  // ===========================================================================
  // Undo / Redo
  // ===========================================================================

  /**
   * Push a command to the undo stack.
   */
  private pushCommand(command: EditorCommand): void {
    this.undoStack.push(command);
    this.redoStack = []; // Clear redo stack on new action

    // Limit history size
    if (this.undoStack.length > this.maxUndoHistory) {
      this.undoStack.shift();
    }
  }

  /**
   * Undo the last command.
   */
  undo(): void {
    const command = this.undoStack.pop();
    if (!command) return;

    this.applyCommandReverse(command);
    this.redoStack.push(command);
    this.emitEvent('undo', { command: command.description });
  }

  /**
   * Redo the last undone command.
   */
  redo(): void {
    const command = this.redoStack.pop();
    if (!command) return;

    this.applyCommandForward(command);
    this.undoStack.push(command);
    this.emitEvent('redo', { command: command.description });
  }

  /**
   * Check if undo is available.
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available.
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Get the undo history.
   */
  getUndoHistory(): string[] {
    return this.undoStack.map((c) => c.description);
  }

  /**
   * Apply a command in reverse (undo).
   */
  private applyCommandReverse(command: EditorCommand): void {
    switch (command.type) {
      case 'transform': {
        const data = command.data as TransformData;
        for (let i = 0; i < data.nodeIds.length; i++) {
          const node = this.nodes.get(data.nodeIds[i]);
          if (node) {
            node.position = vec3Copy(data.before[i].position);
            node.rotation = vec3Copy(data.before[i].rotation);
            node.scale = vec3Copy(data.before[i].scale);
            this.renderer?.updateTransform(node.id, node.position, node.rotation, node.scale);
          }
        }
        break;
      }
      case 'add': {
        const data = command.data as AddDeleteData;
        for (const node of data.nodes) {
          this.nodes.delete(node.id);
          this.renderer?.removeNode(node.id);
          this.selectedNodeIds.delete(node.id);
        }
        break;
      }
      case 'delete': {
        const data = command.data as AddDeleteData;
        for (const node of data.nodes) {
          this.addNode(node, false);
        }
        break;
      }
      case 'rename': {
        const data = command.data as RenameData;
        const node = this.nodes.get(data.nodeId);
        if (node) node.name = data.oldName;
        break;
      }
      case 'reparent': {
        const data = command.data as ReparentData;
        this.reparentNode(data.nodeId, data.oldParentId);
        // Remove the undo command that reparentNode just pushed
        this.undoStack.pop();
        break;
      }
      case 'group': {
        const data = command.data as GroupData;
        this.groups.delete(data.groupId);
        break;
      }
      case 'ungroup': {
        const data = command.data as GroupData;
        this.groups.set(data.groupId, {
          id: data.groupId,
          name: data.groupName,
          nodeIds: [...data.nodeIds],
          locked: false,
          visible: true,
        });
        break;
      }
      case 'visibility': {
        const data = command.data as VisibilityData;
        for (let i = 0; i < data.nodeIds.length; i++) {
          const node = this.nodes.get(data.nodeIds[i]);
          if (node) node.visible = data.oldVisible[i];
        }
        break;
      }
      case 'lock': {
        const data = command.data as LockData;
        for (let i = 0; i < data.nodeIds.length; i++) {
          const node = this.nodes.get(data.nodeIds[i]);
          if (node) node.locked = data.oldLocked[i];
        }
        break;
      }
    }

    this.updateGizmo();
  }

  /**
   * Apply a command forward (redo).
   */
  private applyCommandForward(command: EditorCommand): void {
    switch (command.type) {
      case 'transform': {
        const data = command.data as TransformData;
        for (let i = 0; i < data.nodeIds.length; i++) {
          const node = this.nodes.get(data.nodeIds[i]);
          if (node) {
            node.position = vec3Copy(data.after[i].position);
            node.rotation = vec3Copy(data.after[i].rotation);
            node.scale = vec3Copy(data.after[i].scale);
            this.renderer?.updateTransform(node.id, node.position, node.rotation, node.scale);
          }
        }
        break;
      }
      case 'add': {
        const data = command.data as AddDeleteData;
        for (const node of data.nodes) {
          this.addNode(node, false);
        }
        break;
      }
      case 'delete': {
        const data = command.data as AddDeleteData;
        for (const node of data.nodes) {
          this.nodes.delete(node.id);
          this.renderer?.removeNode(node.id);
          this.selectedNodeIds.delete(node.id);
        }
        break;
      }
      case 'rename': {
        const data = command.data as RenameData;
        const node = this.nodes.get(data.nodeId);
        if (node) node.name = data.newName;
        break;
      }
      case 'reparent': {
        const data = command.data as ReparentData;
        this.reparentNode(data.nodeId, data.newParentId);
        this.undoStack.pop(); // Remove auto-pushed command
        break;
      }
      case 'group': {
        const data = command.data as GroupData;
        this.groups.set(data.groupId, {
          id: data.groupId,
          name: data.groupName,
          nodeIds: [...data.nodeIds],
          locked: false,
          visible: true,
        });
        break;
      }
      case 'ungroup': {
        const data = command.data as GroupData;
        this.groups.delete(data.groupId);
        break;
      }
      case 'visibility': {
        const data = command.data as VisibilityData;
        for (let i = 0; i < data.nodeIds.length; i++) {
          const node = this.nodes.get(data.nodeIds[i]);
          if (node) node.visible = data.newVisible[i];
        }
        break;
      }
      case 'lock': {
        const data = command.data as LockData;
        for (let i = 0; i < data.nodeIds.length; i++) {
          const node = this.nodes.get(data.nodeIds[i]);
          if (node) node.locked = data.newLocked[i];
        }
        break;
      }
    }

    this.updateGizmo();
  }

  // ===========================================================================
  // Clipboard (Copy / Paste / Duplicate)
  // ===========================================================================

  /**
   * Copy selected nodes to clipboard.
   */
  copy(): void {
    this.clipboard = [];
    for (const id of this.selectedNodeIds) {
      const node = this.nodes.get(id);
      if (node) {
        this.clipboard.push({ ...node, children: [...node.children] });
      }
    }
  }

  /**
   * Paste nodes from clipboard with a position offset.
   */
  paste(offset: Vec3 = vec3(1, 0, 1)): string[] {
    const newIds: string[] = [];
    const idMapping = new Map<string, string>();

    // Generate new IDs
    for (const node of this.clipboard) {
      idMapping.set(node.id, generateId());
    }

    for (const node of this.clipboard) {
      const newId = idMapping.get(node.id)!;
      const newParentId = node.parentId ? (idMapping.get(node.parentId) ?? node.parentId) : null;

      const newNode: EditorNode = {
        ...node,
        id: newId,
        name: `${node.name} (copy)`,
        parentId: newParentId,
        position: vec3Add(node.position, offset),
        children: node.children.map((childId) => idMapping.get(childId) ?? childId),
      };

      this.addNode(newNode);
      newIds.push(newId);
    }

    // Select the pasted nodes
    this.deselectAll();
    for (const id of newIds) {
      this.select(id, true);
    }

    return newIds;
  }

  /**
   * Duplicate selected nodes in-place with an offset.
   */
  duplicate(offset: Vec3 = vec3(1, 0, 0)): string[] {
    this.copy();
    return this.paste(offset);
  }

  // ===========================================================================
  // Visibility & Locking
  // ===========================================================================

  /**
   * Toggle visibility of selected nodes.
   */
  toggleVisibility(): void {
    const nodeIds = Array.from(this.selectedNodeIds);
    const oldVisible: boolean[] = [];
    const newVisible: boolean[] = [];

    for (const id of nodeIds) {
      const node = this.nodes.get(id);
      if (node) {
        oldVisible.push(node.visible);
        node.visible = !node.visible;
        newVisible.push(node.visible);
      }
    }

    this.pushCommand({
      type: 'visibility',
      description: `Toggle visibility of ${nodeIds.length} node(s)`,
      timestamp: Date.now(),
      data: { nodeIds, oldVisible, newVisible } as VisibilityData,
    });
  }

  /**
   * Toggle lock state of selected nodes.
   */
  toggleLock(): void {
    const nodeIds = Array.from(this.selectedNodeIds);
    const oldLocked: boolean[] = [];
    const newLocked: boolean[] = [];

    for (const id of nodeIds) {
      const node = this.nodes.get(id);
      if (node) {
        oldLocked.push(node.locked);
        node.locked = !node.locked;
        newLocked.push(node.locked);
      }
    }

    this.pushCommand({
      type: 'lock',
      description: `Toggle lock of ${nodeIds.length} node(s)`,
      timestamp: Date.now(),
      data: { nodeIds, oldLocked, newLocked } as LockData,
    });
  }

  // ===========================================================================
  // Drag & Drop from External Sources
  // ===========================================================================

  /**
   * Handle drag enter event (external asset dragged over viewport).
   */
  onDragEnter(event: DragEvent): void {
    event.preventDefault();
    this.emitEvent('drag-enter', { dataTransfer: event.dataTransfer?.types });
  }

  /**
   * Handle drag over event.
   */
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.emitEvent('drag-over', { x: event.clientX, y: event.clientY });
  }

  /**
   * Handle drop event. Returns the dropped data for the consumer to process.
   */
  onDrop(
    event: DragEvent,
    canvasWidth: number,
    canvasHeight: number,
  ): { position: Vec3; files: File[]; text: string | null } | null {
    event.preventDefault();

    if (!this.renderer || !event.dataTransfer) return null;

    // Determine drop position via raycast
    const ray = this.renderer.screenToRay(event.clientX, event.clientY, canvasWidth, canvasHeight);
    const hits = this.renderer.raycast(ray);

    let dropPosition: Vec3;
    if (hits.length > 0) {
      dropPosition = hits[0].point;
    } else {
      // Default: place on ground plane (y=0)
      if (ray.direction.y !== 0) {
        const t = -ray.origin.y / ray.direction.y;
        dropPosition = vec3Add(ray.origin, vec3Scale(ray.direction, t));
      } else {
        dropPosition = vec3(0, 0, 0);
      }
    }

    if (this.snapConfig.positionSnap) {
      dropPosition = snapVec3(dropPosition, this.snapConfig.positionIncrement);
    }

    const files = Array.from(event.dataTransfer.files);
    const text = event.dataTransfer.getData('text/plain') || null;

    this.emitEvent('drop', { position: dropPosition, fileCount: files.length, text });

    return { position: dropPosition, files, text };
  }

  // ===========================================================================
  // Keyboard Shortcuts
  // ===========================================================================

  /**
   * Handle keyboard shortcut.
   */
  onKeyDown(event: KeyboardEvent): void {
    // Ignore if input is focused
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    const ctrl = event.ctrlKey || event.metaKey;

    switch (event.key) {
      case 'w':
      case 'W':
        this.setTransformMode('translate');
        break;
      case 'e':
      case 'E':
        this.setTransformMode('rotate');
        break;
      case 'r':
      case 'R':
        this.setTransformMode('scale');
        break;
      case 'q':
      case 'Q':
        this.toggleTransformSpace();
        break;
      case 'Delete':
      case 'Backspace':
        for (const id of Array.from(this.selectedNodeIds)) {
          this.deleteNode(id);
        }
        break;
      case 'z':
      case 'Z':
        if (ctrl && event.shiftKey) {
          this.redo();
        } else if (ctrl) {
          this.undo();
        }
        break;
      case 'y':
      case 'Y':
        if (ctrl) this.redo();
        break;
      case 'a':
      case 'A':
        if (ctrl) {
          event.preventDefault();
          this.selectAll();
        }
        break;
      case 'c':
      case 'C':
        if (ctrl) this.copy();
        break;
      case 'v':
      case 'V':
        if (ctrl) this.paste();
        break;
      case 'd':
      case 'D':
        if (ctrl) {
          event.preventDefault();
          this.duplicate();
        }
        break;
      case 'g':
      case 'G':
        if (ctrl) {
          event.preventDefault();
          this.groupSelected();
        }
        break;
      case 'Escape':
        if (this.isTransforming) {
          this.cancelTransform();
        } else {
          this.deselectAll();
        }
        break;
    }
  }

  /**
   * Cancel an in-progress transform, reverting nodes to their start positions.
   */
  private cancelTransform(): void {
    if (!this.isTransforming) return;

    for (const id of this.selectedNodeIds) {
      const node = this.nodes.get(id);
      const startPos = this.transformStartPositions.get(id);
      const startRot = this.transformStartRotations.get(id);
      const startScale = this.transformStartScales.get(id);

      if (node && startPos && startRot && startScale) {
        node.position = vec3Copy(startPos);
        node.rotation = vec3Copy(startRot);
        node.scale = vec3Copy(startScale);
        this.renderer?.updateTransform(id, node.position, node.rotation, node.scale);
      }
    }

    this.isTransforming = false;
    this.activeAxis = null;
    this.transformDragStartPoint = null;
    this.transformStartPositions.clear();
    this.transformStartRotations.clear();
    this.transformStartScales.clear();
    this.updateGizmo();
  }

  // ===========================================================================
  // Serialization
  // ===========================================================================

  /**
   * Export the scene graph as a JSON-serializable object.
   */
  exportScene(): { nodes: EditorNode[]; groups: EditorGroup[] } {
    return {
      nodes: Array.from(this.nodes.values()).map((n) => ({ ...n, children: [...n.children] })),
      groups: Array.from(this.groups.values()).map((g) => ({ ...g, nodeIds: [...g.nodeIds] })),
    };
  }

  /**
   * Import a scene from a serialized object.
   */
  importScene(data: { nodes: EditorNode[]; groups: EditorGroup[] }): void {
    this.deselectAll();
    this.nodes.clear();
    this.groups.clear();
    this.undoStack = [];
    this.redoStack = [];

    for (const node of data.nodes) {
      this.addNode(node, false);
    }

    for (const group of data.groups) {
      this.groups.set(group.id, { ...group, nodeIds: [...group.nodeIds] });
    }
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  /**
   * Register an event handler.
   */
  on(event: EditorEventType, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Remove an event handler.
   */
  off(event: EditorEventType, handler: EventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Emit an event.
   */
  private emitEvent(type: EditorEventType, data?: unknown): void {
    const event: EditorEvent = { type, timestamp: Date.now(), data };
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error(`[Editor] Error in event handler for "${type}":`, err);
        }
      }
    }
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.deselectAll();
    this.nodes.clear();
    this.groups.clear();
    this.undoStack = [];
    this.redoStack = [];
    this.clipboard = [];
    this.eventHandlers.clear();
    this.renderer = null;
  }
}
