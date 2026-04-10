/**
 * EntityRegistry.ts
 *
 * Entity management: creation, destruction, tag-based queries,
 * archetype tracking, and hierarchical parent-child relationships.
 *
 * @module ecs
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Entity {
  id: number;
  name: string;
  active: boolean;
  tags: Set<string>;
  components: Set<string>;
  parent: number | null;
  children: number[];
  createdAt: number;
}

// =============================================================================
// ENTITY REGISTRY
// =============================================================================

export class EntityRegistry {
  private entities: Map<number, Entity> = new Map();
  private nextId = 1;
  private recycledIds: number[] = [];
  private tagIndex: Map<string, Set<number>> = new Map();
  private nameIndex: Map<string, number> = new Map();

  // ---------------------------------------------------------------------------
  // Entity Lifecycle
  // ---------------------------------------------------------------------------

  create(name = '', tags: string[] = []): Entity {
    const id = this.recycledIds.length > 0 ? this.recycledIds.pop()! : this.nextId++;
    const tagSet = new Set(tags);

    const entity: Entity = {
      id,
      name: name || `entity_${id}`,
      active: true,
      tags: tagSet,
      components: new Set(),
      parent: null,
      children: [],
      createdAt: Date.now(),
    };

    this.entities.set(id, entity);
    if (entity.name) this.nameIndex.set(entity.name, id);

    for (const tag of tags) {
      if (!this.tagIndex.has(tag)) this.tagIndex.set(tag, new Set());
      this.tagIndex.get(tag)!.add(id);
    }

    return entity;
  }

  destroy(id: number): boolean {
    const entity = this.entities.get(id);
    if (!entity) return false;

    // Remove from parent
    if (entity.parent !== null) {
      const parent = this.entities.get(entity.parent);
      if (parent) parent.children = parent.children.filter((c) => c !== id);
    }

    // Destroy children recursively
    for (const childId of [...entity.children]) {
      this.destroy(childId);
    }

    // Cleanup indices
    this.nameIndex.delete(entity.name);
    for (const tag of entity.tags) {
      this.tagIndex.get(tag)?.delete(id);
    }

    this.entities.delete(id);
    this.recycledIds.push(id);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  get(id: number): Entity | undefined {
    return this.entities.get(id);
  }
  getByName(name: string): Entity | undefined {
    const id = this.nameIndex.get(name);
    return id !== undefined ? this.entities.get(id) : undefined;
  }

  getByTag(tag: string): Entity[] {
    const ids = this.tagIndex.get(tag);
    if (!ids) return [];
    return [...ids].map((id) => this.entities.get(id)!).filter((e) => e && e.active);
  }

  getByComponents(...componentTypes: string[]): Entity[] {
    const result: Entity[] = [];
    for (const entity of this.entities.values()) {
      if (!entity.active) continue;
      if (componentTypes.every((t) => entity.components.has(t))) {
        result.push(entity);
      }
    }
    return result;
  }

  getAll(): Entity[] {
    return [...this.entities.values()];
  }
  getActiveCount(): number {
    let count = 0;
    for (const e of this.entities.values()) if (e.active) count++;
    return count;
  }
  getTotalCount(): number {
    return this.entities.size;
  }

  // ---------------------------------------------------------------------------
  // Tags
  // ---------------------------------------------------------------------------

  addTag(id: number, tag: string): boolean {
    const entity = this.entities.get(id);
    if (!entity) return false;
    entity.tags.add(tag);
    if (!this.tagIndex.has(tag)) this.tagIndex.set(tag, new Set());
    this.tagIndex.get(tag)!.add(id);
    return true;
  }

  removeTag(id: number, tag: string): boolean {
    const entity = this.entities.get(id);
    if (!entity) return false;
    entity.tags.delete(tag);
    this.tagIndex.get(tag)?.delete(id);
    return true;
  }

  hasTag(id: number, tag: string): boolean {
    return this.entities.get(id)?.tags.has(tag) ?? false;
  }

  // ---------------------------------------------------------------------------
  // Hierarchy
  // ---------------------------------------------------------------------------

  setParent(childId: number, parentId: number): boolean {
    const child = this.entities.get(childId);
    const parent = this.entities.get(parentId);
    if (!child || !parent) return false;

    // Remove from old parent
    if (child.parent !== null) {
      const oldParent = this.entities.get(child.parent);
      if (oldParent) oldParent.children = oldParent.children.filter((c) => c !== childId);
    }

    child.parent = parentId;
    parent.children.push(childId);
    return true;
  }

  getChildren(id: number): Entity[] {
    const entity = this.entities.get(id);
    if (!entity) return [];
    return entity.children.map((cid) => this.entities.get(cid)!).filter(Boolean);
  }

  // ---------------------------------------------------------------------------
  // Component Registration (bookkeeping only — actual data in ComponentStore)
  // ---------------------------------------------------------------------------

  registerComponent(entityId: number, componentType: string): boolean {
    const entity = this.entities.get(entityId);
    if (!entity) return false;
    entity.components.add(componentType);
    return true;
  }

  unregisterComponent(entityId: number, componentType: string): boolean {
    const entity = this.entities.get(entityId);
    if (!entity) return false;
    return entity.components.delete(componentType);
  }

  hasComponent(entityId: number, componentType: string): boolean {
    return this.entities.get(entityId)?.components.has(componentType) ?? false;
  }

  // ---------------------------------------------------------------------------
  // Activation
  // ---------------------------------------------------------------------------

  setActive(id: number, active: boolean): void {
    const entity = this.entities.get(id);
    if (entity) entity.active = active;
  }
}

