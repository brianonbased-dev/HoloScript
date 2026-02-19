/**
 * QuestManager.prod.test.ts
 *
 * Production-grade test suite for QuestManager.
 * Covers: CRUD, activation, abandonment, prerequisite gating,
 *         objective updating, time-limit failures, events, and queries.
 *
 * Sprint CXXXIII  |  @module gameplay
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuestManager } from '../QuestManager';
import type { QuestDef, QuestObjective } from '../QuestManager';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeObjective(overrides: Partial<QuestObjective> = {}): QuestObjective {
  return {
    id: 'obj-1',
    type: 'kill',
    description: 'Kill 5 wolves',
    target: 'wolf',
    required: 5,
    current: 0,
    completed: false,
    optional: false,
    ...overrides,
  };
}

function addAvailableQuest(qm: QuestManager, id = 'q1') {
  return qm.addQuest({
    id,
    name: `Quest ${id}`,
    description: 'A test quest',
    category: 'main',
    objectives: [makeObjective()],
    prerequisites: [],
    level: 1,
    timeLimit: 0,
    repeatable: false,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('QuestManager', () => {

  // ── Construction ──────────────────────────────────────────────────────────
  describe('construction', () => {
    it('starts empty', () => {
      const qm = new QuestManager();
      expect(qm.getQuestCount()).toBe(0);
      expect(qm.getActiveCount()).toBe(0);
      expect(qm.getCompletedCount()).toBe(0);
    });
  });

  // ── CRUD ──────────────────────────────────────────────────────────────────
  describe('addQuest / getQuest / removeQuest', () => {
    it('adds a quest and returns the def', () => {
      const qm = new QuestManager();
      const q = addAvailableQuest(qm);
      expect(q.id).toBe('q1');
      expect(qm.getQuestCount()).toBe(1);
    });

    it('default status is available when no prerequisites', () => {
      const qm = new QuestManager();
      const q = addAvailableQuest(qm);
      expect(q.status).toBe('available');
    });

    it('getQuest returns undefined for unknown id', () => {
      const qm = new QuestManager();
      expect(qm.getQuest('nope')).toBeUndefined();
    });

    it('removeQuest deletes the quest', () => {
      const qm = new QuestManager();
      addAvailableQuest(qm);
      expect(qm.removeQuest('q1')).toBe(true);
      expect(qm.getQuestCount()).toBe(0);
    });

    it('removeQuest returns false for unknown id', () => {
      const qm = new QuestManager();
      expect(qm.removeQuest('nope')).toBe(false);
    });
  });

  // ── Activation ────────────────────────────────────────────────────────────
  describe('activate', () => {
    it('activates an available quest', () => {
      const qm = new QuestManager();
      addAvailableQuest(qm);
      expect(qm.activate('q1')).toBe(true);
      expect(qm.getQuest('q1')!.status).toBe('active');
      expect(qm.getActiveCount()).toBe(1);
    });

    it('returns false for non-available quest', () => {
      const qm = new QuestManager();
      addAvailableQuest(qm);
      qm.activate('q1');
      // already active → cannot activate again
      expect(qm.activate('q1')).toBe(false);
    });

    it('emits "activated" event', () => {
      const qm = new QuestManager();
      const events: string[] = [];
      qm.onEvent((evt) => events.push(evt));
      addAvailableQuest(qm);
      qm.activate('q1');
      expect(events).toContain('activated');
    });
  });

  // ── Abandonment ───────────────────────────────────────────────────────────
  describe('abandon', () => {
    it('resets an active quest to available', () => {
      const qm = new QuestManager();
      addAvailableQuest(qm);
      qm.activate('q1');
      expect(qm.abandon('q1')).toBe(true);
      expect(qm.getQuest('q1')!.status).toBe('available');
    });

    it('resets objective progress on abandon', () => {
      const qm = new QuestManager();
      addAvailableQuest(qm);
      qm.activate('q1');
      qm.updateObjective('q1', 'obj-1', 3);
      qm.abandon('q1');
      expect(qm.getQuest('q1')!.objectives[0].current).toBe(0);
    });

    it('returns false if not active', () => {
      const qm = new QuestManager();
      addAvailableQuest(qm);
      expect(qm.abandon('q1')).toBe(false);
    });
  });

  // ── Objectives ────────────────────────────────────────────────────────────
  describe('updateObjective', () => {
    it('increments objective progress', () => {
      const qm = new QuestManager();
      addAvailableQuest(qm);
      qm.activate('q1');
      qm.updateObjective('q1', 'obj-1', 2);
      expect(qm.getQuest('q1')!.objectives[0].current).toBe(2);
    });

    it('caps progress at required amount', () => {
      const qm = new QuestManager();
      addAvailableQuest(qm);
      qm.activate('q1');
      qm.updateObjective('q1', 'obj-1', 999);
      expect(qm.getQuest('q1')!.objectives[0].current).toBe(5);
    });

    it('marks objective completed when target reached', () => {
      const qm = new QuestManager();
      addAvailableQuest(qm);
      qm.activate('q1');
      qm.updateObjective('q1', 'obj-1', 5);
      expect(qm.getQuest('q1')!.objectives[0].completed).toBe(true);
    });

    it('auto-completes quest when all required objectives done', () => {
      const qm = new QuestManager();
      addAvailableQuest(qm);
      qm.activate('q1');
      qm.updateObjective('q1', 'obj-1', 5);
      expect(qm.getQuest('q1')!.status).toBe('completed');
      expect(qm.getCompletedCount()).toBe(1);
    });

    it('emits "objective_completed" and "completed" events', () => {
      const qm = new QuestManager();
      const events: string[] = [];
      qm.onEvent((evt) => events.push(evt));
      addAvailableQuest(qm);
      qm.activate('q1');
      qm.updateObjective('q1', 'obj-1', 5);
      expect(events).toContain('objective_completed');
      expect(events).toContain('completed');
    });

    it('optional objectives do not block completion', () => {
      const qm = new QuestManager();
      qm.addQuest({
        id: 'q2',
        name: 'Optional quest',
        description: '',
        category: 'side',
        objectives: [
          makeObjective({ id: 'req', required: 1, optional: false }),
          makeObjective({ id: 'opt', required: 3, optional: true }),
        ],
        prerequisites: [],
        level: 1,
        timeLimit: 0,
        repeatable: false,
      });
      qm.activate('q2');
      qm.updateObjective('q2', 'req', 1);
      expect(qm.getQuest('q2')!.status).toBe('completed');
    });

    it('returns false for non-active quest', () => {
      const qm = new QuestManager();
      addAvailableQuest(qm);
      expect(qm.updateObjective('q1', 'obj-1', 1)).toBe(false);
    });
  });

  // ── Prerequisites ─────────────────────────────────────────────────────────
  describe('prerequisites', () => {
    it('quest stays locked until prerequisite is completed', () => {
      const qm = new QuestManager();
      addAvailableQuest(qm, 'q1');
      qm.addQuest({
        id: 'q2',
        name: 'Locked',
        description: '',
        category: 'main',
        objectives: [makeObjective()],
        prerequisites: ['q1'],
        level: 1,
        timeLimit: 0,
        repeatable: false,
      });
      expect(qm.getQuest('q2')!.status).toBe('locked');
    });

    it('recheckAll unlocks quest after prerequisite completed', () => {
      const qm = new QuestManager();
      addAvailableQuest(qm, 'q1');
      qm.addQuest({
        id: 'q2',
        name: 'Locked',
        description: '',
        category: 'main',
        objectives: [makeObjective()],
        prerequisites: ['q1'],
        level: 1,
        timeLimit: 0,
        repeatable: false,
      });
      // Complete q1
      qm.activate('q1');
      qm.updateObjective('q1', 'obj-1', 5);
      qm.recheckAll();
      expect(qm.getQuest('q2')!.status).toBe('available');
    });
  });

  // ── Time limits ───────────────────────────────────────────────────────────
  describe('update (time limit)', () => {
    it('marks quest failed when time expires', () => {
      const qm = new QuestManager();
      qm.addQuest({
        id: 'timed',
        name: 'Timed Quest',
        description: '',
        category: 'main',
        objectives: [makeObjective()],
        prerequisites: [],
        level: 1,
        timeLimit: 10,
        repeatable: false,
      });
      qm.activate('timed');
      qm.update(11);
      expect(qm.getQuest('timed')!.status).toBe('failed');
    });

    it('does not fail quest before time limit', () => {
      const qm = new QuestManager();
      qm.addQuest({
        id: 'timed',
        name: 'Timed Quest',
        description: '',
        category: 'main',
        objectives: [makeObjective()],
        prerequisites: [],
        level: 1,
        timeLimit: 10,
        repeatable: false,
      });
      qm.activate('timed');
      qm.update(5);
      expect(qm.getQuest('timed')!.status).toBe('active');
    });
  });

  // ── Queries ───────────────────────────────────────────────────────────────
  describe('queries', () => {
    it('getByStatus returns correct quests', () => {
      const qm = new QuestManager();
      addAvailableQuest(qm, 'q1');
      addAvailableQuest(qm, 'q2');
      qm.activate('q1');
      expect(qm.getByStatus('active')).toHaveLength(1);
      expect(qm.getByStatus('available')).toHaveLength(1);
    });

    it('getByCategory filters correctly', () => {
      const qm = new QuestManager();
      addAvailableQuest(qm, 'q1'); // category 'main'
      qm.addQuest({
        id: 'side1',
        name: 'Side quest',
        description: '',
        category: 'side',
        objectives: [],
        prerequisites: [],
        level: 1,
        timeLimit: 0,
        repeatable: false,
      });
      expect(qm.getByCategory('main')).toHaveLength(1);
      expect(qm.getByCategory('side')).toHaveLength(1);
      expect(qm.getByCategory('unknown')).toHaveLength(0);
    });

    it('getProgress returns 0 for unknown quest', () => {
      const qm = new QuestManager();
      expect(qm.getProgress('nope')).toBe(0);
    });

    it('getProgress returns ratio of completed required objectives', () => {
      const qm = new QuestManager();
      qm.addQuest({
        id: 'multi',
        name: 'Multi obj',
        description: '',
        category: 'main',
        objectives: [
          makeObjective({ id: 'o1', required: 1, optional: false }),
          makeObjective({ id: 'o2', required: 1, optional: false }),
        ],
        prerequisites: [],
        level: 1,
        timeLimit: 0,
        repeatable: false,
      });
      qm.activate('multi');
      qm.updateObjective('multi', 'o1', 1);
      expect(qm.getProgress('multi')).toBeCloseTo(0.5);
    });
  });
});
