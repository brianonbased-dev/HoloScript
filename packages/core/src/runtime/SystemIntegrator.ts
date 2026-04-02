/**
 * SystemIntegrator.ts
 *
 * Registers built-in ECS systems that connect the engine subsystems:
 * - Animation system reads 'trait:animation' components
 * - Audio system reads 'trait:audio' components
 * - Particle system reads 'trait:particles' components
 * - State machine system reads 'trait:state' components
 * - Network sync system reads 'trait:sync' components
 * - Theme system reads 'trait:theme' components
 *
 * Each "integration system" queries the ECS World for entities with the
 * relevant trait component, then drives the corresponding engine subsystem.
 */

import { World, Entity } from '../ecs/World';
import type { SystemScheduler, SystemPhase } from '../ecs/SystemScheduler';
import type { EventBus } from '../events/EventBus';

export interface ECSSystem {
  name: string;
  priority: number;
  enabled: boolean;
  requiredComponents: string[];
  update: (world: World, entities: Entity[], delta: number) => void;
  phase?: SystemPhase;
}

/**
 * Create the built-in integration systems.
 * These bridge ECS components to engine subsystems.
 */
export function createIntegrationSystems(eventBus: EventBus): ECSSystem[] {
  return [
    // --- Transform Propagation (priority 0 — runs first) ---
    {
      name: 'transform_propagation',
      priority: 0,
      enabled: true,
      requiredComponents: ['transform', 'parent'],
      update(world: World, entities: Entity[], _delta: number) {
        for (const entity of entities) {
          const transform = world.getComponent<any>(entity, 'transform');
          const parent = world.getComponent<any>(entity, 'parent');
          if (parent && transform) {
            const parentTransform = world.getComponent<any>(parent.parentEntity, 'transform');
            if (parentTransform) {
              // Store world position (simplified — additive)
              transform._worldX =
                (parentTransform._worldX ?? parentTransform.position.x) + transform.position.x;
              transform._worldY =
                (parentTransform._worldY ?? parentTransform.position.y) + transform.position.y;
              transform._worldZ =
                (parentTransform._worldZ ?? parentTransform.position.z) + transform.position.z;
            }
          }
        }
      },
    },

    // --- Animation System (priority 10) ---
    {
      name: 'animation_integration',
      priority: 10,
      enabled: true,
      requiredComponents: ['trait:animation'],
      update(world: World, entities: Entity[], delta: number) {
        for (const entity of entities) {
          const config = world.getComponent<any>(entity, 'trait:animation');
          if (config && config._engine) {
            config._engine.update(delta);
          }
        }
      },
    },

    // --- State Machine System (priority 20) ---
    {
      name: 'state_machine_integration',
      priority: 20,
      enabled: true,
      requiredComponents: ['trait:state'],
      update(world: World, entities: Entity[], delta: number) {
        for (const entity of entities) {
          const config = world.getComponent<any>(entity, 'trait:state');
          if (config && config._fsm) {
            config._fsm.update(delta);
            // Surface state onto properties
            const props = world.getComponent<any>(entity, 'properties');
            if (props) {
              props._state = config._fsm.currentState;
            }
          }
        }
      },
    },

    // --- Particle System (priority 30) ---
    {
      name: 'particle_integration',
      priority: 30,
      enabled: true,
      requiredComponents: ['trait:particles'],
      update(world: World, entities: Entity[], delta: number) {
        for (const entity of entities) {
          const config = world.getComponent<any>(entity, 'trait:particles');
          if (config && config._system) {
            config._system.update(delta);
          }
        }
      },
    },

    // --- Network Sync System (priority 50) ---
    {
      name: 'network_sync_integration',
      priority: 50,
      enabled: true,
      requiredComponents: ['trait:sync'],
      update(world: World, entities: Entity[], delta: number) {
        for (const entity of entities) {
          const syncConfig = world.getComponent<any>(entity, 'trait:sync');
          if (!syncConfig) continue;

          syncConfig._timer = (syncConfig._timer || 0) + delta;
          const interval = 1 / (syncConfig.syncRate || 20);

          if (syncConfig._timer >= interval) {
            syncConfig._timer -= interval;
            const transform = world.getComponent<any>(entity, 'transform');
            if (transform) {
              eventBus.emit('network:sync', { entity, transform });
            }
          }
        }
      },
    },

    // --- Renderable Cull System (priority 90 — runs late) ---
    {
      name: 'renderable_cull',
      priority: 90,
      enabled: true,
      requiredComponents: ['renderable', 'transform'],
      update(world: World, entities: Entity[], _delta: number) {
        // Count visible entities for performance metrics
        let visibleCount = 0;
        for (const entity of entities) {
          const r = world.getComponent<any>(entity, 'renderable');
          if (r && r.visible) visibleCount++;
        }
        eventBus.emit('render:stats', { visibleCount, totalCount: entities.length });
      },
    },
  ];
}

/**
 * Register all integration systems with the scheduler.
 */
export function registerIntegrationSystems(scheduler: SystemScheduler, eventBus: EventBus, world?: World): void {
  const systems = createIntegrationSystems(eventBus);
  for (const sys of systems) {
    scheduler.register(
      sys.name,
      (dt: number) => {
        if (world) {
          const entities = world.query(...sys.requiredComponents);
          sys.update(world, entities, dt);
        }
      },
      sys.phase || 'update',
      sys.priority
    );
  }
}
