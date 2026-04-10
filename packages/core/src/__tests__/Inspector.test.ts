import { describe, it, expect } from 'vitest';
import { World } from '@holoscript/engine/ecs/World';
import { EditorUI } from '../editor/EditorUI';
import { Inspector } from '../editor/Inspector';

describe('Editor Inspector', () => {
  it('should reflect active selection', async () => {
    const world = new World();
    const editor = new EditorUI(world);
    const inspector = editor.inspector;

    const e1 = world.createEntity();
    world.addComponent(e1, 'Transform', { x: 10 });

    // No selection
    expect(inspector.componentTypes).toEqual([]);

    // Select e1
    editor.selectionManager.select(e1);
    await Promise.resolve();

    // Inspector shows e1 components
    expect(inspector.componentTypes).toContain('Transform');
  });

  it('should allow modifying component properties', async () => {
    const world = new World();
    const editor = new EditorUI(world);
    const inspector = editor.inspector;

    const e1 = world.createEntity();
    world.addComponent(e1, 'Transform', { x: 10, y: 20 });
    editor.selectionManager.select(e1);
    await Promise.resolve();

    // Get component data
    const transform = inspector.getComponentData('Transform');
    expect(transform.x).toBe(10);

    // Modify via Inspector helper
    inspector.setProperty('Transform', 'x', 50);

    // Verify World update
    const worldTransform = world.getComponent<any>(e1, 'Transform');
    expect(worldTransform.x).toBe(50);
  });

  it('should integrate with UndoManager via reactivity', async () => {
    const world = new World();
    const editor = new EditorUI(world);
    const inspector = editor.inspector;

    const e1 = world.createEntity();
    world.addComponent(e1, 'Transform', { x: 10 });
    editor.selectionManager.select(e1);
    await Promise.resolve();

    // Modify
    inspector.setProperty('Transform', 'x', 99);
    expect(world.getComponent<any>(e1, 'Transform').x).toBe(99);

    // Undo
    world.undo();
    await Promise.resolve();
    expect(world.getComponent<any>(e1, 'Transform').x).toBe(10);

    // Redo
    world.redo();
    await Promise.resolve();
    expect(world.getComponent<any>(e1, 'Transform').x).toBe(99);
  });
});
