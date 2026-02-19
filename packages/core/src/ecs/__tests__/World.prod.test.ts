/**
 * World (ECS) — Production Test Suite
 *
 * Covers: createEntity, destroyEntity, hasEntity, entityCount,
 * addComponent, removeComponent, getComponent, hasComponent, getComponentTypes,
 * addTag, hasTag, query, queryByTag, getAllEntities, undo, redo.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../World';

describe('World (ECS) — Production', () => {
  // ─── Entity Lifecycle ─────────────────────────────────────────────
  it('createEntity returns incrementing IDs', () => {
    const w = new World();
    const e1 = w.createEntity();
    const e2 = w.createEntity();
    expect(e2).toBeGreaterThan(e1);
    expect(w.entityCount).toBe(2);
  });

  it('destroyEntity removes an entity', () => {
    const w = new World();
    const e = w.createEntity();
    w.destroyEntity(e);
    expect(w.hasEntity(e)).toBe(false);
    expect(w.entityCount).toBe(0);
  });

  it('hasEntity returns false for nonexistent', () => {
    const w = new World();
    expect(w.hasEntity(999)).toBe(false);
  });

  // ─── Components ───────────────────────────────────────────────────
  it('addComponent attaches data to entity', () => {
    const w = new World();
    const e = w.createEntity();
    w.addComponent(e, 'position', { x: 1, y: 2, z: 3 });
    expect(w.hasComponent(e, 'position')).toBe(true);
    const pos = w.getComponent<{ x: number; y: number; z: number }>(e, 'position');
    expect(pos?.x).toBe(1);
  });

  it('addComponent ignores nonexistent entity', () => {
    const w = new World();
    w.addComponent(999, 'pos', { x: 0 });
    expect(w.hasComponent(999, 'pos')).toBe(false);
  });

  it('removeComponent removes data', () => {
    const w = new World();
    const e = w.createEntity();
    w.addComponent(e, 'health', { hp: 100 });
    w.removeComponent(e, 'health');
    expect(w.hasComponent(e, 'health')).toBe(false);
  });

  it('getComponentTypes lists all types on entity', () => {
    const w = new World();
    const e = w.createEntity();
    w.addComponent(e, 'position', { x: 0 });
    w.addComponent(e, 'velocity', { vx: 1 });
    const types = w.getComponentTypes(e);
    expect(types).toContain('position');
    expect(types).toContain('velocity');
  });

  it('destroyEntity removes all components', () => {
    const w = new World();
    const e = w.createEntity();
    w.addComponent(e, 'pos', { x: 0 });
    w.destroyEntity(e);
    expect(w.hasComponent(e, 'pos')).toBe(false);
  });

  // ─── Tags ─────────────────────────────────────────────────────────
  it('addTag/hasTag works', () => {
    const w = new World();
    const e = w.createEntity();
    w.addTag(e, 'enemy');
    expect(w.hasTag(e, 'enemy')).toBe(true);
    expect(w.hasTag(e, 'player')).toBe(false);
  });

  // ─── Queries ──────────────────────────────────────────────────────
  it('query returns entities with all component types', () => {
    const w = new World();
    const e1 = w.createEntity();
    const e2 = w.createEntity();
    w.addComponent(e1, 'pos', { x: 0 });
    w.addComponent(e1, 'vel', { vx: 0 });
    w.addComponent(e2, 'pos', { x: 0 });
    const result = w.query('pos', 'vel');
    expect(result).toContain(e1);
    expect(result).not.toContain(e2);
  });

  it('queryByTag returns tagged entities', () => {
    const w = new World();
    const e1 = w.createEntity();
    const e2 = w.createEntity();
    w.addTag(e1, 'npc');
    const npcs = w.queryByTag('npc');
    expect(npcs).toContain(e1);
    expect(npcs).not.toContain(e2);
  });

  it('getAllEntities returns all', () => {
    const w = new World();
    w.createEntity();
    w.createEntity();
    expect(w.getAllEntities().length).toBe(2);
  });

  // ─── Undo / Redo ──────────────────────────────────────────────────
  it('undo reverses createEntity', () => {
    const w = new World();
    const e = w.createEntity();
    expect(w.hasEntity(e)).toBe(true);
    w.undo();
    expect(w.hasEntity(e)).toBe(false);
  });

  it('redo re-applies after undo', () => {
    const w = new World();
    const e = w.createEntity();
    w.undo();
    w.redo();
    // entity should exist again
    expect(w.entityCount).toBeGreaterThanOrEqual(1);
  });
});
