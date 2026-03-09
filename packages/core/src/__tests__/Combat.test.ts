import { describe, it, expect } from 'vitest';
import { DamageSystem } from '../combat/DamageSystem';
import { CombatManager } from '../combat/CombatManager';
import { StatusEffectSystem } from '../combat/StatusEffects';

describe('Cycle 141: Damage & Combat', () => {
  // -------------------------------------------------------------------------
  // DamageSystem
  // -------------------------------------------------------------------------

  it('should calculate damage with resistance and crits', () => {
    const ds = new DamageSystem();
    ds.setConfig({ critChance: 0, critMultiplier: 2, armorPenetration: 0, globalMultiplier: 1 });
    ds.setResistances('target', { fire: 0.5, physical: 0 });

    const phys = ds.calculateDamage('attacker', 'target', 100, 'physical');
    expect(phys.finalDamage).toBe(100);

    const fire = ds.calculateDamage('attacker', 'target', 100, 'fire');
    expect(fire.finalDamage).toBe(50); // 50% fire resist

    const crit = ds.calculateDamage('attacker', 'target', 100, 'physical', true);
    expect(crit.isCritical).toBe(true);
    expect(crit.finalDamage).toBe(200);

    // True damage ignores resistance
    const trueDmg = ds.calculateDamage('attacker', 'target', 100, 'true');
    expect(trueDmg.finalDamage).toBe(100);
  });

  it('should apply and tick DoTs', () => {
    const ds = new DamageSystem();
    ds.setConfig({ critChance: 0, critMultiplier: 1, armorPenetration: 0, globalMultiplier: 1 });

    ds.applyDoT('src', 'tgt', 'poison', 10, 1, 3); // 10 dmg per tick, 1s interval, 3s duration

    const tick1 = ds.updateDoTs(1.0);
    expect(tick1.length).toBe(1);
    expect(tick1[0].finalDamage).toBe(10);

    ds.updateDoTs(1.0); // tick 2
    ds.updateDoTs(1.0); // tick 3 — should expire

    expect(ds.getActiveDoTs().length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // CombatManager
  // -------------------------------------------------------------------------

  it('should detect hitbox/hurtbox collisions', () => {
    const cm = new CombatManager();
    cm.addHitBox({
      id: 'hb1',
      ownerId: 'player',
      position: { x: 0, y: 0, z: 0 },
      size: { x: 2, y: 2, z: 2 },
      active: true,
      damage: 50,
      damageType: 'physical',
      knockback: 5,
    });
    cm.addHurtBox({
      id: 'hr1',
      ownerId: 'enemy',
      position: { x: 1, y: 0, z: 0 },
      size: { x: 2, y: 2, z: 2 },
      active: true,
    });
    cm.addHurtBox({
      id: 'hr2',
      ownerId: 'player',
      position: { x: 0, y: 0, z: 0 },
      size: { x: 2, y: 2, z: 2 },
      active: true,
    }); // Self — should NOT hit

    const hits = cm.checkCollisions();
    expect(hits.length).toBe(1);
    expect(hits[0].hurtbox.ownerId).toBe('enemy');
  });

  it('should advance combo chains', () => {
    const cm = new CombatManager();
    cm.registerCombo('punch_combo', [
      { name: 'jab', input: 'light', damage: 10, window: 0.5 },
      { name: 'cross', input: 'light', damage: 15, window: 0.5 },
      { name: 'uppercut', input: 'heavy', damage: 30, window: 0.5 },
    ]);

    const r1 = cm.advanceCombo('punch_combo', 'light');
    expect(r1.hit).toBe(true);

    const r2 = cm.advanceCombo('punch_combo', 'light');
    expect(r2.hit).toBe(true);

    const r3 = cm.advanceCombo('punch_combo', 'heavy');
    expect(r3.hit).toBe(true);
    expect(r3.completed).toBe(true);
  });

  it('should manage cooldowns', () => {
    const cm = new CombatManager();
    cm.startCooldown('fireball', 5);
    expect(cm.isOnCooldown('fireball')).toBe(true);

    cm.updateCooldowns(3);
    expect(cm.getCooldownRemaining('fireball')).toBeCloseTo(2, 0);

    cm.updateCooldowns(3);
    expect(cm.isOnCooldown('fireball')).toBe(false);
  });

  it('should find targets by range and priority', () => {
    const cm = new CombatManager();
    const targets = cm.findTargets(
      { x: 0, y: 0, z: 0 },
      [
        { entityId: 'far', position: { x: 100, y: 0, z: 0 } },
        { entityId: 'close', position: { x: 3, y: 0, z: 0 }, priority: 1 },
        { entityId: 'mid', position: { x: 5, y: 0, z: 0 }, priority: 2 },
      ],
      10
    );

    expect(targets.length).toBe(2); // far is out of range
    expect(targets[0].entityId).toBe('mid'); // Higher priority first
  });

  // -------------------------------------------------------------------------
  // StatusEffects
  // -------------------------------------------------------------------------

  it('should apply stacking buffs and stat modifiers', () => {
    const se = new StatusEffectSystem();
    se.apply('hero', {
      name: 'strength',
      type: 'buff',
      duration: 10,
      maxStacks: 5,
      stackBehavior: 'stack',
      modifiers: [{ stat: 'attack', flat: 5, percent: 1 }],
      tickInterval: 0,
      tickDamage: 0,
    });
    se.apply('hero', {
      name: 'strength',
      type: 'buff',
      duration: 10,
      maxStacks: 5,
      stackBehavior: 'stack',
      modifiers: [{ stat: 'attack', flat: 5, percent: 1 }],
      tickInterval: 0,
      tickDamage: 0,
    });

    const modified = se.applyStatModifiers('hero', 'attack', 100);
    expect(modified).toBe(110); // 100 + (5 * 2 stacks)
  });

  it('should handle immunity and cleansing', () => {
    const se = new StatusEffectSystem();
    se.addImmunity('hero', 'stun');

    const result = se.apply('hero', {
      name: 'stun',
      type: 'debuff',
      duration: 3,
      maxStacks: 1,
      stackBehavior: 'replace',
      modifiers: [],
      tickInterval: 0,
      tickDamage: 0,
    });
    expect(result).toBeNull(); // Immune

    se.apply('hero', {
      name: 'poison',
      type: 'debuff',
      duration: 5,
      maxStacks: 1,
      stackBehavior: 'replace',
      modifiers: [],
      tickInterval: 1,
      tickDamage: 5,
    });
    expect(se.hasEffect('hero', 'poison')).toBe(true);

    se.cleanse('hero');
    expect(se.hasEffect('hero', 'poison')).toBe(false);
  });
});
