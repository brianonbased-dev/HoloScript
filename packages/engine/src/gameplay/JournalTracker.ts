/**
 * JournalTracker.ts
 *
 * Quest journal UI data: quest log, categories, filters,
 * notifications, and pinned quests.
 *
 * @module gameplay
 */

// =============================================================================
// TYPES
// =============================================================================

export interface JournalEntry {
  questId: string;
  questName: string;
  category: string;
  description: string;
  status: string;
  progress: number; // 0-1
  pinned: boolean;
  addedAt: number;
  updatedAt: number;
  objectiveSummaries: string[];
}

export interface JournalNotification {
  id: string;
  type: 'quest_added' | 'quest_updated' | 'quest_completed' | 'quest_failed';
  questId: string;
  message: string;
  timestamp: number;
  read: boolean;
}

// =============================================================================
// JOURNAL TRACKER
// =============================================================================

let _notifId = 0;

export class JournalTracker {
  private entries: Map<string, JournalEntry> = new Map();
  private notifications: JournalNotification[] = [];
  private pinnedQuests: Set<string> = new Set();
  private maxNotifications = 50;

  // ---------------------------------------------------------------------------
  // Entry Management
  // ---------------------------------------------------------------------------

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
      addedAt: Date.now(),
      updatedAt: Date.now(),
      objectiveSummaries: [],
    };
    this.entries.set(questId, entry);
    this.notify('quest_added', questId, `New quest: ${questName}`);
    return entry;
  }

  updateEntry(
    questId: string,
    updates: Partial<Pick<JournalEntry, 'status' | 'progress' | 'objectiveSummaries'>>
  ): boolean {
    const entry = this.entries.get(questId);
    if (!entry) return false;

    if (updates.status !== undefined) entry.status = updates.status;
    if (updates.progress !== undefined) entry.progress = updates.progress;
    if (updates.objectiveSummaries) entry.objectiveSummaries = updates.objectiveSummaries;
    entry.updatedAt = Date.now();

    if (updates.status === 'completed') {
      this.notify('quest_completed', questId, `Completed: ${entry.questName}`);
    } else if (updates.status === 'failed') {
      this.notify('quest_failed', questId, `Failed: ${entry.questName}`);
    } else {
      this.notify('quest_updated', questId, `Updated: ${entry.questName}`);
    }

    return true;
  }

  removeEntry(questId: string): boolean {
    this.pinnedQuests.delete(questId);
    return this.entries.delete(questId);
  }

  // ---------------------------------------------------------------------------
  // Pin
  // ---------------------------------------------------------------------------

  pin(questId: string): boolean {
    if (!this.entries.has(questId)) return false;
    this.pinnedQuests.add(questId);
    const entry = this.entries.get(questId)!;
    entry.pinned = true;
    return true;
  }

  unpin(questId: string): boolean {
    this.pinnedQuests.delete(questId);
    const entry = this.entries.get(questId);
    if (entry) entry.pinned = false;
    return true;
  }

  getPinned(): JournalEntry[] {
    return [...this.pinnedQuests]
      .map((id) => this.entries.get(id))
      .filter((e): e is JournalEntry => !!e);
  }

  // ---------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------

  private notify(type: JournalNotification['type'], questId: string, message: string): void {
    this.notifications.push({
      id: `notif_${_notifId++}`,
      type,
      questId,
      message,
      timestamp: Date.now(),
      read: false,
    });
    if (this.notifications.length > this.maxNotifications) this.notifications.shift();
  }

  getNotifications(unreadOnly = false): JournalNotification[] {
    if (unreadOnly) return this.notifications.filter((n) => !n.read);
    return [...this.notifications];
  }

  markRead(id: string): void {
    const notif = this.notifications.find((n) => n.id === id);
    if (notif) notif.read = true;
  }

  markAllRead(): void {
    for (const n of this.notifications) n.read = true;
  }

  getUnreadCount(): number {
    return this.notifications.filter((n) => !n.read).length;
  }

  // ---------------------------------------------------------------------------
  // Filtering & Sorting
  // ---------------------------------------------------------------------------

  getByCategory(category: string): JournalEntry[] {
    return [...this.entries.values()].filter((e) => e.category === category);
  }

  getByStatus(status: string): JournalEntry[] {
    return [...this.entries.values()].filter((e) => e.status === status);
  }

  search(query: string): JournalEntry[] {
    const lower = query.toLowerCase();
    return [...this.entries.values()].filter(
      (e) =>
        e.questName.toLowerCase().includes(lower) || e.description.toLowerCase().includes(lower)
    );
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getEntry(questId: string): JournalEntry | undefined {
    return this.entries.get(questId);
  }
  getEntryCount(): number {
    return this.entries.size;
  }
  getCategories(): string[] {
    return [...new Set([...this.entries.values()].map((e) => e.category))];
  }
  getAllEntries(): JournalEntry[] {
    return [...this.entries.values()];
  }
}

