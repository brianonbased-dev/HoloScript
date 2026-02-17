import { describe, it, expect, beforeEach } from 'vitest';
import { DamageSystem } from '../DamageSystem';
import type { DamageInstance } from '../DamageSystem';

describe('DamageSystem', () => {
  let dmg: DamageSystem;

  beforeEach(() => { dmg = new DamageSystem(); });

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  it('default config has critChance and multiplier', () => {
    const cfg = dmg.getConfig();
    expect(cfg.critChance).toBeDefined();
    expect(cfg.critMultiplier).toBeDefined();
  });

  it('setConfig updates values', () => {
    dmg.setConfig({ globalMultiplier: 2.0 });
    expect(dmg.getConfig().globalMultiplier).toBe(2.0);
  });

  // ---------------------------------------------------------------------------
  // Basic Damage Calculation
  // ---------------------------------------------------------------------------

  it('calculateDamage returns DamageInstance', () => {
    dmg.setConfig({ critChance: 0 }); // no random crits
    const result = dmg.calculateDamage('attacker', 'target', 100, 'physical');
    expect(result.sourceId).toBe('attacker');
    expect(result.targetId).toBe('target');
    expect(result.baseDamage).toBe(100);
    expect(result.type).toBe('physical');
    expect(result.finalDamage).toBe(100);
  });

  it('damage is non-negative', () => {
    dmg.setConfig({ critChance: 0, globalMultiplier: 0 });
    const result = dmg.calculateDamage('a', 'b', 100, 'fire');
    expect(result.finalDamage).toBeGreaterThanOrEqual(0);
  });

  // ---------------------------------------------------------------------------
  // Damage Types
  // ---------------------------------------------------------------------------

  it('physical damage type recorded', () => {
    dmg.setConfig({ critChance: 0 });
    expect(dmg.calculateDamage('a', 'b', 50, 'physical').type).toBe('physical');
  });

  it('fire damage type recorded', () => {
    dmg.setConfig({ critChance: 0 });
    expect(dmg.calculateDamage('a', 'b', 50, 'fire').type).toBe('fire');
  });

  it('true damage ignores resistance', () => {
    dmg.setConfig({ critChance: 0 });
    dmg.setResistances('target', { physical: 1.0 });
    const result = dmg.calculateDamage('a', 'target', 100, 'true');
    expect(result.finalDamage).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // Resistances
  // ---------------------------------------------------------------------------

  it('setResistances / getResistances round-trip', () => {
    dmg.setResistances('tank', { physical: 0.5, fire: 0.3 });
    const res = dmg.getResistances('tank');
    expect(res.physical).toBe(0.5);
    expect(res.fire).toBe(0.3);
  });

  it('resistance reduces damage', () => {
    dmg.setConfig({ critChance: 0 });
    dmg.setResistances('tank', { physical: 0.5 });
    const result = dmg.calculateDamage('a', 'tank', 100, 'physical');
    expect(result.finalDamage).toBe(50);
  });

  it('full resistance blocks all damage', () => {
    dmg.setConfig({ critChance: 0 });
    dmg.setResistances('immune', { fire: 1.0 });
    const result = dmg.calculateDamage('a', 'immune', 100, 'fire');
    expect(result.finalDamage).toBe(0);
  });

  it('no resistance means full damage', () => {
    dmg.setConfig({ critChance: 0 });
    const result = dmg.calculateDamage('a', 'glass', 100, 'ice');
    expect(result.finalDamage).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // Critical Hits
  // ---------------------------------------------------------------------------

  it('forced crit multiplies damage', () => {
    dmg.setConfig({ critChance: 0, critMultiplier: 2.0 });
    const result = dmg.calculateDamage('a', 'b', 50, 'physical', true);
    expect(result.isCritical).toBe(true);
    expect(result.finalDamage).toBe(100);
  });

  it('non-crit does not multiply', () => {
    dmg.setConfig({ critChance: 0 });
    const result = dmg.calculateDamage('a', 'b', 50, 'physical');
    expect(result.isCritical).toBe(false);
    expect(result.finalDamage).toBe(50);
  });

  // ---------------------------------------------------------------------------
  // Global Multiplier
  // ---------------------------------------------------------------------------

  it('globalMultiplier scales damage', () => {
    dmg.setConfig({ critChance: 0, globalMultiplier: 1.5 });
    const result = dmg.calculateDamage('a', 'b', 100, 'physical');
    expect(result.finalDamage).toBe(150);
  });

  // ---------------------------------------------------------------------------
  // Damage Over Time
  // ---------------------------------------------------------------------------

  it('applyDoT creates DoT effect', () => {
    const dot = dmg.applyDoT('a', 'b', 'fire', 10, 1, 5);
    expect(dot.damagePerTick).toBe(10);
    expect(dot.duration).toBe(5);
  });

  it('updateDoTs ticks DoT and produces damage', () => {
    dmg.setConfig({ critChance: 0 });
    dmg.applyDoT('a', 'b', 'fire', 10, 0.5, 2);
    const ticked = dmg.updateDoTs(0.5);
    expect(ticked.length).toBeGreaterThan(0);
  });

  it('getActiveDoTs returns active effects', () => {
    dmg.applyDoT('a', 'b', 'poison', 5, 1, 10);
    const dots = dmg.getActiveDoTs('b');
    expect(dots.length).toBe(1);
    expect(dots[0].type).toBe('poison');
  });

  it('DoT expires after duration', () => {
    dmg.setConfig({ critChance: 0 });
    dmg.applyDoT('a', 'b', 'fire', 10, 0.5, 1);
    dmg.updateDoTs(2); // exceed duration
    expect(dmg.getActiveDoTs('b')).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Damage Log & Events
  // ---------------------------------------------------------------------------

  it('getDamageLog records damage events', () => {
    dmg.setConfig({ critChance: 0 });
    dmg.calculateDamage('a', 'b', 25, 'physical');
    const log = dmg.getDamageLog();
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].baseDamage).toBe(25);
  });

  it('onDamage fires callback', () => {
    let captured: DamageInstance | null = null;
    dmg.onDamage((d) => { captured = d; });
    dmg.setConfig({ critChance: 0 });
    dmg.calculateDamage('a', 'b', 30, 'lightning');
    expect(captured).not.toBeNull();
    expect(captured!.type).toBe('lightning');
  });

  it('getTotalDamageDealt sums for source', () => {
    dmg.setConfig({ critChance: 0 });
    dmg.calculateDamage('a', 'b', 50, 'physical');
    dmg.calculateDamage('a', 'c', 30, 'fire');
    expect(dmg.getTotalDamageDealt('a')).toBe(80);
  });

  it('clearLog empties the log', () => {
    dmg.setConfig({ critChance: 0 });
    dmg.calculateDamage('a', 'b', 10, 'physical');
    dmg.clearLog();
    expect(dmg.getDamageLog()).toHaveLength(0);
  });
});
