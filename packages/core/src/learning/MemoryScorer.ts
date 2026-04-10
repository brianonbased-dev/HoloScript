/**
 * MemoryScorer
 *
 * Generates an 'importance' dimensional scalar for Episodic memories.
 * Allows the aggregation engine to aggressively prune trivial loops (like 'Idle')
 * and permanently archive high-value bounds (like 'Combat' or 'Crafting').
 */

export interface EpisodicEvent {
  agentId: string;
  timestamp: number;
  action: string;
  context: Record<string, any>;
  outcome: string;
}

export class MemoryScorer {
  /**
   * Scores an event from -100 (Absolute Noise) to 100 (Critical Experience).
   */
  static computeImportance(event: EpisodicEvent): number {
    let score = 0;

    // 1. Action Density Weighting
    const action = event.action.toLowerCase();
    if (action.includes('idle') || action.includes('wait') || action.includes('sleep')) {
      score -= 50;
    } else if (action.includes('move') || action.includes('look') || action.includes('walk')) {
      score -= 10;
    } else if (action.includes('craft') || action.includes('build') || action.includes('analyze')) {
      score += 30;
    } else if (
      action.includes('combat') ||
      action.includes('attack') ||
      action.includes('defense') ||
      action.includes('damage')
    ) {
      score += 50;
    }

    // 2. Context Entropy (More complex context = higher density value)
    const contextKeys = Object.keys(event.context || {}).length;
    score += Math.min(20, contextKeys * 2);

    // 3. Outcome Variance (Is the outcome signifying a concrete change?)
    const outcome = event.outcome.toLowerCase();
    if (outcome.includes('failed') || outcome.includes('error')) {
      score += 25; // Agent failures are important for negative reinforcement
    } else if (
      outcome.includes('success') ||
      outcome.includes('crafted') ||
      outcome.includes('killed')
    ) {
      score += 25; // Major achievements are important for positive reinforcement
    } else if (outcome.includes('nothing') || outcome.includes('none')) {
      score -= 20; // Zero variance
    }

    // Clamp between -100 and 100
    return Math.max(-100, Math.min(100, score));
  }

  /**
   * Filters arrays natively discarding negative arrays
   */
  static cullLowImportance(events: EpisodicEvent[], threshold: number = 0): EpisodicEvent[] {
    return events.filter((e) => this.computeImportance(e) >= threshold);
  }
}
