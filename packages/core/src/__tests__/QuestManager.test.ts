import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuestManager, type QuestObjective } from '../gameplay/QuestManager';

// =============================================================================
// C281 — Quest Manager
// =============================================================================

function objective(id: string, required: number, optional = false): QuestObjective {
  return { id, type: 'collect', description: id, target: 'item', required, current: 0, completed: false, optional };
}

describe('QuestManager', () => {
  let qm: QuestManager;
  beforeEach(() => { qm = new QuestManager(); });

  it('addQuest with no prerequisites is available', () => {
    const q = qm.addQuest({ id: 'q1', name: 'Q1', description: '', category: 'main', objectives: [], prerequisites: [], level: 1, timeLimit: 0, repeatable: false });
    expect(q.status).toBe('available');
  });

  it('addQuest with unmet prerequisites stays locked', () => {
    const q = qm.addQuest({ id: 'q2', name: 'Q2', description: '', category: 'main', objectives: [], prerequisites: ['q1'], level: 1, timeLimit: 0, repeatable: false });
    expect(q.status).toBe('locked');
  });

  it('activate changes status to active', () => {
    qm.addQuest({ id: 'q1', name: 'Q1', description: '', category: 'main', objectives: [], prerequisites: [], level: 1, timeLimit: 0, repeatable: false });
    expect(qm.activate('q1')).toBe(true);
    expect(qm.getQuest('q1')!.status).toBe('active');
  });

  it('activate rejects non-available quests', () => {
    qm.addQuest({ id: 'q1', name: 'Q1', description: '', category: 'main', objectives: [], prerequisites: ['prereq'], level: 1, timeLimit: 0, repeatable: false });
    expect(qm.activate('q1')).toBe(false);
  });

  it('updateObjective tracks progress and completes', () => {
    qm.addQuest({ id: 'q1', name: 'Q1', description: '', category: 'main', objectives: [objective('o1', 3)], prerequisites: [], level: 1, timeLimit: 0, repeatable: false });
    qm.activate('q1');
    qm.updateObjective('q1', 'o1', 2);
    expect(qm.getQuest('q1')!.objectives[0].current).toBe(2);
    qm.updateObjective('q1', 'o1', 1);
    expect(qm.getQuest('q1')!.status).toBe('completed');
  });

  it('optional objectives do not block completion', () => {
    qm.addQuest({ id: 'q1', name: 'Q1', description: '', category: 'main', objectives: [objective('req', 1), objective('opt', 5, true)], prerequisites: [], level: 1, timeLimit: 0, repeatable: false });
    qm.activate('q1');
    qm.updateObjective('q1', 'req', 1);
    expect(qm.getQuest('q1')!.status).toBe('completed');
  });

  it('abandon resets objectives and sets available', () => {
    qm.addQuest({ id: 'q1', name: 'Q1', description: '', category: 'main', objectives: [objective('o1', 5)], prerequisites: [], level: 1, timeLimit: 0, repeatable: false });
    qm.activate('q1');
    qm.updateObjective('q1', 'o1', 3);
    expect(qm.abandon('q1')).toBe(true);
    expect(qm.getQuest('q1')!.status).toBe('available');
    expect(qm.getQuest('q1')!.objectives[0].current).toBe(0);
  });

  it('time limit causes failure', () => {
    qm.addQuest({ id: 'q1', name: 'Q1', description: '', category: 'main', objectives: [objective('o1', 10)], prerequisites: [], level: 1, timeLimit: 5, repeatable: false });
    qm.activate('q1');
    qm.update(6);
    expect(qm.getQuest('q1')!.status).toBe('failed');
  });

  it('getProgress returns fractional completion', () => {
    qm.addQuest({ id: 'q1', name: 'Q1', description: '', category: 'main', objectives: [objective('a', 1), objective('b', 1)], prerequisites: [], level: 1, timeLimit: 0, repeatable: false });
    qm.activate('q1');
    qm.updateObjective('q1', 'a', 1);
    expect(qm.getProgress('q1')).toBeCloseTo(0.5);
  });

  it('onEvent listener fires on completion', () => {
    const listener = vi.fn();
    qm.onEvent(listener);
    qm.addQuest({ id: 'q1', name: 'Q1', description: '', category: 'main', objectives: [objective('o1', 1)], prerequisites: [], level: 1, timeLimit: 0, repeatable: false });
    qm.activate('q1');
    qm.updateObjective('q1', 'o1', 1);
    const completedCalls = listener.mock.calls.filter(c => c[0] === 'completed');
    expect(completedCalls.length).toBe(1);
  });

  it('recheckAll unlocks quests after prereqs completed', () => {
    qm.addQuest({ id: 'q1', name: 'Q1', description: '', category: 'main', objectives: [objective('o1', 1)], prerequisites: [], level: 1, timeLimit: 0, repeatable: false });
    qm.addQuest({ id: 'q2', name: 'Q2', description: '', category: 'main', objectives: [], prerequisites: ['q1'], level: 1, timeLimit: 0, repeatable: false });
    qm.activate('q1');
    qm.updateObjective('q1', 'o1', 1);
    qm.recheckAll();
    expect(qm.getQuest('q2')!.status).toBe('available');
  });
});
