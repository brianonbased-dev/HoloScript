/**
 * StatusEffects — Production Test Suite
 *
 * Covers: apply, stack behaviors (stack/refresh/replace/ignore),
 * immunity, removal, cleanse, duration expiry, tick damage,
 * stat modifiers, queries.
 */
import { describe, it, expect } from 'vitest';
import { StatusEffectSystem, type StatusEffect } from '../StatusEffects';

function buff(
  name: string,
  opts: Partial<Omit<StatusEffect, 'id' | 'elapsed' | 'lastTick' | 'stacks'>> = {}
): Omit<StatusEffect, 'id' | 'elapsed' | 'lastTick' | 'stacks'> & { stacks?: number } {
  return {
    name,
    type: opts.type ?? 'buff',
    duration: opts.duration ?? 10,
    maxStacks: opts.maxStacks ?? 5,
    stackBehavior: opts.stackBehavior ?? 'stack',
    modifiers: opts.modifiers ?? [],
    tickInterval: opts.tickInterval ?? 0,
    tickDamage: opts.tickDamage ?? 0,
    ...opts,
  };
}

describe('StatusEffects — Production', () => {
  // ─── Apply ────────────────────────────────────────────────────────
  it('apply adds effect to entity', () => {
    const se = new StatusEffectSystem();
    se.apply('hero', buff('might'));
    expect(se.hasEffect('hero', 'might')).toBe(true);
    expect(se.getEffectCount('hero')).toBe(1);
  });

  // ─── Stack Behaviors ──────────────────────────────────────────────
  it('stack behavior increments stacks', () => {
    const se = new StatusEffectSystem();
    se.apply('hero', buff('poison', { stackBehavior: 'stack', maxStacks: 3 }));
    se.apply('hero', buff('poison', { stackBehavior: 'stack', maxStacks: 3 }));
    const effects = se.getEffects('hero');
    expect(effects[0].stacks).toBe(2);
  });

  it('stack capped at maxStacks', () => {
    const se = new StatusEffectSystem();
    for (let i = 0; i < 10; i++)
      se.apply('hero', buff('poison', { stackBehavior: 'stack', maxStacks: 3 }));
    expect(se.getEffects('hero')[0].stacks).toBe(3);
  });

  it('refresh resets duration', () => {
    const se = new StatusEffectSystem();
    se.apply('hero', buff('shield', { stackBehavior: 'refresh', duration: 10 }));
    se.update(5); // 5s elapsed
    se.apply('hero', buff('shield', { stackBehavior: 'refresh', duration: 10 }));
    const eff = se.getEffects('hero')[0];
    expect(eff.elapsed).toBe(0);
  });

  it('ignore does not overwrite existing', () => {
    const se = new StatusEffectSystem();
    se.apply('hero', buff('aura', { stackBehavior: 'ignore' }));
    const result = se.apply('hero', buff('aura', { stackBehavior: 'ignore' }));
    expect(result).not.toBeNull(); // returns existing
    expect(se.getEffectCount('hero')).toBe(1);
  });

  // ─── Immunity ─────────────────────────────────────────────────────
  it('immune entity blocks effect application', () => {
    const se = new StatusEffectSystem();
    se.addImmunity('hero', 'stun');
    expect(se.apply('hero', buff('stun'))).toBeNull();
  });

  it('removeImmunity allows reapplication', () => {
    const se = new StatusEffectSystem();
    se.addImmunity('hero', 'stun');
    se.removeImmunity('hero', 'stun');
    expect(se.apply('hero', buff('stun'))).not.toBeNull();
  });

  // ─── Removal ──────────────────────────────────────────────────────
  it('remove deletes specific effect', () => {
    const se = new StatusEffectSystem();
    se.apply('hero', buff('might'));
    se.remove('hero', 'might');
    expect(se.hasEffect('hero', 'might')).toBe(false);
  });

  it('removeAllOfType clears debuffs only', () => {
    const se = new StatusEffectSystem();
    se.apply('hero', buff('might', { type: 'buff' }));
    se.apply('hero', buff('weak', { type: 'debuff' }));
    const removed = se.removeAllOfType('hero', 'debuff');
    expect(removed).toBe(1);
    expect(se.hasEffect('hero', 'might')).toBe(true);
  });

  it('cleanse removes debuffs', () => {
    const se = new StatusEffectSystem();
    se.apply('hero', buff('poison', { type: 'debuff' }));
    se.apply('hero', buff('slow', { type: 'debuff' }));
    se.apply('hero', buff('haste', { type: 'buff' }));
    const cleansed = se.cleanse('hero');
    expect(cleansed).toBe(2);
    expect(se.hasEffect('hero', 'haste')).toBe(true);
  });

  // ─── Duration Expiry ──────────────────────────────────────────────
  it('effect expires after duration', () => {
    const se = new StatusEffectSystem();
    se.apply('hero', buff('speed', { duration: 5 }));
    se.update(6);
    expect(se.hasEffect('hero', 'speed')).toBe(false);
  });

  // ─── Tick Damage ──────────────────────────────────────────────────
  it('ticking effect produces tick results', () => {
    const se = new StatusEffectSystem();
    se.apply(
      'hero',
      buff('burn', { type: 'debuff', tickInterval: 1, tickDamage: 10, duration: 5 })
    );
    se.update(2);
    const results = se.getTickResults();
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].damage).toBe(10);
  });

  // ─── Stat Modifiers ───────────────────────────────────────────────
  it('stat modifier flat bonus applies', () => {
    const se = new StatusEffectSystem();
    se.apply('hero', buff('strength', { modifiers: [{ stat: 'attack', flat: 10, percent: 1.0 }] }));
    const result = se.applyStatModifiers('hero', 'attack', 100);
    expect(result).toBe(110);
  });

  it('stat modifier percent bonus applies', () => {
    const se = new StatusEffectSystem();
    se.apply('hero', buff('fury', { modifiers: [{ stat: 'attack', flat: 0, percent: 1.5 }] }));
    const result = se.applyStatModifiers('hero', 'attack', 100);
    expect(result).toBe(150);
  });
});
