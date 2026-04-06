import { describe, it, expect } from 'vitest';
import { EntityRegistry } from '@holoscript/engine/ecs/EntityRegistry';
import { ComponentStore } from '@holoscript/engine/ecs/ComponentStore';
import { SystemScheduler } from '@holoscript/engine/ecs/SystemScheduler';

describe('Cycle 124: Entity Component System', () => {
  // -------------------------------------------------------------------------
  // EntityRegistry
  // -------------------------------------------------------------------------

  it('should create entities and query by tag', () => {
    const reg = new EntityRegistry();
    const e1 = reg.create('player', ['movable', 'visible']);
    const e2 = reg.create('wall', ['visible']);
    reg.create('trigger', ['invisible']);

    expect(reg.getActiveCount()).toBe(3);
    expect(reg.getByTag('visible')).toHaveLength(2);
    expect(reg.getByName('player')?.id).toBe(e1.id);
  });

  it('should maintain parent-child hierarchy', () => {
    const reg = new EntityRegistry();
    const parent = reg.create('parent');
    const child1 = reg.create('child1');
    const child2 = reg.create('child2');

    reg.setParent(child1.id, parent.id);
    reg.setParent(child2.id, parent.id);

    expect(reg.getChildren(parent.id)).toHaveLength(2);

    // Destroying parent should destroy children
    reg.destroy(parent.id);
    expect(reg.get(child1.id)).toBeUndefined();
    expect(reg.getActiveCount()).toBe(0);
  });

  it('should recycle entity IDs', () => {
    const reg = new EntityRegistry();
    const e1 = reg.create('temp');
    const id = e1.id;
    reg.destroy(id);

    const e2 = reg.create('reused');
    expect(e2.id).toBe(id); // Recycled!
  });

  // -------------------------------------------------------------------------
  // ComponentStore
  // -------------------------------------------------------------------------

  it('should store and query typed components', () => {
    const store = new ComponentStore();
    store.add('position', 1, { x: 10, y: 20 });
    store.add('position', 2, { x: 30, y: 40 });
    store.add('velocity', 1, { vx: 1, vy: 0 });

    expect(store.get<{ x: number; y: number }>('position', 1)?.x).toBe(10);
    expect(store.getEntitiesWithComponent('position')).toHaveLength(2);
    expect(store.getEntitiesWithAll('position', 'velocity')).toEqual([1]);
  });

  it('should iterate and update components', () => {
    const store = new ComponentStore();
    store.add('hp', 1, { current: 100, max: 100 });
    store.add('hp', 2, { current: 50, max: 100 });

    store.forEach<{ current: number; max: number }>('hp', (id, data) => {
      data.current = Math.min(data.current + 10, data.max);
    });

    expect(store.get<{ current: number }>('hp', 1)?.current).toBe(100); // Capped
    expect(store.get<{ current: number }>('hp', 2)?.current).toBe(60); // Healed
  });

  // -------------------------------------------------------------------------
  // SystemScheduler
  // -------------------------------------------------------------------------

  it('should execute systems in phase order', () => {
    const scheduler = new SystemScheduler();
    const order: string[] = [];

    scheduler.register('Render', () => order.push('render'), 'render', 0);
    scheduler.register('Input', () => order.push('input'), 'preUpdate', 0);
    scheduler.register('Physics', () => order.push('physics'), 'update', 0);
    scheduler.register('Cleanup', () => order.push('cleanup'), 'postUpdate', 0);

    scheduler.update(1 / 60);

    expect(order).toEqual(['input', 'physics', 'cleanup', 'render']);
  });

  it('should respect priority within a phase', () => {
    const scheduler = new SystemScheduler();
    const order: string[] = [];

    scheduler.register('B', () => order.push('B'), 'update', 10);
    scheduler.register('A', () => order.push('A'), 'update', 1);
    scheduler.register('C', () => order.push('C'), 'update', 5);

    scheduler.update(1 / 60);

    expect(order).toEqual(['A', 'C', 'B']); // By priority ascending
  });

  it('should disable systems', () => {
    const scheduler = new SystemScheduler();
    let called = false;

    scheduler.register(
      'Debug',
      () => {
        called = true;
      },
      'update'
    );
    scheduler.disable('Debug');
    scheduler.update(1 / 60);

    expect(called).toBe(false);
    expect(scheduler.isEnabled('Debug')).toBe(false);
  });

  it('should resolve dependency order', () => {
    const scheduler = new SystemScheduler();
    const order: string[] = [];

    scheduler.register('C', () => order.push('C'), 'update', 0, ['B']);
    scheduler.register('A', () => order.push('A'), 'update', 0);
    scheduler.register('B', () => order.push('B'), 'update', 0, ['A']);

    scheduler.update(1 / 60);

    const idxA = order.indexOf('A');
    const idxB = order.indexOf('B');
    const idxC = order.indexOf('C');
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
  });
});
