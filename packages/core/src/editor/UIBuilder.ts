import { World, Entity } from '../ecs/World';
import { HSPlusNode } from '../types/HoloScriptPlus';

/**
 * UIBuilder
 *
 * Helper to spawn UI structures into the World.
 * Converts HSPlusNode definitions (from UIComponents.ts) into real Entities.
 */
export class UIBuilder {
  private world: World;

  constructor(world: World) {
    this.world = world;
  }

  /**
   * Spawn a UI node and its children.
   * @param node The UI definition.
   * @param parent Optional parent entity ID.
   * @returns The created entity ID.
   */
  spawn(node: HSPlusNode, parent?: Entity): Entity {
    const entity = this.world.createEntity();

    // 1. Transform & Properties
    // Map common properties to Transform component
    const position = node.properties?.position || { x: 0, y: 0, z: 0 };
    const rotation = node.properties?.rotation || { x: 0, y: 0, z: 0 };
    const scale = node.properties?.scale || { x: 1, y: 1, z: 1 };

    this.world.addComponent(entity, 'Transform', {
      position,
      rotation: { ...rotation, w: 1 }, // TODO: Euler to Quat conversion if needed
      scale,
      parent, // If World supports hierarchy via component, or handle manually
    });

    // Handle parent relationship (mocked for now, or use a Hierarchy component)
    // usage of 'parent' arg implies we need to link them.
    // For physics/rendering, hierarchy is needed.
    // Let's assume 'Hierarchy' component or similar.
    // For now, we just pass it to Transform if supported, or ignore if flat.
    // HoloScript usually has SceneGraphTrait.
    if (parent !== undefined) {
      // this.world.addComponent(entity, 'Parent', { id: parent });
    }

    // 2. Traits -> Components
    if (node.traits) {
      node.traits.forEach((config, name) => {
        // Map trait name to ComponentType
        // e.g. 'render' -> 'Render' or 'Material'?
        // 'pressable' -> 'Pressable'
        // We'll capitalize for simple mapping.
        const type = name.charAt(0).toUpperCase() + name.slice(1);
        this.world.addComponent(entity, type, config);
      });
    }

    // 3. Special Properties
    if (node.properties?.text) {
      this.world.addComponent(entity, 'Text', {
        content: node.properties.text,
        color: node.properties.color,
        fontSize: node.properties.fontSize,
      });
    }

    if (node.properties?.tag) {
      this.world.addTag(entity, node.properties.tag as string);
    }

    // 4. Children
    if (node.children) {
      node.children.forEach((child) => {
        this.spawn(child, entity);
      });
    }

    return entity;
  }
}
