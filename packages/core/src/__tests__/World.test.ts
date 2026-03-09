import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../ecs/World';

// =============================================================================
// C298 — World (ECS Core)
// =============================================================================

describe('World', () => {
  let world: World;
  beforeEach(() => {
    world = new World();
  });

  it('creates entities with incrementing IDs', () => {
    const a = world.createEntity();
    const b = world.createEntity();
    expect(b).toBe(a + 1);
    expect(world.entityCount).toBe(2);
  });

  it('destroys an entity', () => {
    const e = world.createEntity();
    world.destroyEntity(e);
    expect(world.hasEntity(e)).toBe(false);
    expect(world.entityCount).toBe(0);
  });

  it('adds and gets component', () => {
    const e = world.createEntity();
    world.addComponent(e, 'Position', { x: 1, y: 2 });
    expect(world.hasComponent(e, 'Position')).toBe(true);
    expect(world.getComponent<{ x: number; y: number }>(e, 'Position')?.x).toBe(1);
  });

  it('removes a component', () => {
    const e = world.createEntity();
    world.addComponent(e, 'Vel', { vx: 0 });
    world.removeComponent(e, 'Vel');
    expect(world.hasComponent(e, 'Vel')).toBe(false);
  });

  it('getComponentTypes lists all types on entity', () => {
    const e = world.createEntity();
    world.addComponent(e, 'A', {});
    world.addComponent(e, 'B', {});
    const types = world.getComponentTypes(e);
    expect(types).toContain('A');
    expect(types).toContain('B');
  });

  it('query returns entities matching component types', () => {
    const e1 = world.createEntity();
    const e2 = world.createEntity();
    world.addComponent(e1, 'X', {});
    world.addComponent(e1, 'Y', {});
    world.addComponent(e2, 'X', {});
    expect(world.query('X', 'Y')).toEqual([e1]);
    expect(world.query('X')).toContain(e1);
    expect(world.query('X')).toContain(e2);
  });

  it('tags entities and queries by tag', () => {
    const e = world.createEntity();
    world.addTag(e, 'player');
    expect(world.hasTag(e, 'player')).toBe(true);
    expect(world.queryByTag('player')).toContain(e);
  });

  it('getAllEntities returns all', () => {
    world.createEntity();
    world.createEntity();
    expect(world.getAllEntities()).toHaveLength(2);
  });

  it('undo reverses createEntity', () => {
    const e = world.createEntity();
    world.undo();
    expect(world.hasEntity(e)).toBe(false);
  });

  it('undo reverses destroyEntity', () => {
    const e = world.createEntity();
    world.addComponent(e, 'Pos', { x: 5 });
    world.destroyEntity(e);
    expect(world.hasEntity(e)).toBe(false);
    world.undo();
    expect(world.hasEntity(e)).toBe(true);
  });

  it('redo reapplies undone operation', () => {
    const e = world.createEntity();
    world.undo();
    world.redo();
    expect(world.hasEntity(e)).toBe(true);
  });
});
