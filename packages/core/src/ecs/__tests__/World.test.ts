import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../World';

describe('World', () => {
  let world: World;

  beforeEach(() => { world = new World(); });

  // ---------------------------------------------------------------------------
  // Entity Lifecycle
  // ---------------------------------------------------------------------------

  it('creates entities with unique ids', () => {
    const a = world.createEntity();
    const b = world.createEntity();
    expect(a).not.toBe(b);
    expect(world.hasEntity(a)).toBe(true);
  });

  it('destroys entity', () => {
    const e = world.createEntity();
    world.destroyEntity(e);
    expect(world.hasEntity(e)).toBe(false);
  });

  it('entityCount tracks live entities', () => {
    expect(world.entityCount).toBe(0);
    const e = world.createEntity();
    expect(world.entityCount).toBe(1);
    world.destroyEntity(e);
    expect(world.entityCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Components
  // ---------------------------------------------------------------------------

  it('addComponent / getComponent round-trip', () => {
    const e = world.createEntity();
    world.addComponent(e, 'position', { x: 5, y: 10 });
    const comp = world.getComponent<{ x: number; y: number }>(e, 'position');
    expect(comp!.x).toBe(5);
    expect(comp!.y).toBe(10);
  });

  it('hasComponent checks presence', () => {
    const e = world.createEntity();
    expect(world.hasComponent(e, 'hp')).toBe(false);
    world.addComponent(e, 'hp', { val: 100 });
    expect(world.hasComponent(e, 'hp')).toBe(true);
  });

  it('removeComponent removes data', () => {
    const e = world.createEntity();
    world.addComponent(e, 'hp', { val: 50 });
    world.removeComponent(e, 'hp');
    expect(world.hasComponent(e, 'hp')).toBe(false);
  });

  it('getComponentTypes lists all types on entity', () => {
    const e = world.createEntity();
    world.addComponent(e, 'a', {});
    world.addComponent(e, 'b', {});
    const types = world.getComponentTypes(e);
    expect(types.sort()).toEqual(['a', 'b']);
  });

  it('destroyEntity removes all components', () => {
    const e = world.createEntity();
    world.addComponent(e, 'x', {});
    world.destroyEntity(e);
    expect(world.getComponent(e, 'x')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Tags
  // ---------------------------------------------------------------------------

  it('addTag / hasTag', () => {
    const e = world.createEntity();
    world.addTag(e, 'player');
    expect(world.hasTag(e, 'player')).toBe(true);
    expect(world.hasTag(e, 'nope')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  it('query returns entities with all specified components', () => {
    const a = world.createEntity();
    world.addComponent(a, 'pos', {}); world.addComponent(a, 'vel', {});
    const b = world.createEntity();
    world.addComponent(b, 'pos', {});
    const result = world.query('pos', 'vel');
    expect(result).toContain(a);
    expect(result).not.toContain(b);
  });

  it('queryByTag returns entities with tag', () => {
    const a = world.createEntity();
    world.addTag(a, 'enemy');
    const b = world.createEntity();
    world.addTag(b, 'ally');
    expect(world.queryByTag('enemy')).toContain(a);
    expect(world.queryByTag('enemy')).not.toContain(b);
  });

  it('getAllEntities lists all', () => {
    world.createEntity(); world.createEntity();
    expect(world.getAllEntities()).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // Undo / Redo
  // ---------------------------------------------------------------------------

  it('undo reverses entity creation', () => {
    const e = world.createEntity();
    world.undo();
    expect(world.hasEntity(e)).toBe(false);
  });

  it('redo restores undone create', () => {
    const e = world.createEntity();
    world.undo();
    world.redo();
    expect(world.hasEntity(e)).toBe(true);
  });

  it('undo restores destroyed entity', () => {
    const e = world.createEntity();
    world.addComponent(e, 'hp', { val: 100 });
    world.destroyEntity(e);
    world.undo();
    expect(world.hasEntity(e)).toBe(true);
  });
});
