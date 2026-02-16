import { describe, it, expect, beforeEach } from 'vitest';
import { EntityRegistry } from '../ecs/EntityRegistry';

// =============================================================================
// C292 — Entity Registry
// =============================================================================

describe('EntityRegistry', () => {
  let reg: EntityRegistry;
  beforeEach(() => { reg = new EntityRegistry(); });

  it('creates entities with unique IDs', () => {
    const a = reg.create('a');
    const b = reg.create('b');
    expect(a.id).not.toBe(b.id);
  });

  it('creates entity with default name', () => {
    const e = reg.create();
    expect(e.name).toMatch(/^entity_\d+$/);
  });

  it('retrieves entity by name', () => {
    reg.create('hero');
    expect(reg.getByName('hero')?.name).toBe('hero');
  });

  it('tags entities and queries by tag', () => {
    const e = reg.create('npc', ['enemy']);
    expect(reg.getByTag('enemy')).toHaveLength(1);
    reg.removeTag(e.id, 'enemy');
    expect(reg.getByTag('enemy')).toHaveLength(0);
  });

  it('adds and checks tags dynamically', () => {
    const e = reg.create('obj');
    reg.addTag(e.id, 'loot');
    expect(reg.hasTag(e.id, 'loot')).toBe(true);
  });

  it('destroys entity and recycles ID', () => {
    const e = reg.create('temp');
    const id = e.id;
    reg.destroy(id);
    expect(reg.get(id)).toBeUndefined();
    const next = reg.create('reused');
    expect(next.id).toBe(id); // recycled
  });

  it('destroys children recursively', () => {
    const parent = reg.create('parent');
    const child = reg.create('child');
    reg.setParent(child.id, parent.id);
    reg.destroy(parent.id);
    expect(reg.get(child.id)).toBeUndefined();
  });

  it('sets parent-child hierarchy', () => {
    const p = reg.create('parent');
    const c = reg.create('child');
    reg.setParent(c.id, p.id);
    expect(reg.getChildren(p.id)).toHaveLength(1);
    expect(reg.get(c.id)?.parent).toBe(p.id);
  });

  it('registers and queries by component', () => {
    const e = reg.create('obj');
    reg.registerComponent(e.id, 'Transform');
    reg.registerComponent(e.id, 'Renderer');
    expect(reg.getByComponents('Transform', 'Renderer')).toHaveLength(1);
    expect(reg.hasComponent(e.id, 'Transform')).toBe(true);
  });

  it('unregisters component', () => {
    const e = reg.create('obj');
    reg.registerComponent(e.id, 'Physics');
    reg.unregisterComponent(e.id, 'Physics');
    expect(reg.hasComponent(e.id, 'Physics')).toBe(false);
  });

  it('setActive / getActiveCount work', () => {
    const e = reg.create('obj');
    expect(reg.getActiveCount()).toBe(1);
    reg.setActive(e.id, false);
    expect(reg.getActiveCount()).toBe(0);
  });

  it('getTotalCount returns total entities', () => {
    reg.create('a');
    reg.create('b');
    expect(reg.getTotalCount()).toBe(2);
  });
});
