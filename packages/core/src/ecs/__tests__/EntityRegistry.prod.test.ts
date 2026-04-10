/**
 * EntityRegistry — Production Test Suite
 *
 * Covers: create, destroy, tags, hierarchy, component registration,
 * queries (byName, byTag, byComponents), ID recycling, activation.
 */
import { describe, it, expect } from 'vitest';
import { EntityRegistry } from '../EntityRegistry';

describe('EntityRegistry — Production', () => {
  // ─── Create / Destroy ─────────────────────────────────────────────
  it('create returns entity with unique ID', () => {
    const r = new EntityRegistry();
    const e1 = r.create('hero');
    const e2 = r.create('enemy');
    expect(e1.id).not.toBe(e2.id);
    expect(e1.name).toBe('hero');
    expect(e1.active).toBe(true);
  });

  it('create with tags indexes them', () => {
    const r = new EntityRegistry();
    r.create('player', ['human', 'controllable']);
    expect(r.getByTag('human').length).toBe(1);
    expect(r.getByTag('controllable').length).toBe(1);
  });

  it('destroy removes entity and recycles ID', () => {
    const r = new EntityRegistry();
    const e = r.create('temp');
    const id = e.id;
    r.destroy(id);
    expect(r.get(id)).toBeUndefined();
    // ID recycled on next create
    const e2 = r.create('reuse');
    expect(e2.id).toBe(id);
  });

  it('destroy recursively removes children', () => {
    const r = new EntityRegistry();
    const parent = r.create('parent');
    const child = r.create('child');
    r.setParent(child.id, parent.id);
    r.destroy(parent.id);
    expect(r.get(child.id)).toBeUndefined();
  });

  // ─── Queries ──────────────────────────────────────────────────────
  it('getByName finds by name', () => {
    const r = new EntityRegistry();
    r.create('hero');
    expect(r.getByName('hero')?.name).toBe('hero');
    expect(r.getByName('villain')).toBeUndefined();
  });

  it('getByTag returns only active entities with tag', () => {
    const r = new EntityRegistry();
    const e1 = r.create('a', ['npc']);
    const e2 = r.create('b', ['npc']);
    r.setActive(e2.id, false);
    expect(r.getByTag('npc').length).toBe(1);
  });

  it('getByComponents filters by component set', () => {
    const r = new EntityRegistry();
    const e1 = r.create('a');
    const e2 = r.create('b');
    r.registerComponent(e1.id, 'Transform');
    r.registerComponent(e1.id, 'Mesh');
    r.registerComponent(e2.id, 'Transform');
    expect(r.getByComponents('Transform', 'Mesh').length).toBe(1);
    expect(r.getByComponents('Transform').length).toBe(2);
  });

  // ─── Tags ─────────────────────────────────────────────────────────
  it('addTag / removeTag / hasTag', () => {
    const r = new EntityRegistry();
    const e = r.create('e');
    r.addTag(e.id, 'enemy');
    expect(r.hasTag(e.id, 'enemy')).toBe(true);
    r.removeTag(e.id, 'enemy');
    expect(r.hasTag(e.id, 'enemy')).toBe(false);
  });

  // ─── Hierarchy ────────────────────────────────────────────────────
  it('setParent establishes parent-child link', () => {
    const r = new EntityRegistry();
    const p = r.create('parent');
    const c = r.create('child');
    r.setParent(c.id, p.id);
    expect(r.getChildren(p.id).length).toBe(1);
    expect(r.getChildren(p.id)[0].id).toBe(c.id);
  });

  it('reparenting updates old parent', () => {
    const r = new EntityRegistry();
    const p1 = r.create('p1'),
      p2 = r.create('p2'),
      c = r.create('child');
    r.setParent(c.id, p1.id);
    r.setParent(c.id, p2.id);
    expect(r.getChildren(p1.id).length).toBe(0);
    expect(r.getChildren(p2.id).length).toBe(1);
  });

  // ─── Components ───────────────────────────────────────────────────
  it('registerComponent / unregisterComponent / hasComponent', () => {
    const r = new EntityRegistry();
    const e = r.create('e');
    r.registerComponent(e.id, 'RigidBody');
    expect(r.hasComponent(e.id, 'RigidBody')).toBe(true);
    r.unregisterComponent(e.id, 'RigidBody');
    expect(r.hasComponent(e.id, 'RigidBody')).toBe(false);
  });

  // ─── Counts ───────────────────────────────────────────────────────
  it('getActiveCount and getTotalCount', () => {
    const r = new EntityRegistry();
    r.create('a');
    r.create('b');
    const c = r.create('c');
    r.setActive(c.id, false);
    expect(r.getTotalCount()).toBe(3);
    expect(r.getActiveCount()).toBe(2);
  });

  // ─── Activation ───────────────────────────────────────────────────
  it('setActive toggles entity active state', () => {
    const r = new EntityRegistry();
    const e = r.create('e');
    expect(e.active).toBe(true);
    r.setActive(e.id, false);
    expect(r.get(e.id)?.active).toBe(false);
  });
});
