/**
 * CombatSystem.test.ts — Cycle 188
 *
 * Tests for CombatManager, DamageSystem, and ComboTracker.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CombatManager } from '@holoscript/engine/combat';
import { DamageSystem } from '@holoscript/engine/combat';
import { ComboTracker } from '@holoscript/engine/combat';

// =============================================================================
// CombatManager
// =============================================================================
describe('CombatManager', () => {
  let cm: CombatManager;

  beforeEach(() => {
    cm = new CombatManager();
  });

  it('adds and counts hitboxes/hurtboxes', () => {
    cm.addHitBox({
      id: 'hb1',
      ownerId: 'p1',
      position: [0, 0, 0],
      size: [1, 1, 1],
      active: true,
      damage: 10,
      damageType: 'physical',
      knockback: 2,
    });
    cm.addHurtBox({
      id: 'hr1',
      ownerId: 'p2',
      position: [0, 0, 0],
      size: [1, 1, 1],
      active: true,
    });
    expect(cm.getHitBoxCount()).toBe(1);
    expect(cm.getHurtBoxCount()).toBe(1);
  });

  it('detects AABB collisions', () => {
    cm.addHitBox({
      id: 'hb',
      ownerId: 'a',
      position: [0, 0, 0],
      size: [2, 2, 2],
      active: true,
      damage: 5,
      damageType: 'fire',
      knockback: 1,
    });
    cm.addHurtBox({
      id: 'hr',
      ownerId: 'b',
      position: [0.5, 0, 0],
      size: [2, 2, 2],
      active: true,
    });
    const hits = cm.checkCollisions();
    expect(hits).toHaveLength(1);
  });

  it('prevents self-hit', () => {
    cm.addHitBox({
      id: 'hb',
      ownerId: 'same',
      position: [0, 0, 0],
      size: [2, 2, 2],
      active: true,
      damage: 10,
      damageType: 'physical',
      knockback: 0,
    });
    cm.addHurtBox({
      id: 'hr',
      ownerId: 'same',
      position: [0, 0, 0],
      size: [2, 2, 2],
      active: true,
    });
    expect(cm.checkCollisions()).toHaveLength(0);
  });

  it('inactive hitboxes do not collide', () => {
    cm.addHitBox({
      id: 'hb',
      ownerId: 'a',
      position: [0, 0, 0],
      size: [2, 2, 2],
      active: false,
      damage: 5,
      damageType: 'physical',
      knockback: 0,
    });
    cm.addHurtBox({
      id: 'hr',
      ownerId: 'b',
      position: [0, 0, 0],
      size: [2, 2, 2],
      active: true,
    });
    expect(cm.checkCollisions()).toHaveLength(0);
  });

  it('combo registration and advancement', () => {
    cm.registerCombo('c1', [
      { name: 'jab', input: 'punch', damage: 10, window: 1 },
      { name: 'cross', input: 'punch', damage: 15, window: 1 },
      { name: 'upper', input: 'kick', damage: 25, window: 1 },
    ]);
    const r1 = cm.advanceCombo('c1', 'punch');
    expect(r1.hit).toBe(true);
    expect(r1.completed).toBe(false);
    const r2 = cm.advanceCombo('c1', 'punch');
    expect(r2.hit).toBe(true);
    const r3 = cm.advanceCombo('c1', 'kick');
    expect(r3.completed).toBe(true);
  });

  it('wrong input resets combo', () => {
    cm.registerCombo('c1', [
      { name: 'jab', input: 'punch', damage: 10, window: 1 },
      { name: 'finish', input: 'kick', damage: 30, window: 1 },
    ]);
    cm.advanceCombo('c1', 'punch');
    const wrong = cm.advanceCombo('c1', 'block');
    expect(wrong.hit).toBe(false);
  });

  it('cooldown tracking', () => {
    cm.startCooldown('fireball', 3);
    expect(cm.isOnCooldown('fireball')).toBe(true);
    expect(cm.getCooldownRemaining('fireball')).toBe(3);
    cm.updateCooldowns(2);
    expect(cm.getCooldownRemaining('fireball')).toBe(1);
    cm.updateCooldowns(1.5);
    expect(cm.isOnCooldown('fireball')).toBe(false);
  });

  it('target finding sorts by priority and distance', () => {
    const targets = cm.findTargets(
      [0, 0, 0],
      [
        { entityId: 'far', position: [100, 0, 0], priority: 5 },
        { entityId: 'close', position: [5, 0, 0], priority: 10 },
        { entityId: 'out', position: [1000, 0, 0], priority: 0 },
      ],
      200
    );
    expect(targets[0].entityId).toBe('close'); // highest priority & closest
    expect(targets.find((t) => t.entityId === 'out')).toBeUndefined(); // out of range
  });
});

// =============================================================================
// DamageSystem
// =============================================================================
describe('DamageSystem', () => {
  let ds: DamageSystem;

  beforeEach(() => {
    ds = new DamageSystem();
  });

  it('calculates base damage', () => {
    ds.setConfig({ critChance: 0 }); // no crit for determinism
    const dmg = ds.calculateDamage('attacker', 'defender', 100, 'physical');
    expect(dmg.finalDamage).toBe(100);
    expect(dmg.isCritical).toBe(false);
  });

  it('applies resistances', () => {
    ds.setConfig({ critChance: 0 });
    ds.setResistances('defender', { fire: 0.5 });
    const dmg = ds.calculateDamage('attacker', 'defender', 100, 'fire');
    expect(dmg.finalDamage).toBe(50);
  });

  it('true damage ignores resistance', () => {
    ds.setConfig({ critChance: 0 });
    ds.setResistances('defender', { physical: 1 });
    const dmg = ds.calculateDamage('attacker', 'defender', 100, 'true');
    expect(dmg.finalDamage).toBe(100);
  });

  it('forced critical hit multiplies damage', () => {
    ds.setConfig({ critMultiplier: 3 });
    const dmg = ds.calculateDamage('a', 'b', 50, 'physical', true);
    expect(dmg.isCritical).toBe(true);
    expect(dmg.finalDamage).toBe(150);
  });

  it('armor penetration reduces effective resistance', () => {
    ds.setConfig({ critChance: 0, armorPenetration: 0.5 });
    ds.setResistances('target', { physical: 0.8 });
    const dmg = ds.calculateDamage('src', 'target', 100, 'physical');
    // Effective res = 0.8 * (1 - 0.5) = 0.4 → damage = 100 * 0.6 = 60
    expect(dmg.finalDamage).toBe(60);
  });

  it('DoT applies periodic damage', () => {
    ds.setConfig({ critChance: 0 });
    ds.applyDoT('src', 'tgt', 'poison', 10, 1, 3);
    const ticks = ds.updateDoTs(2.5);
    expect(ticks.length).toBeGreaterThanOrEqual(2); // at least 2 ticks at t=1 and t=2
  });

  it('damage log tracks entries', () => {
    ds.setConfig({ critChance: 0 });
    ds.calculateDamage('a', 'b', 10, 'physical');
    ds.calculateDamage('a', 'b', 20, 'fire');
    expect(ds.getDamageLog().length).toBe(2);
    expect(ds.getTotalDamageDealt('a')).toBe(30);
  });

  it('onDamage callback fires', () => {
    const log: number[] = [];
    ds.setConfig({ critChance: 0 });
    ds.onDamage((d) => log.push(d.finalDamage));
    ds.calculateDamage('a', 'b', 42, 'ice');
    expect(log).toEqual([42]);
  });
});

// =============================================================================
// ComboTracker
// =============================================================================
describe('ComboTracker', () => {
  let tracker: ComboTracker;

  beforeEach(() => {
    tracker = new ComboTracker();
  });

  it('registers combos', () => {
    tracker.registerCombo({
      id: 'hadouken',
      name: 'Hadouken',
      steps: [
        { input: 'down', maxDelay: 500 },
        { input: 'forward', maxDelay: 500 },
        { input: 'punch', maxDelay: 500 },
      ],
      reward: 'fireball',
    });
    expect(tracker.getActiveComboCount()).toBe(0);
  });

  it('completes combo on correct sequence', () => {
    tracker.registerCombo({
      id: 'abc',
      name: 'ABC',
      steps: [
        { input: 'a', maxDelay: 500 },
        { input: 'b', maxDelay: 500 },
        { input: 'c', maxDelay: 500 },
      ],
      reward: 'power_attack',
    });
    tracker.pushInput('a', 0);
    tracker.pushInput('b', 100);
    const result = tracker.pushInput('c', 200);
    expect(result).toBe('power_attack');
  });

  it('times out stale combos', () => {
    tracker.registerCombo({
      id: 'fast',
      name: 'Fast',
      steps: [
        { input: 'a', maxDelay: 100 },
        { input: 'b', maxDelay: 100 },
      ],
      reward: 'quick_strike',
    });
    tracker.pushInput('a', 0);
    tracker.tick(500); // way past maxDelay
    expect(tracker.getActiveComboCount()).toBe(0);
  });

  it('single-step combo completes immediately', () => {
    tracker.registerCombo({
      id: 'tap',
      name: 'Tap',
      steps: [{ input: 'a', maxDelay: 500 }],
      reward: 'quick_tap',
    });
    const result = tracker.pushInput('a', 0);
    expect(result).toBe('quick_tap');
  });

  it('reset clears all state', () => {
    tracker.registerCombo({
      id: 'xy',
      name: 'XY',
      steps: [
        { input: 'x', maxDelay: 500 },
        { input: 'y', maxDelay: 500 },
      ],
      reward: 'combo_xy',
    });
    tracker.pushInput('x', 0);
    tracker.reset();
    expect(tracker.getActiveComboCount()).toBe(0);
    expect(tracker.getCompletedCombos()).toHaveLength(0);
  });
});
