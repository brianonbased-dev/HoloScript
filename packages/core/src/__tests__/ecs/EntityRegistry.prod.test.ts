/**
 * EntityRegistry Production Tests
 *
 * Covers: create, destroy (recursive children, index cleanup), queries
 * (get, getByName, getByTag, getByComponents), tag management, hierarchy
 * (setParent, getChildren), component bookkeeping, setActive, id recycling.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EntityRegistry } from '../../ecs/EntityRegistry';

// ── fixture factory ────────────────────────────────────────────────────────────

function makeReg() { return new EntityRegistry(); }

// ── create ────────────────────────────────────────────────────────────────────

describe('EntityRegistry — create', () => {

  it('creates an entity with auto-generated name when no name supplied', () => {
    const r = makeReg();
    const e = r.create();
    expect(e.name).toBeTruthy();
    expect(e.id).toBeGreaterThan(0);
  });

  it('creates entity with supplied name and tags', () => {
    const r = makeReg();
    const e = r.create('Player', ['hero', 'alive']);
    expect(e.name).toBe('Player');
    expect(e.tags.has('hero')).toBe(true);
    expect(e.tags.has('alive')).toBe(true);
  });

  it('successive creates produce unique IDs', () => {
    const r = makeReg();
    const ids = new Set([r.create().id, r.create().id, r.create().id]);
    expect(ids.size).toBe(3);
  });

  it('new entity is active by default', () => {
    const r = makeReg();
    expect(r.create().active).toBe(true);
  });

  it('new entity has no parent and no children', () => {
    const r = makeReg();
    const e = r.create();
    expect(e.parent).toBeNull();
    expect(e.children).toHaveLength(0);
  });
});

// ── destroy ───────────────────────────────────────────────────────────────────

describe('EntityRegistry — destroy', () => {

  it('returns true when entity existed', () => {
    const r = makeReg();
    const e = r.create();
    expect(r.destroy(e.id)).toBe(true);
  });

  it('returns false for unknown id', () => {
    const r = makeReg();
    expect(r.destroy(9999)).toBe(false);
  });

  it('removes entity from registry', () => {
    const r = makeReg();
    const e = r.create();
    r.destroy(e.id);
    expect(r.get(e.id)).toBeUndefined();
  });

  it('destroys children recursively', () => {
    const r = makeReg();
    const parent = r.create('Parent');
    const child = r.create('Child');
    r.setParent(child.id, parent.id);
    r.destroy(parent.id);
    expect(r.get(child.id)).toBeUndefined();
  });

  it('decrements getActiveCount after destroy', () => {
    const r = makeReg();
    r.create();
    const e = r.create();
    r.destroy(e.id);
    expect(r.getActiveCount()).toBe(1);
  });

  it('destroys removes entity from tag index', () => {
    const r = makeReg();
    const e = r.create('X', ['enemy']);
    r.destroy(e.id);
    expect(r.getByTag('enemy')).toHaveLength(0);
  });

  it('recycled id is reused by next create', () => {
    const r = makeReg();
    const e = r.create();
    const oldId = e.id;
    r.destroy(oldId);
    const e2 = r.create(); // should reuse id
    expect(e2.id).toBe(oldId);
  });
});

// ── queries ───────────────────────────────────────────────────────────────────

describe('EntityRegistry — queries', () => {

  it('get returns entity for valid id', () => {
    const r = makeReg();
    const e = r.create('X');
    expect(r.get(e.id)?.name).toBe('X');
  });

  it('get returns undefined for unknown id', () => {
    const r = makeReg();
    expect(r.get(999)).toBeUndefined();
  });

  it('getByName finds entity by name', () => {
    const r = makeReg();
    r.create('Alpha');
    const found = r.getByName('Alpha');
    expect(found?.name).toBe('Alpha');
  });

  it('getByName returns undefined for unknown name', () => {
    const r = makeReg();
    expect(r.getByName('Missing')).toBeUndefined();
  });

  it('getByTag returns matching active entities', () => {
    const r = makeReg();
    r.create('A', ['enemy']);
    r.create('B', ['enemy']);
    r.create('C', ['friend']);
    expect(r.getByTag('enemy')).toHaveLength(2);
  });

  it('getByTag returns empty when no match', () => {
    const r = makeReg();
    expect(r.getByTag('ghost')).toHaveLength(0);
  });

  it('getByTag excludes inactive entities', () => {
    const r = makeReg();
    const e = r.create('Z', ['enemy']);
    r.setActive(e.id, false);
    expect(r.getByTag('enemy')).toHaveLength(0);
  });

  it('getByComponents returns entities with all listed components', () => {
    const r = makeReg();
    const a = r.create('A');
    const b = r.create('B');
    r.registerComponent(a.id, 'Transform');
    r.registerComponent(a.id, 'Mesh');
    r.registerComponent(b.id, 'Transform');
    const results = r.getByComponents('Transform', 'Mesh');
    expect(results.some(e => e.id === a.id)).toBe(true);
    expect(results.some(e => e.id === b.id)).toBe(false);
  });

  it('getAll returns all entities including inactive', () => {
    const r = makeReg();
    const a = r.create();
    const b = r.create();
    r.setActive(b.id, false);
    const all = r.getAll();
    expect(all.length).toBe(2);
  });

  it('getActiveCount counts only active', () => {
    const r = makeReg();
    const a = r.create();
    const b = r.create();
    r.setActive(b.id, false);
    expect(r.getActiveCount()).toBe(1);
  });

  it('getTotalCount includes inactive', () => {
    const r = makeReg();
    const a = r.create();
    const b = r.create();
    r.setActive(b.id, false);
    expect(r.getTotalCount()).toBe(2);
  });
});

// ── tags ──────────────────────────────────────────────────────────────────────

describe('EntityRegistry — tags', () => {

  it('addTag returns true and makes entity findable by tag', () => {
    const r = makeReg();
    const e = r.create();
    expect(r.addTag(e.id, 'flying')).toBe(true);
    expect(r.getByTag('flying').some(x => x.id === e.id)).toBe(true);
  });

  it('addTag returns false for unknown entity', () => {
    const r = makeReg();
    expect(r.addTag(999, 'tag')).toBe(false);
  });

  it('removeTag removes entity from tag index', () => {
    const r = makeReg();
    const e = r.create('X', ['flying']);
    r.removeTag(e.id, 'flying');
    expect(r.getByTag('flying')).toHaveLength(0);
  });

  it('hasTag returns true after addTag', () => {
    const r = makeReg();
    const e = r.create();
    r.addTag(e.id, 'boss');
    expect(r.hasTag(e.id, 'boss')).toBe(true);
  });

  it('hasTag returns false after removeTag', () => {
    const r = makeReg();
    const e = r.create('X', ['boss']);
    r.removeTag(e.id, 'boss');
    expect(r.hasTag(e.id, 'boss')).toBe(false);
  });
});

// ── hierarchy ────────────────────────────────────────────────────────────────

describe('EntityRegistry — hierarchy', () => {

  it('setParent sets parent and adds to children list', () => {
    const r = makeReg();
    const parent = r.create('P');
    const child = r.create('C');
    expect(r.setParent(child.id, parent.id)).toBe(true);
    expect(child.parent).toBe(parent.id);
    expect(parent.children).toContain(child.id);
  });

  it('setParent returns false for unknown entities', () => {
    const r = makeReg();
    expect(r.setParent(1, 999)).toBe(false);
  });

  it('getChildren returns child entities', () => {
    const r = makeReg();
    const p = r.create('P');
    const c1 = r.create('C1');
    const c2 = r.create('C2');
    r.setParent(c1.id, p.id);
    r.setParent(c2.id, p.id);
    const children = r.getChildren(p.id);
    expect(children.some(x => x.id === c1.id)).toBe(true);
    expect(children.some(x => x.id === c2.id)).toBe(true);
  });

  it('getChildren returns empty array for leaf entities', () => {
    const r = makeReg();
    const e = r.create();
    expect(r.getChildren(e.id)).toHaveLength(0);
  });

  it('re-parenting removes child from old parent', () => {
    const r = makeReg();
    const p1 = r.create('P1');
    const p2 = r.create('P2');
    const child = r.create('C');
    r.setParent(child.id, p1.id);
    r.setParent(child.id, p2.id);
    expect(p1.children).not.toContain(child.id);
    expect(p2.children).toContain(child.id);
  });
});

// ── component bookkeeping ─────────────────────────────────────────────────────

describe('EntityRegistry — component bookkeeping', () => {

  it('registerComponent returns true and sets hasComponent', () => {
    const r = makeReg();
    const e = r.create();
    expect(r.registerComponent(e.id, 'Transform')).toBe(true);
    expect(r.hasComponent(e.id, 'Transform')).toBe(true);
  });

  it('registerComponent returns false for unknown entity', () => {
    const r = makeReg();
    expect(r.registerComponent(999, 'Mesh')).toBe(false);
  });

  it('unregisterComponent removes component', () => {
    const r = makeReg();
    const e = r.create();
    r.registerComponent(e.id, 'Physics');
    r.unregisterComponent(e.id, 'Physics');
    expect(r.hasComponent(e.id, 'Physics')).toBe(false);
  });

  it('hasComponent returns false for missing component', () => {
    const r = makeReg();
    const e = r.create();
    expect(r.hasComponent(e.id, 'NonExistent')).toBe(false);
  });
});

// ── setActive ─────────────────────────────────────────────────────────────────

describe('EntityRegistry — setActive', () => {

  it('setActive(false) deactivates entity', () => {
    const r = makeReg();
    const e = r.create();
    r.setActive(e.id, false);
    expect(e.active).toBe(false);
  });

  it('setActive(true) reactivates entity', () => {
    const r = makeReg();
    const e = r.create();
    r.setActive(e.id, false);
    r.setActive(e.id, true);
    expect(e.active).toBe(true);
  });

  it('setActive on unknown id does not throw', () => {
    const r = makeReg();
    expect(() => r.setActive(999, false)).not.toThrow();
  });
});
