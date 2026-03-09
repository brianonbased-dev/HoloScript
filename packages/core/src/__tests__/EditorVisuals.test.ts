import { describe, it, expect } from 'vitest';
import { World } from '../ecs/World';
import { EditorUI } from '../editor/EditorUI';
import { InspectorPanel } from '../editor/InspectorPanel';

describe('Editor Visuals (VR UI)', () => {
  it('should create UI panel on selection', async () => {
    const world = new World();
    const editor = new EditorUI(world);

    const e1 = world.createEntity();
    world.addComponent(e1, 'Transform', { x: 10 });

    // Select e1
    editor.selectionManager.select(e1);
    await Promise.resolve();

    // Trigger update/rebuild
    editor.update(0.16);

    // Check if UI entities were created
    // We look for 'UI_Interactable' tag or text components
    const uiEntities = world.queryByTag('UI_Interactable');
    // Transform has x, y, z, rotation x, y, z, w, scale x, y, z = 10 props?
    // Plus 2 buttons per prop?
    // At least some should exist.
    expect(uiEntities.length).toBeGreaterThan(0);
  });

  it('should update property on interaction', async () => {
    const world = new World();
    const editor = new EditorUI(world);

    const e1 = world.createEntity();
    world.addComponent(e1, 'Transform', { x: 10 });
    editor.selectionManager.select(e1);
    await Promise.resolve();
    editor.update(0.16);

    // Find the 'increment X' button
    // This is hard without specific naming/tagging in InspectorPanel.
    // But we know 'UI_Interactable' entities trigger actions.
    const interactables = world.queryByTag('UI_Interactable');
    expect(interactables.length).toBeGreaterThan(0);

    // Click the first one (likely decrement 'position')
    // We depend on iteration order (position is first prop usually).
    // Let's just click one and see if Transform changes.
    const btn = interactables[0];

    editor.handleInteraction(btn);

    const t = world.getComponent<any>(e1, 'Transform');
    // Should be 9.9 or 10.1 (default delta 0.1)
    expect(t.x).not.toBe(10);
  });
});
