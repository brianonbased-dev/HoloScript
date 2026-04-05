/**
 * LatencyCompensation.ts
 *
 * Three-tier prediction + smooth correction system for Hololand multiplayer.
 * Handles players with 0–500ms+ RTT gracefully.
 *
 * Tier 1 (0-100ms):  Standard client-side prediction with server reconciliation
 * Tier 2 (100-300ms): Input prediction — predict what the player will do next
 *                      based on recent input patterns (locomotion RNN-like heuristic)
 * Tier 3 (300ms+):    Intent prediction — predict higher-level actions based on
 *                      proximity to interactables, gaze direction, trajectory
 *
 * Correction blending uses threshold tiers to avoid visible snapping:
 *   error < 0.1m → invisible (no correction needed)
 *   error < 0.5m → exponential blend over 200ms
 *   error < 2.0m → Bezier curve correction over 300ms
 *   error > 2.0m → snap position, smooth velocity over 100ms
 *
 * @module network
 */

import type {
  IVector3,
  IQuaternion,
  IInputCommand,
  IPredictionState as _IPredictionState,
} from './NetworkTypes';
import { lerpVector3, slerpQuaternion, distanceVector3 } from './NetworkTypes';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Prediction tier based on measured latency
 */
export type PredictionTier = 'standard' | 'input' | 'intent';

/**
 * Correction threshold configuration
 */
export interface ICorrectionThresholds {
  /** Errors below this are invisible — no correction applied (meters) */
  invisible: number;
  /** Errors below this use smooth exponential blend */
  small: number;
  /** Errors below this use Bezier curve correction */
  medium: number;
  /** Errors above medium → snap position, smooth velocity */
}

/**
 * Latency compensation configuration
 */
export interface ILatencyCompConfig {
  /** Maximum prediction horizon in milliseconds */
  maxHorizon: number;
  /** Safety margin added to prediction horizon (ms) */
  safetyMargin: number;
  /** How often to recalculate the adaptive horizon (ms) */
  horizonUpdateInterval: number;
  /** Maximum divergence time before forced snap (ms) */
  maxDivergenceTime: number;
  /** Correction blend durations (ms) */
  blendDurations: {
    small: number;
    medium: number;
    snap: number;
  };
  /** Correction thresholds (meters) */
  thresholds: ICorrectionThresholds;
  /** Maximum corrections to apply per frame */
  correctionBudgetPerFrame: number;
  /** Input history buffer size */
  inputHistorySize: number;
  /** State snapshot history size */
  stateHistorySize: number;
  /** Whether this is the local player (gets priority treatment) */
  isLocalPlayer: boolean;
}

/**
 * Default latency compensation configuration
 */
export const DEFAULT_LATENCY_CONFIG: ILatencyCompConfig = {
  maxHorizon: 1000,
  safetyMargin: 100,
  horizonUpdateInterval: 5000,
  maxDivergenceTime: 3000,
  blendDurations: {
    small: 200,
    medium: 300,
    snap: 100,
  },
  thresholds: {
    invisible: 0.1,
    small: 0.5,
    medium: 2.0,
  },
  correctionBudgetPerFrame: 3,
  inputHistorySize: 256,
  stateHistorySize: 128,
  isLocalPlayer: false,
};

// =============================================================================
// Entity State
// =============================================================================

/**
 * Predicted entity state for interpolation/extrapolation
 */
export interface IPredictedEntityState {
  position: IVector3;
  rotation: IQuaternion;
  velocity: IVector3;
  angularVelocity: IVector3;
  timestamp: number;
  tick: number;
  confidence: number; // 0-1, how confident the prediction is
}

/**
 * Correction currently being applied
 */
export interface IActiveCorrection {
  startPosition: IVector3;
  targetPosition: IVector3;
  startRotation: IQuaternion;
  targetRotation: IQuaternion;
  startTime: number;
  duration: number;
  elapsed: number;
  type: 'exponential' | 'bezier' | 'snap';
}

/**
 * RTT measurement for adaptive horizon
 */
export interface IRTTSample {
  rtt: number;
  timestamp: number;
}

// =============================================================================
// Input Pattern Analyzer (Tier 2)
// =============================================================================

/**
 * Analyzes recent input patterns to predict future inputs.
 * Uses a sliding window of recent inputs to detect locomotion patterns
 * (running, turning, jumping) and extrapolate.
 */
export class InputPatternAnalyzer {
  private inputHistory: IInputCommand[] = [];
  private maxHistory: number;

  constructor(maxHistory: number = 64) {
    this.maxHistory = maxHistory;
  }

  /** Record a new input command */
  public recordInput(input: IInputCommand): void {
    this.inputHistory.push(input);
    if (this.inputHistory.length > this.maxHistory) {
      this.inputHistory.shift();
    }
  }

  /**
   * Predict the next input based on recent patterns.
   * Returns a predicted input command with confidence score.
   */
  public predictNextInput(
    currentTick: number
  ): { input: IInputCommand; confidence: number } | null {
    if (this.inputHistory.length < 3) return null;

    const recent = this.inputHistory.slice(-8);

    // Extract movement direction consistency
    let consistentDirection = true;
    let avgMoveX = 0,
      avgMoveZ = 0;
    let hasMovement = false;

    for (const inp of recent) {
      const mx = (inp.inputs.moveX as number) ?? 0;
      const mz = (inp.inputs.moveZ as number) ?? 0;
      if (Math.abs(mx) > 0.1 || Math.abs(mz) > 0.1) {
        hasMovement = true;
        avgMoveX += mx;
        avgMoveZ += mz;
      }
    }

    if (!hasMovement) {
      // Player is stationary — predict they stay stationary (high confidence)
      return {
        input: {
          tick: currentTick + 1,
          timestamp: Date.now(),
          inputs: { moveX: 0, moveZ: 0, jump: false, action: false },
          sequenceNumber: -1,
        },
        confidence: 0.9,
      };
    }

    avgMoveX /= recent.length;
    avgMoveZ /= recent.length;

    // Check consistency of direction
    for (const inp of recent) {
      const mx = (inp.inputs.moveX as number) ?? 0;
      const mz = (inp.inputs.moveZ as number) ?? 0;
      if (
        hasMovement &&
        (Math.sign(mx) !== Math.sign(avgMoveX) || Math.sign(mz) !== Math.sign(avgMoveZ))
      ) {
        consistentDirection = false;
      }
    }

    // Confidence based on consistency
    const confidence = consistentDirection ? 0.8 : 0.5;

    return {
      input: {
        tick: currentTick + 1,
        timestamp: Date.now(),
        inputs: {
          moveX: avgMoveX,
          moveZ: avgMoveZ,
          jump: false,
          action: false,
        },
        sequenceNumber: -1,
      },
      confidence,
    };
  }

  /** Clear history */
  public clear(): void {
    this.inputHistory = [];
  }
}

// =============================================================================
// Intent Predictor (Tier 3)
// =============================================================================

/**
 * Interactable object that can be targeted by intent prediction
 */
export interface IInteractable {
  id: string;
  position: IVector3;
  radius: number; // Interaction radius
  type: 'door' | 'pickup' | 'npc' | 'button' | 'teleport' | 'generic';
}

/**
 * Predicts high-level player intent based on movement trajectory,
 * proximity to interactables, and gaze direction.
 */
export class IntentPredictor {
  private interactables: IInteractable[] = [];
  private trajectoryHistory: Array<{ position: IVector3; timestamp: number }> = [];
  private maxTrajectoryHistory = 30; // ~1 second at 30fps

  /** Register interactable objects in the scene */
  public setInteractables(interactables: IInteractable[]): void {
    this.interactables = interactables;
  }

  /** Record player position for trajectory analysis */
  public recordPosition(position: IVector3, timestamp: number): void {
    this.trajectoryHistory.push({ position, timestamp });
    if (this.trajectoryHistory.length > this.maxTrajectoryHistory) {
      this.trajectoryHistory.shift();
    }
  }

  /**
   * Predict player intent: which interactable they're heading toward.
   * Returns predicted target position and confidence.
   */
  public predictIntent(
    currentPosition: IVector3,
    currentVelocity: IVector3,
    gazeDirection?: IVector3,
    horizonMs: number = 1000
  ): { targetPosition: IVector3; confidence: number; interactableId?: string } | null {
    if (this.trajectoryHistory.length < 5) return null;
    if (this.interactables.length === 0) return null;

    const speed = Math.sqrt(
      currentVelocity.x ** 2 + currentVelocity.y ** 2 + currentVelocity.z ** 2
    );

    // Predict position along velocity vector
    const horizonSec = horizonMs / 1000;
    const predictedPos: IVector3 = {
      x: currentPosition.x + currentVelocity.x * horizonSec,
      y: currentPosition.y + currentVelocity.y * horizonSec,
      z: currentPosition.z + currentVelocity.z * horizonSec,
    };

    // Score each interactable by:
    // 1. Distance from predicted position
    // 2. Alignment with movement direction
    // 3. Alignment with gaze direction (if available)
    let bestScore = -Infinity;
    let bestInteractable: IInteractable | null = null;

    for (const obj of this.interactables) {
      const distFromPredicted = distanceVector3(predictedPos, obj.position);
      const distFromCurrent = distanceVector3(currentPosition, obj.position);

      // Skip if too far
      if (distFromCurrent > speed * horizonSec * 2 + obj.radius) continue;

      // Distance score (closer to predicted = higher)
      const distScore = Math.max(0, 1 - distFromPredicted / (speed * horizonSec + obj.radius));

      // Movement alignment score
      let moveAlignScore = 0;
      if (speed > 0.5) {
        const toObj: IVector3 = {
          x: obj.position.x - currentPosition.x,
          y: obj.position.y - currentPosition.y,
          z: obj.position.z - currentPosition.z,
        };
        const toObjLen = Math.sqrt(toObj.x ** 2 + toObj.y ** 2 + toObj.z ** 2);
        if (toObjLen > 0.01) {
          const dot =
            (currentVelocity.x * toObj.x +
              currentVelocity.y * toObj.y +
              currentVelocity.z * toObj.z) /
            (speed * toObjLen);
          moveAlignScore = Math.max(0, dot);
        }
      }

      // Gaze alignment score
      let gazeScore = 0.5; // Neutral if no gaze data
      if (gazeDirection) {
        const toObj: IVector3 = {
          x: obj.position.x - currentPosition.x,
          y: obj.position.y - currentPosition.y,
          z: obj.position.z - currentPosition.z,
        };
        const toObjLen = Math.sqrt(toObj.x ** 2 + toObj.y ** 2 + toObj.z ** 2);
        const gazeLen = Math.sqrt(
          gazeDirection.x ** 2 + gazeDirection.y ** 2 + gazeDirection.z ** 2
        );
        if (toObjLen > 0.01 && gazeLen > 0.01) {
          const dot =
            (gazeDirection.x * toObj.x + gazeDirection.y * toObj.y + gazeDirection.z * toObj.z) /
            (gazeLen * toObjLen);
          gazeScore = Math.max(0, dot);
        }
      }

      const totalScore = distScore * 0.3 + moveAlignScore * 0.4 + gazeScore * 0.3;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestInteractable = obj;
      }
    }

    if (!bestInteractable || bestScore < 0.3) return null;

    return {
      targetPosition: bestInteractable.position,
      confidence: Math.min(bestScore, 0.7), // Cap at 0.7 — intent is always uncertain
      interactableId: bestInteractable.id,
    };
  }

  /** Clear trajectory history */
  public clear(): void {
    this.trajectoryHistory = [];
  }
}

// =============================================================================
// Adaptive Horizon Calculator
// =============================================================================

/**
 * Calculates the prediction horizon based on rolling RTT and jitter measurements.
 * horizon = rtt + (jitter * 2) + safety_margin
 * Auto-adjusts every N seconds.
 */
export class AdaptiveHorizon {
  private rttSamples: IRTTSample[] = [];
  private maxSamples = 100;
  private currentHorizon: number;
  private config: ILatencyCompConfig;

  constructor(config: ILatencyCompConfig) {
    this.config = config;
    this.currentHorizon = 100; // Default 100ms
  }

  /** Record a new RTT measurement */
  public recordRTT(rtt: number): void {
    this.rttSamples.push({ rtt, timestamp: Date.now() });
    if (this.rttSamples.length > this.maxSamples) {
      this.rttSamples.shift();
    }
  }

  /** Get current prediction tier based on average RTT */
  public getTier(): PredictionTier {
    const avgRTT = this.getAverageRTT();
    if (avgRTT < 100) return 'standard';
    if (avgRTT < 300) return 'input';
    return 'intent';
  }

  /** Get average RTT from recent samples */
  public getAverageRTT(): number {
    if (this.rttSamples.length === 0) return 0;
    const sum = this.rttSamples.reduce((s, r) => s + r.rtt, 0);
    return sum / this.rttSamples.length;
  }

  /** Get jitter (P95 - P50 of RTT samples) */
  public getJitter(): number {
    if (this.rttSamples.length < 5) return 0;
    const sorted = this.rttSamples.map((r) => r.rtt).sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    return p95 - p50;
  }

  /** Recalculate and return the adaptive prediction horizon (ms) */
  public update(): number {
    const avgRTT = this.getAverageRTT();
    const jitter = this.getJitter();
    const horizon = avgRTT + jitter * 2 + this.config.safetyMargin;
    this.currentHorizon = Math.min(horizon, this.config.maxHorizon);
    return this.currentHorizon;
  }

  /** Get current horizon without recalculating */
  public getHorizon(): number {
    return this.currentHorizon;
  }
}

// =============================================================================
// Correction Blender
// =============================================================================

/**
 * Smooth correction blender with threshold-based tier selection.
 * Never corrects position and velocity simultaneously — snap one, smooth the other.
 */
export class CorrectionBlender {
  private activeCorrections: IActiveCorrection[] = [];
  private config: ILatencyCompConfig;

  constructor(config: ILatencyCompConfig) {
    this.config = config;
  }

  /**
   * Queue a correction based on error magnitude.
   * Returns the correction type that will be applied.
   */
  public queueCorrection(
    currentPosition: IVector3,
    serverPosition: IVector3,
    currentRotation: IQuaternion,
    serverRotation: IQuaternion
  ): 'none' | 'exponential' | 'bezier' | 'snap' {
    const error = distanceVector3(currentPosition, serverPosition);
    const { thresholds, blendDurations } = this.config;

    // Below invisible threshold — no correction needed
    if (error < thresholds.invisible) return 'none';

    // Respect correction budget
    if (this.activeCorrections.length >= this.config.correctionBudgetPerFrame) {
      return 'none';
    }

    let type: 'exponential' | 'bezier' | 'snap';
    let duration: number;

    if (error < thresholds.small) {
      type = 'exponential';
      duration = blendDurations.small;
    } else if (error < thresholds.medium) {
      type = 'bezier';
      duration = blendDurations.medium;
    } else {
      type = 'snap';
      duration = blendDurations.snap;
    }

    // For local player, increase durations (favor responsiveness)
    if (this.config.isLocalPlayer) {
      duration *= 1.5;
    }

    this.activeCorrections.push({
      startPosition: { ...currentPosition },
      targetPosition: { ...serverPosition },
      startRotation: { ...currentRotation },
      targetRotation: { ...serverRotation },
      startTime: Date.now(),
      duration,
      elapsed: 0,
      type,
    });

    return type;
  }

  /**
   * Advance all active corrections by dt milliseconds.
   * Returns the blended position and rotation.
   */
  public update(
    dt: number,
    currentPosition: IVector3,
    currentRotation: IQuaternion
  ): { position: IVector3; rotation: IQuaternion } {
    if (this.activeCorrections.length === 0) {
      return { position: currentPosition, rotation: currentRotation };
    }

    let pos = { ...currentPosition };
    let rot = { ...currentRotation };

    // Process each active correction
    const completed: number[] = [];

    for (let i = 0; i < this.activeCorrections.length; i++) {
      const c = this.activeCorrections[i];
      c.elapsed += dt;

      const t = Math.min(c.elapsed / c.duration, 1.0);

      if (t >= 1.0) {
        // Correction complete
        pos = { ...c.targetPosition };
        rot = { ...c.targetRotation };
        completed.push(i);
        continue;
      }

      let blendFactor: number;
      switch (c.type) {
        case 'exponential':
          // Exponential ease-out
          blendFactor = 1 - Math.pow(1 - t, 3);
          break;
        case 'bezier':
          // Cubic Bezier (smooth start and end)
          blendFactor = t * t * (3 - 2 * t);
          break;
        case 'snap':
          // Snap position immediately, smooth velocity
          blendFactor = 1.0;
          break;
      }

      pos = lerpVector3(c.startPosition, c.targetPosition, blendFactor);
      rot = slerpQuaternion(c.startRotation, c.targetRotation, blendFactor);
    }

    // Remove completed corrections (reverse order to preserve indices)
    for (let i = completed.length - 1; i >= 0; i--) {
      this.activeCorrections.splice(completed[i], 1);
    }

    return { position: pos, rotation: rot };
  }

  /** Check if any corrections are active */
  public isBlending(): boolean {
    return this.activeCorrections.length > 0;
  }

  /** Clear all active corrections */
  public clear(): void {
    this.activeCorrections = [];
  }
}

// =============================================================================
// State History Buffer
// =============================================================================

/**
 * Ring buffer of predicted entity states for server reconciliation.
 */
export class StateHistoryBuffer {
  private buffer: IPredictedEntityState[] = [];
  private maxSize: number;

  constructor(maxSize: number = 128) {
    this.maxSize = maxSize;
  }

  /** Push a state snapshot */
  public push(state: IPredictedEntityState): void {
    this.buffer.push(state);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  /** Get state at a specific tick */
  public getAtTick(tick: number): IPredictedEntityState | null {
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      if (this.buffer[i].tick === tick) return this.buffer[i];
    }
    return null;
  }

  /** Get the most recent state */
  public getLatest(): IPredictedEntityState | null {
    return this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : null;
  }

  /** Clear history before a given tick */
  public clearBefore(tick: number): void {
    while (this.buffer.length > 0 && this.buffer[0].tick < tick) {
      this.buffer.shift();
    }
  }

  /** Get all states after a given tick */
  public getAfterTick(tick: number): IPredictedEntityState[] {
    return this.buffer.filter((s) => s.tick > tick);
  }

  /** Get buffer size */
  public get size(): number {
    return this.buffer.length;
  }

  /** Clear all */
  public clear(): void {
    this.buffer = [];
  }
}

// =============================================================================
// Main: Latency Compensator
// =============================================================================

/**
 * Latency compensation system for a single networked entity.
 * Manages prediction, correction blending, and adaptive horizon.
 *
 * Usage:
 * ```ts
 * const comp = new LatencyCompensator('player_1', { isLocalPlayer: true });
 *
 * // Each frame:
 * comp.recordInput(input);
 * comp.recordRTT(rttMs);
 * const predicted = comp.predict(currentState, dt);
 *
 * // When server state arrives:
 * comp.reconcile(serverState, serverTick);
 *
 * // Get corrected state for rendering:
 * const { position, rotation } = comp.getCorrectedState(dt);
 * ```
 */
export class LatencyCompensator {
  public readonly entityId: string;

  private config: ILatencyCompConfig;
  private horizon: AdaptiveHorizon;
  private inputAnalyzer: InputPatternAnalyzer;
  private intentPredictor: IntentPredictor;
  private correctionBlender: CorrectionBlender;
  private stateHistory: StateHistoryBuffer;

  private currentState: IPredictedEntityState;
  private lastServerState: IPredictedEntityState | null = null;
  private lastServerTick = 0;
  private divergenceStartTime: number | null = null;

  constructor(entityId: string, config: Partial<ILatencyCompConfig> = {}) {
    this.entityId = entityId;
    this.config = { ...DEFAULT_LATENCY_CONFIG, ...config };
    this.horizon = new AdaptiveHorizon(this.config);
    this.inputAnalyzer = new InputPatternAnalyzer(this.config.inputHistorySize);
    this.intentPredictor = new IntentPredictor();
    this.correctionBlender = new CorrectionBlender(this.config);
    this.stateHistory = new StateHistoryBuffer(this.config.stateHistorySize);

    this.currentState = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      timestamp: Date.now(),
      tick: 0,
      confidence: 1,
    };
  }

  /** Record a player input for Tier 2 prediction */
  public recordInput(input: IInputCommand): void {
    this.inputAnalyzer.recordInput(input);
  }

  /** Record an RTT measurement for adaptive horizon */
  public recordRTT(rtt: number): void {
    this.horizon.recordRTT(rtt);
  }

  /** Register scene interactables for Tier 3 prediction */
  public setInteractables(interactables: IInteractable[]): void {
    this.intentPredictor.setInteractables(interactables);
  }

  /** Get the current prediction tier */
  public getTier(): PredictionTier {
    return this.horizon.getTier();
  }

  /** Get the adaptive prediction horizon in ms */
  public getHorizon(): number {
    return this.horizon.getHorizon();
  }

  /** Get average RTT */
  public getAverageRTT(): number {
    return this.horizon.getAverageRTT();
  }

  /** Get jitter */
  public getJitter(): number {
    return this.horizon.getJitter();
  }

  /**
   * Predict the next state using the appropriate tier.
   * Call this each simulation tick with the current authoritative state.
   */
  public predict(
    state: IPredictedEntityState,
    dt: number,
    gazeDirection?: IVector3
  ): IPredictedEntityState {
    this.currentState = { ...state };
    this.horizon.update();
    const tier = this.getTier();

    // Record position for intent prediction
    this.intentPredictor.recordPosition(state.position, state.timestamp);

    let predicted: IPredictedEntityState;

    switch (tier) {
      case 'standard':
        predicted = this.predictStandard(state, dt);
        break;
      case 'input':
        predicted = this.predictWithInput(state, dt);
        break;
      case 'intent':
        predicted = this.predictWithIntent(state, dt, gazeDirection);
        break;
    }

    // Store in history for reconciliation
    this.stateHistory.push(predicted);

    return predicted;
  }

  /**
   * Tier 1: Standard dead reckoning with physics-aware extrapolation
   */
  private predictStandard(state: IPredictedEntityState, dt: number): IPredictedEntityState {
    // Physics-aware extrapolation (not just linear)
    // Apply gravity to velocity prediction
    const gravity = -9.81;
    const isAirborne = state.position.y > 0.1;

    const predictedVelY = isAirborne ? state.velocity.y + gravity * dt : state.velocity.y;

    return {
      position: {
        x: state.position.x + state.velocity.x * dt,
        y: Math.max(0, state.position.y + predictedVelY * dt),
        z: state.position.z + state.velocity.z * dt,
      },
      rotation: state.rotation, // Rotation prediction would need angular velocity integration
      velocity: {
        x: state.velocity.x,
        y: predictedVelY,
        z: state.velocity.z,
      },
      angularVelocity: state.angularVelocity,
      timestamp: Date.now(),
      tick: state.tick + 1,
      confidence: 0.95,
    };
  }

  /**
   * Tier 2: Input pattern prediction — predict what the player will do next
   */
  private predictWithInput(state: IPredictedEntityState, dt: number): IPredictedEntityState {
    const predicted = this.predictStandard(state, dt);
    const inputPrediction = this.inputAnalyzer.predictNextInput(state.tick);

    if (!inputPrediction) return predicted;

    // Apply predicted input to velocity
    const moveSpeed = 5.0; // Assumed walk speed (m/s)
    const mx = (inputPrediction.input.inputs.moveX as number) ?? 0;
    const mz = (inputPrediction.input.inputs.moveZ as number) ?? 0;

    predicted.velocity.x = mx * moveSpeed;
    predicted.velocity.z = mz * moveSpeed;

    // Re-predict position with adjusted velocity
    predicted.position.x = state.position.x + predicted.velocity.x * dt;
    predicted.position.z = state.position.z + predicted.velocity.z * dt;

    // Reduce confidence based on input prediction confidence
    predicted.confidence = Math.min(predicted.confidence, inputPrediction.confidence * 0.9);

    return predicted;
  }

  /**
   * Tier 3: Intent prediction — predict where the player is heading
   */
  private predictWithIntent(
    state: IPredictedEntityState,
    dt: number,
    gazeDirection?: IVector3
  ): IPredictedEntityState {
    // Start with input prediction
    const predicted = this.predictWithInput(state, dt);

    // Layer on intent prediction
    const intent = this.intentPredictor.predictIntent(
      state.position,
      state.velocity,
      gazeDirection,
      this.horizon.getHorizon()
    );

    if (!intent) return predicted;

    // Blend toward intent target
    const blendFactor = intent.confidence * 0.3; // Intent only nudges, doesn't override
    predicted.position = lerpVector3(predicted.position, intent.targetPosition, blendFactor * dt);
    predicted.confidence = Math.min(predicted.confidence, intent.confidence * 0.7);

    return predicted;
  }

  /**
   * Reconcile with authoritative server state.
   * Call this when a server state update arrives.
   */
  public reconcile(serverState: IPredictedEntityState, serverTick: number): void {
    this.lastServerState = serverState;
    this.lastServerTick = serverTick;

    // Find our predicted state at the server's tick
    const ourState = this.stateHistory.getAtTick(serverTick);
    if (!ourState) {
      // No matching state — snap to server
      this.correctionBlender.queueCorrection(
        this.currentState.position,
        serverState.position,
        this.currentState.rotation,
        serverState.rotation
      );
      this.stateHistory.clearBefore(serverTick);
      return;
    }

    // Calculate prediction error
    const error = distanceVector3(ourState.position, serverState.position);

    if (error > this.config.thresholds.invisible) {
      // Queue correction
      this.correctionBlender.queueCorrection(
        this.currentState.position,
        serverState.position,
        this.currentState.rotation,
        serverState.rotation
      );

      // Track divergence
      if (!this.divergenceStartTime) {
        this.divergenceStartTime = Date.now();
      } else if (Date.now() - this.divergenceStartTime > this.config.maxDivergenceTime) {
        // Force snap after max divergence
        this.currentState.position = { ...serverState.position };
        this.currentState.rotation = { ...serverState.rotation };
        this.currentState.velocity = { ...serverState.velocity };
        this.correctionBlender.clear();
        this.divergenceStartTime = null;
      }
    } else {
      this.divergenceStartTime = null;
    }

    // Clean old history
    this.stateHistory.clearBefore(serverTick);

    // Re-predict from server state for any ticks since serverTick
    const statesToReplay = this.stateHistory.getAfterTick(serverTick);
    if (statesToReplay.length > 0) {
      let replayState = { ...serverState };
      for (const _s of statesToReplay) {
        const dt = 1 / 60; // Assume fixed timestep
        replayState = this.predictStandard(replayState, dt);
      }
    }
  }

  /**
   * Get the corrected state for rendering.
   * Applies any active correction blending.
   */
  public getCorrectedState(dtMs: number): { position: IVector3; rotation: IQuaternion } {
    return this.correctionBlender.update(
      dtMs,
      this.currentState.position,
      this.currentState.rotation
    );
  }

  /** Check if corrections are actively being applied */
  public isBlending(): boolean {
    return this.correctionBlender.isBlending();
  }

  /** Reset all state */
  public reset(): void {
    this.inputAnalyzer.clear();
    this.intentPredictor.clear();
    this.correctionBlender.clear();
    this.stateHistory.clear();
    this.lastServerState = null;
    this.lastServerTick = 0;
    this.divergenceStartTime = null;
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a latency compensator for a local player (gets priority treatment)
 */
export function createLocalPlayerCompensator(entityId: string): LatencyCompensator {
  return new LatencyCompensator(entityId, { isLocalPlayer: true });
}

/**
 * Create a latency compensator for a remote player (tolerates more correction)
 */
export function createRemotePlayerCompensator(entityId: string): LatencyCompensator {
  return new LatencyCompensator(entityId, {
    isLocalPlayer: false,
    thresholds: {
      invisible: 0.2, // More tolerance for remote
      small: 1.0,
      medium: 3.0,
    },
  });
}
