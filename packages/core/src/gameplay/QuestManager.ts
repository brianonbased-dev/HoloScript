/**
 * QuestManager — quest CRUD, objectives, prerequisites, time limits, events.
 * @module gameplay
 */

export interface QuestObjective {
  id: string;
  type: string;
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
  objectives: QuestObjective[];
  prerequisites: string[];
  level: number;
  timeLimit: number;
  repeatable: boolean;
  status: 'locked' | 'available' | 'active' | 'completed' | 'failed';
  elapsed: number;
  completionCount: number;
}

type EventListener = (event: string) => void;

export class QuestManager {
  private quests = new Map<string, QuestDef>();
  private listeners: EventListener[] = [];

  getQuestCount(): number {
    return this.quests.size;
  }

  addQuest(
    def: Omit<QuestDef, 'status' | 'elapsed' | 'completionCount'> & {
      status?: QuestDef['status'];
      elapsed?: number;
      completionCount?: number;
    }
  ): QuestDef {
    const hasUnmetPrereqs =
      def.prerequisites.length > 0 &&
      def.prerequisites.some((pid) => {
        const prereq = this.quests.get(pid);
        return !prereq || prereq.status !== 'completed';
      });

    const quest: QuestDef = {
      ...def,
      objectives: def.objectives.map((o) => ({ ...o })),
      status: hasUnmetPrereqs ? 'locked' : 'available',
      elapsed: 0,
      completionCount: 0,
    };
    this.quests.set(quest.id, quest);
    return quest;
  }

  getQuest(id: string): QuestDef | undefined {
    return this.quests.get(id);
  }

  removeQuest(id: string): boolean {
    return this.quests.delete(id);
  }

  activate(id: string): boolean {
    const q = this.quests.get(id);
    if (!q || q.status !== 'available') return false;
    q.status = 'active';
    q.elapsed = 0;
    this.emit('activated');
    return true;
  }

  abandon(id: string): boolean {
    const q = this.quests.get(id);
    if (!q || q.status !== 'active') return false;
    q.status = 'available';
    q.elapsed = 0;
    for (const obj of q.objectives) {
      obj.current = 0;
      obj.completed = false;
    }
    return true;
  }

  updateObjective(questId: string, objectiveId: string, amount: number): boolean {
    const q = this.quests.get(questId);
    if (!q || q.status !== 'active') return false;
    const obj = q.objectives.find((o) => o.id === objectiveId);
    if (!obj) return false;

    obj.current = Math.min(obj.current + amount, obj.required);
    if (obj.current >= obj.required) {
      obj.completed = true;
      this.emit('objective_completed');
    }

    // Check if all required objectives are completed
    const allRequired = q.objectives.filter((o) => !o.optional);
    if (allRequired.every((o) => o.completed)) {
      q.status = 'completed';
      q.completionCount++;
      this.emit('completed');
    }

    return true;
  }

  update(dt: number): void {
    for (const q of this.quests.values()) {
      if (q.status !== 'active') continue;
      if (q.timeLimit > 0) {
        q.elapsed += dt;
        if (q.elapsed >= q.timeLimit) {
          q.status = 'failed';
          this.emit('failed');
        }
      }
    }
  }

  recheckAll(): void {
    for (const q of this.quests.values()) {
      if (q.status !== 'locked') continue;
      const allMet = q.prerequisites.every((pid) => {
        const prereq = this.quests.get(pid);
        return prereq && prereq.status === 'completed';
      });
      if (allMet) {
        q.status = 'available';
      }
    }
  }

  onEvent(listener: EventListener): void {
    this.listeners.push(listener);
  }

  getByStatus(status: QuestDef['status']): QuestDef[] {
    return [...this.quests.values()].filter((q) => q.status === status);
  }

  getByCategory(category: string): QuestDef[] {
    return [...this.quests.values()].filter((q) => q.category === category);
  }

  getProgress(questId: string): number {
    const q = this.quests.get(questId);
    if (!q) return 0;
    const required = q.objectives.filter((o) => !o.optional);
    if (required.length === 0) return 0;
    const completed = required.filter((o) => o.completed).length;
    return completed / required.length;
  }

  getActiveCount(): number {
    return this.getByStatus('active').length;
  }

  getCompletedCount(): number {
    return this.getByStatus('completed').length;
  }

  private emit(event: string): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
