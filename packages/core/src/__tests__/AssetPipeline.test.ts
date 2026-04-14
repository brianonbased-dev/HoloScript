import { describe, it, expect, beforeEach, vi } from 'vitest';
import { World } from '@holoscript/engine/ecs/World';
import { AssetManager } from '../editor/AssetManager';
import { AssetBrowserPanel } from '../editor/AssetBrowserPanel';
import { UIBuilder } from '../editor/UIBuilder';
import { EditorUI } from '../editor/EditorUI';
import { ReactiveState } from '../state/ReactiveState';

import { AssetRegistry } from '../assets/AssetRegistry';

describe('Asset Pipeline', () => {
  let world: World;
  let manager: AssetManager;

  beforeEach(() => {
    AssetRegistry.resetInstance();
    world = new World(new ReactiveState());
    manager = new AssetManager(world);
  });

  it('should register default assets', () => {
    const assets = manager.getAllAssets();
    expect(assets.length).toBeGreaterThan(0);

    const cube = manager.getAsset('std_cube');
    expect(cube).toBeDefined();
    expect(cube?.assetType).toBe('model');
    expect(cube?.url).toContain('cube.glb');
  });

  it('should filter assets by type', () => {
    const models = manager.getAssetsByType('model');
    const textures = manager.getAssetsByType('texture');

    expect(models.some((a) => a.id === 'std_cube')).toBe(true);
    expect(textures.some((a) => a.id === 'std_texture_checker')).toBe(true);
    // Ensure no mixing
    expect(models.some((a) => a.assetType === 'texture')).toBe(false);
  });

  it('should spawn assets via Editor integration', () => {
    // Setup Editor
    const editor = new EditorUI(world);
    const browser = editor.assetBrowser;

    // Mock the callback trigger
    // In real app, UI click triggers callback.
    // We simulate the callback directly on the browser panel logic?
    // No, `onAssetSelected` is public. We can call it directly to simulate "Selection".

    const cube = manager.getAsset('std_cube')!;

    // Listen for new entity
    // We can check entity count before/after
    const initialCount = world.getAllEntities().length;

    // Trigger selection
    if (browser.onAssetSelected) {
      browser.onAssetSelected(cube);
    } else {
      throw new Error('Callback not bound');
    }

    const subCount = world.getAllEntities().length;
    expect(subCount).toBeGreaterThan(initialCount);

    // Verify component on new entity
    // The new entity should be the selected one in SelectionManager
    const newEntity = editor.selectionManager.primary;
    expect(newEntity).toBeDefined();

    const gltf = world.getComponent<any>(newEntity!, 'GLTF');
    expect(gltf).toBeDefined();
    expect(gltf.src).toBe(cube.url);

    const transform = world.getComponent<any>(newEntity!, 'Transform');
    expect(transform).toBeDefined();
    expect(transform.position[2]).toBe(-1);
  });

  it('should generate UI entities for assets', () => {
    const builder = new UIBuilder(world);
    const browser = new AssetBrowserPanel(world, manager, builder);

    // Check if panel root exists
    expect(browser.panelRoot).toBeDefined();

    // Check if asset buttons were created
    // We tagged them via UIBuilder?
    // AssetBrowserPanel adds component 'AssetRef'

    let foundButtons = 0;
    world.getAllEntities().forEach((e) => {
      if (world.hasComponent(e, 'AssetRef')) foundButtons++;
    });

    expect(foundButtons).toBeGreaterThan(0);
  });
});
