import { AssetRegistry } from '../assets/AssetRegistry';
import type { AssetType } from '../assets/AssetMetadata';
import { World } from '../ecs/World';

/**
 * AssetManager
 *
 * Editor-specific wrapper around element lifecycle and session management for assets.
 * Handles:
 * - Session-local asset registration (drag-and-dropped files)
 * - Thumbnail generation/caching (placeholder for now)
 * - Convenience methods for UI
 */
export class AssetManager {
  private registry: AssetRegistry;
  private world: World;

  // Session-only assets (not part of global manifest)
  private sessionAssets: Map<string, any> = new Map();

  constructor(world: World) {
    this.world = world;
    this.registry = AssetRegistry.getInstance();

    // Register some default "Editor" assets if not present
    this.registerDefaultAssets();
  }

  private registerDefaultAssets() {
    // Mock standard library for testing
    const defaults: any[] = [
      {
        id: 'std_cube',
        name: 'Standard Cube',
        type: 'model',
        assetType: 'model',
        url: 'https://assets.holoscript.org/primitives/cube.glb',
        format: 'glb',
        fileSize: 1024,
        tags: ['primitive', 'geometry'],
      },
      {
        id: 'std_sphere',
        name: 'Standard Sphere',
        type: 'model',
        assetType: 'model',
        url: 'https://assets.holoscript.org/primitives/sphere.glb',
        format: 'glb',
        fileSize: 1024,
        tags: ['primitive', 'geometry'],
      },
      {
        id: 'std_texture_checker',
        name: 'Checkerboard',
        type: 'texture',
        assetType: 'texture',
        url: 'https://assets.holoscript.org/textures/checker.png',
        format: 'png',
        fileSize: 1024,
        tags: ['texture', 'debug'],
      },
    ];

    // We need a way to register these into the Registry
    // The registry expects a Manifest.
    // Let's create a "session" manifest?
    // Or just mock `getAsset` in this manager to fall back?
    // Registry isn't easily mutable without registering a manifest.

    // Check if registry has "editor_defaults" manifest.
    const manifest = this.registry.getManifest('editor_defaults');
    if (!manifest) {
      // We can't implement manifest easily without importing AssetManifest class completely
      // and it might be complex.
      // For now, let's keep access through THIS manager using sessionAssets.
      defaults.forEach((a) => this.sessionAssets.set(a.id, a));
    }
  }

  /**
   * Get all available assets (Registry + Session)
   */
  getAllAssets(): any[] {
    const registryAssets: any[] = [];
    // registry.search('') returns all unique?

    // This is inefficient but functional for MVP
    // Registry design assumes search/filtering.
    const all = this.registry.search('');

    return [...all, ...Array.from(this.sessionAssets.values())];
  }

  getAssetsByType(type: string): any[] {
    const registryAssets = this.registry.findByType(type as AssetType);
    const sessionAssets = Array.from(this.sessionAssets.values()).filter(
      (a) => a.assetType === type
    );
    return [...registryAssets, ...sessionAssets];
  }

  getAsset(id: string): any | undefined {
    return this.sessionAssets.get(id) || this.registry.getAsset(id);
  }

  /**
   * Import a file (Mock)
   * In a real app, this would handle File object from Drop event.
   */
  importFile(name: string, url: string, type: string) {
    const id = `local_${Date.now()}_${name}`;
    const asset: any = {
      id,
      name,
      assetType: type,
      type: type, // Legacy compat?
      url,
      format: name.split('.').pop() || 'dat',
      fileSize: 0,
      tags: ['local'],
    };
    this.sessionAssets.set(id, asset);
    return asset;
  }
}
