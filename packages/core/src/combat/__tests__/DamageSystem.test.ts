import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DamageSystem } from '../DamageSystem';

describe('DamageSystem', () => {
  let sys: DamageSystem;

  beforeEach(() => {
    sys = new DamageSystem();
    sys.setConfig({ critChance: 0, critMultiplier: 2, armorPenetration: 0, globalMultiplier: 1 });
  });

  it('basic damage with no resistance', () => {
    const dmg = sys.calculateDamage('a', 'b', 100, 'physical');
    expect(dmg.finalDamage).toBe(100);
    expect(dmg.isCritical).toBe(false);
  });

  it('critical hit multiplies damage', () => {
    const dmg = sys.calculateDamage('a', 'b', 100, 'fire', true);
    expect(dmg.isCritical).toBe(true);
    expect(dmg.finalDamage).toBe(200);
  });

  it('resistance reduces damage', () => {
    sys.setResistances('b', { fire: 0.5 }); // 50% fire resistance
    const dmg = sys.calculateDamage('a', 'b', 100, 'fire');
    expect(dmg.finalDamage).toBe(50);
  });

  it('true damage ignores resistance', () => {
    sys.setResistances('b', { physical: 0.9 });
    const dmg = sys.calculateDamage('a', 'b', 100, 'true');
    expect(dmg.finalDamage).toBe(100);
  });

  it('armor penetration reduces effective resistance', () => {
    sys.setConfig({ critChance: 0, critMultiplier: 2, armorPenetration: 0.5, globalMultiplier: 1 });
    sys.setResistances('b', { physical: 0.4 }); // 40% res, 50% pen → effective 20%
    const dmg = sys.calculateDamage('a', 'b', 100, 'physical');
    expect(dmg.finalDamage).toBe(80);
  });

  it('global multiplier scales all damage', () => {
    sys.setConfig({ critChance: 0, critMultiplier: 2, armorPenetration: 0, globalMultiplier: 1.5 });
    const dmg = sys.calculateDamage('a', 'b', 100, 'physical');
    expect(dmg.finalDamage).toBe(150);
  });

  it('getResistances returns defaults for unknown entity', () => {
    const res = sys.getResistances('unknown');
    expect(res.physical).toBe(0);
    expect(res.fire).toBe(0);
  });

  it('onDamage callback fires', () => {
    const cb = vi.fn();
    sys.onDamage(cb);
    sys.calculateDamage('a', 'b', 50, 'ice');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].finalDamage).toBe(50);
  });

  it('damage log tracks history', () => {
    sys.calculateDamage('a', 'b', 10, 'physical');
    sys.calculateDamage('a', 'b', 20, 'fire');
    expect(sys.getDamageLog().length).toBe(2);
  });

  it('getTotalDamageDealt sums by source', () => {
    sys.calculateDamage('a', 'b', 30, 'physical');
    sys.calculateDamage('a', 'c', 20, 'fire');
    sys.calculateDamage('x', 'b', 100, 'ice');
    expect(sys.getTotalDamageDealt('a')).toBe(50);
  });

  it('clearLog empties damage history', () => {
    sys.calculateDamage('a', 'b', 10, 'physical');
    sys.clearLog();
    expect(sys.getDamageLog().length).toBe(0);
  });

  it('applyDoT creates a DoT effect', () => {
    const dot = sys.applyDoT('a', 'b', 'poison', 10, 1, 5);
    expect(dot.damagePerTick).toBe(10);
    expect(sys.getActiveDoTs('b').length).toBe(1);
  });

  it('updateDoTs ticks damage and expires', () => {
    sys.applyDoT('a', 'b', 'poison', 10, 1, 2, 1);
    const ticked1 = sys.updateDoTs(1.5); // 1 tick at t=1
    expect(ticked1.length).toBe(1);
    const ticked2 = sys.updateDoTs(1); // tick at t=2, then expires
    expect(ticked2.length).toBe(1);
    expect(sys.getActiveDoTs('b').length).toBe(0); // expired
  });

  it('DoT stacking multiplies tick damage', () => {
    sys.applyDoT('a', 'b', 'fire', 5, 1, 3, 3); // 3 stacks
    const ticked = sys.updateDoTs(1.5); // 1 tick
    expect(ticked[0].baseDamage).toBe(15); // 5 * 3 stacks
  });
});
