/**
 * World.ts
 *
 * The central ECS World — the container for all entities, components, and systems.
 * Provides entity creation, component attachment, and query APIs.
 */

export type Entity = number;
export type ComponentType = string;

import { reactive } from '../state/ReactiveState';
import { UndoManager } from '../state/UndoManager';

export type WorldOp =
  | { type: 'create'; entity: Entity }
  | { type: 'destroy'; entity: Entity; components: Map<ComponentType, any>; tags: Set<string> }
  | { type: 'addComponent'; entity: Entity; componentType: ComponentType; data: any }
  | { type: 'removeComponent'; entity: Entity; componentType: ComponentType; data: any }
  | {
      type: 'updateComponent';
      entity: Entity;
      componentType: ComponentType;
      key: string | symbol;
      value: any;
      oldValue: any;
    }
  | { type: 'addTag'; entity: Entity; tag: string }
  | { type: 'removeTag'; entity: Entity; tag: string }
  | { type: 'restore'; entity: Entity; components: Map<ComponentType, any>; tags: Set<string> };

export class World {
  private nextEntity: Entity = 1;
  private entities: Set<Entity> = new Set();
  private components: Map<ComponentType, Map<Entity, any>> = new Map();
  private tags: Map<Entity, Set<string>> = new Map();
  public undoManager: UndoManager<WorldOp> = new UndoManager<WorldOp>();
  private isUndoing = false;

  /**
   * Create a new entity.
   */
  createEntity(): Entity {
    const id = this.nextEntity++;
    this.entities.add(id);

    if (!this.isUndoing) {
      this.undoManager.push(
        { type: 'destroy', entity: id, components: new Map(), tags: new Set() }, // UNDO: Destroy
        { type: 'create', entity: id } // REDO: Create
      );
    }
    return id;
  }

  /**
   * Destroy an entity and all its components.
   */
  destroyEntity(entity: Entity): void {
    const componentsToSave = new Map<ComponentType, any>();
    for (const [type, store] of this.components) {
      if (store.has(entity)) {
        componentsToSave.set(type, store.get(entity));
      }
    }

    const tagsToSave = new Set(this.tags.get(entity) || []);

    if (!this.isUndoing) {
      this.undoManager.push(
        { type: 'restore', entity, components: componentsToSave, tags: tagsToSave }, // UNDO: Restore
        { type: 'destroy', entity, components: componentsToSave, tags: tagsToSave } // REDO: Destroy
      );
    }

    this.entities.delete(entity);
    this.tags.delete(entity);
    for (const store of this.components.values()) {
      store.delete(entity);
    }
  }

  /**
   * Check if an entity exists.
   */
  hasEntity(entity: Entity): boolean {
    return this.entities.has(entity);
  }

  /**
   * Get entity count.
   */
  get entityCount(): number {
    return this.entities.size;
  }

  /**
   * Add a component to an entity.
   * The component data will be wrapped in a reactive proxy.
   */
  addComponent<T extends object>(entity: Entity, type: ComponentType, data: T): void {
    if (!this.entities.has(entity)) return;
    if (!this.components.has(type)) this.components.set(type, new Map());

    // Wrap in reactive proxy for state tracking
    const reactiveData = reactive(data, (target, key, value, oldValue) => {
      if (!this.isUndoing) {
        this.undoManager.push(
          {
            type: 'updateComponent',
            entity,
            componentType: type,
            key,
            value: oldValue,
            oldValue: undefined,
          }, // UNDO
          { type: 'updateComponent', entity, componentType: type, key, value, oldValue: undefined } // REDO
        );
      }
    });

    this.components.get(type)!.set(entity, reactiveData);

    if (!this.isUndoing) {
      this.undoManager.push(
        { type: 'removeComponent', entity, componentType: type, data: reactiveData }, // UNDO
        { type: 'addComponent', entity, componentType: type, data: reactiveData } // REDO
      );
    }
  }

  /**
   * Remove a component from an entity.
   */
  removeComponent(entity: Entity, type: ComponentType): void {
    const data = this.components.get(type)?.get(entity);
    if (data && !this.isUndoing) {
      this.undoManager.push(
        { type: 'addComponent', entity, componentType: type, data }, // UNDO
        { type: 'removeComponent', entity, componentType: type, data } // REDO
      );
    }
    this.components.get(type)?.delete(entity);
  }

  /**
   * Get a component from an entity.
   */
  getComponent<T>(entity: Entity, type: ComponentType): T | undefined {
    return this.components.get(type)?.get(entity) as T | undefined;
  }

  /**
   * Check if an entity has a component.
   */
  hasComponent(entity: Entity, type: ComponentType): boolean {
    return this.components.get(type)?.has(entity) || false;
  }

  /**
   * Get all component types for an entity.
   */
  getComponentTypes(entity: Entity): ComponentType[] {
    const types: ComponentType[] = [];
    for (const [type, store] of this.components) {
      if (store.has(entity)) {
        types.push(type);
      }
    }
    return types;
  }

  /**
   * Add a tag to an entity.
   */
  addTag(entity: Entity, tag: string): void {
    if (!this.tags.has(entity)) this.tags.set(entity, new Set());
    this.tags.get(entity)!.add(tag);
  }

  /**
   * Check if an entity has a tag.
   */
  hasTag(entity: Entity, tag: string): boolean {
    return this.tags.get(entity)?.has(tag) || false;
  }

  /**
   * Query all entities that have ALL of the specified component types.
   */
  query(...componentTypes: ComponentType[]): Entity[] {
    const results: Entity[] = [];
    for (const entity of this.entities) {
      let match = true;
      for (const type of componentTypes) {
        if (!this.hasComponent(entity, type)) {
          match = false;
          break;
        }
      }
      if (match) results.push(entity);
    }
    return results;
  }

  /**
   * Query entities by tag.
   */
  queryByTag(tag: string): Entity[] {
    const results: Entity[] = [];
    for (const entity of this.entities) {
      if (this.hasTag(entity, tag)) results.push(entity);
    }
    return results;
  }

  /**
   * Get all entities.
   */
  getAllEntities(): Entity[] {
    return Array.from(this.entities);
  }

  /**
   * Undo the last operation.
   */
  undo(): void {
    const step = this.undoManager.undo();
    if (!step) return;

    this.isUndoing = true;
    try {
      this.applyOp(step.undo);
    } finally {
      this.isUndoing = false;
    }
  }

  /**
   * Redo the last undone operation.
   */
  redo(): void {
    const step = this.undoManager.redo();
    if (!step) return;

    this.isUndoing = true;
    try {
      this.applyOp(step.redo);
    } finally {
      this.isUndoing = false;
    }
  }

  private applyOp(op: WorldOp): void {
    switch (op.type) {
      case 'create':
        // To restore a creation means we just create it again?
        // No, we should ideally restore the exact entity ID if possible,
        // but for now createEntity() increments ID.
        // Weakness: re-creating might result in different ID if we don't handle it.
        // However, 'create' op is usually the inverse of 'destroy'.
        // If we are undoing a destroy, we need to restore entity with SAME ID.
        // Let's modify createEntity to accept an ID?
        // Or just force it.
        if (!this.entities.has(op.entity)) {
          this.entities.add(op.entity);
          // Ensure nextEntity is higher
          if (op.entity >= this.nextEntity) {
            this.nextEntity = op.entity + 1;
          }
        }
        break;

      case 'destroy':
        this.destroyEntity(op.entity);
        // destroyEntity pushes to undoManager if not isUndoing.
        break;

      case 'addComponent':
        this.addComponent(op.entity, op.componentType, op.data);
        break;

      case 'removeComponent':
        this.removeComponent(op.entity, op.componentType);
        break;

      case 'updateComponent':
        const store = this.components.get(op.componentType);
        if (store && store.has(op.entity)) {
          const comp = store.get(op.entity);
          // Direct update to proxy
          comp[op.key] = op.value;
        }
        break;

      case 'addTag':
        this.addTag(op.entity, op.tag);
        break;

      case 'removeTag':
        if (this.tags.has(op.entity)) {
          this.tags.get(op.entity)!.delete(op.tag);
        }
        break;
      case 'restore':
        // Restore entity
        if (!this.entities.has(op.entity)) {
          this.entities.add(op.entity);
          if (op.entity >= this.nextEntity) {
            this.nextEntity = op.entity + 1;
          }
        }

        // Restore components
        op.components.forEach((data, type) => {
          this.addComponent(op.entity, type, data);
        });

        // Restore tags
        op.tags.forEach((tag) => this.addTag(op.entity, tag));
        break;
    }
  }
}

