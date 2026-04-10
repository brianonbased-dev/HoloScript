import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AchievementSystem } from '../gameplay/AchievementSystem';

// =============================================================================
// C282 — Achievement System
// =============================================================================

describe('AchievementSystem', () => {
  let sys: AchievementSystem;
  beforeEach(() => {
    sys = new AchievementSystem();
  });

  it('register creates locked achievement with 0 progress', () => {
    const a = sys.register({
      id: 'a1',
      name: 'First Kill',
      description: '',
      icon: '🗡️',
      rarity: 'bronze',
      maxProgress: 1,
      hidden: false,
      category: 'combat',
    });
    expect(a.unlocked).toBe(false);
    expect(a.currentProgress).toBe(0);
  });

  it('addProgress increments and unlocks at max', () => {
    sys.register({
      id: 'a1',
      name: 'A',
      description: '',
      icon: '',
      rarity: 'silver',
      maxProgress: 3,
      hidden: false,
      category: 'test',
    });
    sys.addProgress('a1', 2);
    expect(sys.get('a1')!.currentProgress).toBe(2);
    sys.addProgress('a1', 1);
    expect(sys.get('a1')!.unlocked).toBe(true);
  });

  it('addProgress clamps to maxProgress', () => {
    sys.register({
      id: 'a1',
      name: 'A',
      description: '',
      icon: '',
      rarity: 'bronze',
      maxProgress: 5,
      hidden: false,
      category: 'test',
    });
    sys.addProgress('a1', 100);
    expect(sys.get('a1')!.currentProgress).toBe(5);
  });

  it('addProgress returns false if already unlocked', () => {
    sys.register({
      id: 'a1',
      name: 'A',
      description: '',
      icon: '',
      rarity: 'bronze',
      maxProgress: 1,
      hidden: false,
      category: 'test',
    });
    sys.addProgress('a1', 1);
    expect(sys.addProgress('a1', 1)).toBe(false);
  });

  it('unlock immediately unlocks achievement', () => {
    sys.register({
      id: 'a1',
      name: 'A',
      description: '',
      icon: '',
      rarity: 'gold',
      maxProgress: 100,
      hidden: false,
      category: 'test',
    });
    expect(sys.unlock('a1')).toBe(true);
    expect(sys.get('a1')!.unlocked).toBe(true);
    expect(sys.get('a1')!.currentProgress).toBe(100);
  });

  it('onUnlock listener fires', () => {
    const cb = vi.fn();
    sys.onUnlock(cb);
    sys.register({
      id: 'a1',
      name: 'A',
      description: '',
      icon: '',
      rarity: 'bronze',
      maxProgress: 1,
      hidden: false,
      category: 'test',
    });
    sys.addProgress('a1', 1);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].id).toBe('a1');
  });

  it('totalPoints accumulates rarity-based points', () => {
    sys.register({
      id: 'a1',
      name: 'A',
      description: '',
      icon: '',
      rarity: 'bronze',
      maxProgress: 1,
      hidden: false,
      category: 'test',
    });
    sys.register({
      id: 'a2',
      name: 'B',
      description: '',
      icon: '',
      rarity: 'gold',
      maxProgress: 1,
      hidden: false,
      category: 'test',
    });
    sys.unlock('a1'); // bronze = 5
    sys.unlock('a2'); // gold = 25
    expect(sys.getTotalPoints()).toBe(30);
  });

  it('getCompletionPercent returns ratio', () => {
    sys.register({
      id: 'a1',
      name: 'A',
      description: '',
      icon: '',
      rarity: 'bronze',
      maxProgress: 1,
      hidden: false,
      category: 'test',
    });
    sys.register({
      id: 'a2',
      name: 'B',
      description: '',
      icon: '',
      rarity: 'bronze',
      maxProgress: 1,
      hidden: false,
      category: 'test',
    });
    sys.unlock('a1');
    expect(sys.getCompletionPercent()).toBeCloseTo(50);
  });

  it('getByCategory filters correctly', () => {
    sys.register({
      id: 'a1',
      name: 'A',
      description: '',
      icon: '',
      rarity: 'bronze',
      maxProgress: 1,
      hidden: false,
      category: 'combat',
    });
    sys.register({
      id: 'a2',
      name: 'B',
      description: '',
      icon: '',
      rarity: 'bronze',
      maxProgress: 1,
      hidden: false,
      category: 'explore',
    });
    expect(sys.getByCategory('combat')).toHaveLength(1);
  });

  it('getByRarity filters correctly', () => {
    sys.register({
      id: 'a1',
      name: 'A',
      description: '',
      icon: '',
      rarity: 'diamond',
      maxProgress: 1,
      hidden: false,
      category: 'test',
    });
    sys.register({
      id: 'a2',
      name: 'B',
      description: '',
      icon: '',
      rarity: 'bronze',
      maxProgress: 1,
      hidden: false,
      category: 'test',
    });
    expect(sys.getByRarity('diamond')).toHaveLength(1);
  });

  it('getProgress returns fractional progress', () => {
    sys.register({
      id: 'a1',
      name: 'A',
      description: '',
      icon: '',
      rarity: 'bronze',
      maxProgress: 10,
      hidden: false,
      category: 'test',
    });
    sys.addProgress('a1', 5);
    expect(sys.getProgress('a1')).toBeCloseTo(0.5);
  });
});
