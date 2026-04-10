/**
 * ComboTracker — input sequence matching with timing windows,
 * multi-combo tracking, timeout cleanup.
 */

export interface ComboStep {
  input: string;
  maxDelay: number; // ms
}

export interface ComboDefinition {
  id: string;
  name: string;
  steps: ComboStep[];
  reward: string;
}

interface ActiveCombo {
  defId: string;
  currentStep: number;
  lastInputTime: number;
}

export class ComboTracker {
  private definitions: Map<string, ComboDefinition> = new Map();
  private active: ActiveCombo[] = [];
  private completedRewards: string[] = [];

  registerCombo(def: ComboDefinition): void {
    this.definitions.set(def.id, { ...def, steps: [...def.steps] });
  }

  pushInput(input: string, timestamp: number): string | null {
    this.completedRewards = [];
    let firstReward: string | null = null;

    // Try to advance existing active combos
    const surviving: ActiveCombo[] = [];
    for (const ac of this.active) {
      const def = this.definitions.get(ac.defId)!;
      const step = def.steps[ac.currentStep];
      const delay = timestamp - ac.lastInputTime;

      if (delay > step.maxDelay) {
        // Timed out — drop this active combo
        continue;
      }

      if (step.input === input) {
        ac.currentStep++;
        ac.lastInputTime = timestamp;
        if (ac.currentStep >= def.steps.length) {
          // Completed!
          this.completedRewards.push(def.reward);
          if (!firstReward) firstReward = def.reward;
          // Don't keep it active
        } else {
          surviving.push(ac);
        }
      }
      // Wrong input — drop this active combo (don't push to surviving)
    }
    this.active = surviving;

    // Try to start new combos with this input
    for (const def of this.definitions.values()) {
      // Don't start a new tracker if we already have one active for this combo
      if (this.active.some((a) => a.defId === def.id)) continue;

      if (def.steps[0].input === input) {
        if (def.steps.length === 1) {
          // Single-step combo completes immediately
          this.completedRewards.push(def.reward);
          if (!firstReward) firstReward = def.reward;
        } else {
          this.active.push({
            defId: def.id,
            currentStep: 1,
            lastInputTime: timestamp,
          });
        }
      }
    }

    return firstReward;
  }

  tick(currentTime: number): void {
    this.active = this.active.filter((ac) => {
      const def = this.definitions.get(ac.defId)!;
      const step = def.steps[ac.currentStep];
      const elapsed = currentTime - ac.lastInputTime;
      return elapsed <= step.maxDelay;
    });
  }

  reset(): void {
    this.active = [];
    this.completedRewards = [];
  }

  getActiveComboCount(): number {
    return this.active.length;
  }

  getCompletedCombos(): string[] {
    return [...this.completedRewards];
  }
}
