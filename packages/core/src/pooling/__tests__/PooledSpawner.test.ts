import { describe, it, expect, beforeEach } from 'vitest';
import { PooledSpawner } from '../PooledSpawner';

describe('PooledSpawner', () => {
  let spawner: PooledSpawner;

  beforeEach(() => {
    spawner = new PooledSpawner();
    spawner.registerPrefab({
      id: 'bullet',
      poolSize: 10,
      maxInstances: 20,
      autoExpand: true,
      defaultLifetime: 2,
    });
  });

  it('registerPrefab creates a pool', () => {
    const stats = spawner.getPoolStats('bullet');
    expect(stats).toBeDefined();
  });

  it('spawn creates an entity', () => {
    const entity = spawner.spawn('bullet');
    expect(entity).not.toBeNull();
    expect(entity!.active).toBe(true);
    expect(entity!.prefabId).toBe('bullet');
  });

  it('spawn with position and rotation', () => {
    const entity = spawner.spawn('bullet', { x: 1, y: 2, z: 3 }, { x: 0, y: 90, z: 0 });
    expect(entity!.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(entity!.rotation).toEqual({ x: 0, y: 90, z: 0 });
  });

  it('spawn with custom data', () => {
    const entity = spawner.spawn('bullet', undefined, undefined, { dmg: 10 });
    expect(entity!.data.dmg).toBe(10);
  });

  it('spawn returns null for unregistered prefab', () => {
    expect(spawner.spawn('unknown')).toBeNull();
  });

  it('despawn returns entity to pool', () => {
    const entity = spawner.spawn('bullet')!;
    const result = spawner.despawn(entity.id);
    expect(result).toBe(true);
    expect(spawner.getActiveCount()).toBe(0);
  });

  it('despawn returns false for unknown entity', () => {
    expect(spawner.despawn('nonexistent')).toBe(false);
  });

  it('getActiveCount tracks spawned entities', () => {
    spawner.spawn('bullet');
    spawner.spawn('bullet');
    expect(spawner.getActiveCount()).toBe(2);
    expect(spawner.getActiveCount('bullet')).toBe(2);
  });

  it('getEntity retrieves by id', () => {
    const entity = spawner.spawn('bullet')!;
    expect(spawner.getEntity(entity.id)).toBe(entity);
  });

  it('update expires entities past lifetime', () => {
    const entity = spawner.spawn('bullet')!;
    expect(spawner.getActiveCount()).toBe(1);
    const expired = spawner.update(3); // > defaultLifetime of 2
    expect(expired).toContain(entity.id);
    expect(spawner.getActiveCount()).toBe(0);
  });

  it('update does not expire entities with time left', () => {
    spawner.spawn('bullet');
    const expired = spawner.update(0.5);
    expect(expired).toHaveLength(0);
    expect(spawner.getActiveCount()).toBe(1);
  });

  it('onSpawn callback fires', () => {
    let called = false;
    spawner.registerPrefab({
      id: 'fx', poolSize: 5, maxInstances: 10, autoExpand: false,
      defaultLifetime: 1,
      onSpawn: () => { called = true; },
    });
    spawner.spawn('fx');
    expect(called).toBe(true);
  });

  it('onDespawn callback fires', () => {
    let called = false;
    spawner.registerPrefab({
      id: 'fx', poolSize: 5, maxInstances: 10, autoExpand: false,
      defaultLifetime: 1,
      onDespawn: () => { called = true; },
    });
    const e = spawner.spawn('fx')!;
    spawner.despawn(e.id);
    expect(called).toBe(true);
  });
});
