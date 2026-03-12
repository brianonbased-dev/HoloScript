'use client';
/**
 * useECSInspector — Hook for ECS world inspection and entity management
 */
import { useState, useCallback, useRef } from 'react';
import {
  ECSWorld,
  type TransformComponent,
  type VelocityComponent,
  type ColliderComponent,
  type RenderableComponent,
  type AgentComponent,
  type SystemStats,
} from '@holoscript/core';

// Local numeric constants matching ComponentType const enum (cannot cross isolatedModules boundary)
const CT_Transform  = 0b00001; // ComponentType.Transform
const CT_Velocity   = 0b00010; // ComponentType.Velocity
const CT_Collider   = 0b00100; // ComponentType.Collider
const CT_Renderable = 0b01000; // ComponentType.Renderable
const CT_Agent      = 0b10000; // ComponentType.Agent

export interface EntityInfo {
  id: number;
  mask: number;
  components: string[];
  transform?: TransformComponent;
  velocity?: VelocityComponent;
  collider?: ColliderComponent;
  renderable?: RenderableComponent;
  agent?: AgentComponent;
}

export interface UseECSInspectorReturn {
  world: ECSWorld;
  entities: EntityInfo[];
  stats: SystemStats;
  selectedEntity: EntityInfo | null;
  select: (id: number) => void;
  spawn: (
    components: Partial<
      Record<'transform' | 'velocity' | 'collider' | 'renderable' | 'agent', boolean>
    >
  ) => number;
  destroy: (id: number) => void;
  tick: (dt?: number) => void;
  reset: () => void;
  spawnBatch: (count: number) => void;
}

const COMPONENT_NAMES: [number, string][] = [
  [CT_Transform,  'Transform'],
  [CT_Velocity,   'Velocity'],
  [CT_Collider,   'Collider'],
  [CT_Renderable, 'Renderable'],
  [CT_Agent,      'Agent'],
];

export function useECSInspector(): UseECSInspectorReturn {
  const worldRef = useRef(new ECSWorld());
  const [entities, setEntities] = useState<EntityInfo[]>([]);
  const [stats, setStats] = useState<SystemStats>({
    entityCount: 0,
    systemCount: 0,
    lastFrameMs: 0,
    avgFrameMs: 0,
    peakFrameMs: 0,
    totalFrames: 0,
  });
  const [selectedEntity, setSelectedEntity] = useState<EntityInfo | null>(null);

  const syncEntities = useCallback(() => {
    const w = worldRef.current;
    // Query all entities (any component)
    const allMask =
      CT_Transform |
      CT_Velocity |
      CT_Collider |
      CT_Renderable |
      CT_Agent;
    const ids = new Set<number>();
    for (const [mask] of COMPONENT_NAMES) {
      for (const id of w.query(mask)) ids.add(id);
    }
    const infos: EntityInfo[] = [...ids]
      .map((id) => {
        const m = w.getMask(id);
        const comps = COMPONENT_NAMES.filter(([c]) => (m & c) !== 0).map(([, n]) => n);
        return {
          id,
          mask: m,
          components: comps,
          transform: w.getTransform(id),
          velocity: w.getVelocity(id),
          collider: w.getCollider(id),
          renderable: w.getRenderable(id),
          agent: w.getAgent(id),
        };
      })
      .sort((a, b) => a.id - b.id);
    setEntities(infos);
    setStats(w.getStats());
  }, []);

  const select = useCallback(
    (id: number) => {
      setSelectedEntity(entities.find((e) => e.id === id) || null);
    },
    [entities]
  );

  const spawn = useCallback(
    (
      comps: Partial<
        Record<'transform' | 'velocity' | 'collider' | 'renderable' | 'agent', boolean>
      >
    ) => {
      const w = worldRef.current;
      const id = w.createEntity();
      if (comps.transform !== false)
        w.addTransform(id, {
          x: Math.random() * 10 - 5,
          y: 0,
          z: Math.random() * 10 - 5,
          rx: 0,
          ry: 0,
          rz: 0,
          sx: 1,
          sy: 1,
          sz: 1,
        });
      if (comps.velocity)
        w.addVelocity(id, { vx: 0, vy: 0, vz: 0, angularX: 0, angularY: 0, angularZ: 0 });
      if (comps.collider)
        w.addCollider(id, {
          type: 'sphere',
          radius: 0.5,
          halfExtentX: 0.5,
          halfExtentY: 0.5,
          halfExtentZ: 0.5,
          isTrigger: false,
        });
      if (comps.renderable)
        w.addRenderable(id, {
          meshId: 'sphere',
          materialId: 'default',
          visible: true,
          lodLevel: 0,
        });
      if (comps.agent)
        w.addAgent(id, {
          state: 'idle',
          targetX: 0,
          targetY: 0,
          targetZ: 0,
          speed: 1,
          traitMask: 0,
        });
      syncEntities();
      return id;
    },
    [syncEntities]
  );

  const destroy = useCallback(
    (id: number) => {
      worldRef.current.destroyEntity(id);
      syncEntities();
    },
    [syncEntities]
  );

  const tick = useCallback(
    (dt = 1 / 60) => {
      worldRef.current.tick(dt);
      syncEntities();
    },
    [syncEntities]
  );

  const reset = useCallback(() => {
    worldRef.current = new ECSWorld();
    setEntities([]);
    setSelectedEntity(null);
    setStats({
      entityCount: 0,
      systemCount: 0,
      lastFrameMs: 0,
      avgFrameMs: 0,
      peakFrameMs: 0,
      totalFrames: 0,
    });
  }, []);

  const spawnBatch = useCallback(
    (count: number) => {
      const w = worldRef.current;
      for (let i = 0; i < count; i++) {
        const id = w.createEntity();
        w.addTransform(id, {
          x: Math.random() * 20 - 10,
          y: Math.random() * 5,
          z: Math.random() * 20 - 10,
          rx: 0,
          ry: 0,
          rz: 0,
          sx: 1,
          sy: 1,
          sz: 1,
        });
        if (i % 2 === 0)
          w.addVelocity(id, {
            vx: Math.random() - 0.5,
            vy: 0,
            vz: Math.random() - 0.5,
            angularX: 0,
            angularY: 0,
            angularZ: 0,
          });
        if (i % 3 === 0)
          w.addRenderable(id, {
            meshId: 'cube',
            materialId: 'default',
            visible: true,
            lodLevel: 0,
          });
      }
      syncEntities();
    },
    [syncEntities]
  );

  return {
    world: worldRef.current,
    entities,
    stats,
    selectedEntity,
    select,
    spawn,
    destroy,
    tick,
    reset,
    spawnBatch,
  };
}
