import { describe, it, expect } from 'vitest';
import { CharacterStats } from '../CharacterStats';

describe('CharacterStats', () => {
  it('initializes with defaults and full resources', () => {
    const stats = new CharacterStats();
    expect(stats.level).toBe(1);
    expect(stats.health).toBe(100);
    expect(stats.maxHealth).toBe(100);
    expect(stats.mana).toBe(50);
    expect(stats.stamina).toBe(100);
    expect(stats.isAlive).toBe(true);
  });

  it('level scaling increases stats', () => {
    const s1 = new CharacterStats({ level: 1, baseStrength: 10, levelScaling: 0.1 });
    const s5 = new CharacterStats({ level: 5, baseStrength: 10, levelScaling: 0.1 });
    // Level 5: 10 * (1 + 4*0.1) = 14
    expect(s5.strength).toBe(14);
    expect(s5.strength).toBeGreaterThan(s1.strength);
  });

  it('takeDamage reduces health and applies defense mitigation', () => {
    const stats = new CharacterStats({ baseHealth: 100, baseDefense: 5 });
    const dealt = stats.takeDamage(20);
    // Mitigated: max(1, 20-5) = 15
    expect(dealt).toBe(15);
    expect(stats.health).toBe(85);
  });

  it('takeDamage always deals at least 1 damage', () => {
    const stats = new CharacterStats({ baseHealth: 100, baseDefense: 100 });
    const dealt = stats.takeDamage(5);
    expect(dealt).toBe(1);
    expect(stats.health).toBe(99);
  });

  it('character dies when health reaches zero', () => {
    const stats = new CharacterStats({ baseHealth: 10, baseDefense: 0 });
    stats.takeDamage(20);
    expect(stats.isAlive).toBe(false);
    expect(stats.health).toBe(0);
  });

  it('heal restores health up to max', () => {
    const stats = new CharacterStats({ baseHealth: 100, baseDefense: 0 });
    stats.takeDamage(50);
    const healed = stats.heal(30);
    expect(healed).toBe(30);
    expect(stats.health).toBe(80);
    // Over-heal capped
    const healed2 = stats.heal(9999);
    expect(stats.health).toBe(100);
    expect(healed2).toBe(20);
  });

  it('heal does nothing on dead character', () => {
    const stats = new CharacterStats({ baseHealth: 10, baseDefense: 0 });
    stats.takeDamage(999);
    expect(stats.isAlive).toBe(false);
    const healed = stats.heal(50);
    expect(healed).toBe(0);
  });

  it('spendMana and restoreMana work correctly', () => {
    const stats = new CharacterStats({ baseMana: 50 });
    expect(stats.spendMana(30)).toBe(true);
    expect(stats.mana).toBe(20);
    expect(stats.spendMana(30)).toBe(false); // not enough
    const restored = stats.restoreMana(10);
    expect(restored).toBe(10);
    expect(stats.mana).toBe(30);
  });

  it('spendStamina and restoreStamina work correctly', () => {
    const stats = new CharacterStats({ baseStamina: 100 });
    expect(stats.spendStamina(60)).toBe(true);
    expect(stats.stamina).toBe(40);
    expect(stats.spendStamina(60)).toBe(false);
    stats.restoreStamina(60);
    expect(stats.stamina).toBe(100);
  });

  it('addExperience triggers level-up and restores resources', () => {
    const stats = new CharacterStats({ baseHealth: 100, baseDefense: 0 });
    stats.takeDamage(50);
    expect(stats.health).toBe(50);
    // exp to level 1 -> 2: round(100 * 1^1.5) = 100
    const levels = stats.addExperience(100);
    expect(levels).toBe(1);
    expect(stats.level).toBe(2);
    // Health restored to new max on level-up
    expect(stats.health).toBe(stats.maxHealth);
  });

  it('multi-level-up from large xp gain', () => {
    const stats = new CharacterStats();
    // Give a huge amount of xp
    const levels = stats.addExperience(10000);
    expect(levels).toBeGreaterThan(1);
    expect(stats.level).toBeGreaterThan(2);
  });

  it('revive restores life with given fraction', () => {
    const stats = new CharacterStats({ baseHealth: 100, baseDefense: 0 });
    stats.takeDamage(999);
    expect(stats.isAlive).toBe(false);
    stats.revive(0.5);
    expect(stats.isAlive).toBe(true);
    expect(stats.health).toBe(50);
  });

  it('buff modifier increases stat', () => {
    const stats = new CharacterStats({ baseStrength: 10 });
    expect(stats.strength).toBe(10);
    stats.addModifier({ id: 'str-buff', stat: 'strength', flat: 5 });
    expect(stats.strength).toBe(15);
    stats.removeModifier('str-buff');
    expect(stats.strength).toBe(10);
  });

  it('multiplier modifier scales stat', () => {
    const stats = new CharacterStats({ baseDefense: 10 });
    stats.addModifier({ id: 'def-mult', stat: 'defense', multiplier: 2.0 });
    expect(stats.defense).toBe(20);
  });

  it('timed modifier expires after update', () => {
    const stats = new CharacterStats({ baseSpeed: 5 });
    stats.addModifier({ id: 'haste', stat: 'speed', flat: 10, duration: 1.0 });
    expect(stats.speed).toBe(15);
    stats.update(1.5);
    expect(stats.speed).toBe(5);
    expect(stats.getModifiers()).toHaveLength(0);
  });

  it('stats getter returns full stat block', () => {
    const stats = new CharacterStats();
    const block = stats.stats;
    expect(block).toHaveProperty('health');
    expect(block).toHaveProperty('maxHealth');
    expect(block).toHaveProperty('mana');
    expect(block).toHaveProperty('maxMana');
    expect(block).toHaveProperty('stamina');
    expect(block).toHaveProperty('maxStamina');
    expect(block).toHaveProperty('strength');
    expect(block).toHaveProperty('defense');
    expect(block).toHaveProperty('speed');
  });
});
