'use client';
/**
 * useMultiplayer — Hook for multiplayer state simulation and visualization
 *
 * Uses ECSWorld to simulate multiple connected clients with entity ownership
 * and state synchronization. No real networking — just a local simulation
 * for the Studio panel.
 */
import { useState, useCallback, useRef } from 'react';
import { ECSWorld, ComponentType, type TransformComponent } from '@holoscript/core';

export interface NetworkedEntity {
  id: number;
  owner: string;
  transform: TransformComponent;
  synced: boolean;
}
export interface ClientInfo {
  id: string;
  name: string;
  ping: number;
  entities: number;
  color: string;
}

const CLIENT_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];

export interface UseMultiplayerReturn {
  clients: ClientInfo[];
  entities: NetworkedEntity[];
  tickRate: number;
  bandwidth: string;
  addClient: (name?: string) => void;
  removeClient: (id: string) => void;
  spawnNetworked: (owner: string) => number;
  simulateTick: () => void;
  reset: () => void;
}

export function useMultiplayer(): UseMultiplayerReturn {
  const worldRef = useRef(new ECSWorld());
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [entities, setEntities] = useState<NetworkedEntity[]>([]);
  const ownerMap = useRef(new Map<number, string>());
  const tickCountRef = useRef(0);

  const sync = useCallback(() => {
    const w = worldRef.current;
    const ids = w.query(ComponentType.Transform);
    const ents: NetworkedEntity[] = ids.map((id) => ({
      id,
      owner: ownerMap.current.get(id) || 'server',
      transform: w.getTransform(id)!,
      synced: true,
    }));
    setEntities(ents);

    // Update client entity counts
    setClients((prev) =>
      prev.map((c) => ({
        ...c,
        entities: ents.filter((e) => e.owner === c.id).length,
        ping: Math.round(20 + Math.random() * 60),
      }))
    );
  }, []);

  const addClient = useCallback(
    (name?: string) => {
      const id = `client-${Date.now()}`;
      const c: ClientInfo = {
        id,
        name: name || `Player ${clients.length + 1}`,
        ping: Math.round(20 + Math.random() * 60),
        entities: 0,
        color: CLIENT_COLORS[clients.length % CLIENT_COLORS.length],
      };
      setClients((prev) => [...prev, c]);
    },
    [clients.length]
  );

  const removeClient = useCallback(
    (id: string) => {
      // Remove all entities owned by this client
      const w = worldRef.current;
      for (const [eid, owner] of ownerMap.current) {
        if (owner === id) {
          w.destroyEntity(eid);
          ownerMap.current.delete(eid);
        }
      }
      setClients((prev) => prev.filter((c) => c.id !== id));
      sync();
    },
    [sync]
  );

  const spawnNetworked = useCallback(
    (owner: string) => {
      const w = worldRef.current;
      const id = w.createEntity();
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
      w.addVelocity(id, {
        vx: Math.random() - 0.5,
        vy: 0,
        vz: Math.random() - 0.5,
        angularX: 0,
        angularY: 0,
        angularZ: 0,
      });
      ownerMap.current.set(id, owner);
      sync();
      return id;
    },
    [sync]
  );

  const simulateTick = useCallback(() => {
    tickCountRef.current++;
    worldRef.current.tick(1 / 20); // 20Hz tick rate
    // Simulate position updates
    const w = worldRef.current;
    for (const id of w.query(ComponentType.Transform | ComponentType.Velocity)) {
      const t = w.getTransform(id);
      const v = w.getVelocity(id);
      if (t && v) {
        t.x += v.vx * 0.05;
        t.z += v.vz * 0.05;
      }
    }
    sync();
  }, [sync]);

  const reset = useCallback(() => {
    worldRef.current = new ECSWorld();
    ownerMap.current.clear();
    tickCountRef.current = 0;
    setClients([]);
    setEntities([]);
  }, []);

  const bandwidth = `${((entities.length * 24 * 20) / 1024).toFixed(1)} KB/s`; // ~24 bytes per entity at 20Hz

  return {
    clients,
    entities,
    tickRate: 20,
    bandwidth,
    addClient,
    removeClient,
    spawnNetworked,
    simulateTick,
    reset,
  };
}
