/**
 * ECS World Production Tests
 *
 * Covers: createEntity (unique IDs, entityCount, hasEntity), destroyEntity
 * (removes entity + components + tags, hasEntity returns false),
 * addComponent / getComponent / hasComponent / removeComponent /
 * getComponentTypes, addTag / hasTag, query (empty, all-match,
 * partial-match, multi-component), queryByTag, getAllEntities,
 * undo/redo (create, destroy, component add/remove).
 */

import { describe, it, expect } from 'vitest';
import { World } from '@holoscript/engine/ecs/World';

function makeWorld() {
  return new World();
}

// ── createEntity / destroyEntity / hasEntity ──────────────────────────────────

describe('World — entity lifecycle', () => {
  it('createEntity returns a unique positive integer', () => {
    const w = makeWorld();
    const e1 = w.createEntity();
    const e2 = w.createEntity();
    expect(e1).toBeGreaterThan(0);
    expect(e2).toBeGreaterThan(e1);
  });

  it('hasEntity returns true for created entity', () => {
    const w = makeWorld();
    const e = w.createEntity();
    expect(w.hasEntity(e)).toBe(true);
  });

  it('hasEntity returns false for unknown entity', () => {
    const w = makeWorld();
    expect(w.hasEntity(9999)).toBe(false);
  });

  it('entityCount increases with each creation', () => {
    const w = makeWorld();
    w.createEntity();
    w.createEntity();
    expect(w.entityCount).toBe(2);
  });

  it('destroyEntity removes entity', () => {
    const w = makeWorld();
    const e = w.createEntity();
    w.destroyEntity(e);
    expect(w.hasEntity(e)).toBe(false);
  });

  it('entityCount decreases after destroy', () => {
    const w = makeWorld();
    const e1 = w.createEntity();
    w.createEntity();
    w.destroyEntity(e1);
    expect(w.entityCount).toBe(1);
  });

  it('destroying unknown entity does not throw', () => {
    const w = makeWorld();
    expect(() => w.destroyEntity(9999)).not.toThrow();
  });

  it('getAllEntities returns all live entity IDs', () => {
    const w = makeWorld();
    const e1 = w.createEntity();
    const e2 = w.createEntity();
    expect(w.getAllEntities()).toContain(e1);
    expect(w.getAllEntities()).toContain(e2);
  });

  it('getAllEntities does not contain destroyed entity', () => {
    const w = makeWorld();
    const e = w.createEntity();
    w.destroyEntity(e);
    expect(w.getAllEntities()).not.toContain(e);
  });
});

// ── addComponent / getComponent / hasComponent / removeComponent ──────────────

describe('World — component operations', () => {
  it('addComponent allows getComponent to retrieve data', () => {
    const w = makeWorld();
    const e = w.createEntity();
    w.addComponent(e, 'position', { x: 1, y: 2 });
    const pos = w.getComponent<{ x: number; y: number }>(e, 'position');
    expect(pos?.x).toBe(1);
    expect(pos?.y).toBe(2);
  });

  it('hasComponent returns true after addComponent', () => {
    const w = makeWorld();
    const e = w.createEntity();
    w.addComponent(e, 'velocity', { vx: 0 });
    expect(w.hasComponent(e, 'velocity')).toBe(true);
  });

  it('hasComponent returns false for missing component', () => {
    const w = makeWorld();
    const e = w.createEntity();
    expect(w.hasComponent(e, 'ghost')).toBe(false);
  });

  it('removeComponent removes the component', () => {
    const w = makeWorld();
    const e = w.createEntity();
    w.addComponent(e, 'health', { hp: 100 });
    w.removeComponent(e, 'health');
    expect(w.hasComponent(e, 'health')).toBe(false);
  });

  it('getComponent returns undefined after removeComponent', () => {
    const w = makeWorld();
    const e = w.createEntity();
    w.addComponent(e, 'health', { hp: 100 });
    w.removeComponent(e, 'health');
    expect(w.getComponent(e, 'health')).toBeUndefined();
  });

  it('addComponent on non-existent entity does not throw', () => {
    const w = makeWorld();
    expect(() => w.addComponent(9999, 'tag', { val: 1 })).not.toThrow();
  });

  it('component data is reactive — mutations are reflected', () => {
    const w = makeWorld();
    const e = w.createEntity();
    w.addComponent(e, 'pos', { x: 0, y: 0 });
    const comp = w.getComponent<{ x: number; y: number }>(e, 'pos')!;
    comp.x = 42;
    expect(w.getComponent<{ x: number; y: number }>(e, 'pos')?.x).toBe(42);
  });

  it('getComponentTypes returns all component type names for entity', () => {
    const w = makeWorld();
    const e = w.createEntity();
    w.addComponent(e, 'pos', {});
    w.addComponent(e, 'health', {});
    const types = w.getComponentTypes(e);
    expect(types).toContain('pos');
    expect(types).toContain('health');
  });

  it('destroyEntity removes all its components', () => {
    const w = makeWorld();
    const e = w.createEntity();
    w.addComponent(e, 'pos', { x: 1 });
    w.destroyEntity(e);
    // entity gone; any future getComponent should return undefined
    expect(w.getComponent(e, 'pos')).toBeUndefined();
  });
});

// ── tags ──────────────────────────────────────────────────────────────────────

describe('World — tags', () => {
  it('addTag / hasTag', () => {
    const w = makeWorld();
    const e = w.createEntity();
    w.addTag(e, 'player');
    expect(w.hasTag(e, 'player')).toBe(true);
  });

  it('hasTag returns false for missing tag', () => {
    const w = makeWorld();
    const e = w.createEntity();
    expect(w.hasTag(e, 'enemy')).toBe(false);
  });

  it('queryByTag returns entities with the given tag', () => {
    const w = makeWorld();
    const e1 = w.createEntity();
    const e2 = w.createEntity();
    w.addTag(e1, 'npc');
    w.addTag(e2, 'player');
    expect(w.queryByTag('npc')).toContain(e1);
    expect(w.queryByTag('npc')).not.toContain(e2);
  });

  it('queryByTag returns empty when no entity has the tag', () => {
    const w = makeWorld();
    w.createEntity();
    expect(w.queryByTag('rare')).toHaveLength(0);
  });
});

// ── query (component-based) ───────────────────────────────────────────────────

describe('World — query', () => {
  it('query returns entities with all specified components', () => {
    const w = makeWorld();
    const e1 = w.createEntity();
    w.addComponent(e1, 'pos', {});
    w.addComponent(e1, 'vel', {});
    const e2 = w.createEntity();
    w.addComponent(e2, 'pos', {}); // no vel
    const results = w.query('pos', 'vel');
    expect(results).toContain(e1);
    expect(results).not.toContain(e2);
  });

  it('query with no types returns all entities', () => {
    const w = makeWorld();
    const e1 = w.createEntity();
    const e2 = w.createEntity();
    const results = w.query();
    expect(results).toContain(e1);
    expect(results).toContain(e2);
  });

  it('query returns empty when no entity has required components', () => {
    const w = makeWorld();
    w.createEntity();
    expect(w.query('physics')).toHaveLength(0);
  });

  it('query does not include destroyed entities', () => {
    const w = makeWorld();
    const e = w.createEntity();
    w.addComponent(e, 'pos', {});
    w.destroyEntity(e);
    expect(w.query('pos')).not.toContain(e);
  });
});

// ── undo / redo ───────────────────────────────────────────────────────────────

describe('World — undo / redo', () => {
  it('undo createEntity removes entity', () => {
    const w = makeWorld();
    w.createEntity();
    w.undo();
    expect(w.entityCount).toBe(0);
  });

  it('redo restores entity after undo', () => {
    const w = makeWorld();
    const e = w.createEntity();
    w.undo();
    w.redo();
    expect(w.hasEntity(e)).toBe(true);
  });

  it('undo addComponent removes component', () => {
    const w = makeWorld();
    const e = w.createEntity();
    w.addComponent(e, 'hp', { val: 100 });
    w.undo(); // undo addComponent
    expect(w.hasComponent(e, 'hp')).toBe(false);
  });

  it('redo addComponent restores component', () => {
    const w = makeWorld();
    const e = w.createEntity();
    w.addComponent(e, 'hp', { val: 100 });
    w.undo();
    w.redo();
    expect(w.hasComponent(e, 'hp')).toBe(true);
  });

  it('undo destroyEntity restores entity', () => {
    const w = makeWorld();
    const e = w.createEntity();
    w.destroyEntity(e);
    w.undo();
    expect(w.hasEntity(e)).toBe(true);
  });

  it('undo when history is empty does not throw', () => {
    const w = makeWorld();
    expect(() => w.undo()).not.toThrow();
  });

  it('redo when at end of history does not throw', () => {
    const w = makeWorld();
    w.createEntity();
    w.undo();
    w.redo();
    expect(() => w.redo()).not.toThrow(); // already at end
  });
});
