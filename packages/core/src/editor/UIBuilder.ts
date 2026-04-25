// @ts-expect-error
import { World, Entity } from '@holoscript/engine/ecs/World';
import { HSPlusNode } from '../types/HoloScriptPlus';

/** Convert Euler angles (radians) to quaternion { x, y, z, w }. */
function eulerToQuat(euler: [number, number, number]): {
  x: number;
  y: number;
  z: number;
  w: number;
} {
  const halfX = euler[0] * 0.5;
  const halfY = euler[1] * 0.5;
  const halfZ = euler[2] * 0.5;
  const cx = Math.cos(halfX);
  const sx = Math.sin(halfX);
  const cy = Math.cos(halfY);
  const sy = Math.sin(halfY);
  const cz = Math.cos(halfZ);
  const sz = Math.sin(halfZ);
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };
}

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
    const position = node.properties?.position || [0, 0, 0];
    const rotation = node.properties?.rotation || [0, 0, 0];
    const scale = node.properties?.scale || [1, 1, 1];

    this.world.addComponent(entity, 'Transform', {
      position,
      // @ts-expect-error During migration
      rotation: eulerToQuat(rotation),
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
