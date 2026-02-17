import { describe, it, expect, beforeEach } from 'vitest';
import { JournalTracker } from '../JournalTracker';

describe('JournalTracker', () => {
  let jt: JournalTracker;
  beforeEach(() => { jt = new JournalTracker(); });

  // --- Entry Management ---
  it('addEntry creates entry', () => {
    const e = jt.addEntry('q1', 'Find Sword', 'main', 'Find the legendary sword');
    expect(e.questId).toBe('q1');
    expect(e.status).toBe('active');
    expect(e.progress).toBe(0);
    expect(jt.getEntryCount()).toBe(1);
  });

  it('updateEntry changes status', () => {
    jt.addEntry('q1', 'Test', 'side', 'desc');
    const ok = jt.updateEntry('q1', { status: 'completed', progress: 1 });
    expect(ok).toBe(true);
    expect(jt.getEntry('q1')!.status).toBe('completed');
    expect(jt.getEntry('q1')!.progress).toBe(1);
  });

  it('updateEntry returns false for missing', () => {
    expect(jt.updateEntry('nope', { status: 'completed' })).toBe(false);
  });

  it('removeEntry deletes', () => {
    jt.addEntry('q1', 'Test', 'main', 'desc');
    expect(jt.removeEntry('q1')).toBe(true);
    expect(jt.getEntryCount()).toBe(0);
  });

  it('updateEntry with objectiveSummaries', () => {
    jt.addEntry('q1', 'Test', 'main', 'desc');
    jt.updateEntry('q1', { objectiveSummaries: ['Kill 5 goblins', 'Return to base'] });
    expect(jt.getEntry('q1')!.objectiveSummaries).toHaveLength(2);
  });

  // --- Pinning ---
  it('pin sets pinned flag', () => {
    jt.addEntry('q1', 'Test', 'main', 'desc');
    expect(jt.pin('q1')).toBe(true);
    expect(jt.getEntry('q1')!.pinned).toBe(true);
  });

  it('pin returns false for missing', () => {
    expect(jt.pin('nope')).toBe(false);
  });

  it('unpin clears pin', () => {
    jt.addEntry('q1', 'Test', 'main', 'desc');
    jt.pin('q1');
    jt.unpin('q1');
    expect(jt.getEntry('q1')!.pinned).toBe(false);
  });

  it('getPinned returns pinned entries', () => {
    jt.addEntry('q1', 'A', 'main', 'd');
    jt.addEntry('q2', 'B', 'side', 'd');
    jt.pin('q1');
    expect(jt.getPinned()).toHaveLength(1);
    expect(jt.getPinned()[0].questId).toBe('q1');
  });

  // --- Notifications ---
  it('addEntry generates notification', () => {
    jt.addEntry('q1', 'Test', 'main', 'desc');
    const notifs = jt.getNotifications();
    expect(notifs.length).toBeGreaterThan(0);
    expect(notifs[0].type).toBe('quest_added');
  });

  it('complete status generates quest_completed notification', () => {
    jt.addEntry('q1', 'Test', 'main', 'desc');
    jt.updateEntry('q1', { status: 'completed' });
    const notifs = jt.getNotifications();
    expect(notifs.some(n => n.type === 'quest_completed')).toBe(true);
  });

  it('failed status generates quest_failed notification', () => {
    jt.addEntry('q1', 'Test', 'main', 'desc');
    jt.updateEntry('q1', { status: 'failed' });
    expect(jt.getNotifications().some(n => n.type === 'quest_failed')).toBe(true);
  });

  it('markRead clears unread flag', () => {
    jt.addEntry('q1', 'Test', 'main', 'desc');
    const notifs = jt.getNotifications();
    jt.markRead(notifs[0].id);
    expect(jt.getUnreadCount()).toBe(0);
  });

  it('markAllRead clears all', () => {
    jt.addEntry('q1', 'A', 'main', 'd');
    jt.addEntry('q2', 'B', 'side', 'd');
    jt.markAllRead();
    expect(jt.getUnreadCount()).toBe(0);
  });

  it('getNotifications(unreadOnly) filters', () => {
    jt.addEntry('q1', 'Test', 'main', 'desc');
    jt.markAllRead();
    expect(jt.getNotifications(true)).toHaveLength(0);
    expect(jt.getNotifications(false).length).toBeGreaterThan(0);
  });

  // --- Filtering ---
  it('getByCategory filters', () => {
    jt.addEntry('q1', 'A', 'main', 'd');
    jt.addEntry('q2', 'B', 'side', 'd');
    expect(jt.getByCategory('main')).toHaveLength(1);
  });

  it('getByStatus filters', () => {
    jt.addEntry('q1', 'A', 'main', 'd');
    jt.updateEntry('q1', { status: 'completed' });
    expect(jt.getByStatus('completed')).toHaveLength(1);
    expect(jt.getByStatus('active')).toHaveLength(0);
  });

  it('search matches name and description', () => {
    jt.addEntry('q1', 'Dragon Slayer', 'main', 'Kill the red dragon');
    expect(jt.search('dragon')).toHaveLength(1);
    expect(jt.search('slayer')).toHaveLength(1);
    expect(jt.search('unicorn')).toHaveLength(0);
  });

  // --- Queries ---
  it('getCategories returns unique list', () => {
    jt.addEntry('q1', 'A', 'main', 'd');
    jt.addEntry('q2', 'B', 'main', 'd');
    jt.addEntry('q3', 'C', 'side', 'd');
    expect(jt.getCategories()).toHaveLength(2);
  });

  it('getAllEntries returns all', () => {
    jt.addEntry('q1', 'A', 'main', 'd');
    jt.addEntry('q2', 'B', 'side', 'd');
    expect(jt.getAllEntries()).toHaveLength(2);
  });
});
