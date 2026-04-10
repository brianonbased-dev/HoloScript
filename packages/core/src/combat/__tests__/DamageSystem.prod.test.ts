/**
 * DamageSystem — Production Test Suite
 *
 * Covers: damage calculation, resistances, critical hits, true damage,
 * armor penetration, global multiplier, DoT, damage log, events, queries.
 */
import { describe, it, expect, vi } from 'vitest';
import { DamageSystem } from '../DamageSystem';

describe('DamageSystem — Production', () => {
  // ─── Basic Damage ─────────────────────────────────────────────────
  it('calculateDamage returns damage instance', () => {
    const ds = new DamageSystem();
    ds.setConfig({ critChance: 0 }); // no crits
    const dmg = ds.calculateDamage('a', 'b', 100, 'physical');
    expect(dmg.baseDamage).toBe(100);
    expect(dmg.finalDamage).toBe(100);
    expect(dmg.isCritical).toBe(false);
  });

  // ─── Critical Hits ────────────────────────────────────────────────
  it('forceCrit applies critical multiplier', () => {
    const ds = new DamageSystem();
    ds.setConfig({ critMultiplier: 2.0, critChance: 0 });
    const dmg = ds.calculateDamage('a', 'b', 100, 'physical', true);
    expect(dmg.isCritical).toBe(true);
    expect(dmg.finalDamage).toBe(200);
  });

  // ─── Resistances ──────────────────────────────────────────────────
  it('resistance reduces damage', () => {
    const ds = new DamageSystem();
    ds.setConfig({ critChance: 0 });
    ds.setResistances('target', { fire: 0.5 });
    const dmg = ds.calculateDamage('a', 'target', 100, 'fire');
    expect(dmg.finalDamage).toBe(50);
  });

  it('full resistance blocks all damage', () => {
    const ds = new DamageSystem();
    ds.setConfig({ critChance: 0 });
    ds.setResistances('target', { ice: 1.0 });
    const dmg = ds.calculateDamage('a', 'target', 100, 'ice');
    expect(dmg.finalDamage).toBe(0);
  });

  // ─── True Damage ──────────────────────────────────────────────────
  it('true damage ignores resistance', () => {
    const ds = new DamageSystem();
    ds.setConfig({ critChance: 0 });
    ds.setResistances('target', { physical: 1.0 });
    const dmg = ds.calculateDamage('a', 'target', 100, 'true');
    expect(dmg.finalDamage).toBe(100);
  });

  // ─── Armor Penetration ────────────────────────────────────────────
  it('armor penetration reduces effective resistance', () => {
    const ds = new DamageSystem();
    ds.setConfig({ critChance: 0, armorPenetration: 0.5 });
    ds.setResistances('target', { physical: 0.8 });
    const dmg = ds.calculateDamage('a', 'target', 100, 'physical');
    // Effective res = 0.8 * (1 - 0.5) = 0.4, damage = 100 * 0.6 = 60
    expect(dmg.finalDamage).toBe(60);
  });

  // ─── Global Multiplier ────────────────────────────────────────────
  it('globalMultiplier scales all damage', () => {
    const ds = new DamageSystem();
    ds.setConfig({ critChance: 0, globalMultiplier: 1.5 });
    const dmg = ds.calculateDamage('a', 'b', 100, 'physical');
    expect(dmg.finalDamage).toBe(150);
  });

  // ─── Config ───────────────────────────────────────────────────────
  it('getConfig returns current config', () => {
    const ds = new DamageSystem();
    ds.setConfig({ critChance: 0.5 });
    expect(ds.getConfig().critChance).toBe(0.5);
  });

  // ─── Damage Over Time ─────────────────────────────────────────────
  it('applyDoT creates active DoT', () => {
    const ds = new DamageSystem();
    ds.applyDoT('a', 'b', 'poison', 10, 1, 5);
    expect(ds.getActiveDoTs().length).toBe(1);
  });

  it('updateDoTs ticks damage', () => {
    const ds = new DamageSystem();
    ds.setConfig({ critChance: 0 });
    ds.applyDoT('a', 'b', 'poison', 10, 1, 5);
    const ticked = ds.updateDoTs(1.5); // should tick once at t=1
    expect(ticked.length).toBeGreaterThanOrEqual(1);
  });

  it('DoT expires after duration', () => {
    const ds = new DamageSystem();
    ds.setConfig({ critChance: 0 });
    ds.applyDoT('a', 'b', 'fire', 5, 1, 2);
    ds.updateDoTs(3); // past duration
    expect(ds.getActiveDoTs().length).toBe(0);
  });

  // ─── Events ───────────────────────────────────────────────────────
  it('onDamage callback fires on damage', () => {
    const ds = new DamageSystem();
    ds.setConfig({ critChance: 0 });
    const cb = vi.fn();
    ds.onDamage(cb);
    ds.calculateDamage('a', 'b', 50, 'physical');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  // ─── Log / Queries ────────────────────────────────────────────────
  it('getDamageLog returns recent entries', () => {
    const ds = new DamageSystem();
    ds.setConfig({ critChance: 0 });
    ds.calculateDamage('a', 'b', 10, 'physical');
    ds.calculateDamage('a', 'b', 20, 'fire');
    expect(ds.getDamageLog().length).toBe(2);
  });

  it('getTotalDamageDealt sums by source', () => {
    const ds = new DamageSystem();
    ds.setConfig({ critChance: 0 });
    ds.calculateDamage('alice', 'bob', 30, 'physical');
    ds.calculateDamage('alice', 'bob', 20, 'fire');
    ds.calculateDamage('eve', 'bob', 100, 'physical');
    expect(ds.getTotalDamageDealt('alice')).toBe(50);
  });

  it('clearLog empties damage log', () => {
    const ds = new DamageSystem();
    ds.setConfig({ critChance: 0 });
    ds.calculateDamage('a', 'b', 10, 'physical');
    ds.clearLog();
    expect(ds.getDamageLog().length).toBe(0);
  });
});
