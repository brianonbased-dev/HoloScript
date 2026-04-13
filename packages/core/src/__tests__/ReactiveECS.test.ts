import { describe, it, expect, vi } from 'vitest';
import { effect } from '../state/ReactiveState';

// Inject core reactivity into engine World just for this test suite
vi.mock('@holoscript/engine/state/ReactiveState', async () => {
  const coreReactive = await import('../state/ReactiveState');
  return { reactive: coreReactive.reactive };
});

import { World } from '@holoscript/engine/ecs/World';

describe('Reactive ECS', () => {
  it('should wrap components in reactive proxies', () => {
    const world = new World();
    const entity = world.createEntity();
    const data = { x: 0, y: 0 };

    world.addComponent(entity, 'Position', data);
    const comp = world.getComponent<{ x: number; y: number }>(entity, 'Position');

    expect(comp).not.toBe(data); // Proxy wrapper
    expect(comp?.x).toBe(0);
  });

  it('should trigger effects when component data changes', async () => {
    const world = new World();
    const entity = world.createEntity();
    world.addComponent(entity, 'Health', { current: 100, max: 100 });

    const comp = world.getComponent<{ current: number }>(entity, 'Health')!;
    const callback = vi.fn();

    effect(() => {
      callback(comp.current);
    });

    expect(callback).toHaveBeenCalledWith(100);

    // Modify component property
    comp.current = 90;

    // Updates are batched (microtask)
    await Promise.resolve();

    expect(callback).toHaveBeenCalledWith(90);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('should support tracking nested objects', async () => {
    const world = new World();
    const entity = world.createEntity();
    world.addComponent(entity, 'Transform', {
      position: [0, 0, 0],
      scale: { x: 1, y: 1, z: 1 },
    });

    const transform = world.getComponent<any>(entity, 'Transform')!;
    const callback = vi.fn();

    effect(() => {
      callback(transform.position.x);
    });

    expect(callback).toHaveBeenCalledWith(0);

    transform.position.x = 10;

    await Promise.resolve();

    expect(callback).toHaveBeenCalledWith(10);
  });
});
