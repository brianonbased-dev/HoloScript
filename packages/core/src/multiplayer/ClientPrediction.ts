/**
 * ClientPrediction.ts
 *
 * Client-side prediction: input buffering, predictive state,
 * server reconciliation with rollback, and misprediction metrics.
 *
 * @module multiplayer
 */

// =============================================================================
// TYPES
// =============================================================================

export interface InputFrame {
  sequence: number;
  deltaTime: number;
  actions: Record<string, number>; // e.g. { moveX: 1, jump: 1 }
}

export interface PredictedState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export type PredictionFn = (state: PredictedState, input: InputFrame) => PredictedState;

// =============================================================================
// CLIENT PREDICTION
// =============================================================================

export class ClientPrediction {
  private pendingInputs: InputFrame[] = [];
  private currentState: PredictedState;
  private lastAckedSequence = -1;
  private predict: PredictionFn;
  private mispredictions = 0;
  private maxPending = 120;

  constructor(initialState: PredictedState, predictor: PredictionFn) {
    this.currentState = { ...initialState };
    this.predict = predictor;
  }

  // ---------------------------------------------------------------------------
  // Input Processing
  // ---------------------------------------------------------------------------

  pushInput(input: InputFrame): PredictedState {
    this.pendingInputs.push(input);
    if (this.pendingInputs.length > this.maxPending) this.pendingInputs.shift();

    this.currentState = this.predict(this.currentState, input);
    return { ...this.currentState };
  }

  // ---------------------------------------------------------------------------
  // Server Reconciliation
  // ---------------------------------------------------------------------------

  reconcile(serverState: PredictedState, ackedSequence: number): PredictedState {
    const oldState = { ...this.currentState };

    // Discard acknowledged inputs
    this.pendingInputs = this.pendingInputs.filter((i) => i.sequence > ackedSequence);
    this.lastAckedSequence = ackedSequence;

    // Re-predict from server state
    let state = { ...serverState };
    for (const input of this.pendingInputs) {
      state = this.predict(state, input);
    }

    // Check for misprediction
    const dx = state.x - oldState.x,
      dy = state.y - oldState.y,
      dz = state.z - oldState.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) > 0.01) this.mispredictions++;

    this.currentState = state;
    return { ...this.currentState };
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getState(): PredictedState {
    return { ...this.currentState };
  }
  getPendingCount(): number {
    return this.pendingInputs.length;
  }
  getMispredictions(): number {
    return this.mispredictions;
  }
  getLastAckedSequence(): number {
    return this.lastAckedSequence;
  }
}
