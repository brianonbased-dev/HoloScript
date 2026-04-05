/**
 * BarkManager.ts
 *
 * Contextual bark system: priority queuing, cooldowns,
 * proximity triggers, and random variation.
 *
 * @module dialogue
 */

// =============================================================================
// TYPES
// =============================================================================

export interface BarkDefinition {
  id: string;
  context: string; // e.g. 'combat_start', 'item_found', 'idle'
  lines: string[]; // Random selection pool
  priority: number; // Higher = more important
  cooldown: number; // Seconds before this bark can play again
  maxRange: number; // Proximity trigger range (0 = no range check)
}

export interface ActiveBark {
  definitionId: string;
  line: string;
  speakerId: string;
  timestamp: number;
}

// =============================================================================
// BARK MANAGER
// =============================================================================

export class BarkManager {
  private definitions: Map<string, BarkDefinition> = new Map();
  private cooldowns: Map<string, number> = new Map(); // defId → last played time
  private queue: ActiveBark[] = [];
  private maxQueue = 3;
  private currentTime = 0;

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  registerBark(def: BarkDefinition): void {
    this.definitions.set(def.id, def);
  }

  // ---------------------------------------------------------------------------
  // Triggering
  // ---------------------------------------------------------------------------

  trigger(
    context: string,
    speakerId: string,
    speakerX = 0,
    speakerY = 0,
    listenerX = 0,
    listenerY = 0
  ): ActiveBark | null {
    // Find matching barks
    const candidates: BarkDefinition[] = [];

    for (const def of this.definitions.values()) {
      if (def.context !== context) continue;

      // Cooldown check
      const lastPlayed = this.cooldowns.get(def.id) ?? -Infinity;
      if (this.currentTime - lastPlayed < def.cooldown) continue;

      // Range check
      if (def.maxRange > 0) {
        const dx = speakerX - listenerX,
          dy = speakerY - listenerY;
        if (Math.sqrt(dx * dx + dy * dy) > def.maxRange) continue;
      }

      candidates.push(def);
    }

    if (candidates.length === 0) return null;

    // Pick highest priority (ties broken randomly)
    candidates.sort((a, b) => b.priority - a.priority);
    const best = candidates[0];

    // Random line selection
    const line = best.lines[Math.floor(Math.random() * best.lines.length)];

    const bark: ActiveBark = {
      definitionId: best.id,
      line,
      speakerId,
      timestamp: this.currentTime,
    };

    this.cooldowns.set(best.id, this.currentTime);

    // Queue management
    this.queue.push(bark);
    if (this.queue.length > this.maxQueue) this.queue.shift();

    return bark;
  }

  // ---------------------------------------------------------------------------
  // Time
  // ---------------------------------------------------------------------------

  tick(time: number): void {
    this.currentTime = time;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getQueue(): ActiveBark[] {
    return [...this.queue];
  }
  getQueueLength(): number {
    return this.queue.length;
  }
  clearQueue(): void {
    this.queue = [];
  }
  isOnCooldown(defId: string): boolean {
    const def = this.definitions.get(defId);
    if (!def) return false;
    const last = this.cooldowns.get(defId) ?? -Infinity;
    return this.currentTime - last < def.cooldown;
  }
}

