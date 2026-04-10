import { describe, it, expect, beforeEach } from 'vitest';
import { AchievementSystem } from '../AchievementSystem';

const ach = (id: string, rarity: 'bronze' | 'gold' = 'bronze', max = 10) => ({
  id,
  name: id,
  description: 'Test',
  icon: '🏆',
  rarity,
  maxProgress: max,
  hidden: false,
  category: 'general',
});

describe('AchievementSystem', () => {
  let sys: AchievementSystem;

  beforeEach(() => {
    sys = new AchievementSystem();
  });

  it('register adds achievement', () => {
    sys.register(ach('a'));
    expect(sys.getCount()).toBe(1);
    expect(sys.get('a')?.unlocked).toBe(false);
  });

  it('addProgress increments', () => {
    sys.register(ach('a', 'bronze', 5));
    sys.addProgress('a', 3);
    expect(sys.get('a')?.currentProgress).toBe(3);
    expect(sys.get('a')?.unlocked).toBe(false);
  });

  it('addProgress auto-unlocks at max', () => {
    sys.register(ach('a', 'bronze', 3));
    const unlocked = sys.addProgress('a', 3);
    expect(unlocked).toBe(true);
    expect(sys.get('a')?.unlocked).toBe(true);
    expect(sys.get('a')?.unlockedAt).not.toBeNull();
  });

  it('addProgress does not exceed max', () => {
    sys.register(ach('a', 'bronze', 3));
    sys.addProgress('a', 10);
    expect(sys.get('a')?.currentProgress).toBe(3);
  });

  it('addProgress returns false for already unlocked', () => {
    sys.register(ach('a', 'bronze', 1));
    sys.addProgress('a', 1);
    expect(sys.addProgress('a', 1)).toBe(false);
  });

  it('unlock directly unlocks', () => {
    sys.register(ach('a'));
    expect(sys.unlock('a')).toBe(true);
    expect(sys.get('a')?.unlocked).toBe(true);
  });

  it('unlock returns false for already unlocked', () => {
    sys.register(ach('a'));
    sys.unlock('a');
    expect(sys.unlock('a')).toBe(false);
  });

  it('onUnlock listener fires', () => {
    const fired: string[] = [];
    sys.onUnlock((a) => fired.push(a.id));
    sys.register(ach('a', 'bronze', 1));
    sys.addProgress('a', 1);
    expect(fired).toEqual(['a']);
  });

  it('totalPoints accumulates per rarity', () => {
    sys.register(ach('a', 'bronze', 1));
    sys.register(ach('b', 'gold', 1));
    sys.unlock('a');
    sys.unlock('b');
    expect(sys.getTotalPoints()).toBe(5 + 25); // bronze 5 + gold 25
  });

  it('getUnlocked / getLocked filter', () => {
    sys.register(ach('a'));
    sys.register(ach('b'));
    sys.unlock('a');
    expect(sys.getUnlocked().length).toBe(1);
    expect(sys.getLocked().length).toBe(1);
  });

  it('getByCategory filters', () => {
    sys.register({ ...ach('a'), category: 'combat' });
    sys.register(ach('b'));
    expect(sys.getByCategory('combat').length).toBe(1);
  });

  it('getByRarity filters', () => {
    sys.register(ach('a', 'bronze'));
    sys.register(ach('b', 'gold'));
    expect(sys.getByRarity('gold').length).toBe(1);
  });

  it('getProgress returns fraction', () => {
    sys.register(ach('a', 'bronze', 10));
    sys.addProgress('a', 5);
    expect(sys.getProgress('a')).toBe(0.5);
  });

  it('getProgress returns 0 for unknown', () => {
    expect(sys.getProgress('nope')).toBe(0);
  });

  it('getCompletionPercent', () => {
    sys.register(ach('a', 'bronze', 1));
    sys.register(ach('b', 'bronze', 1));
    sys.unlock('a');
    expect(sys.getCompletionPercent()).toBe(50);
  });

  it('getCompletionPercent 0 when empty', () => {
    expect(sys.getCompletionPercent()).toBe(0);
  });
});
