/**
 * UtilityAI.ts
 *
 * Utility-based AI: action scoring with consideration curves,
 * weighted selection, cooldowns, and action history.
 *
 * @module ai
 */

// =============================================================================
// TYPES
// =============================================================================

export type CurveType = 'linear' | 'quadratic' | 'logistic' | 'step';

export interface Consideration {
  name: string;
  input: () => number; // 0-1 normalized input
  curve: CurveType;
  weight: number;
  invert: boolean;
}

export interface UtilityAction {
  id: string;
  name: string;
  considerations: Consideration[];
  cooldown: number; // Seconds
  lastExecuted: number;
  bonus: number; // Flat score bonus
  execute: () => void;
}

// =============================================================================
// UTILITY AI
// =============================================================================

export class UtilityAI {
  private actions: Map<string, UtilityAction> = new Map();
  private history: Array<{ actionId: string; score: number; timestamp: number }> = [];
  private maxHistory = 50;
  private currentTime = 0;

  // ---------------------------------------------------------------------------
  // Action Management
  // ---------------------------------------------------------------------------

  addAction(action: UtilityAction): void {
    this.actions.set(action.id, action);
  }
  removeAction(id: string): void {
    this.actions.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------------

  scoreAction(action: UtilityAction): number {
    if (this.currentTime - action.lastExecuted < action.cooldown) return 0;

    let score = 1;
    for (const c of action.considerations) {
      let input = Math.max(0, Math.min(1, c.input()));
      if (c.invert) input = 1 - input;

      let value: number;
      switch (c.curve) {
        case 'linear':
          value = input;
          break;
        case 'quadratic':
          value = input * input;
          break;
        case 'logistic':
          value = 1 / (1 + Math.exp(-10 * (input - 0.5)));
          break;
        case 'step':
          value = input >= 0.5 ? 1 : 0;
          break;
      }

      score *= value * c.weight;
    }

    return score + action.bonus;
  }

  scoreAll(): Array<{ actionId: string; score: number }> {
    const scores: Array<{ actionId: string; score: number }> = [];
    for (const action of this.actions.values()) {
      scores.push({ actionId: action.id, score: this.scoreAction(action) });
    }
    return scores.sort((a, b) => b.score - a.score);
  }

  // ---------------------------------------------------------------------------
  // Selection & Execution
  // ---------------------------------------------------------------------------

  selectBest(): UtilityAction | null {
    let bestAction: UtilityAction | null = null;
    let bestScore = -Infinity;

    for (const action of this.actions.values()) {
      const score = this.scoreAction(action);
      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }

    return bestAction;
  }

  executeBest(): string | null {
    const action = this.selectBest();
    if (!action || this.scoreAction(action) <= 0) return null;

    action.execute();
    action.lastExecuted = this.currentTime;
    this.history.push({
      actionId: action.id,
      score: this.scoreAction(action),
      timestamp: this.currentTime,
    });
    if (this.history.length > this.maxHistory) this.history.shift();

    return action.id;
  }

  // ---------------------------------------------------------------------------
  // Time
  // ---------------------------------------------------------------------------

  setTime(time: number): void {
    this.currentTime = time;
  }
  getHistory() {
    return [...this.history];
  }
  getActionCount(): number {
    return this.actions.size;
  }
}
