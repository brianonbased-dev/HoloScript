// Common types shared across all attack PoCs.
// Spec source: research/paper-21-ati/threat-model.md §3 (capabilities) + §4 (specs).

export type AttackId =
  | 'whitewasher'
  | 'sybil'
  | 'score-manipulator'
  | 'slow-poisoner'
  | 'eclipse';

// What the attacker observes about the system (per §3 capability matrix).
// In sandbox mode, the testbed mediates these observations.
export interface AttackContext {
  // §3: "Observes own trust score (black-box)" — every attacker has this.
  observeOwnTrust(): number;
  // §3: "Knows trust formula (white-box)" — published spec from Paper 1.
  readonly trustFormulaSpec: string;
  // Sandbox testbed identifier — verifiable that this is NOT a live mesh.
  readonly sandboxId: string;
}

// One round of attack execution. Captured as data so success metrics can be
// computed per §4.X spec without coupling to runtime state.
export interface AttackResult {
  readonly attackId: AttackId;
  readonly round: number;
  readonly outputAccepted: boolean;
  readonly trustAtAttack: number;
  readonly observedSuccessMetric: boolean;
  readonly notes?: string;
}

// Common interface for all 5 attack classes. Implementations land in the
// per-attack ATI-3-* board tasks; this scaffold ships stubs only.
export interface AdversarialAttack {
  readonly id: AttackId;
  // Pointer back to the spec section in research/paper-21-ati/threat-model.md.
  readonly specReference: string;
  // §4.X "Preconditions" enumerated as strings — test harness asserts these
  // hold before invoking step().
  readonly preconditions: readonly string[];
  // Execute one attack round; emit one AttackResult.
  step(context: AttackContext, round: number): AttackResult;
  // Compute success per §4.X "Success metric" against the result history.
  evaluateSuccess(history: readonly AttackResult[]): boolean;
}
