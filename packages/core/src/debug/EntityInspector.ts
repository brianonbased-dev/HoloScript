/**
 * EntityInspector — Live entity browser with component viewer
 *
 * @version 1.0.0
 */

export interface InspectedEntity {
  id: string;
  name: string;
  tags: string[];
  components: Map<string, Record<string, unknown>>;
  active: boolean;
  parentId: string | null;
}

export interface InspectorFilter {
  nameQuery?: string;
  tag?: string;
  componentType?: string;
  activeOnly?: boolean;
}

export class EntityInspector {
  private entities: Map<string, InspectedEntity> = new Map();
  private selectedId: string | null = null;
  private watchedProperties: Map<string, string[]> = new Map(); // entityId → property paths

  registerEntity(entity: InspectedEntity): void {
    this.entities.set(entity.id, entity);
  }

  removeEntity(id: string): boolean {
    return this.entities.delete(id);
  }

  select(id: string): boolean {
    if (!this.entities.has(id)) return false;
    this.selectedId = id;
    return true;
  }

  getSelected(): InspectedEntity | null {
    return this.selectedId ? (this.entities.get(this.selectedId) ?? null) : null;
  }

  /**
   * Get component data for a selected entity
   */
  getComponent(entityId: string, componentType: string): Record<string, unknown> | undefined {
    return this.entities.get(entityId)?.components.get(componentType);
  }

  /**
   * Edit a property on a component
   */
  setProperty(entityId: string, componentType: string, key: string, value: unknown): boolean {
    const comp = this.entities.get(entityId)?.components.get(componentType);
    if (!comp) return false;
    comp[key] = value;
    return true;
  }

  /**
   * Filter entities
   */
  filter(f: InspectorFilter): InspectedEntity[] {
    let result = [...this.entities.values()];
    if (f.nameQuery) {
      const q = f.nameQuery.toLowerCase();
      result = result.filter((e) => e.name.toLowerCase().includes(q));
    }
    if (f.tag) result = result.filter((e) => e.tags.includes(f.tag!));
    if (f.componentType) result = result.filter((e) => e.components.has(f.componentType!));
    if (f.activeOnly) result = result.filter((e) => e.active);
    return result;
  }

  /**
   * Watch properties for changes
   */
  watch(entityId: string, properties: string[]): void {
    this.watchedProperties.set(entityId, properties);
  }

  getWatched(): Map<string, string[]> {
    return new Map(this.watchedProperties);
  }
  getEntityCount(): number {
    return this.entities.size;
  }
}
