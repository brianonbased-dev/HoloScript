import { describe, it, expect, beforeEach } from 'vitest';
import { StatusEffectSystem, StatusEffect } from '../StatusEffects';

type EffectDef = Omit<StatusEffect, 'id' | 'elapsed' | 'lastTick' | 'stacks'> & { stacks?: number };

function makeBuff(overrides: Partial<EffectDef> = {}): EffectDef {
  return {
    name: 'regen',
    type: 'buff',
    duration: 10,
    maxStacks: 3,
    stackBehavior: 'stack',
    modifiers: [],
    tickInterval: 0,
    tickDamage: 0,
    ...overrides,
  };
}

function makeDebuff(overrides: Partial<EffectDef> = {}): EffectDef {
  return {
    name: 'poison',
    type: 'debuff',
    duration: 5,
    maxStacks: 1,
    stackBehavior: 'replace',
    modifiers: [],
    tickInterval: 1,
    tickDamage: 3,
    ...overrides,
  };
}

describe('StatusEffectSystem', () => {
  let sys: StatusEffectSystem;
  const eid = 'player1';

  beforeEach(() => {
    sys = new StatusEffectSystem();
  });

  // --- Apply / Remove / Query ---
  it('apply adds effect', () => {
    sys.apply(eid, makeBuff());
    expect(sys.hasEffect(eid, 'regen')).toBe(true);
    expect(sys.getEffectCount(eid)).toBe(1);
  });

  it('remove removes effect', () => {
    sys.apply(eid, makeBuff());
    expect(sys.remove(eid, 'regen')).toBe(true);
    expect(sys.hasEffect(eid, 'regen')).toBe(false);
  });

  it('remove returns false for missing', () => {
    expect(sys.remove(eid, 'nonexistent')).toBe(false);
  });

  it('getEffects returns list', () => {
    sys.apply(eid, makeBuff());
    sys.apply(eid, makeDebuff());
    expect(sys.getEffects(eid)).toHaveLength(2);
  });

  // --- Stacking Behaviors ---
  it('stack behavior increments stacks', () => {
    sys.apply(eid, makeBuff({ stackBehavior: 'stack', maxStacks: 5 }));
    sys.apply(eid, makeBuff({ stackBehavior: 'stack', maxStacks: 5 }));
    const effects = sys.getEffects(eid);
    expect(effects[0].stacks).toBe(2);
  });

  it('stack behavior caps at maxStacks', () => {
    sys.apply(eid, makeBuff({ stackBehavior: 'stack', maxStacks: 2 }));
    sys.apply(eid, makeBuff({ stackBehavior: 'stack', maxStacks: 2 }));
    sys.apply(eid, makeBuff({ stackBehavior: 'stack', maxStacks: 2 }));
    expect(sys.getEffects(eid)[0].stacks).toBe(2);
  });

  it('refresh behavior resets elapsed', () => {
    sys.apply(eid, makeBuff({ name: 'shield', stackBehavior: 'refresh', duration: 5 }));
    sys.update(3); // 3 seconds elapsed
    sys.apply(eid, makeBuff({ name: 'shield', stackBehavior: 'refresh', duration: 5 }));
    // After refresh, elapsed should be 0
    const effects = sys.getEffects(eid);
    expect(effects[0].elapsed).toBe(0);
  });

  it('ignore behavior keeps existing', () => {
    const first = sys.apply(eid, makeBuff({ name: 'ward', stackBehavior: 'ignore' }));
    const second = sys.apply(eid, makeBuff({ name: 'ward', stackBehavior: 'ignore' }));
    expect(second).toBe(first); // Returns existing, no change
    expect(sys.getEffectCount(eid)).toBe(1);
  });

  // --- Immunity ---
  it('immunity blocks application', () => {
    sys.addImmunity(eid, 'poison');
    const result = sys.apply(eid, makeDebuff());
    expect(result).toBeNull();
    expect(sys.hasEffect(eid, 'poison')).toBe(false);
  });

  it('removeImmunity allows application', () => {
    sys.addImmunity(eid, 'poison');
    sys.removeImmunity(eid, 'poison');
    sys.apply(eid, makeDebuff());
    expect(sys.hasEffect(eid, 'poison')).toBe(true);
  });

  // --- Ticking ---
  it('update produces tick results', () => {
    sys.apply(eid, makeDebuff({ tickInterval: 1, tickDamage: 5 }));
    sys.update(1.5);
    const ticks = sys.getTickResults();
    expect(ticks).toHaveLength(1);
    expect(ticks[0].damage).toBe(5);
    expect(ticks[0].entityId).toBe(eid);
  });

  it('tick damage scales with stacks', () => {
    sys.apply(
      eid,
      makeDebuff({
        name: 'dot',
        stackBehavior: 'stack',
        maxStacks: 3,
        tickInterval: 1,
        tickDamage: 2,
        stacks: 3,
      })
    );
    sys.update(1.0);
    const ticks = sys.getTickResults();
    expect(ticks[0].damage).toBe(6); // 2 * 3 stacks
  });

  // --- Duration Expiry ---
  it('update removes expired effects', () => {
    sys.apply(eid, makeBuff({ duration: 2 }));
    sys.update(3);
    expect(sys.hasEffect(eid, 'regen')).toBe(false);
  });

  it('infinite duration (0) does not expire', () => {
    sys.apply(eid, makeBuff({ duration: 0 }));
    sys.update(9999);
    expect(sys.hasEffect(eid, 'regen')).toBe(true);
  });

  // --- Stat Modifiers ---
  it('getStatModifiers sums flat/percent from effects', () => {
    sys.apply(
      eid,
      makeBuff({
        modifiers: [{ stat: 'attack', flat: 10, percent: 1.2 }],
      })
    );
    const mods = sys.getStatModifiers(eid, 'attack');
    expect(mods.flat).toBe(10);
    expect(mods.percent).toBeCloseTo(1.2);
  });

  it('applyStatModifiers calculates final value', () => {
    sys.apply(
      eid,
      makeBuff({
        modifiers: [{ stat: 'attack', flat: 5, percent: 1.5 }],
      })
    );
    // (100 + 5) * 1.5 = 157.5
    expect(sys.applyStatModifiers(eid, 'attack', 100)).toBeCloseTo(157.5);
  });

  // --- Cleanse ---
  it('cleanse removes all debuffs', () => {
    sys.apply(eid, makeBuff());
    sys.apply(eid, makeDebuff());
    const count = sys.cleanse(eid);
    expect(count).toBe(1);
    expect(sys.hasEffect(eid, 'regen')).toBe(true);
    expect(sys.hasEffect(eid, 'poison')).toBe(false);
  });

  it('removeAllOfType removes only matching type', () => {
    sys.apply(eid, makeBuff());
    sys.apply(eid, makeBuff({ name: 'haste' }));
    sys.apply(eid, makeDebuff());
    const removed = sys.removeAllOfType(eid, 'buff');
    expect(removed).toBe(2);
    expect(sys.getEffectCount(eid)).toBe(1);
  });

  // --- Edge cases ---
  it('getEffectCount returns 0 for unknown entity', () => {
    expect(sys.getEffectCount('nobody')).toBe(0);
  });
});
