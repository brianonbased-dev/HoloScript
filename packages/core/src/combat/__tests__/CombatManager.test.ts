import { describe, it, expect, beforeEach } from 'vitest';
import { CombatManager, HitBox, HurtBox, ComboStep } from '../CombatManager';

function hitbox(id: string, ownerId: string, pos = { x: 0, y: 0, z: 0 }, size = { x: 1, y: 1, z: 1 }): HitBox {
  return { id, ownerId, position: pos, size, active: true, damage: 10, damageType: 'physical', knockback: 1 };
}

function hurtbox(id: string, ownerId: string, pos = { x: 0, y: 0, z: 0 }, size = { x: 1, y: 1, z: 1 }): HurtBox {
  return { id, ownerId, position: pos, size, active: true };
}

describe('CombatManager', () => {
  let cm: CombatManager;

  beforeEach(() => { cm = new CombatManager(); });

  // --- Hitbox/Hurtbox CRUD ---
  it('addHitBox / getHitBoxCount', () => {
    cm.addHitBox(hitbox('h1', 'p1'));
    expect(cm.getHitBoxCount()).toBe(1);
  });

  it('addHurtBox / getHurtBoxCount', () => {
    cm.addHurtBox(hurtbox('hr1', 'p2'));
    expect(cm.getHurtBoxCount()).toBe(1);
  });

  it('removeHitBox removes', () => {
    cm.addHitBox(hitbox('h1', 'p1'));
    cm.removeHitBox('h1');
    expect(cm.getHitBoxCount()).toBe(0);
  });

  it('removeHurtBox removes', () => {
    cm.addHurtBox(hurtbox('hr1', 'p2'));
    cm.removeHurtBox('hr1');
    expect(cm.getHurtBoxCount()).toBe(0);
  });

  // --- Collision Detection ---
  it('checkCollisions detects overlap', () => {
    cm.addHitBox(hitbox('h1', 'p1', { x: 0, y: 0, z: 0 }));
    cm.addHurtBox(hurtbox('hr1', 'p2', { x: 0.5, y: 0, z: 0 }));
    const hits = cm.checkCollisions();
    expect(hits).toHaveLength(1);
    expect(hits[0].hitbox.id).toBe('h1');
    expect(hits[0].hurtbox.id).toBe('hr1');
  });

  it('checkCollisions skips when no overlap', () => {
    cm.addHitBox(hitbox('h1', 'p1', { x: 0, y: 0, z: 0 }));
    cm.addHurtBox(hurtbox('hr1', 'p2', { x: 100, y: 0, z: 0 }));
    expect(cm.checkCollisions()).toHaveLength(0);
  });

  it('checkCollisions skips self-hits', () => {
    cm.addHitBox(hitbox('h1', 'p1'));
    cm.addHurtBox(hurtbox('hr1', 'p1')); // same owner
    expect(cm.checkCollisions()).toHaveLength(0);
  });

  it('checkCollisions skips inactive hitboxes', () => {
    cm.addHitBox(hitbox('h1', 'p1'));
    cm.setHitBoxActive('h1', false);
    cm.addHurtBox(hurtbox('hr1', 'p2'));
    expect(cm.checkCollisions()).toHaveLength(0);
  });

  it('hit log records collisions', () => {
    cm.addHitBox(hitbox('h1', 'p1'));
    cm.addHurtBox(hurtbox('hr1', 'p2'));
    cm.checkCollisions();
    const log = cm.getHitLog();
    expect(log).toHaveLength(1);
    expect(log[0].hitboxId).toBe('h1');
  });

  // --- Combo System ---
  it('registerCombo creates chain', () => {
    const steps: ComboStep[] = [
      { name: 'jab', input: 'punch', damage: 5, window: 0.5 },
      { name: 'cross', input: 'punch', damage: 10, window: 0.5 },
    ];
    const chain = cm.registerCombo('basic', steps);
    expect(chain.id).toBe('basic');
    expect(chain.currentStep).toBe(0);
    expect(chain.completed).toBe(false);
  });

  it('advanceCombo progresses on correct input', () => {
    const steps: ComboStep[] = [
      { name: 'jab', input: 'punch', damage: 5, window: 0.5 },
      { name: 'kick', input: 'kick', damage: 10, window: 0.5 },
    ];
    cm.registerCombo('c1', steps);
    const r1 = cm.advanceCombo('c1', 'punch');
    expect(r1.hit).toBe(true);
    expect(r1.step).toBe(0);
    const r2 = cm.advanceCombo('c1', 'kick');
    expect(r2.hit).toBe(true);
    expect(r2.completed).toBe(true);
  });

  it('advanceCombo resets on wrong input', () => {
    cm.registerCombo('c2', [
      { name: 'jab', input: 'punch', damage: 5, window: 0.5 },
    ]);
    cm.advanceCombo('c2', 'punch'); // advance
    cm.resetCombo('c2');
    const r = cm.advanceCombo('c2', 'kick'); // wrong
    expect(r.hit).toBe(false);
  });

  it('updateCombos resets on timeout', () => {
    cm.registerCombo('c3', [
      { name: 'jab', input: 'punch', damage: 5, window: 0.3 },
      { name: 'cross', input: 'punch', damage: 10, window: 0.3 },
    ]);
    cm.advanceCombo('c3', 'punch'); // step 0 → step 1
    cm.updateCombos(1.0); // exceed window
    // Combo should be reset
    const r = cm.advanceCombo('c3', 'punch'); // starts from 0 again
    expect(r.step).toBe(0);
  });

  // --- Cooldowns ---
  it('startCooldown / isOnCooldown', () => {
    cm.startCooldown('fireball', 5);
    expect(cm.isOnCooldown('fireball')).toBe(true);
  });

  it('getCooldownRemaining returns remaining time', () => {
    cm.startCooldown('fireball', 5);
    expect(cm.getCooldownRemaining('fireball')).toBe(5);
  });

  it('updateCooldowns decrements', () => {
    cm.startCooldown('fireball', 5);
    cm.updateCooldowns(3);
    expect(cm.getCooldownRemaining('fireball')).toBe(2);
  });

  it('cooldown expires after full duration', () => {
    cm.startCooldown('fireball', 2);
    cm.updateCooldowns(3);
    expect(cm.isOnCooldown('fireball')).toBe(false);
  });

  it('isOnCooldown returns false for unknown ability', () => {
    expect(cm.isOnCooldown('unknown')).toBe(false);
  });

  // --- Targeting ---
  it('findTargets returns sorted by priority then distance', () => {
    const candidates = [
      { entityId: 'far', position: { x: 10, y: 0, z: 0 }, priority: 1 },
      { entityId: 'close', position: { x: 2, y: 0, z: 0 }, priority: 1 },
      { entityId: 'high', position: { x: 5, y: 0, z: 0 }, priority: 5 },
    ];
    const targets = cm.findTargets({ x: 0, y: 0, z: 0 }, candidates, 20);
    expect(targets[0].entityId).toBe('high'); // highest priority
    expect(targets[1].entityId).toBe('close'); // same priority, closer
  });

  it('findTargets filters by maxRange', () => {
    const candidates = [
      { entityId: 'close', position: { x: 2, y: 0, z: 0 } },
      { entityId: 'far', position: { x: 100, y: 0, z: 0 } },
    ];
    const targets = cm.findTargets({ x: 0, y: 0, z: 0 }, candidates, 10);
    expect(targets).toHaveLength(1);
    expect(targets[0].entityId).toBe('close');
  });
});
