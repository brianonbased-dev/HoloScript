/**
 * ChoiceManager.ts
 *
 * Player choice tracking: consequence scoring, memory,
 * reputation effects, and branching history.
 *
 * @module dialogue
 */

// =============================================================================
// TYPES
// =============================================================================

export interface PlayerChoice {
  id: string;
  dialogueId: string;
  nodeId: string;
  choiceText: string;
  timestamp: number;
  consequences: ChoiceConsequence[];
}

export interface ChoiceConsequence {
  type: 'reputation' | 'variable' | 'flag' | 'relationship';
  target: string;
  value: number | string | boolean;
}

export interface ReputationEntry {
  faction: string;
  value: number;
  history: Array<{ change: number; reason: string; timestamp: number }>;
}

export interface RelationshipEntry {
  character: string;
  affinity: number;
  history: Array<{ change: number; reason: string; timestamp: number }>;
}

// =============================================================================
// CHOICE MANAGER
// =============================================================================

export class ChoiceManager {
  private choices: PlayerChoice[] = [];
  private flags: Map<string, boolean> = new Map();
  private reputations: Map<string, ReputationEntry> = new Map();
  private relationships: Map<string, RelationshipEntry> = new Map();

  // ---------------------------------------------------------------------------
  // Record Choice
  // ---------------------------------------------------------------------------

  recordChoice(
    dialogueId: string,
    nodeId: string,
    choiceText: string,
    consequences: ChoiceConsequence[] = []
  ): PlayerChoice {
    const choice: PlayerChoice = {
      id: `choice_${this.choices.length}`,
      dialogueId,
      nodeId,
      choiceText,
      timestamp: Date.now(),
      consequences,
    };
    this.choices.push(choice);

    // Apply consequences
    for (const c of consequences) {
      switch (c.type) {
        case 'reputation':
          this.modifyReputation(c.target, c.value as number, choiceText);
          break;
        case 'relationship':
          this.modifyRelationship(c.target, c.value as number, choiceText);
          break;
        case 'flag':
          this.flags.set(c.target, c.value as boolean);
          break;
      }
    }

    return choice;
  }

  // ---------------------------------------------------------------------------
  // Reputation
  // ---------------------------------------------------------------------------

  private modifyReputation(faction: string, change: number, reason: string): void {
    if (!this.reputations.has(faction)) {
      this.reputations.set(faction, { faction, value: 0, history: [] });
    }
    const rep = this.reputations.get(faction)!;
    rep.value += change;
    rep.history.push({ change, reason, timestamp: Date.now() });
  }

  getReputation(faction: string): number {
    return this.reputations.get(faction)?.value ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Relationships
  // ---------------------------------------------------------------------------

  private modifyRelationship(character: string, change: number, reason: string): void {
    if (!this.relationships.has(character)) {
      this.relationships.set(character, { character, affinity: 0, history: [] });
    }
    const rel = this.relationships.get(character)!;
    rel.affinity += change;
    rel.history.push({ change, reason, timestamp: Date.now() });
  }

  getRelationship(character: string): number {
    return this.relationships.get(character)?.affinity ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Flags
  // ---------------------------------------------------------------------------

  setFlag(name: string, value = true): void {
    this.flags.set(name, value);
  }
  getFlag(name: string): boolean {
    return this.flags.get(name) ?? false;
  }
  hasFlag(name: string): boolean {
    return this.flags.has(name);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getChoiceCount(): number {
    return this.choices.length;
  }

  getChoicesForDialogue(dialogueId: string): PlayerChoice[] {
    return this.choices.filter((c) => c.dialogueId === dialogueId);
  }

  hasChosen(dialogueId: string, nodeId: string): boolean {
    return this.choices.some((c) => c.dialogueId === dialogueId && c.nodeId === nodeId);
  }

  getRecentChoices(count: number): PlayerChoice[] {
    return this.choices.slice(-count);
  }

  getAllReputations(): Map<string, ReputationEntry> {
    return new Map(this.reputations);
  }
  getAllRelationships(): Map<string, RelationshipEntry> {
    return new Map(this.relationships);
  }
}

