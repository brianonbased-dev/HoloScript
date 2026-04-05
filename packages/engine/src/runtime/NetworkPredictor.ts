/**
 * @holoscript/core Network Predictor
 *
 * Implements client-side prediction and server-authoritative reconciliation.
 * Handles input buffering and state rollback for smooth multi-user interactions.
 */

// Removed unused import
export interface NetworkInput {
  sequenceNumber: number;
  timestamp: number;
  data: any;
}

export interface NetworkState<T> {
  sequenceNumber: number;
  state: T;
}

export class NetworkPredictor<T extends Record<string, any>> {
  private inputBuffer: NetworkInput[] = [];
  private stateBuffer: NetworkState<T>[] = [];
  private lastConfirmedSequence: number = -1;
  private predictedState: T;
  private confirmedState: T;

  private rtt: number = 0;
  private jitter: number = 0;
  private lastPingTime: number = 0;

  constructor(initialState: T) {
    this.predictedState = { ...initialState };
    this.confirmedState = { ...initialState };
    this.stateBuffer.push({ sequenceNumber: 0, state: { ...initialState } });
  }

  /**
   * Add a local input and predict the resulting state immediately.
   */
  public predict(input: any, applyFn: (state: T, input: any) => void): T {
    const seq = ++this.lastConfirmedSequence;
    const networkInput: NetworkInput = {
      sequenceNumber: seq,
      timestamp: performance.now(),
      data: input,
    };

    this.inputBuffer.push(networkInput);

    // Apply to current predicted state
    applyFn(this.predictedState, input);

    // Store in state buffer for potential rollback
    this.stateBuffer.push({
      sequenceNumber: seq,
      state: JSON.parse(JSON.stringify(this.predictedState)),
    });

    // Cleanup buffer (keep last 2 seconds of state at 60fps)
    if (this.stateBuffer.length > 120) {
      this.stateBuffer.shift();
    }

    return this.predictedState;
  }

  /**
   * Reconcile local state with authoritative server state.
   */
  public reconcile(serverState: NetworkState<T>, applyFn: (state: T, input: any) => void): T {
    // 1. Update confirmed state
    this.confirmedState = JSON.parse(JSON.stringify(serverState.state));

    // 2. Remove acknowledged inputs
    this.inputBuffer = this.inputBuffer.filter(
      (i) => i.sequenceNumber > serverState.sequenceNumber
    );

    // 3. Re-play unacknowledged inputs on top of confirmed state
    const newState = JSON.parse(JSON.stringify(this.confirmedState));
    for (const input of this.inputBuffer) {
      applyFn(newState, input.data);
    }

    this.predictedState = newState;
    return this.predictedState;
  }

  /**
   * Update network metrics for adaptive prediction.
   */
  public updateMetrics(serverTimestamp: number): void {
    const now = performance.now();
    const currentRtt = now - serverTimestamp;

    this.jitter = Math.abs(currentRtt - this.rtt) * 0.1 + this.jitter * 0.9;
    this.rtt = currentRtt * 0.1 + this.rtt * 0.9;
  }

  public getPredictionHorizon(): number {
    return this.rtt / 2 + this.jitter * 2;
  }

  public getPredictedState(): T {
    return this.predictedState;
  }
}
