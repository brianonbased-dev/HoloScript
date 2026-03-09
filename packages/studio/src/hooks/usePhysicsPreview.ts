'use client';
/**
 * usePhysicsPreview — Hook for live physics simulation preview
 */
import { useState, useCallback, useRef } from 'react';
import {
  ECSWorld,
  ComponentType,
  type TransformComponent,
  type VelocityComponent,
  type ColliderComponent,
  type SystemStats,
} from '@holoscript/core';

export interface PhysicsEntity {
  id: number;
  transform: TransformComponent;
  velocity?: VelocityComponent;
  collider?: ColliderComponent;
}

export interface UsePhysicsPreviewReturn {
  world: ECSWorld;
  entities: PhysicsEntity[];
  stats: SystemStats;
  isRunning: boolean;
  spawn: (t: TransformComponent, v?: VelocityComponent, c?: ColliderComponent) => number;
  start: () => void;
  stop: () => void;
  step: (dt?: number) => void;
  reset: () => void;
}

export function usePhysicsPreview(): UsePhysicsPreviewReturn {
  const worldRef = useRef(new ECSWorld());
  const [entities, setEntities] = useState<PhysicsEntity[]>([]);
  const [stats, setStats] = useState<SystemStats>({
    entityCount: 0,
    systemCount: 0,
    lastFrameMs: 0,
    avgFrameMs: 0,
    peakFrameMs: 0,
    totalFrames: 0,
  });
  const [isRunning, setIsRunning] = useState(false);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef(0);

  const syncEntities = useCallback(() => {
    const w = worldRef.current;
    const mask = ComponentType.Transform;
    const ids = w.query(mask);
    const ents: PhysicsEntity[] = ids.map((id) => ({
      id,
      transform: w.getTransform(id)!,
      velocity: w.getVelocity(id),
      collider: w.getCollider(id),
    }));
    setEntities(ents);
    setStats(w.getStats());
  }, []);

  const spawn = useCallback(
    (t: TransformComponent, v?: VelocityComponent, c?: ColliderComponent) => {
      const w = worldRef.current;
      const id = w.createEntity();
      w.addTransform(id, t);
      if (v) w.addVelocity(id, v);
      if (c) w.addCollider(id, c);
      syncEntities();
      return id;
    },
    [syncEntities]
  );

  const step = useCallback(
    (dt = 1 / 60) => {
      worldRef.current.tick(dt);
      syncEntities();
    },
    [syncEntities]
  );

  const loop = useCallback(
    (time: number) => {
      const dt = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 1 / 60;
      lastTimeRef.current = time;
      step(Math.min(dt, 0.05));
      rafRef.current = requestAnimationFrame(loop);
    },
    [step]
  );

  const start = useCallback(() => {
    if (isRunning) return;
    setIsRunning(true);
    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(loop);
  }, [isRunning, loop]);

  const stop = useCallback(() => {
    setIsRunning(false);
    cancelAnimationFrame(rafRef.current);
  }, []);

  const reset = useCallback(() => {
    stop();
    worldRef.current = new ECSWorld();
    syncEntities();
  }, [stop, syncEntities]);

  return { world: worldRef.current, entities, stats, isRunning, spawn, start, stop, step, reset };
}
