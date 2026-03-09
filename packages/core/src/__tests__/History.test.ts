import { describe, it, expect } from 'vitest';
import { World } from '../ecs/World';
import { reactive, effect } from '../state/ReactiveState';

describe('World History (Undo/Redo)', () => {
  it('should undo/redo component property changes', async () => {
    const world = new World();
    const entity = world.createEntity();
    world.addComponent(entity, 'Transform', { x: 0, y: 0 });

    const transform = world.getComponent<any>(entity, 'Transform');

    // 1. Change value
    transform.x = 10;
    await Promise.resolve(); // flush reactivity
    expect(transform.x).toBe(10);

    // 2. Undo
    world.undo();
    await Promise.resolve();
    expect(transform.x).toBe(0);

    // 3. Redo
    world.redo();
    await Promise.resolve();
    expect(transform.x).toBe(10);
  });

  it('should undo/redo entity creation', () => {
    const world = new World();
    const entity = world.createEntity();
    expect(world.hasEntity(entity)).toBe(true);

    world.undo();
    expect(world.hasEntity(entity)).toBe(false);

    world.redo();
    expect(world.hasEntity(entity)).toBe(true);
  });

  it('should undo/redo entity destruction (restore components)', () => {
    const world = new World();
    const entity = world.createEntity();
    world.addComponent(entity, 'Tag', { name: 'Player' });
    world.addTag(entity, 'Hero');

    // Verify initial state
    expect(world.hasEntity(entity)).toBe(true);
    expect(world.getComponent<any>(entity, 'Tag').name).toBe('Player');
    expect(world.hasTag(entity, 'Hero')).toBe(true);

    // Destroy
    world.destroyEntity(entity);
    expect(world.hasEntity(entity)).toBe(false);

    // Undo (Restore)
    world.undo();
    expect(world.hasEntity(entity)).toBe(true);
    expect(world.getComponent<any>(entity, 'Tag').name).toBe('Player');
    expect(world.hasTag(entity, 'Hero')).toBe(true);

    // Redo (Destroy again)
    world.redo();
    expect(world.hasEntity(entity)).toBe(false);
  });

  it('should undo/redo component addition', () => {
    const world = new World();
    const entity = world.createEntity();

    world.addComponent(entity, 'A', { val: 1 });
    expect(world.hasComponent(entity, 'A')).toBe(true);

    world.undo();
    expect(world.hasComponent(entity, 'A')).toBe(false);

    world.redo();
    expect(world.hasComponent(entity, 'A')).toBe(true);
  });

  it('should undo/redo component removal', () => {
    const world = new World();
    const entity = world.createEntity();
    world.addComponent(entity, 'A', { val: 1 });

    world.removeComponent(entity, 'A');
    expect(world.hasComponent(entity, 'A')).toBe(false);

    world.undo();
    expect(world.hasComponent(entity, 'A')).toBe(true);
    // Verify data preserved
    expect(world.getComponent<any>(entity, 'A').val).toBe(1);

    world.redo();
    expect(world.hasComponent(entity, 'A')).toBe(false);
  });
});
