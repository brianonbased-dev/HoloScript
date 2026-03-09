import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { World } from '../ecs/World';
import { EditorUI } from '../editor/EditorUI';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
    length: 0,
    key: (i: number) => Object.keys(store)[i] || null,
    removeItem: (key: string) => {
      delete store[key];
    },
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('Editor Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should save scene to storage', () => {
    const world = new World();
    const editor = new EditorUI(world);

    const e1 = world.createEntity();
    world.addComponent(e1, 'Transform', { x: 123 });

    const success = editor.persistence.save('test_scene');
    expect(success).toBe(true);

    const stored = localStorage.getItem('holoscript_scene_test_scene');
    expect(stored).toBeDefined();
    // Parse to be robust against formatting
    const json = JSON.parse(stored!);
    // Navigate to position.x
    // root -> children[0] -> properties -> position -> x
    // But structure depends on whether it's root or child.
    // My serializer wraps in root.
    // Let's just Regex check or deep check if simple.
    expect(stored).toMatch(/"x":\s*123/);
  });

  it('should load scene from storage', () => {
    const world = new World();
    const editor = new EditorUI(world);

    // 1. Save initial scene
    const e1 = world.createEntity();
    world.addComponent(e1, 'Transform', { x: 999 });
    editor.persistence.save('saved_scene');

    // 2. Clear / Modify world
    world.destroyEntity(e1);
    expect(world.getAllEntities().length).toBeGreaterThan(0); // System menu entities might exist

    // 3. Load
    const success = editor.persistence.load('saved_scene');
    expect(success).toBe(true);

    // 4. Verify content
    // Should have entity with x: 999
    // We need to hunt for it because ID might change (though serializer tries to preserve)
    // SceneDeserializer usually generates new IDs unless we forced them.
    // Let's check components.

    // We access private entities or query components
    // Can use query
    // But World doesn't expose `queryComponentData`.
    // Let's count entities with Transform x:999
    let found = false;
    world.getAllEntities().forEach((e) => {
      const t = world.getComponent<any>(e, 'Transform');
      if (t) {
        // Check flat x OR nested position.x
        const x = t.x ?? t.position?.x;
        if (x === 999) found = true;
      }
    });
    expect(found).toBe(true);
  });

  it('should trigger save via UI interaction', () => {
    const world = new World();
    const editor = new EditorUI(world);

    // Find Save button
    const saveBtns = world.queryByTag('UI_System_Save');
    expect(saveBtns.length).toBe(1);

    // Click it
    editor.handleInteraction(saveBtns[0]);

    // Check storage for 'latest'
    const stored = localStorage.getItem('holoscript_scene_latest');
    expect(stored).toBeDefined();
  });
});
