import { describe, it, expect } from 'vitest';
import { AchievementSystem } from '@holoscript/engine/gameplay';
import { ProgressionTree } from '@holoscript/engine/gameplay';
import { LeaderboardManager } from '@holoscript/engine/gameplay';

describe('Cycle 135: Achievement & Progression', () => {
  // -------------------------------------------------------------------------
  // AchievementSystem
  // -------------------------------------------------------------------------

  it('should track achievement progress and unlock', () => {
    const ach = new AchievementSystem();
    ach.register({
      id: 'first_kill',
      name: 'First Kill',
      description: 'Defeat an enemy',
      icon: '⚔️',
      rarity: 'bronze',
      maxProgress: 1,
      hidden: false,
      category: 'combat',
    });
    ach.register({
      id: 'collector',
      name: 'Collector',
      description: 'Collect 100 items',
      icon: '📦',
      rarity: 'gold',
      maxProgress: 100,
      hidden: false,
      category: 'exploration',
    });

    expect(ach.getCount()).toBe(2);
    expect(ach.getUnlockedCount()).toBe(0);

    ach.addProgress('first_kill', 1);
    expect(ach.get('first_kill')!.unlocked).toBe(true);
    expect(ach.getTotalPoints()).toBe(5); // bronze = 5

    ach.addProgress('collector', 50);
    expect(ach.getProgress('collector')).toBe(0.5);
    expect(ach.get('collector')!.unlocked).toBe(false);
  });

  it('should fire unlock events and report completion', () => {
    const ach = new AchievementSystem();
    ach.register({
      id: 'a1',
      name: 'A1',
      description: '',
      icon: '',
      rarity: 'silver',
      maxProgress: 1,
      hidden: false,
      category: 'test',
    });
    ach.register({
      id: 'a2',
      name: 'A2',
      description: '',
      icon: '',
      rarity: 'gold',
      maxProgress: 1,
      hidden: false,
      category: 'test',
    });

    const unlocked: string[] = [];
    ach.onUnlock((a) => unlocked.push(a.id));

    ach.unlock('a1');
    ach.unlock('a2');
    expect(unlocked).toEqual(['a1', 'a2']);
    expect(ach.getCompletionPercent()).toBe(100);
  });

  // -------------------------------------------------------------------------
  // ProgressionTree
  // -------------------------------------------------------------------------

  it('should allocate skill points with prerequisites', () => {
    const tree = new ProgressionTree();
    tree.addNode({
      id: 'str',
      name: 'Strength',
      description: '+ATK',
      tier: 1,
      maxLevel: 5,
      cost: 1,
      prerequisites: [],
      icon: '💪',
      category: 'combat',
      effects: { attack: 2 },
    });
    tree.addNode({
      id: 'crit',
      name: 'Critical',
      description: '+Crit',
      tier: 2,
      maxLevel: 3,
      cost: 2,
      prerequisites: ['str'],
      icon: '🎯',
      category: 'combat',
      effects: { critChance: 5 },
    });

    tree.addPoints(10);
    expect(tree.getNode('crit')!.unlocked).toBe(false); // prereq not met

    tree.invest('str', 1);
    expect(tree.getNode('crit')!.unlocked).toBe(true); // Now unlocked
    expect(tree.getAvailablePoints()).toBe(9);

    tree.invest('crit', 2);
    expect(tree.getEffectTotal('critChance')).toBe(10); // 5 * 2
  });

  it('should respec and refund points', () => {
    const tree = new ProgressionTree();
    tree.addNode({
      id: 'hp',
      name: 'Health',
      description: '+HP',
      tier: 1,
      maxLevel: 10,
      cost: 1,
      prerequisites: [],
      icon: '❤️',
      category: 'survival',
      effects: { health: 10 },
    });
    tree.addPoints(5);
    tree.invest('hp', 3);
    expect(tree.getAvailablePoints()).toBe(2);

    tree.respec();
    expect(tree.getAvailablePoints()).toBe(5);
    expect(tree.getNode('hp')!.currentLevel).toBe(0);
    expect(tree.getRespecCount()).toBe(1);
  });

  // -------------------------------------------------------------------------
  // LeaderboardManager
  // -------------------------------------------------------------------------

  it('should submit scores and rank players', () => {
    const lb = new LeaderboardManager();
    lb.createBoard('highscore', 'High Scores', false, 10);

    lb.submitScore('highscore', 'p1', 'Alice', 1000);
    lb.submitScore('highscore', 'p2', 'Bob', 1500);
    lb.submitScore('highscore', 'p3', 'Charlie', 800);

    expect(lb.getPlayerRank('highscore', 'p2')).toBe(1); // Highest
    expect(lb.getPlayerRank('highscore', 'p1')).toBe(2);

    const top = lb.getTopN('highscore', 2);
    expect(top).toHaveLength(2);
    expect(top[0].playerName).toBe('Bob');
  });

  it('should track personal bests', () => {
    const lb = new LeaderboardManager();
    lb.createBoard('speedrun', 'Speedrun', true); // ascending = lower better

    const r1 = lb.submitScore('speedrun', 'p1', 'Alice', 120);
    expect(r1!.isPersonalBest).toBe(true);

    const r2 = lb.submitScore('speedrun', 'p1', 'Alice', 100); // Better
    expect(r2!.isPersonalBest).toBe(true);
    expect(lb.getPersonalBest('p1', 'speedrun')).toBe(100);

    const r3 = lb.submitScore('speedrun', 'p1', 'Alice', 150); // Worse
    expect(r3!.isPersonalBest).toBe(false);
  });

  it('should paginate and get around-player results', () => {
    const lb = new LeaderboardManager();
    lb.createBoard('score', 'Scores');

    for (let i = 0; i < 20; i++) {
      lb.submitScore('score', `p${i}`, `Player ${i}`, (i + 1) * 100);
    }

    const page = lb.getPage('score', 0, 5);
    expect(page).toHaveLength(5);
    expect(page[0].score).toBe(2000); // Highest first

    const around = lb.getAroundPlayer('score', 'p10', 2);
    expect(around.length).toBeGreaterThanOrEqual(3);
  });
});
