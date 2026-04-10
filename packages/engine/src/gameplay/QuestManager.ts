/**
 * QuestManager.ts
 *
 * Quest lifecycle: creation, objectives, prerequisites,
 * state tracking, and completion logic.
 *
 * @module gameplay
 */

// =============================================================================
// TYPES
// =============================================================================

export type QuestStatus = 'locked' | 'available' | 'active' | 'completed' | 'failed';
export type ObjectiveType = 'collect' | 'kill' | 'reach' | 'interact' | 'escort' | 'custom';

export interface QuestObjective {
  id: string;
  type: ObjectiveType;
  description: string;
  target: string;
  required: number;
  current: number;
  completed: boolean;
  optional: boolean;
}

export interface QuestDef {
  id: string;
  name: string;
  description: string;
  category: string;
  status: QuestStatus;
  objectives: QuestObjective[];
  prerequisites: string[]; // Quest IDs that must be completed
  level: number;
  timeLimit: number; // 0 = no limit, seconds
  elapsed: number;
  repeatable: boolean;
  completionCount: number;
}

// =============================================================================
// QUEST MANAGER
// =============================================================================

export class QuestManager {
  private quests: Map<string, QuestDef> = new Map();
  private listeners: Array<(event: string, quest: QuestDef) => void> = [];

  // ---------------------------------------------------------------------------
  // Quest CRUD
  // ---------------------------------------------------------------------------

  addQuest(
    config: Omit<QuestDef, 'status' | 'elapsed' | 'completionCount'> & { status?: QuestStatus }
  ): QuestDef {
    const quest: QuestDef = {
      ...config,
      status: config.status ?? 'locked',
      elapsed: 0,
      completionCount: 0,
    };
    this.quests.set(quest.id, quest);
    this.checkAvailability(quest.id);
    return quest;
  }

  getQuest(id: string): QuestDef | undefined {
    return this.quests.get(id);
  }
  removeQuest(id: string): boolean {
    return this.quests.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Activation
  // ---------------------------------------------------------------------------

  activate(id: string): boolean {
    const quest = this.quests.get(id);
    if (!quest || quest.status !== 'available') return false;
    quest.status = 'active';
    this.emit('activated', quest);
    return true;
  }

  abandon(id: string): boolean {
    const quest = this.quests.get(id);
    if (!quest || quest.status !== 'active') return false;
    quest.status = 'available';
    // Reset objectives
    for (const obj of quest.objectives) {
      obj.current = 0;
      obj.completed = false;
    }
    quest.elapsed = 0;
    this.emit('abandoned', quest);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Objective Progress
  // ---------------------------------------------------------------------------

  updateObjective(questId: string, objectiveId: string, progress: number): boolean {
    const quest = this.quests.get(questId);
    if (!quest || quest.status !== 'active') return false;

    const obj = quest.objectives.find((o) => o.id === objectiveId);
    if (!obj || obj.completed) return false;

    obj.current = Math.min(obj.required, obj.current + progress);
    if (obj.current >= obj.required) {
      obj.completed = true;
      this.emit('objective_completed', quest);
    }

    // Check quest completion
    const requiredDone = quest.objectives.filter((o) => !o.optional).every((o) => o.completed);
    if (requiredDone) {
      quest.status = 'completed';
      quest.completionCount++;
      this.emit('completed', quest);
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Time
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    for (const quest of this.quests.values()) {
      if (quest.status !== 'active') continue;
      if (quest.timeLimit > 0) {
        quest.elapsed += dt;
        if (quest.elapsed >= quest.timeLimit) {
          quest.status = 'failed';
          this.emit('failed', quest);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Prerequisites
  // ---------------------------------------------------------------------------

  private checkAvailability(id: string): void {
    const quest = this.quests.get(id);
    if (!quest || quest.status !== 'locked') return;

    const allMet = quest.prerequisites.every((pId) => {
      const p = this.quests.get(pId);
      return p && p.status === 'completed';
    });

    if (allMet || quest.prerequisites.length === 0) {
      quest.status = 'available';
    }
  }

  recheckAll(): void {
    for (const id of this.quests.keys()) this.checkAvailability(id);
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  onEvent(listener: (event: string, quest: QuestDef) => void): void {
    this.listeners.push(listener);
  }

  private emit(event: string, quest: QuestDef): void {
    for (const l of this.listeners) l(event, quest);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getByStatus(status: QuestStatus): QuestDef[] {
    return [...this.quests.values()].filter((q) => q.status === status);
  }
  getByCategory(category: string): QuestDef[] {
    return [...this.quests.values()].filter((q) => q.category === category);
  }
  getQuestCount(): number {
    return this.quests.size;
  }
  getActiveCount(): number {
    return this.getByStatus('active').length;
  }
  getCompletedCount(): number {
    return this.getByStatus('completed').length;
  }
  getProgress(id: string): number {
    const q = this.quests.get(id);
    if (!q) return 0;
    const required = q.objectives.filter((o) => !o.optional);
    if (required.length === 0) return 1;
    return required.filter((o) => o.completed).length / required.length;
  }
}

