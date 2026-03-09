import { describe, it, expect, beforeEach } from 'vitest';
import { RewardSystem } from '../RewardSystem';

describe('RewardSystem', () => {
  let rs: RewardSystem;
  beforeEach(() => {
    rs = new RewardSystem();
  });

  // --- Bundles ---
  it('createBundle stores bundle', () => {
    const b = rs.createBundle('Starter Pack', [{ type: 'xp', target: '', amount: 100 }]);
    expect(b.id).toBeDefined();
    expect(b.claimed).toBe(false);
    expect(rs.getBundleCount()).toBe(1);
  });

  it('getBundle retrieves by id', () => {
    const b = rs.createBundle('Pack', [{ type: 'currency', target: 'gold', amount: 50 }]);
    expect(rs.getBundle(b.id)).toBeDefined();
  });

  // --- Claiming ---
  it('claim applies XP reward', () => {
    const b = rs.createBundle('XP Pack', [{ type: 'xp', target: '', amount: 50 }]);
    const granted = rs.claim(b.id);
    expect(granted).toHaveLength(1);
    expect(rs.getXP()).toBe(50);
    expect(rs.getBundle(b.id)!.claimed).toBe(true);
  });

  it('claim applies currency reward', () => {
    const b = rs.createBundle('Gold', [{ type: 'currency', target: 'gold', amount: 200 }]);
    rs.claim(b.id);
    expect(rs.getCurrency('gold')).toBe(200);
  });

  it('claim applies unlock reward', () => {
    const b = rs.createBundle('Unlock', [{ type: 'unlock', target: 'dark_mode', amount: 1 }]);
    rs.claim(b.id);
    expect(rs.hasUnlock('dark_mode')).toBe(true);
  });

  it('claim applies skill_point reward', () => {
    const b = rs.createBundle('SP', [{ type: 'skill_point', target: '', amount: 3 }]);
    rs.claim(b.id);
    expect(rs.getSkillPoints()).toBe(3);
  });

  it('double claim returns null', () => {
    const b = rs.createBundle('Pack', [{ type: 'xp', target: '', amount: 10 }]);
    rs.claim(b.id);
    expect(rs.claim(b.id)).toBeNull();
  });

  it('claim missing bundle returns null', () => {
    expect(rs.claim('nope')).toBeNull();
  });

  // --- XP & Leveling ---
  it('addXP accumulates', () => {
    rs.addXP(50);
    rs.addXP(30);
    expect(rs.getXP()).toBe(80);
  });

  it('addXP triggers level up', () => {
    // Level 2 requires 200 XP (level * 100)
    const { leveled, newLevel } = rs.addXP(250);
    expect(leveled).toBe(true);
    expect(newLevel).toBeGreaterThan(1);
  });

  it('XP multiplier scales XP', () => {
    rs.setXPMultiplier(2);
    rs.addXP(50);
    expect(rs.getXP()).toBe(100);
  });

  // --- Currency ---
  it('spendCurrency deducts', () => {
    rs.createBundle('Gold', [{ type: 'currency', target: 'gold', amount: 100 }]);
    rs.claim(
      rs.getBundle(rs.createBundle('G', [{ type: 'currency', target: 'gold', amount: 100 }]).id)!.id
    );
    // getCurrency should show gold from the second bundle
    const total = rs.getCurrency('gold');
    expect(rs.spendCurrency('gold', 50)).toBe(true);
    expect(rs.getCurrency('gold')).toBe(total - 50);
  });

  it('spendCurrency fails if insufficient', () => {
    expect(rs.spendCurrency('gold', 1)).toBe(false);
  });

  it('getCurrency returns 0 for unknown', () => {
    expect(rs.getCurrency('diamonds')).toBe(0);
  });

  // --- Queries ---
  it('getStats returns copy', () => {
    const s = rs.getStats();
    expect(s.level).toBe(1);
    expect(s.xp).toBe(0);
  });

  it('getClaimedCount tracks claims', () => {
    const b1 = rs.createBundle('A', [{ type: 'xp', target: '', amount: 1 }]);
    const b2 = rs.createBundle('B', [{ type: 'xp', target: '', amount: 1 }]);
    rs.claim(b1.id);
    expect(rs.getClaimedCount()).toBe(1);
    rs.claim(b2.id);
    expect(rs.getClaimedCount()).toBe(2);
  });

  it('multiple reward types in one bundle', () => {
    const b = rs.createBundle('Mega Pack', [
      { type: 'xp', target: '', amount: 50 },
      { type: 'currency', target: 'gold', amount: 100 },
      { type: 'unlock', target: 'vip', amount: 1 },
      { type: 'skill_point', target: '', amount: 2 },
    ]);
    const granted = rs.claim(b.id);
    expect(granted).toHaveLength(4);
    expect(rs.getXP()).toBe(50);
    expect(rs.getCurrency('gold')).toBe(100);
    expect(rs.hasUnlock('vip')).toBe(true);
    expect(rs.getSkillPoints()).toBe(2);
  });
});
