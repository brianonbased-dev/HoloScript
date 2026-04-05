/**
 * BehaviorSelector.ts
 *
 * Behavior selection: weighted random, priority-based, and
 * conditional behavior picking with fallbacks and lockout timers.
 *
 * @module ai
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Behavior {
  id: string;
  name: string;
  weight: number;
  priority: number;
  condition?: () => boolean;
  action: () => void;
  lockoutMs: number; // Minimum time between executions
  lastExecuted: number;
}

export type SelectionMode = 'priority' | 'weighted' | 'sequential';

// =============================================================================
// BEHAVIOR SELECTOR
// =============================================================================

export class BehaviorSelector {
  private behaviors: Behavior[] = [];
  private mode: SelectionMode;
  private currentIndex = 0;
  private currentTime = 0;
  private fallback: Behavior | null = null;
  private history: Array<{ behaviorId: string; timestamp: number }> = [];
  private maxHistory = 50;

  constructor(mode: SelectionMode = 'priority') {
    this.mode = mode;
  }

  // ---------------------------------------------------------------------------
  // Behavior Management
  // ---------------------------------------------------------------------------

  addBehavior(behavior: Behavior): void {
    this.behaviors.push(behavior);
  }
  removeBehavior(id: string): void {
    this.behaviors = this.behaviors.filter((b) => b.id !== id);
  }
  setFallback(behavior: Behavior): void {
    this.fallback = behavior;
  }
  setMode(mode: SelectionMode): void {
    this.mode = mode;
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  select(): Behavior | null {
    const available = this.getAvailable();
    if (available.length === 0) return this.fallback;

    switch (this.mode) {
      case 'priority':
        return this.selectByPriority(available);
      case 'weighted':
        return this.selectByWeight(available);
      case 'sequential':
        return this.selectSequential(available);
    }
  }

  private getAvailable(): Behavior[] {
    return this.behaviors.filter((b) => {
      if (this.currentTime - b.lastExecuted < b.lockoutMs) return false;
      if (b.condition && !b.condition()) return false;
      return true;
    });
  }

  private selectByPriority(behaviors: Behavior[]): Behavior {
    return behaviors.reduce((best, b) => (b.priority > best.priority ? b : best));
  }

  private selectByWeight(behaviors: Behavior[]): Behavior {
    const totalWeight = behaviors.reduce((sum, b) => sum + b.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const b of behaviors) {
      roll -= b.weight;
      if (roll <= 0) return b;
    }
    return behaviors[behaviors.length - 1];
  }

  private selectSequential(behaviors: Behavior[]): Behavior {
    this.currentIndex = this.currentIndex % behaviors.length;
    return behaviors[this.currentIndex++];
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  execute(): string | null {
    const behavior = this.select();
    if (!behavior) return null;

    behavior.action();
    behavior.lastExecuted = this.currentTime;
    this.history.push({ behaviorId: behavior.id, timestamp: this.currentTime });
    if (this.history.length > this.maxHistory) this.history.shift();

    return behavior.id;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  setTime(time: number): void {
    this.currentTime = time;
  }
  getBehaviorCount(): number {
    return this.behaviors.length;
  }
  getHistory() {
    return [...this.history];
  }
}
