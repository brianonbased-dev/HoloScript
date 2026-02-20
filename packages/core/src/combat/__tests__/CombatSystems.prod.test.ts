/**
 * CombatSystems.prod.test.ts
 *
 * Production tests for the combat subsystem:
 *   CombatManager, DamageSystem, StatusEffectSystem,
 *   ComboTracker, HitboxSystem, ProjectileSystem
 *
 * Rules: pure in-memory, deterministic, no I/O.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CombatManager } from '../CombatManager';
import { DamageSystem } from '../DamageSystem';
import { StatusEffectSystem } from '../StatusEffects';
import { ComboTracker } from '../ComboTracker';
import { HitboxSystem } from '../HitboxSystem';
import { ProjectileSystem } from '../ProjectileSystem';

// =============================================================================
// CombatManager
// =============================================================================

describe('CombatManager', () => {
  let cm: CombatManager;
  beforeEach(() => { cm = new CombatManager(); });

  it('adds and counts hitboxes', () => {
    cm.addHitBox({ id: 'hb1', ownerId: 'a', position: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 }, active: true, damage: 10, damageType: 'physical', knockback: 1 });
    expect(cm.getHitBoxCount()).toBe(1);
  });

  it('adds and counts hurtboxes', () => {
    cm.addHurtBox({ id: 'hr1', ownerId: 'b', position: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 }, active: true });
    expect(cm.getHurtBoxCount()).toBe(1);
  });

  it('removes hitbox', () => {
    cm.addHitBox({ id: 'hb1', ownerId: 'a', position: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 }, active: true, damage: 10, damageType: 'physical', knockback: 1 });
    cm.removeHitBox('hb1');
    expect(cm.getHitBoxCount()).toBe(0);
  });

  it('detects AABB collision between overlapping boxes', () => {
    cm.addHitBox({ id: 'hb1', ownerId: 'attacker', position: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 }, active: true, damage: 20, damageType: 'physical', knockback: 1 });
    cm.addHurtBox({ id: 'hr1', ownerId: 'defender', position: { x: 0.5, y: 0.5, z: 0.5 }, size: { x: 2, y: 2, z: 2 }, active: true });
    const hits = cm.checkCollisions();
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].hitbox.damage).toBe(20);
  });

  it('no self-hit collision', () => {
    cm.addHitBox({ id: 'hb1', ownerId: 'same', position: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 }, active: true, damage: 10, damageType: 'physical', knockback: 1 });
    cm.addHurtBox({ id: 'hr1', ownerId: 'same', position: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 }, active: true });
    expect(cm.checkCollisions().length).toBe(0);
  });

  it('no collision when hitbox inactive', () => {
    cm.addHitBox({ id: 'hb1', ownerId: 'a', position: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 }, active: false, damage: 10, damageType: 'physical', knockback: 1 });
    cm.addHurtBox({ id: 'hr1', ownerId: 'b', position: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 }, active: true });
    expect(cm.checkCollisions().length).toBe(0);
  });

  it('setHitBoxActive toggles collision', () => {
    cm.addHitBox({ id: 'hb1', ownerId: 'a', position: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 }, active: false, damage: 10, damageType: 'physical', knockback: 1 });
    cm.addHurtBox({ id: 'hr1', ownerId: 'b', position: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 }, active: true });
    cm.setHitBoxActive('hb1', true);
    expect(cm.checkCollisions().length).toBeGreaterThan(0);
  });

  it('registers and advances combo correctly', () => {
    cm.registerCombo('jab-cross', [
      { name: 'jab', input: 'left', damage: 5, window: 1 },
      { name: 'cross', input: 'right', damage: 10, window: 1 },
    ]);
    const r1 = cm.advanceCombo('jab-cross', 'left');
    expect(r1.hit).toBe(true);
    expect(r1.completed).toBe(false);
    const r2 = cm.advanceCombo('jab-cross', 'right');
    expect(r2.hit).toBe(true);
    expect(r2.completed).toBe(true);
  });

  it('resets combo on wrong input', () => {
    cm.registerCombo('c1', [
      { name: 'a', input: 'a', damage: 5, window: 1 },
      { name: 'b', input: 'b', damage: 5, window: 1 },
    ]);
    cm.advanceCombo('c1', 'a');
    const r = cm.advanceCombo('c1', 'x'); // wrong
    expect(r.hit).toBe(false);
  });

  it('starts and tracks cooldowns', () => {
    cm.startCooldown('fireball', 2);
    expect(cm.isOnCooldown('fireball')).toBe(true);
    expect(cm.getCooldownRemaining('fireball')).toBe(2);
  });

  it('cooldown ticks down correctly', () => {
    cm.startCooldown('dash', 1);
    cm.updateCooldowns(0.5);
    expect(cm.getCooldownRemaining('dash')).toBeCloseTo(0.5);
    cm.updateCooldowns(0.6);
    expect(cm.isOnCooldown('dash')).toBe(false);
  });

  it('findTargets filters by range and sorts by priority', () => {
    const candidates = [
      { entityId: 'far', position: { x: 100, y: 0, z: 0 }, priority: 10 },
      { entityId: 'near-lo', position: { x: 2, y: 0, z: 0 }, priority: 0 },
      { entityId: 'near-hi', position: { x: 3, y: 0, z: 0 }, priority: 5 },
    ];
    const targets = cm.findTargets({ x: 0, y: 0, z: 0 }, candidates, 10);
    expect(targets.length).toBe(2);
    expect(targets[0].entityId).toBe('near-hi'); // highest priority
  });

  it('returns hit log after collisions', () => {
    cm.addHitBox({ id: 'hb1', ownerId: 'a', position: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 }, active: true, damage: 10, damageType: 'physical', knockback: 1 });
    cm.addHurtBox({ id: 'hr1', ownerId: 'b', position: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 }, active: true });
    cm.checkCollisions();
    expect(cm.getHitLog().length).toBe(1);
  });
});

// =============================================================================
// DamageSystem
// =============================================================================

describe('DamageSystem', () => {
  let ds: DamageSystem;
  beforeEach(() => { ds = new DamageSystem(); });

  it('calculates base damage (true type ignores resistance)', () => {
    const inst = ds.calculateDamage('s', 't', 100, 'true', false);
    expect(inst.finalDamage).toBe(100);
    expect(inst.isCritical).toBe(false);
  });

  it('applies resistance to physical damage', () => {
    ds.setResistances('target', { physical: 0.5 });
    const inst = ds.calculateDamage('s', 'target', 100, 'physical', false);
    expect(inst.finalDamage).toBeCloseTo(50);
  });

  it('forced crit applies multiplier', () => {
    ds.setConfig({ critMultiplier: 3.0, critChance: 0 });
    const inst = ds.calculateDamage('s', 't', 100, 'true', true);
    expect(inst.isCritical).toBe(true);
    expect(inst.finalDamage).toBeCloseTo(300);
  });

  it('global multiplier scales damage', () => {
    ds.setConfig({ globalMultiplier: 0.5 });
    const inst = ds.calculateDamage('s', 't', 100, 'true', false);
    expect(inst.finalDamage).toBeCloseTo(50);
  });

  it('armor penetration reduces effective resistance', () => {
    ds.setResistances('t', { physical: 1.0 }); // fully resistant
    ds.setConfig({ armorPenetration: 1.0 });    // fully penetrate
    const inst = ds.calculateDamage('s', 't', 100, 'physical', false);
    expect(inst.finalDamage).toBeCloseTo(100);
  });

  it('fires onDamage callbacks', () => {
    ds.setConfig({ critChance: 0, critMultiplier: 1, globalMultiplier: 1 });
    const events: number[] = [];
    ds.onDamage(d => events.push(d.finalDamage));
    ds.calculateDamage('s', 't', 50, 'true', false);
    expect(events).toHaveLength(1);
    expect(events[0]).toBe(50);
  });

  it('tracks total damage dealt per source', () => {
    ds.setConfig({ critChance: 0, critMultiplier: 1, globalMultiplier: 1 });
    ds.calculateDamage('playerA', 't', 30, 'true', false);
    ds.calculateDamage('playerA', 't', 20, 'true', false);
    ds.calculateDamage('playerB', 't', 100, 'true', false);
    expect(ds.getTotalDamageDealt('playerA')).toBeCloseTo(50);
    expect(ds.getTotalDamageDealt('playerB')).toBeCloseTo(100);
  });

  it('applies DoT and ticks on update', () => {
    ds.applyDoT('src', 'tgt', 'fire', 10, 0.5, 2, 1);
    const ticked = ds.updateDoTs(1.0); // 2 ticks at 0.5s intervals
    expect(ticked.length).toBeGreaterThanOrEqual(2);
  });

  it('DoT expires after duration', () => {
    ds.applyDoT('src', 'tgt', 'poison', 5, 0.2, 0.5, 1);
    ds.updateDoTs(1.0); // fully elapsed
    expect(ds.getActiveDoTs('tgt').length).toBe(0);
  });

  it('clears damage log', () => {
    ds.calculateDamage('s', 't', 10, 'true', false);
    ds.clearLog();
    expect(ds.getDamageLog().length).toBe(0);
  });
});

// =============================================================================
// StatusEffectSystem
// =============================================================================

describe('StatusEffectSystem', () => {
  let sys: StatusEffectSystem;
  const base = {
    name: 'burn', type: 'debuff' as const, duration: 5,
    maxStacks: 3, stackBehavior: 'stack' as const,
    modifiers: [], tickInterval: 1, tickDamage: 10,
  };
  beforeEach(() => { sys = new StatusEffectSystem(); });

  it('applies a status effect', () => {
    sys.apply('entity1', base);
    expect(sys.hasEffect('entity1', 'burn')).toBe(true);
    expect(sys.getEffectCount('entity1')).toBe(1);
  });

  it('stacks effect up to maxStacks', () => {
    sys.apply('e', base);
    sys.apply('e', base);
    sys.apply('e', base);
    sys.apply('e', base); // beyond max
    const effects = sys.getEffects('e');
    const burn = effects.find(e => e.name === 'burn');
    expect(burn?.stacks).toBe(3);
  });

  it('refreshes duration on reapply (refresh behavior)', () => {
    const refresh = { ...base, name: 'chill', stackBehavior: 'refresh' as const };
    sys.apply('e', refresh);
    sys.update(2); // elapse 2s
    sys.apply('e', refresh); // refresh
    expect(sys.getEffects('e').find(x => x.name === 'chill')?.elapsed).toBe(0);
  });

  it('ignores reapply (ignore behavior)', () => {
    const ign = { ...base, name: 'shield', stackBehavior: 'ignore' as const };
    sys.apply('e', ign);
    sys.apply('e', { ...ign, tickDamage: 999 });
    expect(sys.getEffects('e').find(x => x.name === 'shield')?.tickDamage).toBe(10);
  });

  it('removes effect by name', () => {
    sys.apply('e', base);
    sys.remove('e', 'burn');
    expect(sys.hasEffect('e', 'burn')).toBe(false);
  });

  it('cleanses all debuffs', () => {
    sys.apply('e', base);
    sys.cleanse('e');
    expect(sys.getEffects('e').length).toBe(0);
  });

  it('ticks deal damage on update', () => {
    sys.apply('e', base);
    sys.update(1.5); // 1 tick at t=1
    const results = sys.getTickResults();
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('expires effect after duration', () => {
    sys.apply('e', { ...base, duration: 1 });
    sys.update(2);
    expect(sys.hasEffect('e', 'burn')).toBe(false);
  });

  it('immunity blocks application', () => {
    sys.addImmunity('e', 'burn');
    const result = sys.apply('e', base);
    expect(result).toBeNull();
  });

  it('computes stat modifiers from stacked effects', () => {
    sys.apply('e', {
      ...base, name: 'str_up', type: 'buff', stackBehavior: 'stack',
      modifiers: [{ stat: 'strength', flat: 10, percent: 1.0 }],
      tickInterval: 0, tickDamage: 0,
    });
    const mod = sys.getStatModifiers('e', 'strength');
    expect(mod.flat).toBe(10);
    const applied = sys.applyStatModifiers('e', 'strength', 50);
    expect(applied).toBe(60);
  });
});

// =============================================================================
// ComboTracker
// =============================================================================

describe('ComboTracker', () => {
  let ct: ComboTracker;
  beforeEach(() => {
    ct = new ComboTracker();
    ct.registerCombo({
      id: 'hadouken',
      name: 'Hadouken',
      steps: [
        { input: 'down', maxDelay: 300 },
        { input: 'forward', maxDelay: 300 },
        { input: 'punch', maxDelay: 300 },
      ],
      reward: 'fireball',
    });
  });

  it('no completed combo on partial input', () => {
    const result = ct.pushInput('down', 0);
    expect(result).toBeNull();
    expect(ct.getActiveComboCount()).toBe(1);
  });

  it('completes combo on full sequence', () => {
    ct.pushInput('down', 0);
    ct.pushInput('forward', 100);
    const r = ct.pushInput('punch', 200);
    expect(r).toBe('fireball');
  });

  it('single-step combo completes immediately', () => {
    ct.registerCombo({ id: 'quick', name: 'Quick', steps: [{ input: 'kick', maxDelay: 200 }], reward: 'quick_kick' });
    const r = ct.pushInput('kick', 0);
    expect(r).toBe('quick_kick');
  });

  it('timeouts combo if delay exceeded', () => {
    ct.pushInput('down', 0);
    ct.tick(1000); // advance past maxDelay
    expect(ct.getActiveComboCount()).toBe(0);
  });

  it('resets clears all active combos', () => {
    ct.pushInput('down', 0);
    ct.reset();
    expect(ct.getActiveComboCount()).toBe(0);
  });

  it('getCompletedCombos reflects latest push', () => {
    ct.pushInput('down', 0);
    ct.pushInput('forward', 100);
    ct.pushInput('punch', 200);
    expect(ct.getCompletedCombos()).toContain('fireball');
  });
});

// =============================================================================
// HitboxSystem
// =============================================================================

describe('HitboxSystem', () => {
  let hs: HitboxSystem;
  const makeHB = (ownerId: string, active: [number, number]) => ({
    id: `hb_${ownerId}`, ownerId,
    x: 0, y: 0, z: 0, width: 2, height: 2, depth: 2,
    damage: 15, knockbackX: 1, knockbackY: 0.5,
    activeStart: active[0], activeEnd: active[1],
    group: `grp_${ownerId}`,
  });
  const makeHR = (entityId: string) => ({
    id: `hr_${entityId}`, entityId,
    x: 0, y: 0, z: 0, width: 2, height: 2, depth: 2,
  });

  beforeEach(() => { hs = new HitboxSystem(); });

  it('registers hitbox and hurtbox', () => {
    hs.addHitbox(makeHB('a', [1, 5]));
    hs.addHurtbox(makeHR('b'));
    const events = hs.update(3);
    expect(events.length).toBe(1);
    expect(events[0].damage).toBe(15);
  });

  it('no hit outside active frames', () => {
    hs.addHitbox(makeHB('a', [5, 10]));
    hs.addHurtbox(makeHR('b'));
    const events = hs.update(3); // frame 3, outside [5,10]
    expect(events.length).toBe(0);
  });

  it('no self-hit', () => {
    hs.addHitbox(makeHB('self', [1, 5]));
    hs.addHurtbox(makeHR('self'));
    expect(hs.update(3).length).toBe(0);
  });

  it('deduplication prevents double-hit from same group', () => {
    hs.addHitbox(makeHB('a', [1, 5]));
    hs.addHurtbox(makeHR('b'));
    hs.update(3); // first hit registered
    const second = hs.update(4); // same group:entity key
    expect(second.length).toBe(0);
  });

  it('clearHitLog resets dedup and getHitCount', () => {
    hs.addHitbox(makeHB('a', [1, 5]));
    hs.addHurtbox(makeHR('b'));
    hs.update(3);
    hs.clearHitLog();
    expect(hs.getHitCount()).toBe(0);
    expect(hs.update(4).length).toBe(1); // can hit again after clear
  });

  it('removes hitbox', () => {
    const hb = makeHB('a', [1, 5]);
    hs.addHitbox(hb);
    hs.addHurtbox(makeHR('b'));
    hs.removeHitbox(hb.id);
    expect(hs.update(3).length).toBe(0);
  });
});

// =============================================================================
// ProjectileSystem
// =============================================================================

describe('ProjectileSystem', () => {
  let ps: ProjectileSystem;
  const cfg = {
    speed: 10, lifetime: 5, damage: 20,
    homing: false, homingStrength: 0,
    piercing: 0, gravity: 0,
  };
  beforeEach(() => { ps = new ProjectileSystem(); });

  it('spawns a projectile and tracks it', () => {
    const id = ps.spawn('own', 0, 0, 0, 1, 0, 0, cfg);
    const p = ps.getProjectile(id);
    expect(p).toBeDefined();
    expect(p!.alive).toBe(true);
    expect(ps.getAliveCount()).toBe(1);
  });

  it('normalizes direction and applies speed', () => {
    const id = ps.spawn('own', 0, 0, 0, 3, 4, 0, cfg); // len=5
    const p = ps.getProjectile(id)!;
    const speed = Math.sqrt(p.vx ** 2 + p.vy ** 2 + p.vz ** 2);
    expect(speed).toBeCloseTo(10);
  });

  it('projectile moves over time', () => {
    const id = ps.spawn('own', 0, 0, 0, 1, 0, 0, cfg);
    ps.update(0.1);
    const p = ps.getProjectile(id)!;
    expect(p.x).toBeCloseTo(1); // speed=10 * dt=0.1
  });

  it('projectile dies after lifetime', () => {
    const id = ps.spawn('own', 0, 0, 0, 1, 0, 0, { ...cfg, lifetime: 1 });
    ps.update(2);
    expect(ps.getProjectile(id)!.alive).toBe(false);
    expect(ps.getAliveCount()).toBe(0);
  });

  it('gravity pulls projectile down', () => {
    const id = ps.spawn('own', 0, 0, 0, 0, 0, 0, { ...cfg, gravity: 9.8 });
    ps.update(1);
    const p = ps.getProjectile(id)!;
    expect(p.vy).toBeLessThan(0);
  });

  it('fires impact callback on hit and kills non-piercing projectile', () => {
    let hit = false;
    ps.setImpactCallback(() => { hit = true; });
    const id = ps.spawn('own', 0, 0, 0, 1, 0, 0, cfg);
    const targets = [{ id: 'enemy', x: 0.1, y: 0, z: 0, radius: 5 }];
    ps.update(0, targets);
    expect(hit).toBe(true);
    expect(ps.getProjectile(id)!.alive).toBe(false);
  });

  it('piercing projectile survives first hit', () => {
    const id = ps.spawn('own', 0, 0, 0, 1, 0, 0, { ...cfg, piercing: 1 });
    const targets = [{ id: 'e1', x: 0.1, y: 0, z: 0, radius: 5 }];
    ps.update(0, targets);
    expect(ps.getProjectile(id)!.alive).toBe(true);
    expect(ps.getProjectile(id)!.hitCount).toBe(1);
  });

  it('cleanup removes dead projectiles from alive count', () => {
    ps.spawn('own', 0, 0, 0, 1, 0, 0, { ...cfg, lifetime: 0.1 });
    ps.update(1);
    expect(ps.getAliveCount()).toBe(0);
    ps.cleanup();
  });
});
