/**
 * ComponentRegistry.ts
 *
 * Registry for component type schemas and defaults.
 * Ensures consistent component creation across the ECS.
 */

export interface ComponentSchema {
  type: string;
  defaultData: () => any;
  description?: string;
}

export class ComponentRegistry {
  private schemas: Map<string, ComponentSchema> = new Map();

  /**
   * Register a component type with its default data factory.
   */
  register(schema: ComponentSchema): void {
    this.schemas.set(schema.type, schema);
  }

  /**
   * Get the schema for a component type.
   */
  getSchema(type: string): ComponentSchema | undefined {
    return this.schemas.get(type);
  }

  /**
   * Create default data for a component type.
   */
  createDefault(type: string): any {
    const schema = this.schemas.get(type);
    return schema ? schema.defaultData() : undefined;
  }

  /**
   * Check if a component type is registered.
   */
  has(type: string): boolean {
    return this.schemas.has(type);
  }

  /**
   * List all registered component types.
   */
  listTypes(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Get count of registered types.
   */
  get count(): number {
    return this.schemas.size;
  }
}

// =============================================================================
// BUILT-IN COMPONENT SCHEMAS
// =============================================================================

export function registerBuiltInComponents(registry: ComponentRegistry): void {
  registry.register({
    type: 'transform',
    defaultData: () => ({
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    }),
    description: 'Position, rotation, and scale in 3D space.',
  });

  registry.register({
    type: 'renderable',
    defaultData: () => ({ visible: true, meshType: 'box', color: '#FFFFFF', opacity: 1 }),
    description: 'Visual rendering properties.',
  });

  registry.register({
    type: 'collider',
    defaultData: () => ({ type: 'box', size: { x: 1, y: 1, z: 1 }, isTrigger: false }),
    description: 'Collision shape.',
  });

  registry.register({
    type: 'rigidbody',
    defaultData: () => ({
      mass: 1,
      velocity: { x: 0, y: 0, z: 0 },
      useGravity: true,
      isKinematic: false,
    }),
    description: 'Physics body properties.',
  });

  registry.register({
    type: 'audio_source',
    defaultData: () => ({ soundId: '', volume: 1, loop: false, spatialize: true }),
    description: 'Spatial audio source.',
  });

  registry.register({
    type: 'ui_element',
    defaultData: () => ({ type: 'panel', interactive: false, text: '' }),
    description: 'UI element properties.',
  });
}
