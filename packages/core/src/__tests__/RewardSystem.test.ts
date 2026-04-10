import { describe, it, expect, beforeEach } from 'vitest';
import { RewardSystem } from '../gameplay/RewardSystem';

// =============================================================================
// C266 — Reward System
// =============================================================================

describe('RewardSystem', () => {
  let sys: RewardSystem;
  beforeEach(() => {
    sys = new RewardSystem();
  });

  it('default stats: level 1, xp 0, gold 0', () => {
    const s = sys.getStats();
    expect(s.level).toBe(1);
    expect(s.xp).toBe(0);
    expect(s.currency.get('gold')).toBe(0);
  });

  it('createBundle stores bundle', () => {
    const b = sys.createBundle('Starter', [{ type: 'xp', target: '', amount: 50 }]);
    expect(sys.getBundle(b.id)).toBeDefined();
    expect(sys.getBundleCount()).toBe(1);
  });

  it('claim grants XP', () => {
    const b = sys.createBundle('XP Pack', [{ type: 'xp', target: '', amount: 50 }]);
    sys.claim(b.id);
    expect(sys.getXP()).toBe(50);
  });

  it('claim grants currency', () => {
    const b = sys.createBundle('Gold Pack', [{ type: 'currency', target: 'gold', amount: 100 }]);
    sys.claim(b.id);
    expect(sys.getCurrency('gold')).toBe(100);
  });

  it('claim grants unlock', () => {
    const b = sys.createBundle('Unlock Pack', [
      { type: 'unlock', target: 'double_jump', amount: 1 },
    ]);
    sys.claim(b.id);
    expect(sys.hasUnlock('double_jump')).toBe(true);
  });

  it('claim grants skill points', () => {
    const b = sys.createBundle('SP Pack', [{ type: 'skill_point', target: '', amount: 3 }]);
    sys.claim(b.id);
    expect(sys.getSkillPoints()).toBe(3);
  });

  it('double claim returns null', () => {
    const b = sys.createBundle('Once', [{ type: 'xp', target: '', amount: 10 }]);
    sys.claim(b.id);
    expect(sys.claim(b.id)).toBeNull();
  });

  it('addXP triggers level up', () => {
    const result = sys.addXP(250); // xpPerLevel=100, needs 200 for level 2, then level 3
    expect(result.leveled).toBe(true);
    expect(sys.getLevel()).toBeGreaterThan(1);
  });

  it('XP multiplier scales rewards', () => {
    sys.setXPMultiplier(2);
    sys.addXP(50);
    expect(sys.getXP()).toBe(100);
  });

  it('spendCurrency deducts correctly', () => {
    sys.createBundle('Gold', [{ type: 'currency', target: 'gold', amount: 100 }]);
    sys.claim(sys.getStats().currency.size > 0 ? [...sys.getStats().currency.keys()][0] : '');
    // Direct approach:
    const b = sys.createBundle('G2', [{ type: 'currency', target: 'gold', amount: 200 }]);
    sys.claim(b.id);
    expect(sys.spendCurrency('gold', 50)).toBe(true);
    expect(sys.getCurrency('gold')).toBe(150);
  });

  it('spendCurrency fails if insufficient', () => {
    expect(sys.spendCurrency('gold', 100)).toBe(false);
  });

  it('getClaimedCount tracks claimed bundles', () => {
    const b1 = sys.createBundle('A', [{ type: 'xp', target: '', amount: 10 }]);
    sys.createBundle('B', [{ type: 'xp', target: '', amount: 10 }]);
    sys.claim(b1.id);
    expect(sys.getClaimedCount()).toBe(1);
  });

  it('mixed bundle grants all reward types', () => {
    const b = sys.createBundle('Mixed', [
      { type: 'xp', target: '', amount: 30 },
      { type: 'currency', target: 'gems', amount: 5 },
      { type: 'unlock', target: 'shield', amount: 1 },
    ]);
    const granted = sys.claim(b.id);
    expect(granted).toHaveLength(3);
    expect(sys.getXP()).toBe(30);
    expect(sys.getCurrency('gems')).toBe(5);
    expect(sys.hasUnlock('shield')).toBe(true);
  });
});
