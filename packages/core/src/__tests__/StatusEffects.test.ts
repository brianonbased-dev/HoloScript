import { describe, it, expect, beforeEach } from 'vitest';
import { StatusEffectSystem, type StatusEffect } from '../combat/StatusEffects';

// =============================================================================
// C300 — StatusEffects
// =============================================================================

function buff(
  overrides: Partial<Omit<StatusEffect, 'id' | 'elapsed' | 'lastTick' | 'stacks'>> = {}
): Omit<StatusEffect, 'id' | 'elapsed' | 'lastTick' | 'stacks'> & { stacks?: number } {
  return {
    name: 'regen',
    type: 'buff',
    duration: 10,
    maxStacks: 1,
    stackBehavior: 'refresh',
    modifiers: [],
    tickInterval: 0,
    tickDamage: 0,
    ...overrides,
  };
}

describe('StatusEffectSystem', () => {
  let sys: StatusEffectSystem;
  beforeEach(() => {
    sys = new StatusEffectSystem();
  });

  it('applies and queries effects', () => {
    sys.apply('e1', buff());
    expect(sys.hasEffect('e1', 'regen')).toBe(true);
    expect(sys.getEffectCount('e1')).toBe(1);
  });

  it('stack behavior: stack increments stacks up to maxStacks', () => {
    sys.apply('e1', buff({ name: 'might', stackBehavior: 'stack', maxStacks: 3 }));
    sys.apply('e1', buff({ name: 'might', stackBehavior: 'stack', maxStacks: 3 }));
    sys.apply('e1', buff({ name: 'might', stackBehavior: 'stack', maxStacks: 3 }));
    sys.apply('e1', buff({ name: 'might', stackBehavior: 'stack', maxStacks: 3 }));
    const e = sys.getEffects('e1').find((f) => f.name === 'might')!;
    expect(e.stacks).toBe(3);
  });

  it('stack behavior: refresh resets elapsed', () => {
    sys.apply('e1', buff({ name: 'shield', stackBehavior: 'refresh', duration: 5 }));
    sys.update(3);
    sys.apply('e1', buff({ name: 'shield', stackBehavior: 'refresh', duration: 5 }));
    const e = sys.getEffects('e1').find((f) => f.name === 'shield')!;
    expect(e.elapsed).toBe(0);
  });

  it('stack behavior: ignore returns existing without change', () => {
    sys.apply('e1', buff({ name: 'ward', stackBehavior: 'ignore', duration: 10 }));
    sys.update(5);
    const ret = sys.apply('e1', buff({ name: 'ward', stackBehavior: 'ignore', duration: 10 }));
    expect(ret!.elapsed).toBeCloseTo(5);
  });

  it('immunity blocks application', () => {
    sys.addImmunity('e1', 'poison');
    const result = sys.apply('e1', buff({ name: 'poison', type: 'debuff' }));
    expect(result).toBeNull();
    expect(sys.hasEffect('e1', 'poison')).toBe(false);
  });

  it('remove deletes specific effect', () => {
    sys.apply('e1', buff({ name: 'a' }));
    sys.apply('e1', buff({ name: 'b' }));
    sys.remove('e1', 'a');
    expect(sys.hasEffect('e1', 'a')).toBe(false);
    expect(sys.hasEffect('e1', 'b')).toBe(true);
  });

  it('cleanse removes all debuffs', () => {
    sys.apply('e1', buff({ name: 'regen', type: 'buff' }));
    sys.apply('e1', buff({ name: 'poison', type: 'debuff' }));
    sys.apply('e1', buff({ name: 'bleed', type: 'debuff' }));
    const removed = sys.cleanse('e1');
    expect(removed).toBe(2);
    expect(sys.getEffectCount('e1')).toBe(1);
  });

  it('effects expire after duration', () => {
    sys.apply('e1', buff({ name: 'haste', duration: 2 }));
    sys.update(1);
    expect(sys.hasEffect('e1', 'haste')).toBe(true);
    sys.update(1.5);
    expect(sys.hasEffect('e1', 'haste')).toBe(false);
  });

  it('tick damage fires at interval scaled by stacks', () => {
    sys.apply(
      'e1',
      buff({
        name: 'burn',
        type: 'debuff',
        duration: 10,
        tickInterval: 1,
        tickDamage: 5,
        stackBehavior: 'stack',
        maxStacks: 2,
      })
    );
    sys.apply(
      'e1',
      buff({
        name: 'burn',
        type: 'debuff',
        duration: 10,
        tickInterval: 1,
        tickDamage: 5,
        stackBehavior: 'stack',
        maxStacks: 2,
      })
    );
    sys.update(1);
    const ticks = sys.getTickResults();
    expect(ticks.length).toBe(1);
    expect(ticks[0].damage).toBe(10); // 5 * 2 stacks
  });

  it('stat modifiers apply flat and percent per stack', () => {
    sys.apply(
      'e1',
      buff({
        name: 'str',
        modifiers: [{ stat: 'attack', flat: 10, percent: 1.2 }],
        stackBehavior: 'stack',
        maxStacks: 2,
      })
    );
    sys.apply(
      'e1',
      buff({
        name: 'str',
        modifiers: [{ stat: 'attack', flat: 10, percent: 1.2 }],
        stackBehavior: 'stack',
        maxStacks: 2,
      })
    );
    const result = sys.applyStatModifiers('e1', 'attack', 100);
    // (100 + 10*2) * 1.2^2 = 120 * 1.44 = 172.8
    expect(result).toBeCloseTo(172.8);
  });

  it('removeImmunity allows future application', () => {
    sys.addImmunity('e1', 'frost');
    sys.removeImmunity('e1', 'frost');
    const ret = sys.apply('e1', buff({ name: 'frost', type: 'debuff' }));
    expect(ret).not.toBeNull();
  });
});
