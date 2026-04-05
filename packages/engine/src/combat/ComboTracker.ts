/**
 * ComboTracker.ts
 *
 * Input combo tracking: sequence matching, timing windows,
 * chain progression, and reset/timeout handling.
 *
 * @module combat
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ComboStep {
  input: string; // e.g. 'punch', 'kick', 'special'
  maxDelay: number; // Max ms between this step and the next
}

export interface ComboDefinition {
  id: string;
  name: string;
  steps: ComboStep[];
  reward: string; // Action to trigger on completion
}

export interface ComboState {
  comboId: string;
  currentStep: number;
  lastInputTime: number;
  completed: boolean;
}

// =============================================================================
// COMBO TRACKER
// =============================================================================

export class ComboTracker {
  private combos: ComboDefinition[] = [];
  private activeStates: ComboState[] = [];
  private completedCombos: string[] = [];
  private currentTime = 0;

  // ---------------------------------------------------------------------------
  // Combo Registration
  // ---------------------------------------------------------------------------

  registerCombo(combo: ComboDefinition): void {
    this.combos.push(combo);
  }

  // ---------------------------------------------------------------------------
  // Input Processing
  // ---------------------------------------------------------------------------

  pushInput(input: string, timestamp: number): string | null {
    this.currentTime = timestamp;
    this.completedCombos = [];

    // Advance active combos
    for (let i = this.activeStates.length - 1; i >= 0; i--) {
      const state = this.activeStates[i];
      const combo = this.combos.find((c) => c.id === state.comboId)!;
      const step = combo.steps[state.currentStep];

      // Check timing
      if (timestamp - state.lastInputTime > step.maxDelay) {
        this.activeStates.splice(i, 1);
        continue;
      }

      // Check input match
      if (step.input === input) {
        state.currentStep++;
        state.lastInputTime = timestamp;

        if (state.currentStep >= combo.steps.length) {
          state.completed = true;
          this.completedCombos.push(combo.reward);
          this.activeStates.splice(i, 1);
        }
      }
    }

    // Start new combo chains on matching first input
    for (const combo of this.combos) {
      if (combo.steps[0].input === input) {
        // Avoid duplicates
        const exists = this.activeStates.some((s) => s.comboId === combo.id && s.currentStep === 1);
        if (!exists) {
          if (combo.steps.length === 1) {
            this.completedCombos.push(combo.reward);
          } else {
            this.activeStates.push({
              comboId: combo.id,
              currentStep: 1,
              lastInputTime: timestamp,
              completed: false,
            });
          }
        }
      }
    }

    return this.completedCombos.length > 0 ? this.completedCombos[0] : null;
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  tick(timestamp: number): void {
    this.currentTime = timestamp;
    // Clean up timed-out combos
    this.activeStates = this.activeStates.filter((state) => {
      const combo = this.combos.find((c) => c.id === state.comboId)!;
      const step = combo.steps[state.currentStep];
      return timestamp - state.lastInputTime <= step.maxDelay;
    });
  }

  getActiveComboCount(): number {
    return this.activeStates.length;
  }
  getCompletedCombos(): string[] {
    return [...this.completedCombos];
  }
  reset(): void {
    this.activeStates = [];
    this.completedCombos = [];
  }
}

