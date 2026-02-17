import { describe, it, expect, beforeEach } from 'vitest';
import { EntityRegistry } from '../EntityRegistry';

describe('EntityRegistry', () => {
  let reg: EntityRegistry;

  beforeEach(() => { reg = new EntityRegistry(); });

  // ---------------------------------------------------------------------------
  // Creation
  // ---------------------------------------------------------------------------

  it('creates entities with auto-incrementing ids', () => {
    const a = reg.create('player');
    const b = reg.create('enemy');
    expect(a.id).toBeLessThan(b.id);
    expect(a.name).toBe('player');
    expect(b.active).toBe(true);
  });

  it('creates entity with tags', () => {
    const e = reg.create('npc', ['friendly', 'quest']);
    expect(e.tags.has('friendly')).toBe(true);
    expect(e.tags.has('quest')).toBe(true);
  });

  it('assigns default name when empty', () => {
    const e = reg.create();
    expect(e.name).toMatch(/^entity_\d+$/);
  });

  // ---------------------------------------------------------------------------
  // Destruction & ID recycling
  // ---------------------------------------------------------------------------

  it('destroys entity and returns true', () => {
    const e = reg.create('temp');
    expect(reg.destroy(e.id)).toBe(true);
    expect(reg.get(e.id)).toBeUndefined();
  });

  it('destroy returns false for unknown id', () => {
    expect(reg.destroy(999)).toBe(false);
  });

  it('recursively destroys children', () => {
    const parent = reg.create('parent');
    const child = reg.create('child');
    reg.setParent(child.id, parent.id);
    reg.destroy(parent.id);
    expect(reg.get(child.id)).toBeUndefined();
  });

  it('recycles destroyed entity ids', () => {
    const a = reg.create('a');
    const oldId = a.id;
    reg.destroy(oldId);
    const b = reg.create('b');
    expect(b.id).toBe(oldId);
  });

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  it('get retrieves entity by id', () => {
    const e = reg.create('hero');
    expect(reg.get(e.id)?.name).toBe('hero');
  });

  it('getByName finds entity by name', () => {
    reg.create('boss');
    expect(reg.getByName('boss')).toBeDefined();
    expect(reg.getByName('nope')).toBeUndefined();
  });

  it('getByTag returns matching active entities', () => {
    reg.create('a', ['enemy']);
    reg.create('b', ['enemy']);
    reg.create('c', ['ally']);
    expect(reg.getByTag('enemy')).toHaveLength(2);
  });

  it('getByComponents filters by component set', () => {
    const e = reg.create('player');
    reg.registerComponent(e.id, 'transform');
    reg.registerComponent(e.id, 'health');
    reg.create('empty');
    expect(reg.getByComponents('transform', 'health')).toHaveLength(1);
  });

  it('getAll returns all entities', () => {
    reg.create(); reg.create(); reg.create();
    expect(reg.getAll()).toHaveLength(3);
  });

  it('getActiveCount counts only active', () => {
    const a = reg.create();
    reg.create();
    reg.setActive(a.id, false);
    expect(reg.getActiveCount()).toBe(1);
  });

  it('getTotalCount includes inactive', () => {
    const a = reg.create();
    reg.create();
    reg.setActive(a.id, false);
    expect(reg.getTotalCount()).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Tags
  // ---------------------------------------------------------------------------

  it('addTag / removeTag / hasTag lifecycle', () => {
    const e = reg.create();
    reg.addTag(e.id, 'marked');
    expect(reg.hasTag(e.id, 'marked')).toBe(true);
    reg.removeTag(e.id, 'marked');
    expect(reg.hasTag(e.id, 'marked')).toBe(false);
  });

  it('tag operations return false for unknown entity', () => {
    expect(reg.addTag(999, 'x')).toBe(false);
    expect(reg.removeTag(999, 'x')).toBe(false);
    expect(reg.hasTag(999, 'x')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Hierarchy
  // ---------------------------------------------------------------------------

  it('setParent establishes parent-child relationship', () => {
    const parent = reg.create('p');
    const child = reg.create('c');
    expect(reg.setParent(child.id, parent.id)).toBe(true);
    expect(child.parent).toBe(parent.id);
    expect(reg.getChildren(parent.id)).toHaveLength(1);
  });

  it('setParent removes child from old parent', () => {
    const p1 = reg.create('p1');
    const p2 = reg.create('p2');
    const c = reg.create('c');
    reg.setParent(c.id, p1.id);
    reg.setParent(c.id, p2.id);
    expect(reg.getChildren(p1.id)).toHaveLength(0);
    expect(reg.getChildren(p2.id)).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // Component bookkeeping
  // ---------------------------------------------------------------------------

  it('register / unregister / has component', () => {
    const e = reg.create();
    reg.registerComponent(e.id, 'physics');
    expect(reg.hasComponent(e.id, 'physics')).toBe(true);
    reg.unregisterComponent(e.id, 'physics');
    expect(reg.hasComponent(e.id, 'physics')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Activation
  // ---------------------------------------------------------------------------

  it('setActive toggles entity active flag', () => {
    const e = reg.create();
    reg.setActive(e.id, false);
    expect(e.active).toBe(false);
    reg.setActive(e.id, true);
    expect(e.active).toBe(true);
  });
});
