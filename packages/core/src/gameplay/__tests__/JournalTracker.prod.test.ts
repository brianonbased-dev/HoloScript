/**
 * JournalTracker.prod.test.ts
 *
 * Production tests for JournalTracker.
 * Pure in-memory, zero I/O, deterministic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JournalTracker, type JournalEntry } from '../JournalTracker';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JournalTracker', () => {
  let tracker: JournalTracker;

  beforeEach(() => {
    tracker = new JournalTracker();
  });

  // ── Entry Management ──────────────────────────────────────────────────────

  describe('addEntry / getEntry', () => {
    it('addEntry returns a valid entry', () => {
      const entry = tracker.addEntry('q1', 'Main Quest', 'main', 'Defeat the boss');
      expect(entry.questId).toBe('q1');
      expect(entry.questName).toBe('Main Quest');
      expect(entry.status).toBe('active');
      expect(entry.progress).toBe(0);
      expect(entry.pinned).toBe(false);
    });

    it('getEntry retrieves the entry by questId', () => {
      tracker.addEntry('q1', 'Test', 'cat', 'desc');
      expect(tracker.getEntry('q1')).toBeDefined();
      expect(tracker.getEntry('q1')!.questId).toBe('q1');
    });

    it('getEntry returns undefined for unknown id', () => {
      expect(tracker.getEntry('bad')).toBeUndefined();
    });

    it('getEntryCount increases', () => {
      tracker.addEntry('q1', 'A', 'c', 'd');
      tracker.addEntry('q2', 'B', 'c', 'd');
      expect(tracker.getEntryCount()).toBe(2);
    });
  });

  describe('updateEntry', () => {
    it('updates status, progress, objectives', () => {
      tracker.addEntry('q1', 'Quest', 'main', 'desc');
      const ok = tracker.updateEntry('q1', {
        status: 'completed',
        progress: 1,
        objectiveSummaries: ['Kill boss'],
      });
      expect(ok).toBe(true);
      const e = tracker.getEntry('q1')!;
      expect(e.status).toBe('completed');
      expect(e.progress).toBe(1);
      expect(e.objectiveSummaries).toEqual(['Kill boss']);
    });

    it('returns false for unknown questId', () => {
      expect(tracker.updateEntry('bad', { status: 'failed' })).toBe(false);
    });

    it('partial update only changes provided fields', () => {
      tracker.addEntry('q1', 'Q', 'c', 'd');
      tracker.updateEntry('q1', { progress: 0.5 });
      expect(tracker.getEntry('q1')!.status).toBe('active');
    });
  });

  describe('removeEntry', () => {
    it('removes an entry', () => {
      tracker.addEntry('q1', 'Q', 'c', 'd');
      expect(tracker.removeEntry('q1')).toBe(true);
      expect(tracker.getEntry('q1')).toBeUndefined();
    });

    it('returns false for nonexistent entry', () => {
      expect(tracker.removeEntry('nope')).toBe(false);
    });

    it('removes from pinned set on deletion', () => {
      tracker.addEntry('q1', 'Q', 'c', 'd');
      tracker.pin('q1');
      tracker.removeEntry('q1');
      expect(tracker.getPinned()).toHaveLength(0);
    });
  });

  // ── Pin ───────────────────────────────────────────────────────────────────

  describe('pin / unpin / getPinned', () => {
    it('pin() sets entry.pinned = true', () => {
      tracker.addEntry('q1', 'Q', 'c', 'd');
      expect(tracker.pin('q1')).toBe(true);
      expect(tracker.getEntry('q1')!.pinned).toBe(true);
    });

    it('pin() returns false for unknown id', () => {
      expect(tracker.pin('bad')).toBe(false);
    });

    it('unpin() sets entry.pinned = false', () => {
      tracker.addEntry('q1', 'Q', 'c', 'd');
      tracker.pin('q1');
      tracker.unpin('q1');
      expect(tracker.getEntry('q1')!.pinned).toBe(false);
    });

    it('getPinned() returns pinned entries', () => {
      tracker.addEntry('q1', 'Q1', 'c', 'd');
      tracker.addEntry('q2', 'Q2', 'c', 'd');
      tracker.pin('q1');
      const pinned = tracker.getPinned();
      expect(pinned).toHaveLength(1);
      expect(pinned[0].questId).toBe('q1');
    });
  });

  // ── Notifications ─────────────────────────────────────────────────────────

  describe('notifications', () => {
    it('addEntry creates a quest_added notification', () => {
      tracker.addEntry('q1', 'Q', 'c', 'd');
      const notifs = tracker.getNotifications();
      expect(notifs).toHaveLength(1);
      expect(notifs[0].type).toBe('quest_added');
      expect(notifs[0].questId).toBe('q1');
      expect(notifs[0].read).toBe(false);
    });

    it('updateEntry with completed creates quest_completed notification', () => {
      tracker.addEntry('q1', 'Q', 'c', 'd');
      tracker.updateEntry('q1', { status: 'completed' });
      const notifs = tracker.getNotifications();
      const completed = notifs.find(n => n.type === 'quest_completed');
      expect(completed).toBeDefined();
    });

    it('updateEntry with failed creates quest_failed notification', () => {
      tracker.addEntry('q1', 'Q', 'c', 'd');
      tracker.updateEntry('q1', { status: 'failed' });
      const notifs = tracker.getNotifications();
      const failed = notifs.find(n => n.type === 'quest_failed');
      expect(failed).toBeDefined();
    });

    it('getNotifications(unreadOnly=true) filters', () => {
      tracker.addEntry('q1', 'Q', 'c', 'd');
      const all = tracker.getNotifications();
      tracker.markRead(all[0].id);
      expect(tracker.getNotifications(true)).toHaveLength(0);
    });

    it('markAllRead() marks everything read', () => {
      tracker.addEntry('q1', 'Q', 'c', 'd');
      tracker.addEntry('q2', 'Q2', 'c', 'd');
      tracker.markAllRead();
      expect(tracker.getUnreadCount()).toBe(0);
    });

    it('getUnreadCount() counts unread', () => {
      tracker.addEntry('q1', 'Q', 'c', 'd');
      tracker.addEntry('q2', 'Q2', 'c', 'd');
      expect(tracker.getUnreadCount()).toBe(2);
    });
  });

  // ── Filtering ─────────────────────────────────────────────────────────────

  describe('getByCategory / getByStatus / search / getCategories', () => {
    beforeEach(() => {
      tracker.addEntry('q1', 'Dragon Slayer', 'main', 'Slay the dragon');
      tracker.addEntry('q2', 'Herbalist', 'side', 'Gather herbs');
      tracker.addEntry('q3', 'Dragon Lore', 'main', 'Study dragons');
      tracker.updateEntry('q2', { status: 'completed' });
    });

    it('getByCategory() returns correct entries', () => {
      expect(tracker.getByCategory('main')).toHaveLength(2);
      expect(tracker.getByCategory('side')).toHaveLength(1);
    });

    it('getByStatus() returns correct entries', () => {
      expect(tracker.getByStatus('active')).toHaveLength(2);
      expect(tracker.getByStatus('completed')).toHaveLength(1);
    });

    it('search() matches questName case-insensitively', () => {
      const results = tracker.search('dragon');
      expect(results).toHaveLength(2);
    });

    it('search() matches description', () => {
      const results = tracker.search('herbs');
      expect(results).toHaveLength(1);
    });

    it('search() returns empty for no match', () => {
      expect(tracker.search('zzz')).toHaveLength(0);
    });

    it('getCategories() returns unique categories', () => {
      const cats = tracker.getCategories();
      expect(cats).toContain('main');
      expect(cats).toContain('side');
      expect(cats).toHaveLength(2);
    });

    it('getAllEntries() returns all', () => {
      expect(tracker.getAllEntries()).toHaveLength(3);
    });
  });
});
