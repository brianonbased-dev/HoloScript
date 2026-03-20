/**
 * SceneDeserializer.ts
 *
 * Reconstructs live HoloScript+ node trees from serialized JSON.
 * Rebuilds Map-based traits from Object representations.
 */

import type { HSPlusNode } from '../types/HoloScriptPlus';
import type { SerializedScene, SerializedNode } from './SceneSerializer';

// =============================================================================
// DESERIALIZER
// =============================================================================

export class SceneDeserializer {
  /**
   * Deserialize from a SerializedScene object.
   */
  deserialize(scene: SerializedScene): HSPlusNode {
    return this.rebuildNode(scene.root);
  }

  /**
   * Deserialize from a JSON string.
   */
  fromJSON(json: string): { node: HSPlusNode; name: string; metadata?: Record<string, any> } {
    const scene: SerializedScene = JSON.parse(json);

    if (scene.version !== 1) {
      console.warn(`Unknown version ${scene.version}, attempting load`);
    }

    return {
      node: this.rebuildNode(scene.root),
      name: scene.name,
      metadata: scene.metadata,
    };
  }

  private rebuildNode(serialized: SerializedNode): HSPlusNode {
    // Skip reference nodes (circular ref placeholders)
    if (serialized.type === 'ref') {
      return {
        id: serialized.id,
        type: 'entity',
        properties: { _isRef: true },
        traits: new Map(),
        children: [],
      };
    }

    // Rebuild traits as Map
    const traits = new Map<string, any>();
    if (serialized.traits) {
      for (const [key, value] of Object.entries(serialized.traits)) {
        traits.set(key, value);
      }
    }

    // Rebuild children recursively
    const children = (serialized.children || []).map((child) => this.rebuildNode(child));

    return {
      id: serialized.id,
      type: serialized.type,
      properties: { ...serialized.properties },
      traits,
      children,
    };
  }
}
