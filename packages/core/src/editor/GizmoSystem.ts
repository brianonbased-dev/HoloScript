import { World, Entity } from '../ecs/World';
import { SelectionManager } from './SelectionManager';
import { effect } from '../state/ReactiveState';
import { Vector3 } from '../types/HoloScriptPlus';

/**
 * GizmoSystem
 *
 * Manages the lifecycle and behavior of editor gizmos.
 */
export class GizmoSystem {
  private world: World;
  private selectionManager: SelectionManager;
  private gizmoEntities: Map<Entity, Entity[]> = new Map(); // Maps Root Gizmo -> Child Axes

  // Configuration
  public gizmoScale: number = 0.5;
  public axisLength: number = 1.0;
  public axisThickness: number = 0.05;

  constructor(world: World, selectionManager: SelectionManager) {
    this.world = world;
    this.selectionManager = selectionManager;

    // Reactive effect to rebuild gizmos when selection changes
    effect(() => {
      // Track selection size/contents to trigger re-render
      const count = this.selectionManager.selected.size;
      // Also need to depend on content, but Set iteration is tracked by reactive()
      // We just iterate to establish dependency.
      for (const _ of this.selectionManager.selected) {
      }

      this.rebuildGizmos();
    });
  }

  /**
   * Destroy old gizmos and create new ones based on selection.
   */
  private rebuildGizmos() {
    // 1. Destroy existing gizmos (roots and children)
    for (const [root, children] of this.gizmoEntities) {
      this.world.destroyEntity(root);
      children.forEach((child) => this.world.destroyEntity(child));
    }
    this.gizmoEntities.clear();

    // 2. Create new gizmos if selection exists
    if (this.selectionManager.selected.size > 0) {
      // Should create generic gizmo at centroid
      // For now, simpler: Create gizmo for EACH selected entity?
      // Or just primary? Let's do Primary for now.
      const primary = this.selectionManager.primary;
      if (primary !== undefined && this.world.hasEntity(primary)) {
        this.createGizmo(primary);
      }
    }
  }

  private createGizmo(target: Entity) {
    // Create root gizmo entity
    const gizmoRoot = this.world.createEntity();
    this.world.addTag(gizmoRoot, 'Gizmo');
    this.world.addTag(gizmoRoot, 'GizmoRoot');
    this.world.addTag(gizmoRoot, 'NoSelect');

    // Add transform synced to target
    const targetPos = this.world.getComponent<any>(target, 'Transform')?.position || {
      x: 0,
      y: 0,
      z: 0,
    };
    this.world.addComponent(gizmoRoot, 'Transform', {
      position: { ...targetPos },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    });

    // Create Axis Handles
    const xAxis = this.createAxis(gizmoRoot, 'x', { x: 1, y: 0, z: 0 }, { r: 1, g: 0, b: 0 });
    const yAxis = this.createAxis(gizmoRoot, 'y', { x: 0, y: 1, z: 0 }, { r: 0, g: 1, b: 0 });
    const zAxis = this.createAxis(gizmoRoot, 'z', { x: 0, y: 0, z: 1 }, { r: 0, g: 0, b: 1 });

    // Store
    this.gizmoEntities.set(gizmoRoot, [xAxis, yAxis, zAxis]);
  }

  private createAxis(
    parent: Entity,
    axisName: string,
    direction: Vector3,
    color: { r: number; g: number; b: number }
  ): Entity {
    const axis = this.world.createEntity();
    this.world.addTag(axis, 'Gizmo');
    this.world.addTag(axis, `GizmoAxis${axisName.toUpperCase()}`);
    this.world.addTag(axis, 'NoSelect');

    // Offset position to account for parent (simple hierarchy simulation)
    // Since we don't have true hierarchy in World yet (or maybe we do via SceneGraphTrait?),
    // For now, we'll manually sync positions in update().
    // Initial relative transform
    this.world.addComponent(axis, 'Transform', {
      position: { x: 0, y: 0, z: 0 }, // Relative to parent (simulated)
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: this.axisLength, y: this.axisThickness, z: this.axisThickness },
    });

    this.world.addComponent(axis, 'Material', { color });

    return axis;
  }

  /**
   * Main update loop.
   * - Syncs gizmo position to target
   * - Syncs axes to gizmo root
   * - Handles input (raycast)
   */
  update(delta: number) {
    const primary = this.selectionManager.primary;
    if (primary === undefined) return;

    // Sync position
    const targetTransform = this.world.getComponent<any>(primary, 'Transform');

    for (const [gizmoRoot, children] of this.gizmoEntities) {
      const rootTransform = this.world.getComponent<any>(gizmoRoot, 'Transform');

      if (targetTransform && rootTransform) {
        rootTransform.position = { ...targetTransform.position };
        rootTransform.rotation = { ...targetTransform.rotation }; // Sync rotation too? Yes.

        // Sync axes (simulate hierarchy)
        children.forEach((child) => {
          const childTransform = this.world.getComponent<any>(child, 'Transform');
          if (childTransform) {
            childTransform.position = { ...rootTransform.position };
            childTransform.rotation = { ...rootTransform.rotation };
          }
        });
      }
    }
  }

  /**
   * Simulate a drag interaction on the gizmo.
   * Used by tests (and eventually InputSystem).
   * @param axis 'x' | 'y' | 'z'
   * @param delta Movement delta
   */
  public dragHandle(axis: 'x' | 'y' | 'z', amount: number) {
    const primary = this.selectionManager.primary;
    if (primary === undefined) return;

    const transform = this.world.getComponent<any>(primary, 'Transform');
    if (transform) {
      transform.position[axis] += amount;
    }
  }
}
