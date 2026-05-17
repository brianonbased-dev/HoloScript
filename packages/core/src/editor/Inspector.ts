/* eslint-disable @typescript-eslint/no-explicit-any */
// World, Entity, and ComponentType are defined in the engine package.
// Until the engine package provides runtime exports, we declare the minimal
// shape we depend on here so type-checking stays strict within this module.
interface World {
  hasEntity(entity: any): boolean;
  getComponentTypes(entity: any): ComponentType[];
  getComponent(entity: any, type: ComponentType): unknown;
  createEntity(): Entity;
  addComponent(entity: Entity, type: string, data: unknown): void;
  addTag(entity: Entity, tag: string): void;
}
type Entity = number;
type ComponentType = string;

import { SelectionManager } from './SelectionManager';
import { effect, computed } from '../state/ReactiveState';

/**
 * Inspector
 *
 * View-Model for the Entity Inspector.
 * Reacts to SelectionManager changes to expose the current entity's components.
 */
export class Inspector {
  private world: World;
  private selectionManager: SelectionManager;

  // The currently inspected entity
  // We use a getter to access selection manager reactively
  private get activeEntity(): Entity | undefined {
    return this.selectionManager.primary;
  }

  constructor(world: World, selectionManager: SelectionManager) {
    this.world = world;
    this.selectionManager = selectionManager;
  }

  /**
   * Get the list of component types on the active entity.
   */
  get componentTypes(): ComponentType[] {
    const entity = this.activeEntity;
    if (entity === undefined || !this.world.hasEntity(entity)) return [];

    // This is not efficient in current World implementation as we don't have
    // a direct "getComponents" method that returns types.
    // We might need to iterate valid component types or World needs a helper.
    // For now, let's assume we can ask World for the signature or iterate known types.
    // But World doesn't expose `entityComponents` map easily.
    // Let's add `getComponents(entity)` to World?
    // Or just implement a helper here if World exposes `getAllComponents(entity)`?
    // World.ts: `getComponent(entity, type)`
    // We don't have a list of all component types on an entity.
    // We should add `world.getComponents(entity)` returning `Map<ComponentType, any>`.

    // Assuming World exposes enough metadata for component type discovery.
    // Let's check `World.ts`... it has `entityComponents` private map.
    // I should update World.ts to expose `getComponentTypes(entity)`.

    return this.world.getComponentTypes(entity);
  }

  /**
   * Get the data for a specific component.
   * Returns the reactive proxy, so setting properties triggers Undo/Redo.
   */
  getComponentData(type: ComponentType): unknown {
    const entity = this.activeEntity;
    if (entity === undefined) return undefined;
    return this.world.getComponent(entity, type);
  }

  /**
   * Set a property on a component.
   * (Optional wrapper, UI can also set directly on data returned by getComponentData)
   */
  setProperty(type: ComponentType, key: string, value: unknown) {
    const data = this.getComponentData(type);
    if (data && typeof data === 'object' && data !== null) {
      (data as Record<string, unknown>)[key] = value;
    }
  }
}
