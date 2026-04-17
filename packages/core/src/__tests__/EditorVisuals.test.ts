import { describe, it, expect } from 'vitest';
import { World } from '@holoscript/engine/ecs/World';
import { EditorUI } from '../editor/EditorUI';
import { InspectorPanel } from '../editor/InspectorPanel';

describe('Editor Visuals (VR UI)', () => {
  it('should create UI panel on selection', async () => {
    const world = new World();
    const editor = new EditorUI(world);

    const e1 = world.createEntity();
    world.addComponent(e1, 'Transform', {
      position: [10, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    });
    world.addComponent(e1, 'Stats', { hp: 10 });

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
    world.addComponent(e1, 'Transform', {
      position: [10, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    });
    world.addComponent(e1, 'Stats', { hp: 10 });
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

    const stats = world.getComponent<any>(e1, 'Stats');
    expect(stats.hp).not.toBe(10);
  });

  it('should execute the graph from Run Graph system interaction', () => {
    const world = new World();
    const editor = new EditorUI(world);

    const expectedResult = {
      nodeOrder: ['n1'],
      outputs: new Map([['n1', { result: 42 }]]),
      state: { score: 1 },
      emittedEvents: new Map(),
    };

    editor.graphPanel = {
      executeGraph: () => expectedResult,
    } as any;

    const runButton = world.createEntity();
    world.addTag(runButton, 'UI_System_RunGraph');

    editor.handleInteraction(runButton);

    expect(editor.graphRunning).toBe(false);
    expect(editor.lastGraphResult).toBe(expectedResult);
    expect(editor.getGraphRunningState()).toEqual({
      running: false,
      lastResult: expectedResult,
    });
  });
});
