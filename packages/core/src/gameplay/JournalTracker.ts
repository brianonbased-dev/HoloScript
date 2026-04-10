/**
 * JournalTracker — quest journal with entries, pinning, notifications, search.
 * @module gameplay
 */

export interface JournalEntry {
  questId: string;
  questName: string;
  category: string;
  description: string;
  status: 'active' | 'completed' | 'failed';
  progress: number;
  pinned: boolean;
  objectiveSummaries: string[];
}

export interface JournalNotification {
  id: string;
  type: 'quest_added' | 'quest_completed' | 'quest_failed';
  questId: string;
  read: boolean;
}

let notifIdCounter = 0;

export class JournalTracker {
  private entries = new Map<string, JournalEntry>();
  private notifications: JournalNotification[] = [];

  getEntryCount(): number {
    return this.entries.size;
  }

  addEntry(
    questId: string,
    questName: string,
    category: string,
    description: string
  ): JournalEntry {
    const entry: JournalEntry = {
      questId,
      questName,
      category,
      description,
      status: 'active',
      progress: 0,
      pinned: false,
      objectiveSummaries: [],
    };
    this.entries.set(questId, entry);
    this.pushNotification('quest_added', questId);
    return entry;
  }

  getEntry(questId: string): JournalEntry | undefined {
    return this.entries.get(questId);
  }

  updateEntry(
    questId: string,
    updates: Partial<Pick<JournalEntry, 'status' | 'progress' | 'objectiveSummaries'>>
  ): boolean {
    const entry = this.entries.get(questId);
    if (!entry) return false;

    if (updates.status !== undefined) entry.status = updates.status;
    if (updates.progress !== undefined) entry.progress = updates.progress;
    if (updates.objectiveSummaries !== undefined)
      entry.objectiveSummaries = [...updates.objectiveSummaries];

    // Generate notifications for status changes
    if (updates.status === 'completed') {
      this.pushNotification('quest_completed', questId);
    } else if (updates.status === 'failed') {
      this.pushNotification('quest_failed', questId);
    }

    return true;
  }

  removeEntry(questId: string): boolean {
    return this.entries.delete(questId);
  }

  pin(questId: string): boolean {
    const entry = this.entries.get(questId);
    if (!entry) return false;
    entry.pinned = true;
    return true;
  }

  unpin(questId: string): boolean {
    const entry = this.entries.get(questId);
    if (!entry) return false;
    entry.pinned = false;
    return true;
  }

  getPinned(): JournalEntry[] {
    return [...this.entries.values()].filter((e) => e.pinned);
  }

  getNotifications(unreadOnly = false): JournalNotification[] {
    if (unreadOnly) {
      return this.notifications.filter((n) => !n.read);
    }
    return [...this.notifications];
  }

  getUnreadCount(): number {
    return this.notifications.filter((n) => !n.read).length;
  }

  markRead(notifId: string): void {
    const notif = this.notifications.find((n) => n.id === notifId);
    if (notif) notif.read = true;
  }

  markAllRead(): void {
    for (const notif of this.notifications) {
      notif.read = true;
    }
  }

  getByCategory(category: string): JournalEntry[] {
    return [...this.entries.values()].filter((e) => e.category === category);
  }

  getByStatus(status: JournalEntry['status']): JournalEntry[] {
    return [...this.entries.values()].filter((e) => e.status === status);
  }

  search(query: string): JournalEntry[] {
    const lower = query.toLowerCase();
    return [...this.entries.values()].filter(
      (e) =>
        e.questName.toLowerCase().includes(lower) ||
        e.description.toLowerCase().includes(lower)
    );
  }

  getCategories(): string[] {
    const cats = new Set<string>();
    for (const entry of this.entries.values()) {
      cats.add(entry.category);
    }
    return [...cats];
  }

  getAllEntries(): JournalEntry[] {
    return [...this.entries.values()];
  }

  private pushNotification(
    type: JournalNotification['type'],
    questId: string
  ): void {
    this.notifications.push({
      id: `notif_${++notifIdCounter}`,
      type,
      questId,
      read: false,
    });
  }
}
