import { describe, it, expect } from 'vitest';
import { World } from '@holoscript/engine/ecs/World';
import { SelectionManager } from '../editor/SelectionManager';
import { GizmoSystem } from '../editor/GizmoSystem';
import { effect } from '../state/ReactiveState';

describe('Editor Core (Selection & Gizmos)', () => {
  it('should manage selection state', async () => {
    const sm = new SelectionManager();
    const e1 = 1;
    const e2 = 2;

    // Single select
    sm.select(e1);
    await Promise.resolve(); // flush reactivity
    expect(sm.isSelected(e1)).toBe(true);
    expect(sm.selected.size).toBe(1);

    // Replace select
    sm.select(e2);
    await Promise.resolve();
    expect(sm.isSelected(e1)).toBe(false);
    expect(sm.isSelected(e2)).toBe(true);

    // Additive select
    sm.select(e1, true);
    await Promise.resolve();
    expect(sm.isSelected(e1)).toBe(true);
    expect(sm.isSelected(e2)).toBe(true);
    expect(sm.selected.size).toBe(2);

    // Deselect
    sm.deselect(e2);
    await Promise.resolve();
    expect(sm.isSelected(e2)).toBe(false);
    expect(sm.selected.size).toBe(1);

    // Clear
    sm.clear();
    await Promise.resolve();
    expect(sm.selected.size).toBe(0);
  });

  it('should spawn gizmos on selection', async () => {
    const world = new World();
    const sm = new SelectionManager();
    const gizmoSystem = new GizmoSystem(world, sm);

    const e1 = world.createEntity();
    world.addComponent(e1, 'Transform', { position: [10, 0, 0] });

    // Initial state: no gizmos
    expect(world.entityCount).toBe(1);

    // Select entity
    sm.select(e1);
    await Promise.resolve(); // Allow effect to run

    // Expect gizmo entity to be created
    // Original entity + Gizmo root = 2 entities
    expect(world.entityCount).toBeGreaterThan(1);

    // precise check if we knew ID, but we just check count increased.
    const allEntities = world.getAllEntities();
    const gizmo = allEntities.find((id) => world.hasTag(id, 'Gizmo'));
    expect(gizmo).toBeDefined();

    // Check gizmo transform matches target
    const gizmoTransform = world.getComponent<any>(gizmo!, 'Transform');
    expect(gizmoTransform.position.x).toBe(10);
  });

  it('should destroy gizmos on deselect', async () => {
    const world = new World();
    const sm = new SelectionManager();
    // keep reference to system
    const _gs = new GizmoSystem(world, sm);

    const e1 = world.createEntity();
    world.addComponent(e1, 'Transform', { position: [0, 0, 0] });

    sm.select(e1);
    await Promise.resolve();
    // Expect Root + 3 Axes = 4 entities
    expect(world.queryByTag('Gizmo').length).toBe(4);

    sm.clear();
    await Promise.resolve();
    expect(world.queryByTag('Gizmo').length).toBe(0);
  });

  it('should update target when gizmo is dragged', async () => {
    const world = new World();
    const sm = new SelectionManager();
    const gs = new GizmoSystem(world, sm);

    const e1 = world.createEntity();
    world.addComponent(e1, 'Transform', { position: [0, 0, 0] });

    sm.select(e1);
    await Promise.resolve();

    // Drag X axis by 5 units
    gs.dragHandle('x', 5);
    await Promise.resolve();

    const transform = world.getComponent<any>(e1, 'Transform');
    expect(transform.position.x).toBe(5);
  });
});
