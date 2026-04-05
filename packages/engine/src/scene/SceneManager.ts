/**
 * SceneManager.ts
 *
 * High-level API for saving, loading, and listing HoloScript+ scenes.
 * Combines SceneSerializer + SceneDeserializer + StateSnapshot.
 */

import type { HSPlusNode } from '../types/HoloScriptPlus';
import { SceneSerializer, SerializedScene } from './SceneSerializer';
import { SceneDeserializer } from './SceneDeserializer';
import { StateSnapshotCapture, RuntimeStateSnapshot } from './StateSnapshot';

// =============================================================================
// TYPES
// =============================================================================

export interface SavedScene {
  scene: SerializedScene;
  state?: RuntimeStateSnapshot;
}

export interface SceneListEntry {
  name: string;
  timestamp: string;
  nodeCount: number;
}

// =============================================================================
// SCENE MANAGER
// =============================================================================

export class SceneManager {
  private serializer = new SceneSerializer();
  private deserializer = new SceneDeserializer();
  private stateCapture = new StateSnapshotCapture();
  private storage = new Map<string, SavedScene>();

  /**
   * Save a scene to the internal store.
   */
  save(
    name: string,
    root: HSPlusNode,
    stateOptions?: Parameters<StateSnapshotCapture['capture']>[0],
    metadata?: Record<string, any>
  ): SavedScene {
    const scene = this.serializer.serialize(root, name, metadata);
    const state = stateOptions ? this.stateCapture.capture(stateOptions) : undefined;

    const saved: SavedScene = { scene, state };
    this.storage.set(name, saved);

    return saved;
  }

  /**
   * Load a scene by name.
   */
  load(name: string): { node: HSPlusNode; state?: RuntimeStateSnapshot } | null {
    const saved = this.storage.get(name);
    if (!saved) return null;

    const node = this.deserializer.deserialize(saved.scene);
    return { node, state: saved.state };
  }

  /**
   * Check if a scene exists.
   */
  has(name: string): boolean {
    return this.storage.has(name);
  }

  /**
   * Delete a saved scene.
   */
  delete(name: string): boolean {
    return this.storage.delete(name);
  }

  /**
   * List all saved scenes.
   */
  list(): SceneListEntry[] {
    const entries: SceneListEntry[] = [];
    for (const [name, saved] of this.storage) {
      entries.push({
        name,
        timestamp: saved.scene.timestamp,
        nodeCount: this.countNodes(saved.scene.root),
      });
    }
    return entries;
  }

  /**
   * Export a scene to JSON string.
   */
  exportJSON(name: string): string | null {
    const saved = this.storage.get(name);
    if (!saved) return null;
    return JSON.stringify(saved, null, 2);
  }

  /**
   * Import a scene from JSON string.
   */
  importJSON(json: string): string {
    const saved: SavedScene = JSON.parse(json);
    const name = saved.scene.name;
    this.storage.set(name, saved);
    return name;
  }

  /**
   * Get count of saved scenes.
   */
  get count(): number {
    return this.storage.size;
  }

  private countNodes(node: any): number {
    let count = 1;
    if (node.children) {
      for (const child of node.children) {
        count += this.countNodes(child);
      }
    }
    return count;
  }
}
