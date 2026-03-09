import { describe, it, expect, beforeEach } from 'vitest';
import { QuestManager, QuestDef } from '../QuestManager';

function quest(
  id: string,
  overrides: Partial<Omit<QuestDef, 'status' | 'elapsed' | 'completionCount'>> = {}
) {
  return {
    id,
    name: id,
    description: 'Test quest',
    category: 'main',
    objectives: [],
    prerequisites: [],
    level: 1,
    timeLimit: 0,
    repeatable: false,
    ...overrides,
  };
}

function objective(id: string, required = 1) {
  return {
    id,
    type: 'collect' as const,
    description: 'desc',
    target: 't',
    required,
    current: 0,
    completed: false,
    optional: false,
  };
}

describe('QuestManager', () => {
  let qm: QuestManager;
  beforeEach(() => {
    qm = new QuestManager();
  });

  // --- CRUD ---
  it('addQuest stores quest', () => {
    const q = qm.addQuest(quest('q1'));
    expect(q).toBeDefined();
    expect(qm.getQuestCount()).toBe(1);
  });

  it('quest with no prerequisites starts available', () => {
    const q = qm.addQuest(quest('q1'));
    expect(q.status).toBe('available');
  });

  it('quest with unmet prerequisites stays locked', () => {
    const q = qm.addQuest(quest('q2', { prerequisites: ['q1'] }));
    expect(q.status).toBe('locked');
  });

  it('removeQuest deletes', () => {
    qm.addQuest(quest('q1'));
    expect(qm.removeQuest('q1')).toBe(true);
    expect(qm.getQuestCount()).toBe(0);
  });

  // --- Activation ---
  it('activate changes status', () => {
    qm.addQuest(quest('q1'));
    expect(qm.activate('q1')).toBe(true);
    expect(qm.getQuest('q1')!.status).toBe('active');
  });

  it('activate returns false for locked', () => {
    qm.addQuest(quest('q1', { prerequisites: ['q0'] }));
    expect(qm.activate('q1')).toBe(false);
  });

  it('abandon resets quest', () => {
    qm.addQuest(quest('q1', { objectives: [objective('o1', 5)] }));
    qm.activate('q1');
    qm.updateObjective('q1', 'o1', 3);
    expect(qm.abandon('q1')).toBe(true);
    expect(qm.getQuest('q1')!.status).toBe('available');
    expect(qm.getQuest('q1')!.objectives[0].current).toBe(0);
  });

  // --- Objectives ---
  it('updateObjective increments progress', () => {
    qm.addQuest(quest('q1', { objectives: [objective('o1', 5)] }));
    qm.activate('q1');
    qm.updateObjective('q1', 'o1', 3);
    expect(qm.getQuest('q1')!.objectives[0].current).toBe(3);
  });

  it('completing all required objectives completes quest', () => {
    qm.addQuest(quest('q1', { objectives: [objective('o1', 1)] }));
    qm.activate('q1');
    qm.updateObjective('q1', 'o1', 1);
    expect(qm.getQuest('q1')!.status).toBe('completed');
  });

  it('optional objectives do not block completion', () => {
    qm.addQuest(
      quest('q1', {
        objectives: [objective('o1', 1), { ...objective('o2', 5), optional: true }],
      })
    );
    qm.activate('q1');
    qm.updateObjective('q1', 'o1', 1);
    expect(qm.getQuest('q1')!.status).toBe('completed');
  });

  it('updateObjective returns false for inactive quest', () => {
    qm.addQuest(quest('q1', { objectives: [objective('o1', 5)] }));
    expect(qm.updateObjective('q1', 'o1', 1)).toBe(false);
  });

  // --- Time ---
  it('update expires timed quests', () => {
    qm.addQuest(quest('q1', { timeLimit: 10 }));
    qm.activate('q1');
    qm.update(11);
    expect(qm.getQuest('q1')!.status).toBe('failed');
  });

  it('update does not expire quests with no time limit', () => {
    qm.addQuest(quest('q1', { timeLimit: 0 }));
    qm.activate('q1');
    qm.update(1000);
    expect(qm.getQuest('q1')!.status).toBe('active');
  });

  // --- Prerequisites ---
  it('recheckAll unlocks quests when prereqs met', () => {
    qm.addQuest(quest('q1'));
    qm.addQuest(quest('q2', { prerequisites: ['q1'] }));
    qm.activate('q1');
    qm.addQuest(quest('q1-done', { objectives: [] })); // won't help — need q1 completed
    // Complete q1
    expect(qm.getQuest('q2')!.status).toBe('locked');
    // Manually complete q1
    qm.getQuest('q1')!.status = 'completed';
    qm.recheckAll();
    expect(qm.getQuest('q2')!.status).toBe('available');
  });

  // --- Events ---
  it('onEvent fires on completion', () => {
    const events: string[] = [];
    qm.onEvent((ev) => events.push(ev));
    qm.addQuest(quest('q1', { objectives: [objective('o1', 1)] }));
    qm.activate('q1');
    qm.updateObjective('q1', 'o1', 1);
    expect(events).toContain('completed');
  });

  // --- Queries ---
  it('getByStatus filters', () => {
    qm.addQuest(quest('q1'));
    qm.addQuest(quest('q2'));
    qm.activate('q1');
    expect(qm.getByStatus('active')).toHaveLength(1);
    expect(qm.getByStatus('available')).toHaveLength(1);
  });

  it('getByCategory filters', () => {
    qm.addQuest(quest('q1', { category: 'main' }));
    qm.addQuest(quest('q2', { category: 'side' }));
    expect(qm.getByCategory('main')).toHaveLength(1);
  });

  it('getProgress returns ratio', () => {
    qm.addQuest(quest('q1', { objectives: [objective('o1', 2), objective('o2', 2)] }));
    qm.activate('q1');
    qm.updateObjective('q1', 'o1', 2);
    expect(qm.getProgress('q1')).toBe(0.5);
  });

  it('getActiveCount and getCompletedCount', () => {
    qm.addQuest(quest('q1', { objectives: [objective('o1', 1)] }));
    qm.activate('q1');
    expect(qm.getActiveCount()).toBe(1);
    qm.updateObjective('q1', 'o1', 1);
    expect(qm.getCompletedCount()).toBe(1);
  });
});
