import { describe, it, expect, beforeEach } from 'vitest';
import { EntityRegistry } from '../EntityRegistry';

describe('EntityRegistry', () => {
  let reg: EntityRegistry;

  beforeEach(() => {
    reg = new EntityRegistry();
  });

  // ---------- Lifecycle ----------
  it('creates entities with incrementing IDs', () => {
    const e1 = reg.create();
    const e2 = reg.create();
    expect(e1.id).toBeLessThan(e2.id);
  });

  it('assigns default name if none given', () => {
    const e = reg.create();
    expect(e.name).toMatch(/^entity_\d+$/);
  });

  it('assigns custom name', () => {
    const e = reg.create('player');
    expect(e.name).toBe('player');
  });

  it('destroys an entity', () => {
    const e = reg.create();
    expect(reg.destroy(e.id)).toBe(true);
    expect(reg.get(e.id)).toBeUndefined();
  });

  it('recycles IDs after destroy', () => {
    const e = reg.create();
    const oldId = e.id;
    reg.destroy(oldId);
    const e2 = reg.create();
    expect(e2.id).toBe(oldId); // recycled
  });

  it('destroy returns false for nonexistent', () => {
    expect(reg.destroy(9999)).toBe(false);
  });

  // ---------- Tags ----------
  it('creates entity with initial tags', () => {
    const e = reg.create('', ['player', 'visible']);
    expect(reg.hasTag(e.id, 'player')).toBe(true);
    expect(reg.hasTag(e.id, 'visible')).toBe(true);
  });

  it('addTag / removeTag', () => {
    const e = reg.create();
    reg.addTag(e.id, 'enemy');
    expect(reg.hasTag(e.id, 'enemy')).toBe(true);
    reg.removeTag(e.id, 'enemy');
    expect(reg.hasTag(e.id, 'enemy')).toBe(false);
  });

  // ---------- Queries ----------
  it('getByName finds entity', () => {
    reg.create('hero');
    expect(reg.getByName('hero')).toBeDefined();
    expect(reg.getByName('hero')!.name).toBe('hero');
  });

  it('getByTag returns tagged entities', () => {
    reg.create('a', ['npc']);
    reg.create('b', ['npc']);
    reg.create('c');
    const npcs = reg.getByTag('npc');
    expect(npcs.length).toBe(2);
  });

  it('getByComponents returns matching entities', () => {
    const e = reg.create();
    reg.registerComponent(e.id, 'pos');
    reg.registerComponent(e.id, 'vel');
    const e2 = reg.create();
    reg.registerComponent(e2.id, 'pos');
    expect(reg.getByComponents('pos', 'vel').length).toBe(1);
  });

  it('getAll returns all entities', () => {
    reg.create(); reg.create();
    expect(reg.getAll().length).toBe(2);
  });

  it('getTotalCount tracks live entities', () => {
    reg.create(); reg.create();
    expect(reg.getTotalCount()).toBe(2);
  });

  // ---------- Hierarchy ----------
  it('setParent creates parent-child relationship', () => {
    const parent = reg.create('parent');
    const child = reg.create('child');
    expect(reg.setParent(child.id, parent.id)).toBe(true);
    expect(reg.getChildren(parent.id).length).toBe(1);
    expect(reg.getChildren(parent.id)[0].id).toBe(child.id);
  });

  it('destroying parent also destroys children', () => {
    const parent = reg.create('p');
    const child = reg.create('c');
    reg.setParent(child.id, parent.id);
    reg.destroy(parent.id);
    expect(reg.get(child.id)).toBeUndefined();
  });

  // ---------- Active state ----------
  it('setActive hides entity from tag queries', () => {
    const e = reg.create('', ['test']);
    reg.setActive(e.id, false);
    expect(reg.getByTag('test').length).toBe(0);
    expect(reg.getActiveCount()).toBe(0);
  });

  // ---------- Components ----------
  it('registerComponent / hasComponent / unregisterComponent', () => {
    const e = reg.create();
    reg.registerComponent(e.id, 'health');
    expect(reg.hasComponent(e.id, 'health')).toBe(true);
    reg.unregisterComponent(e.id, 'health');
    expect(reg.hasComponent(e.id, 'health')).toBe(false);
  });
});
