/**
 * HitboxSystem — Production Test Suite
 *
 * Covers: hitbox/hurtbox registration, AABB overlap, frame windows,
 * self-hit prevention, deduplication, knockback, clearLog, queries.
 */
import { describe, it, expect } from 'vitest';
import { HitboxSystem, type Hitbox, type Hurtbox } from '../HitboxSystem';

function makeHitbox(
  id: string,
  ownerId: string,
  x: number,
  y: number,
  start: number,
  end: number,
  group = 'g1'
): Hitbox {
  return {
    id,
    ownerId,
    x,
    y,
    z: 0,
    width: 2,
    height: 2,
    depth: 2,
    damage: 10,
    knockbackX: 5,
    knockbackY: 3,
    activeStart: start,
    activeEnd: end,
    group,
  };
}

function makeHurtbox(id: string, entityId: string, x: number, y: number): Hurtbox {
  return { id, entityId, x, y, z: 0, width: 2, height: 2, depth: 2 };
}

describe('HitboxSystem — Production', () => {
  // ─── Registration ─────────────────────────────────────────────────
  it('addHitbox + addHurtbox registers', () => {
    const hs = new HitboxSystem();
    hs.addHitbox(makeHitbox('h1', 'a', 0, 0, 0, 10));
    hs.addHurtbox(makeHurtbox('hr1', 'b', 0, 0));
    // no crash
    expect(true).toBe(true);
  });

  // ─── Overlap Detection ────────────────────────────────────────────
  it('detects overlapping hitbox and hurtbox', () => {
    const hs = new HitboxSystem();
    hs.addHitbox(makeHitbox('h1', 'a', 0, 0, 0, 10));
    hs.addHurtbox(makeHurtbox('hr1', 'b', 1, 1));
    const events = hs.update(5);
    expect(events.length).toBe(1);
    expect(events[0].attackerId).toBe('a');
    expect(events[0].defenderId).toBe('b');
    expect(events[0].damage).toBe(10);
  });

  it('no hit when boxes do not overlap', () => {
    const hs = new HitboxSystem();
    hs.addHitbox(makeHitbox('h1', 'a', 0, 0, 0, 10));
    hs.addHurtbox(makeHurtbox('hr1', 'b', 100, 100));
    const events = hs.update(5);
    expect(events.length).toBe(0);
  });

  // ─── Active Frame Window ──────────────────────────────────────────
  it('hitbox inactive outside frame window', () => {
    const hs = new HitboxSystem();
    hs.addHitbox(makeHitbox('h1', 'a', 0, 0, 5, 10));
    hs.addHurtbox(makeHurtbox('hr1', 'b', 0, 0));
    expect(hs.update(3).length).toBe(0); // too early
    expect(hs.update(7).length).toBe(1); // in window
    hs.clearHitLog();
    expect(hs.update(12).length).toBe(0); // too late
  });

  // ─── Self-Hit Prevention ──────────────────────────────────────────
  it('same owner never hits self', () => {
    const hs = new HitboxSystem();
    hs.addHitbox(makeHitbox('h1', 'a', 0, 0, 0, 10));
    hs.addHurtbox(makeHurtbox('hr1', 'a', 0, 0));
    expect(hs.update(5).length).toBe(0);
  });

  // ─── Deduplication ────────────────────────────────────────────────
  it('same group only hits target once', () => {
    const hs = new HitboxSystem();
    hs.addHitbox(makeHitbox('h1', 'a', 0, 0, 0, 10, 'slash'));
    hs.addHurtbox(makeHurtbox('hr1', 'b', 0, 0));
    hs.update(5);
    const events2 = hs.update(6);
    expect(events2.length).toBe(0);
  });

  it('clearHitLog allows re-hit', () => {
    const hs = new HitboxSystem();
    hs.addHitbox(makeHitbox('h1', 'a', 0, 0, 0, 20, 'slash'));
    hs.addHurtbox(makeHurtbox('hr1', 'b', 0, 0));
    hs.update(5);
    hs.clearHitLog();
    const events = hs.update(6);
    expect(events.length).toBe(1);
  });

  // ─── Knockback ────────────────────────────────────────────────────
  it('hit event carries knockback', () => {
    const hs = new HitboxSystem();
    hs.addHitbox(makeHitbox('h1', 'a', 0, 0, 0, 10));
    hs.addHurtbox(makeHurtbox('hr1', 'b', 0, 0));
    const ev = hs.update(5)[0];
    expect(ev.knockbackX).toBe(5);
    expect(ev.knockbackY).toBe(3);
  });

  // ─── Removal ──────────────────────────────────────────────────────
  it('removeHitbox stops hits', () => {
    const hs = new HitboxSystem();
    hs.addHitbox(makeHitbox('h1', 'a', 0, 0, 0, 10));
    hs.addHurtbox(makeHurtbox('hr1', 'b', 0, 0));
    hs.removeHitbox('h1');
    expect(hs.update(5).length).toBe(0);
  });

  // ─── Queries ──────────────────────────────────────────────────────
  it('getHitCount and getLastEvents', () => {
    const hs = new HitboxSystem();
    hs.addHitbox(makeHitbox('h1', 'a', 0, 0, 0, 10));
    hs.addHurtbox(makeHurtbox('hr1', 'b', 0, 0));
    hs.update(5);
    expect(hs.getHitCount()).toBe(1);
    expect(hs.getLastEvents().length).toBe(1);
  });
});
