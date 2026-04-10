/**
 * SceneRunner.ts
 *
 * Walks parsed HoloScript+ AST and instantiates the runtime scene:
 * - Creates ECS entities from HSPlusNode tree
 * - Attaches components (transform, renderable, etc.)
 * - Binds traits from @directives via TraitBinder
 * - Wires event listeners via EventBus
 * - Applies theme styles
 *
 * This is THE bridge between the parser and the engine.
 */
import type { HSPlusNode } from '@holoscript/core';
import { World, Entity } from '@holoscript/core';
import { TraitBinder } from './TraitBinder';
import { EventBus } from '@holoscript/core';
import { AssetPipeline } from './AssetPipeline';

export interface AssetManifestEntry {
  type: string;
  path: string;
}

export interface SceneRunnerConfig {
  world: World;
  traitBinder: TraitBinder;
  eventBus: EventBus;
  /** Optional asset pipeline for preloading scene assets. */
  assetPipeline?: AssetPipeline;
}

export interface SpawnedEntity {
  entity: Entity;
  nodeId: string;
  nodeType: string;
  traitNames: string[];
  childEntities: Entity[];
}

export class SceneRunner {
  private world: World;
  private traitBinder: TraitBinder;
  private eventBus: EventBus;
  private spawnedEntities: Map<string, SpawnedEntity> = new Map();
  private nodeToEntity: Map<string, Entity> = new Map();
  /** Optional asset pipeline — set via config.assetPipeline */
  readonly assetPipeline?: AssetPipeline;

  constructor(config: SceneRunnerConfig) {
    this.world = config.world;
    this.traitBinder = config.traitBinder;
    this.eventBus = config.eventBus;
    this.assetPipeline = config.assetPipeline;
  }

  /**
   * Preload a list of typed assets via the AssetPipeline.
   * All assets load in parallel; rejects if any single load fails.
   * No-op if no AssetPipeline was provided in config.
   */
  async preloadAssets(manifest: AssetManifestEntry[]): Promise<void> {
    if (!this.assetPipeline || manifest.length === 0) return;
    await Promise.all(manifest.map(({ type, path }) => this.assetPipeline!.load(type, path)));
  }

  /**
   * Convenience: preload assets then run the AST.
   * Emits 'scene:assets_loaded' on the EventBus after preloading.
   */
  async runWithAssets(root: HSPlusNode, manifest: AssetManifestEntry[]): Promise<Entity> {
    await this.preloadAssets(manifest);
    this.eventBus.emit('scene:assets_loaded', { count: manifest.length });
    return this.run(root);
  }

  /**
   * Run an entire AST — walks the tree and instantiates everything.
   */
  run(root: HSPlusNode): Entity {
    return this.instantiateNode(root);
  }

  /**
   * Instantiate a single AST node as an ECS entity, then recurse into children.
   */
  instantiateNode(node: HSPlusNode, parentEntity?: Entity): Entity {
    const entity = this.world.createEntity();
    const nodeId = node.id || node.name || `node_${entity}`;

    // 1. Add transform component from node properties
    const pos = this.extractVec3(node.properties, 'position', { x: 0, y: 0, z: 0 });
    const rot = this.extractVec3(node.properties, 'rotation', { x: 0, y: 0, z: 0 });
    const scl = this.extractVec3(node.properties, 'scale', { x: 1, y: 1, z: 1 });
    this.world.addComponent(entity, 'transform', { position: pos, rotation: rot, scale: scl });

    // 2. Add renderable component if it has visual properties
    if (node.type && node.type !== 'document' && node.type !== 'program') {
      this.world.addComponent(entity, 'renderable', {
        visible: true,
        nodeType: node.type,
        color: (node.properties as Record<string, unknown> | undefined)?.color || '#FFFFFF',
        opacity: (node.properties as Record<string, unknown> | undefined)?.opacity ?? 1,
      });
    }

    // 3. Add node identity tag
    this.world.addTag(entity, `type:${node.type || 'entity'}`);
    if (node.name) this.world.addTag(entity, `name:${node.name}`);

    // 4. Process directives → bind traits
    const boundTraits: string[] = [];
    if (node.directives) {
      for (const directive of node.directives) {
        const d = directive as Record<string, unknown>;
        const traitName = String(d.name || d.type || '');
        if (!traitName) continue;

        if (this.traitBinder.has(traitName)) {
          const config = this.traitBinder.mergeConfig(
            traitName,
            (d.args || {}) as Record<string, unknown>
          );
          this.world.addComponent(entity, `trait:${traitName}`, config);
          boundTraits.push(traitName);

          // Emit event for trait attachment
          this.eventBus.emit('trait:attached', { entity, nodeId, traitName, config });
        }
      }
    }

    // 5. Store all properties as a component
    if (node.properties && Object.keys(node.properties).length > 0) {
      this.world.addComponent(entity, 'properties', { ...node.properties });
    }

    // 6. If node has event handlers, store them
    if (node.event) {
      this.world.addComponent(entity, 'event_handler', { event: node.event, data: node.data });
    }

    // 7. Recurse into children
    const childEntities: Entity[] = [];
    if (node.children) {
      for (const child of node.children) {
        const childEntity = this.instantiateNode(child, entity);
        childEntities.push(childEntity);
      }
    }

    // 8. Store parent-child relationship
    if (parentEntity !== undefined) {
      this.world.addComponent(entity, 'parent', { parentEntity });
    }
    if (childEntities.length > 0) {
      this.world.addComponent(entity, 'children', { entities: childEntities });
    }

    // 9. Track for lookup
    const spawned: SpawnedEntity = {
      entity,
      nodeId,
      nodeType: node.type || 'unknown',
      traitNames: boundTraits,
      childEntities,
    };
    this.spawnedEntities.set(nodeId, spawned);
    this.nodeToEntity.set(nodeId, entity);

    // 10. Emit instantiation event
    this.eventBus.emit('node:instantiated', { entity, nodeId, nodeType: node.type });

    return entity;
  }

  /**
   * Get entity for a node ID.
   */
  getEntity(nodeId: string): Entity | undefined {
    return this.nodeToEntity.get(nodeId);
  }

  /**
   * Get spawned entity info.
   */
  getSpawned(nodeId: string): SpawnedEntity | undefined {
    return this.spawnedEntities.get(nodeId);
  }

  /**
   * Get all spawned entities.
   */
  getAllSpawned(): SpawnedEntity[] {
    return Array.from(this.spawnedEntities.values());
  }

  /**
   * Despawn all entities from this run.
   */
  despawnAll(): void {
    for (const spawned of this.spawnedEntities.values()) {
      this.world.destroyEntity(spawned.entity);
    }
    this.spawnedEntities.clear();
    this.nodeToEntity.clear();
  }

  /**
   * Get spawned entity count.
   */
  get spawnedCount(): number {
    return this.spawnedEntities.size;
  }

  private extractVec3(
    props: Record<string, unknown> | undefined,
    key: string,
    fallback: { x: number; y: number; z: number }
  ): { x: number; y: number; z: number } {
    if (!props || !props[key]) return fallback;
    const v = props[key];
    if (Array.isArray(v))
      return { x: Number(v[0]) || 0, y: Number(v[1]) || 0, z: Number(v[2]) || 0 };
    if (typeof v === 'object' && v !== null) {
      const o = v as Record<string, unknown>;
      return { x: Number(o.x) || 0, y: Number(o.y) || 0, z: Number(o.z) || 0 };
    }
    return fallback;
  }
}
