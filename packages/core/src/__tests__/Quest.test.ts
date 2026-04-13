import { describe, it, expect } from 'vitest';
import { QuestManager } from '@holoscript/engine/gameplay';
import { RewardSystem } from '@holoscript/engine/gameplay';
import { JournalTracker } from '@holoscript/engine/gameplay';

describe('Cycle 131: Quest & Objectives', () => {
  // -------------------------------------------------------------------------
  // QuestManager
  // -------------------------------------------------------------------------

  it('should manage quest lifecycle and objectives', () => {
    const mgr = new QuestManager();
    mgr.addQuest({
      id: 'q1',
      name: 'Slay the Dragon',
      description: 'Kill the dragon',
      category: 'main',
      objectives: [
        {
          id: 'o1',
          type: 'kill',
          description: 'Kill dragon',
          target: 'dragon',
          required: 1,
          current: 0,
          completed: false,
          optional: false,
        },
        {
          id: 'o2',
          type: 'collect',
          description: 'Collect scales',
          target: 'scale',
          required: 3,
          current: 0,
          completed: false,
          optional: true,
        },
      ],
      prerequisites: [],
      level: 5,
      timeLimit: 0,
      repeatable: false,
    });

    expect(mgr.getQuest('q1')!.status).toBe('available');
    mgr.activate('q1');
    expect(mgr.getQuest('q1')!.status).toBe('active');

    mgr.updateObjective('q1', 'o1', 1);
    expect(mgr.getQuest('q1')!.status).toBe('completed');
  });

  it('should enforce prerequisites', () => {
    const mgr = new QuestManager();
    mgr.addQuest({
      id: 'intro',
      name: 'Intro',
      description: '',
      category: 'main',
      objectives: [
        {
          id: 'o',
          type: 'custom',
          description: '',
          target: '',
          required: 1,
          current: 0,
          completed: false,
          optional: false,
        },
      ],
      prerequisites: [],
      level: 1,
      timeLimit: 0,
      repeatable: false,
    });
    mgr.addQuest({
      id: 'sequel',
      name: 'Sequel',
      description: '',
      category: 'main',
      objectives: [
        {
          id: 'o',
          type: 'custom',
          description: '',
          target: '',
          required: 1,
          current: 0,
          completed: false,
          optional: false,
        },
      ],
      prerequisites: ['intro'],
      level: 1,
      timeLimit: 0,
      repeatable: false,
    });

    expect(mgr.getQuest('sequel')!.status).toBe('locked');
    mgr.activate('intro');
    mgr.updateObjective('intro', 'o', 1);
    mgr.recheckAll();
    expect(mgr.getQuest('sequel')!.status).toBe('available');
  });

  it('should fail timed quests', () => {
    const mgr = new QuestManager();
    mgr.addQuest({
      id: 'timed',
      name: 'Rush',
      description: '',
      category: 'side',
      objectives: [
        {
          id: 'o',
          type: 'reach',
          description: '',
          target: '',
          required: 1,
          current: 0,
          completed: false,
          optional: false,
        },
      ],
      prerequisites: [],
      level: 1,
      timeLimit: 10,
      repeatable: false,
    });
    mgr.activate('timed');
    mgr.update(11);
    expect(mgr.getQuest('timed')!.status).toBe('failed');
  });

  // -------------------------------------------------------------------------
  // RewardSystem
  // -------------------------------------------------------------------------

  it('should grant XP and level up', () => {
    const rewards = new RewardSystem();
    const result = rewards.addXP(250);
    expect(result.leveled).toBe(true);
    expect(rewards.getLevel()).toBeGreaterThan(1);
    expect(rewards.getXP()).toBe(250);
  });

  it('should claim reward bundles', () => {
    const rewards = new RewardSystem();
    const bundle = rewards.createBundle('Quest Complete', [
      { type: 'xp', target: '', amount: 50 },
      { type: 'currency', target: 'gold', amount: 100 },
      { type: 'unlock', target: 'dark_forest', amount: 1 },
      { type: 'skill_point', target: '', amount: 2 },
    ]);

    const granted = rewards.claim(bundle.id);
    expect(granted).toHaveLength(4);
    expect(rewards.getCurrency('gold')).toBe(100);
    expect(rewards.hasUnlock('dark_forest')).toBe(true);
    expect(rewards.getSkillPoints()).toBe(2);

    // Can't claim twice
    expect(rewards.claim(bundle.id)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // JournalTracker
  // -------------------------------------------------------------------------

  it('should track journal entries with notifications', () => {
    const journal = new JournalTracker();
    journal.addEntry('q1', 'Slay Dragon', 'main', 'Kill the dragon');
    journal.addEntry('q2', 'Find Herbs', 'side', 'Collect herbs');

    expect(journal.getEntryCount()).toBe(2);
    expect(journal.getUnreadCount()).toBe(2);

    journal.updateEntry('q1', { status: 'completed', progress: 1 });
    expect(journal.getUnreadCount()).toBe(3); // add + add + completed
  });

  it('should pin quests and filter by category', () => {
    const journal = new JournalTracker();
    journal.addEntry('q1', 'Main Quest', 'main', 'Main story');
    journal.addEntry('q2', 'Side Quest', 'side', 'Optional');

    journal.pin('q1');
    expect(journal.getPinned()).toHaveLength(1);
    expect(journal.getByCategory('side')).toHaveLength(1);
  });

  it('should search entries', () => {
    const journal = new JournalTracker();
    journal.addEntry('q1', 'Dragon Slayer', 'main', 'Kill the mighty dragon');
    journal.addEntry('q2', 'Herb Collector', 'side', 'Gather rare herbs');

    expect(journal.search('dragon')).toHaveLength(1);
    expect(journal.search('rare')).toHaveLength(1);
  });
});
