import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DamageSystem } from '@holoscript/engine/combat';

// =============================================================================
// C301 — DamageSystem
// =============================================================================

describe('DamageSystem', () => {
  let ds: DamageSystem;
  beforeEach(() => {
    ds = new DamageSystem();
  });

  it('calculates base damage', () => {
    const dmg = ds.calculateDamage('a', 'b', 100, 'physical');
    expect(dmg.baseDamage).toBe(100);
    expect(dmg.finalDamage).toBeGreaterThan(0);
  });

  it('forced crit applies multiplier', () => {
    ds.setConfig({ critMultiplier: 3.0 });
    const dmg = ds.calculateDamage('a', 'b', 100, 'fire', true);
    expect(dmg.isCritical).toBe(true);
    expect(dmg.finalDamage).toBeCloseTo(300);
  });

  it('resistance reduces damage', () => {
    ds.setConfig({ critChance: 0 });
    ds.setResistances('b', { physical: 0.5 });
    const dmg = ds.calculateDamage('a', 'b', 100, 'physical');
    expect(dmg.finalDamage).toBeCloseTo(50);
  });

  it('true damage ignores resistance', () => {
    ds.setConfig({ critChance: 0 });
    ds.setResistances('b', { physical: 1.0 });
    const dmg = ds.calculateDamage('a', 'b', 80, 'true');
    expect(dmg.finalDamage).toBeCloseTo(80);
  });

  it('armor penetration reduces effective resistance', () => {
    ds.setConfig({ critChance: 0, armorPenetration: 0.5 });
    ds.setResistances('b', { fire: 0.6 });
    // effectiveRes = 0.6 * (1 - 0.5) = 0.3; damage = 100 * 0.7 = 70
    const dmg = ds.calculateDamage('a', 'b', 100, 'fire');
    expect(dmg.finalDamage).toBeCloseTo(70);
  });

  it('global multiplier scales final damage', () => {
    ds.setConfig({ critChance: 0, globalMultiplier: 1.5 });
    const dmg = ds.calculateDamage('a', 'b', 100, 'lightning');
    expect(dmg.finalDamage).toBeCloseTo(150);
  });

  it('applies DoT and ticks produce damage', () => {
    ds.setConfig({ critChance: 0 });
    ds.applyDoT('a', 'b', 'poison', 10, 1, 3);
    const ticked = ds.updateDoTs(1);
    expect(ticked.length).toBe(1);
    expect(ticked[0].finalDamage).toBeCloseTo(10);
  });

  it('DoT expires after duration', () => {
    ds.applyDoT('a', 'b', 'fire', 5, 1, 2);
    ds.updateDoTs(3);
    expect(ds.getActiveDoTs('b').length).toBe(0);
  });

  it('onDamage callback fires', () => {
    const cb = vi.fn();
    ds.onDamage(cb);
    ds.calculateDamage('a', 'b', 50, 'ice');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('damage log tracks instances', () => {
    ds.setConfig({ critChance: 0 });
    ds.calculateDamage('a', 'b', 10, 'physical');
    ds.calculateDamage('a', 'b', 20, 'physical');
    expect(ds.getDamageLog().length).toBe(2);
    expect(ds.getTotalDamageDealt('a')).toBeCloseTo(30);
  });

  it('clearLog empties log', () => {
    ds.calculateDamage('a', 'b', 10, 'physical');
    ds.clearLog();
    expect(ds.getDamageLog().length).toBe(0);
  });
});
