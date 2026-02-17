import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../World';

describe('World (ECS)', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  // ---------- Entity Lifecycle ----------
  it('creates entities with unique IDs', () => {
    const e1 = world.createEntity();
    const e2 = world.createEntity();
    expect(e1).not.toBe(e2);
    expect(world.hasEntity(e1)).toBe(true);
    expect(world.hasEntity(e2)).toBe(true);
  });

  it('counts entities', () => {
    world.createEntity();
    world.createEntity();
    expect(world.entityCount).toBe(2);
  });

  it('destroys an entity', () => {
    const e = world.createEntity();
    world.destroyEntity(e);
    expect(world.hasEntity(e)).toBe(false);
    expect(world.entityCount).toBe(0);
  });

  it('getAllEntities returns all live entities', () => {
    const e1 = world.createEntity();
    const e2 = world.createEntity();
    const all = world.getAllEntities();
    expect(all).toContain(e1);
    expect(all).toContain(e2);
  });

  // ---------- Components ----------
  it('adds and retrieves a component', () => {
    const e = world.createEntity();
    world.addComponent(e, 'position', { x: 1, y: 2, z: 3 });
    const pos = world.getComponent(e, 'position');
    expect(pos).toBeDefined();
    expect(pos.x).toBe(1);
  });

  it('hasComponent returns true when present', () => {
    const e = world.createEntity();
    world.addComponent(e, 'velocity', { vx: 0, vy: 0 });
    expect(world.hasComponent(e, 'velocity')).toBe(true);
    expect(world.hasComponent(e, 'position')).toBe(false);
  });

  it('removes a component', () => {
    const e = world.createEntity();
    world.addComponent(e, 'health', { hp: 100 });
    world.removeComponent(e, 'health');
    expect(world.hasComponent(e, 'health')).toBe(false);
  });

  it('getComponentTypes lists component types', () => {
    const e = world.createEntity();
    world.addComponent(e, 'a', {});
    world.addComponent(e, 'b', {});
    const types = world.getComponentTypes(e);
    expect(types).toContain('a');
    expect(types).toContain('b');
  });

  it('destroyEntity removes all components', () => {
    const e = world.createEntity();
    world.addComponent(e, 'pos', { x: 0 });
    world.destroyEntity(e);
    expect(world.getComponent(e, 'pos')).toBeUndefined();
  });

  // ---------- Tags ----------
  it('adds and checks tags', () => {
    const e = world.createEntity();
    world.addTag(e, 'player');
    expect(world.hasTag(e, 'player')).toBe(true);
    expect(world.hasTag(e, 'enemy')).toBe(false);
  });

  // ---------- Queries ----------
  it('queries entities by component type', () => {
    const e1 = world.createEntity();
    const e2 = world.createEntity();
    const e3 = world.createEntity();
    world.addComponent(e1, 'pos', { x: 0 });
    world.addComponent(e2, 'pos', { x: 1 });
    world.addComponent(e2, 'vel', { vx: 0 });
    world.addComponent(e3, 'vel', { vx: 1 });

    const withPos = world.query('pos');
    expect(withPos).toContain(e1);
    expect(withPos).toContain(e2);
    expect(withPos).not.toContain(e3);
  });

  it('queries entities with multiple component types (AND)', () => {
    const e1 = world.createEntity();
    const e2 = world.createEntity();
    world.addComponent(e1, 'pos', {});
    world.addComponent(e1, 'vel', {});
    world.addComponent(e2, 'pos', {});

    const both = world.query('pos', 'vel');
    expect(both).toContain(e1);
    expect(both).not.toContain(e2);
  });

  it('queryByTag returns tagged entities', () => {
    const e1 = world.createEntity();
    const e2 = world.createEntity();
    world.addTag(e1, 'npc');
    const npcs = world.queryByTag('npc');
    expect(npcs).toContain(e1);
    expect(npcs).not.toContain(e2);
  });

  // ---------- Undo/Redo ----------
  it('undoes entity creation', () => {
    const e = world.createEntity();
    expect(world.hasEntity(e)).toBe(true);
    world.undo();
    expect(world.hasEntity(e)).toBe(false);
  });

  it('redoes undone entity creation', () => {
    const e = world.createEntity();
    world.undo();
    world.redo();
    expect(world.hasEntity(e)).toBe(true);
  });

  it('undoes entity destruction', () => {
    const e = world.createEntity();
    world.addComponent(e, 'data', { value: 42 });
    world.destroyEntity(e);
    expect(world.hasEntity(e)).toBe(false);
    world.undo();
    expect(world.hasEntity(e)).toBe(true);
  });
});
