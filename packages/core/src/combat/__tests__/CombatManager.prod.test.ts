/**
 * CombatManager — Production Test Suite
 *
 * Covers: hitbox/hurtbox AABB, self-hit prevention, combos,
 * cooldowns, target finding, hit log, queries.
 */
import { describe, it, expect } from 'vitest';
import { CombatManager, type HitBox, type HurtBox } from '../CombatManager';

function hb(id: string, owner: string, x: number, active = true): HitBox {
  return { id, ownerId: owner, position: { x, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 }, active, damage: 10, damageType: 'physical', knockback: 5 };
}
function hr(id: string, owner: string, x: number, active = true): HurtBox {
  return { id, ownerId: owner, position: { x, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 }, active };
}

describe('CombatManager — Production', () => {
  // ─── Collision Detection ──────────────────────────────────────────
  it('detects overlapping hitbox and hurtbox', () => {
    const cm = new CombatManager();
    cm.addHitBox(hb('h1', 'a', 0));
    cm.addHurtBox(hr('hr1', 'b', 0));
    const hits = cm.checkCollisions();
    expect(hits.length).toBe(1);
  });

  it('no self-hit', () => {
    const cm = new CombatManager();
    cm.addHitBox(hb('h1', 'a', 0));
    cm.addHurtBox(hr('hr1', 'a', 0));
    expect(cm.checkCollisions().length).toBe(0);
  });

  it('inactive hitbox produces no hits', () => {
    const cm = new CombatManager();
    cm.addHitBox(hb('h1', 'a', 0, false));
    cm.addHurtBox(hr('hr1', 'b', 0));
    expect(cm.checkCollisions().length).toBe(0);
  });

  it('setHitBoxActive toggles', () => {
    const cm = new CombatManager();
    cm.addHitBox(hb('h1', 'a', 0, false));
    cm.addHurtBox(hr('hr1', 'b', 0));
    cm.setHitBoxActive('h1', true);
    expect(cm.checkCollisions().length).toBe(1);
  });

  // ─── Combo System ─────────────────────────────────────────────────
  it('registerCombo + advanceCombo completes', () => {
    const cm = new CombatManager();
    cm.registerCombo('slash', [
      { name: 's1', input: 'A', damage: 10, window: 1 },
      { name: 's2', input: 'B', damage: 20, window: 1 },
    ]);
    const r1 = cm.advanceCombo('slash', 'A');
    expect(r1.hit).toBe(true);
    const r2 = cm.advanceCombo('slash', 'B');
    expect(r2.hit).toBe(true);
    expect(r2.completed).toBe(true);
  });

  it('wrong input resets combo', () => {
    const cm = new CombatManager();
    cm.registerCombo('slash', [
      { name: 's1', input: 'A', damage: 10, window: 1 },
      { name: 's2', input: 'B', damage: 20, window: 1 },
    ]);
    cm.advanceCombo('slash', 'A');
    const r = cm.advanceCombo('slash', 'C'); // wrong
    expect(r.hit).toBe(false);
  });

  it('combo times out if window expires', () => {
    const cm = new CombatManager();
    cm.registerCombo('fast', [
      { name: 's1', input: 'A', damage: 10, window: 0.5 },
      { name: 's2', input: 'B', damage: 20, window: 0.5 },
    ]);
    cm.advanceCombo('fast', 'A');
    cm.updateCombos(1); // past 0.5s window
    const r = cm.advanceCombo('fast', 'B');
    expect(r.hit).toBe(false); // reset by timeout, 'B' doesn't match step 0
  });

  // ─── Cooldowns ────────────────────────────────────────────────────
  it('cooldown blocks then expires', () => {
    const cm = new CombatManager();
    cm.startCooldown('fireball', 3);
    expect(cm.isOnCooldown('fireball')).toBe(true);
    expect(cm.getCooldownRemaining('fireball')).toBe(3);
    cm.updateCooldowns(4);
    expect(cm.isOnCooldown('fireball')).toBe(false);
  });

  // ─── Targeting ────────────────────────────────────────────────────
  it('findTargets filters by range and sorts by priority', () => {
    const cm = new CombatManager();
    const pos = { x: 0, y: 0, z: 0 };
    const candidates = [
      { entityId: 'near', position: { x: 5, y: 0, z: 0 }, priority: 1 },
      { entityId: 'far', position: { x: 100, y: 0, z: 0 }, priority: 10 },
      { entityId: 'mid', position: { x: 10, y: 0, z: 0 }, priority: 5 },
    ];
    const targets = cm.findTargets(pos, candidates, 20);
    expect(targets.length).toBe(2); // far is out of range
    expect(targets[0].entityId).toBe('mid'); // higher priority first
  });

  // ─── Queries ──────────────────────────────────────────────────────
  it('hitLog accumulates and counts track', () => {
    const cm = new CombatManager();
    cm.addHitBox(hb('h1', 'a', 0));
    cm.addHurtBox(hr('hr1', 'b', 0));
    cm.checkCollisions();
    expect(cm.getHitLog().length).toBe(1);
    expect(cm.getHitBoxCount()).toBe(1);
    expect(cm.getHurtBoxCount()).toBe(1);
  });
});
