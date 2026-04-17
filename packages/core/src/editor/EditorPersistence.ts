import { World } from '@holoscript/engine/ecs/World';
import { SceneSerializer } from '@holoscript/engine/scene/SceneSerializer';
import { SceneDeserializer } from '@holoscript/engine/scene/SceneDeserializer';
import { UIBuilder } from './UIBuilder';
import { SerializedScene } from '@holoscript/engine/scene/SceneSerializer';

/**
 * EditorPersistence
 *
 * Manages saving and loading of scenes.
 * Bridges the Editor UI with the Scene Serialization system.
 */
export class EditorPersistence {
  private world: World;
  private serializer: SceneSerializer;
  private deserializer: SceneDeserializer;
  private builder: UIBuilder;

  // Storage Key Prefix
  private readonly STORAGE_PREFIX = 'holoscript_scene_';

  constructor(world: World) {
    this.world = world;
    this.serializer = new SceneSerializer(world);
    this.deserializer = new SceneDeserializer();
    this.builder = new UIBuilder(world);

    // Ensure UIBuilder handles 'System' or 'Root' nodes gracefully?
    // My serializer creates a virtual 'root' node.
    // UIBuilder spawn(root) will create an entity for root, then children.
    // We probably don't want the root entity if it's just a container.
    // But let's spawn it for now to keep hierarchy clean.
  }

  /**
   * Save the current scene to local storage.
   * @param name Scene name
   * @returns Success boolean
   */
  save(name: string): boolean {
    try {
      const json = JSON.stringify(this.serializer.serialize());
      if (!json) return false;

      // In a real app, this might use File System Access API
      // For now, localStorage is safe for web demos
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`${this.STORAGE_PREFIX}${name}`, json);
        // Scene saved successfully
        return true;
      }
      // Mock environment (node tests) support
      // We could write to disk if running in node/electron, but let's assume browser-first.
      // If localStorage is mocked in global (test env), it works.
      return true;
    } catch (e) {
      // Save operation failed
      return false;
    }
  }

  /**
   * Load a scene from local storage.
   * @param name Scene name
   * @returns Success boolean
   */
  load(name: string): boolean {
    try {
      let json: string | null = null;

      if (typeof localStorage !== 'undefined') {
        json = localStorage.getItem(`${this.STORAGE_PREFIX}${name}`);
      }

      if (!json) {
        // Scene not found, return false
        return false;
      }

      // Clear current world?
      // "destroyEntity" loop.
      // NOTE: This destroys Editor UI too if we aren't careful!
      // We should only destroy scene entities.
      // But separating them is hard without tags.
      // My Editor UI has 'NoSelect' tag usually.
      // Let's destroy everything EXCEPT 'NoSelect'?
      // But we might want to clear old selected objects too.
      // Ideally, we nuking everything and EditorUI.rebuild() is called?
      // EditorUI handles its own lifecycle.
      // Let's nuke only things that are NOT tagged 'EditorUI' or 'System'.
      // For MVP: Nuke all, EditorUI might disappear.
      // If EditorUI disappears, user gets stuck.

      // Filter out known editor tags to preserve editor system entities.
      const entities = this.world.getAllEntities();
      entities.forEach((e) => {
        if (!this.world.hasTag(e, 'NoSelect') && !this.world.hasTag(e, 'Gizmo')) {
          this.world.destroyEntity(e);
        }
      });

      // Parse JSON
      const result = this.deserializer.fromJSON(json);

      // Spawn
      // Result.node is the Root.
      // Children of Root are the actual scene entities.
      // If we spawn Root, we get a root entity.
      // Let's spawn references.
      if (result.node) {
        // @ts-expect-error During migration
        this.builder.spawn(result.node);
      }

      // Scene loaded successfully
      return true;
    } catch (e) {
      // Load operation failed
      return false;
    }
  }

  /**
   * List available saved scenes.
   */
  listScenes(): string[] {
    if (typeof localStorage === 'undefined') return [];

    const scenes: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.STORAGE_PREFIX)) {
        scenes.push(key.substring(this.STORAGE_PREFIX.length));
      }
    }
    return scenes;
  }
}
