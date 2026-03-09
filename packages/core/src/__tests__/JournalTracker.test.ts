import { describe, it, expect, beforeEach } from 'vitest';
import { JournalTracker } from '../gameplay/JournalTracker';

// =============================================================================
// C260 — Journal Tracker
// =============================================================================

describe('JournalTracker', () => {
  let journal: JournalTracker;
  beforeEach(() => {
    journal = new JournalTracker();
  });

  it('addEntry creates active quest', () => {
    const e = journal.addEntry('q1', 'Find Sword', 'main', 'Find the legendary sword');
    expect(e.status).toBe('active');
    expect(e.progress).toBe(0);
  });

  it('getEntry retrieves entry', () => {
    journal.addEntry('q1', 'Find Sword', 'main', 'desc');
    expect(journal.getEntry('q1')).toBeDefined();
  });

  it('getEntryCount reflects count', () => {
    journal.addEntry('q1', 'A', 'main', 'desc');
    journal.addEntry('q2', 'B', 'side', 'desc');
    expect(journal.getEntryCount()).toBe(2);
  });

  it('updateEntry changes status and progress', () => {
    journal.addEntry('q1', 'A', 'main', 'desc');
    journal.updateEntry('q1', { status: 'completed', progress: 1 });
    expect(journal.getEntry('q1')!.status).toBe('completed');
    expect(journal.getEntry('q1')!.progress).toBe(1);
  });

  it('updateEntry returns false for unknown quest', () => {
    expect(journal.updateEntry('nope', { status: 'completed' })).toBe(false);
  });

  it('removeEntry deletes quest', () => {
    journal.addEntry('q1', 'A', 'main', 'desc');
    expect(journal.removeEntry('q1')).toBe(true);
    expect(journal.getEntry('q1')).toBeUndefined();
  });

  it('pin and getPinned', () => {
    journal.addEntry('q1', 'A', 'main', 'desc');
    journal.addEntry('q2', 'B', 'side', 'desc');
    journal.pin('q1');
    const pinned = journal.getPinned();
    expect(pinned).toHaveLength(1);
    expect(pinned[0].questId).toBe('q1');
  });

  it('unpin removes from pinned', () => {
    journal.addEntry('q1', 'A', 'main', 'desc');
    journal.pin('q1');
    journal.unpin('q1');
    expect(journal.getPinned()).toHaveLength(0);
    expect(journal.getEntry('q1')!.pinned).toBe(false);
  });

  it('addEntry creates quest_added notification', () => {
    journal.addEntry('q1', 'A', 'main', 'desc');
    const notifs = journal.getNotifications();
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('quest_added');
  });

  it('completing quest creates quest_completed notification', () => {
    journal.addEntry('q1', 'A', 'main', 'desc');
    journal.updateEntry('q1', { status: 'completed' });
    const notifs = journal.getNotifications();
    expect(notifs.some((n) => n.type === 'quest_completed')).toBe(true);
  });

  it('markAllRead clears unread count', () => {
    journal.addEntry('q1', 'A', 'main', 'desc');
    expect(journal.getUnreadCount()).toBe(1);
    journal.markAllRead();
    expect(journal.getUnreadCount()).toBe(0);
  });

  it('getByCategory filters entries', () => {
    journal.addEntry('q1', 'A', 'main', 'desc');
    journal.addEntry('q2', 'B', 'side', 'desc');
    expect(journal.getByCategory('main')).toHaveLength(1);
  });

  it('search finds by name or description', () => {
    journal.addEntry('q1', 'Find Sword', 'main', 'Look in the dungeon');
    expect(journal.search('sword')).toHaveLength(1);
    expect(journal.search('dungeon')).toHaveLength(1);
    expect(journal.search('nothing')).toHaveLength(0);
  });

  it('getCategories returns unique categories', () => {
    journal.addEntry('q1', 'A', 'main', 'd');
    journal.addEntry('q2', 'B', 'side', 'd');
    journal.addEntry('q3', 'C', 'main', 'd');
    expect(journal.getCategories().sort()).toEqual(['main', 'side']);
  });
});
