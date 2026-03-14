/**
 * ReproducibleTrainingSession.ts
 *
 * Deterministic training session mode for VR.
 * Provides fixed random seeds, deterministic physics stepping,
 * input recording/playback, state checkpointing, and
 * diff-based session comparison.
 *
 * The goal is to enable exact replay of VR training sessions for:
 * - Assessment and scoring consistency
 * - Regression testing of training scenario changes
 * - A/B comparison of student performance across sessions
 * - Debugging complex multi-step interactions
 *
 * @module ReproducibleTrainingSession
 */

// =============================================================================
// Types & Interfaces
// =============================================================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type SessionMode = 'recording' | 'playback' | 'comparison' | 'idle';

export interface SessionConfig {
  /** Random seed for all PRNG operations */
  seed: number;
  /** Fixed physics timestep in seconds */
  physicsTimestep?: number;
  /** Maximum physics substeps per frame */
  maxSubsteps?: number;
  /** Enable input recording */
  recordInput?: boolean;
  /** Enable state checkpointing */
  enableCheckpoints?: boolean;
  /** Checkpoint interval in frames */
  checkpointInterval?: number;
  /** Maximum checkpoint count (rolling buffer) */
  maxCheckpoints?: number;
  /** Session metadata */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Input Recording
// ---------------------------------------------------------------------------

export type InputEventType =
  | 'controller-position'
  | 'controller-rotation'
  | 'controller-button'
  | 'controller-axis'
  | 'headset-position'
  | 'headset-rotation'
  | 'hand-tracking'
  | 'eye-tracking'
  | 'voice-command'
  | 'keyboard'
  | 'mouse'
  | 'touch'
  | 'custom';

export interface InputEvent {
  type: InputEventType;
  frameNumber: number;
  timestamp: number;
  hand?: 'left' | 'right';
  data: Record<string, unknown>;
}

export interface InputRecording {
  sessionId: string;
  seed: number;
  startTime: number;
  endTime: number;
  totalFrames: number;
  events: InputEvent[];
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// State Checkpointing
// ---------------------------------------------------------------------------

export interface ObjectState {
  id: string;
  position: Vec3;
  rotation: Quaternion;
  scale: Vec3;
  velocity?: Vec3;
  angularVelocity?: Vec3;
  customState: Record<string, unknown>;
}

export interface Checkpoint {
  id: string;
  frameNumber: number;
  timestamp: number;
  rngState: number;
  objects: ObjectState[];
  globalState: Record<string, unknown>;
  physicsState: PhysicsSnapshot;
  metadata: Record<string, unknown>;
}

export interface PhysicsSnapshot {
  accumulatedTime: number;
  stepCount: number;
  bodyStates: {
    id: string;
    position: Vec3;
    rotation: Quaternion;
    linearVelocity: Vec3;
    angularVelocity: Vec3;
    sleeping: boolean;
  }[];
}

// ---------------------------------------------------------------------------
// Session Comparison
// ---------------------------------------------------------------------------

export type DiffType = 'position' | 'rotation' | 'state' | 'timing' | 'event-missing' | 'event-extra';

export interface SessionDiff {
  frameNumber: number;
  timestamp: number;
  diffType: DiffType;
  objectId?: string;
  description: string;
  sessionAValue?: unknown;
  sessionBValue?: unknown;
  magnitude: number;  // Quantified difference (0..1 or absolute)
}

export interface ComparisonResult {
  sessionAId: string;
  sessionBId: string;
  totalDiffs: number;
  diffs: SessionDiff[];
  overallSimilarity: number;  // 0..1
  perObjectSimilarity: Map<string, number>;
  timingDeviation: number;  // Average timing difference in ms
  summary: string;
}

// ---------------------------------------------------------------------------
// Physics Integration
// ---------------------------------------------------------------------------

/**
 * Platform-provided physics engine adapter.
 * The consuming platform implements this to enable deterministic stepping.
 */
export interface DeterministicPhysicsAdapter {
  /** Step the physics simulation by exactly dt seconds */
  step(dt: number): void;
  /** Get a serializable snapshot of all physics bodies */
  getSnapshot(): PhysicsSnapshot;
  /** Restore physics state from a snapshot */
  restoreSnapshot(snapshot: PhysicsSnapshot): void;
  /** Set the physics engine to deterministic mode */
  setDeterministic(enabled: boolean): void;
}

/**
 * Platform-provided scene adapter for reading/writing object states.
 */
export interface SceneAdapter {
  /** Get all object IDs in the scene */
  getObjectIds(): string[];
  /** Get the state of a specific object */
  getObjectState(id: string): ObjectState | null;
  /** Set the state of a specific object */
  setObjectState(id: string, state: ObjectState): void;
  /** Get global scene state */
  getGlobalState(): Record<string, unknown>;
  /** Set global scene state */
  setGlobalState(state: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Session State
// ---------------------------------------------------------------------------

export interface SessionState {
  sessionId: string;
  mode: SessionMode;
  seed: number;
  frameNumber: number;
  elapsedTime: number;
  isRecording: boolean;
  isPlaying: boolean;
  checkpointCount: number;
  inputEventCount: number;
  playbackProgress: number;  // 0..1 during playback
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type SessionEventType =
  | 'session-started'
  | 'session-stopped'
  | 'recording-started'
  | 'recording-stopped'
  | 'playback-started'
  | 'playback-stopped'
  | 'playback-frame'
  | 'checkpoint-created'
  | 'checkpoint-restored'
  | 'comparison-started'
  | 'comparison-completed'
  | 'input-recorded'
  | 'input-replayed'
  | 'desync-detected'
  | 'error';

export interface SessionEvent {
  type: SessionEventType;
  timestamp: number;
  data?: unknown;
}

type EventHandler = (event: SessionEvent) => void;

// =============================================================================
// Deterministic PRNG (Mulberry32)
// =============================================================================

/**
 * Mulberry32: a fast, seedable 32-bit PRNG with full period.
 * Produces deterministic sequences given the same seed.
 */
export class DeterministicRNG {
  private state: number;
  private initialSeed: number;
  private callCount: number = 0;

  constructor(seed: number) {
    this.initialSeed = seed;
    this.state = seed | 0;
  }

  /**
   * Generate the next random number in [0, 1).
   */
  next(): number {
    this.callCount++;
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generate a random integer in [min, max] (inclusive).
   */
  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /**
   * Generate a random float in [min, max).
   */
  nextFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Gaussian (normal) distribution using Box-Muller transform.
   */
  nextGaussian(mean: number = 0, stddev: number = 1): number {
    const u1 = this.next();
    const u2 = this.next();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * stddev;
  }

  /**
   * Pick a random element from an array.
   */
  pick<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)];
  }

  /**
   * Shuffle an array in-place (Fisher-Yates).
   */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Get the current internal state for checkpointing.
   */
  getState(): number {
    return this.state;
  }

  /**
   * Restore the internal state from a checkpoint.
   */
  setState(state: number): void {
    this.state = state;
  }

  /**
   * Reset to the original seed.
   */
  reset(): void {
    this.state = this.initialSeed | 0;
    this.callCount = 0;
  }

  /**
   * Get the number of calls made since creation/reset.
   */
  getCallCount(): number {
    return this.callCount;
  }
}

// =============================================================================
// Deterministic Timer
// =============================================================================

/**
 * Fixed-timestep accumulator for deterministic physics stepping.
 * Guarantees the same number of physics steps regardless of frame rate.
 */
export class FixedTimestepAccumulator {
  private timestep: number;
  private maxSubsteps: number;
  private accumulator: number = 0;
  private stepCount: number = 0;
  private interpolationAlpha: number = 0;

  constructor(timestep: number = 1 / 60, maxSubsteps: number = 4) {
    this.timestep = timestep;
    this.maxSubsteps = maxSubsteps;
  }

  /**
   * Accumulate frame time and return the number of physics steps to execute.
   * @param deltaTime Actual frame time in seconds
   * @returns Number of fixed steps to take this frame
   */
  accumulate(deltaTime: number): number {
    // Clamp delta to prevent spiral of death
    const clampedDelta = Math.min(deltaTime, this.timestep * this.maxSubsteps);
    this.accumulator += clampedDelta;

    let steps = 0;
    while (this.accumulator >= this.timestep && steps < this.maxSubsteps) {
      this.accumulator -= this.timestep;
      this.stepCount++;
      steps++;
    }

    // Interpolation alpha for rendering between physics states
    this.interpolationAlpha = this.accumulator / this.timestep;

    return steps;
  }

  /**
   * Get the fixed timestep value.
   */
  getTimestep(): number {
    return this.timestep;
  }

  /**
   * Get the interpolation alpha for smooth rendering.
   */
  getInterpolationAlpha(): number {
    return this.interpolationAlpha;
  }

  /**
   * Get total physics steps taken.
   */
  getStepCount(): number {
    return this.stepCount;
  }

  /**
   * Get the accumulated time (remainder after stepping).
   */
  getAccumulatedTime(): number {
    return this.accumulator;
  }

  /**
   * Reset the accumulator.
   */
  reset(): void {
    this.accumulator = 0;
    this.stepCount = 0;
    this.interpolationAlpha = 0;
  }

  /**
   * Restore from checkpoint.
   */
  restore(accumulatedTime: number, stepCount: number): void {
    this.accumulator = accumulatedTime;
    this.stepCount = stepCount;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function vec3Distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function quatDot(a: Quaternion, b: Quaternion): number {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

function quatAngleDifference(a: Quaternion, b: Quaternion): number {
  const dot = Math.abs(quatDot(a, b));
  return 2 * Math.acos(Math.min(dot, 1));
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// =============================================================================
// ReproducibleTrainingSession
// =============================================================================

/**
 * ReproducibleTrainingSession manages deterministic VR training sessions.
 *
 * It wraps the physics engine in a fixed-timestep accumulator, replaces
 * Math.random with a seedable PRNG, records all user input with frame-accurate
 * timestamps, and provides checkpoint/restore for instant state rollback.
 */
export class ReproducibleTrainingSession {
  // Configuration
  private config: Required<SessionConfig>;

  // Session identity
  private sessionId: string;
  private mode: SessionMode = 'idle';

  // Deterministic subsystems
  private rng: DeterministicRNG;
  private timestepAccumulator: FixedTimestepAccumulator;

  // Frame tracking
  private frameNumber: number = 0;
  private startTime: number = 0;
  private elapsedTime: number = 0;

  // Input recording
  private inputEvents: InputEvent[] = [];
  private isRecording: boolean = false;

  // Input playback
  private playbackRecording: InputRecording | null = null;
  private playbackIndex: number = 0;
  private isPlaying: boolean = false;

  // Checkpoints
  private checkpoints: Map<string, Checkpoint> = new Map();
  private checkpointOrder: string[] = [];

  // Platform adapters
  private physicsAdapter: DeterministicPhysicsAdapter | null = null;
  private sceneAdapter: SceneAdapter | null = null;

  // Session recordings for comparison
  private sessionRecordings: Map<string, InputRecording> = new Map();

  // Math.random override
  private originalMathRandom: (() => number) | null = null;

  // Events
  private eventHandlers: Map<SessionEventType, Set<EventHandler>> = new Map();

  // Input replay callback (platform invokes actual input simulation)
  private inputReplayCallback: ((event: InputEvent) => void) | null = null;

  constructor(config: SessionConfig) {
    this.config = {
      seed: config.seed,
      physicsTimestep: config.physicsTimestep ?? 1 / 60,
      maxSubsteps: config.maxSubsteps ?? 4,
      recordInput: config.recordInput ?? true,
      enableCheckpoints: config.enableCheckpoints ?? true,
      checkpointInterval: config.checkpointInterval ?? 300, // Every 5s at 60fps
      maxCheckpoints: config.maxCheckpoints ?? 20,
      metadata: config.metadata ?? {},
    };

    this.sessionId = generateSessionId();
    this.rng = new DeterministicRNG(this.config.seed);
    this.timestepAccumulator = new FixedTimestepAccumulator(
      this.config.physicsTimestep,
      this.config.maxSubsteps,
    );
  }

  // ===========================================================================
  // Adapter Setup
  // ===========================================================================

  /**
   * Set the deterministic physics adapter.
   */
  setPhysicsAdapter(adapter: DeterministicPhysicsAdapter): void {
    this.physicsAdapter = adapter;
  }

  /**
   * Set the scene adapter for state serialization.
   */
  setSceneAdapter(adapter: SceneAdapter): void {
    this.sceneAdapter = adapter;
  }

  /**
   * Set the callback invoked during playback to simulate input events.
   */
  setInputReplayCallback(callback: (event: InputEvent) => void): void {
    this.inputReplayCallback = callback;
  }

  // ===========================================================================
  // Session Lifecycle
  // ===========================================================================

  /**
   * Start a new recording session.
   */
  startRecording(): void {
    this.mode = 'recording';
    this.frameNumber = 0;
    this.startTime = performance.now();
    this.elapsedTime = 0;
    this.inputEvents = [];
    this.isRecording = true;
    this.checkpoints.clear();
    this.checkpointOrder = [];

    // Reset PRNG to seed
    this.rng.reset();

    // Override Math.random with deterministic PRNG
    this.overrideMathRandom();

    // Set physics to deterministic mode
    this.physicsAdapter?.setDeterministic(true);

    // Reset timestep accumulator
    this.timestepAccumulator.reset();

    // Create initial checkpoint
    if (this.config.enableCheckpoints) {
      this.createCheckpoint('initial');
    }

    this.emitEvent('recording-started', {
      sessionId: this.sessionId,
      seed: this.config.seed,
    });
    this.emitEvent('session-started', {
      sessionId: this.sessionId,
      mode: 'recording',
    });
  }

  /**
   * Stop the current recording session and return the recording.
   */
  stopRecording(): InputRecording {
    this.isRecording = false;
    this.mode = 'idle';
    this.restoreMathRandom();

    const recording: InputRecording = {
      sessionId: this.sessionId,
      seed: this.config.seed,
      startTime: this.startTime,
      endTime: performance.now(),
      totalFrames: this.frameNumber,
      events: [...this.inputEvents],
      metadata: { ...this.config.metadata },
    };

    this.sessionRecordings.set(this.sessionId, recording);

    this.emitEvent('recording-stopped', {
      sessionId: this.sessionId,
      totalFrames: this.frameNumber,
      totalEvents: this.inputEvents.length,
    });

    return recording;
  }

  /**
   * Start playback of a recorded session.
   */
  startPlayback(recording: InputRecording): void {
    this.mode = 'playback';
    this.playbackRecording = recording;
    this.playbackIndex = 0;
    this.frameNumber = 0;
    this.startTime = performance.now();
    this.elapsedTime = 0;
    this.isPlaying = true;

    // Reset PRNG to the same seed
    this.rng = new DeterministicRNG(recording.seed);
    this.overrideMathRandom();

    // Set physics to deterministic mode
    this.physicsAdapter?.setDeterministic(true);
    this.timestepAccumulator.reset();

    // Restore initial checkpoint if available
    const initialCheckpoint = this.checkpoints.get('initial');
    if (initialCheckpoint) {
      this.restoreCheckpoint('initial');
    }

    this.emitEvent('playback-started', {
      sessionId: recording.sessionId,
      totalFrames: recording.totalFrames,
    });
  }

  /**
   * Stop playback.
   */
  stopPlayback(): void {
    this.isPlaying = false;
    this.mode = 'idle';
    this.playbackRecording = null;
    this.playbackIndex = 0;
    this.restoreMathRandom();

    this.emitEvent('playback-stopped', { frameNumber: this.frameNumber });
  }

  /**
   * Stop the current session (recording or playback).
   */
  stop(): void {
    if (this.isRecording) {
      this.stopRecording();
    } else if (this.isPlaying) {
      this.stopPlayback();
    }
    this.mode = 'idle';
    this.restoreMathRandom();
    this.emitEvent('session-stopped', { sessionId: this.sessionId });
  }

  // ===========================================================================
  // Frame Update
  // ===========================================================================

  /**
   * Update the training session. Call once per frame.
   *
   * @param deltaTime Actual frame time in seconds
   */
  update(deltaTime: number): void {
    this.frameNumber++;
    this.elapsedTime += deltaTime;

    // Deterministic physics stepping
    const physicsSteps = this.timestepAccumulator.accumulate(deltaTime);
    for (let i = 0; i < physicsSteps; i++) {
      this.physicsAdapter?.step(this.timestepAccumulator.getTimestep());
    }

    // Replay input events during playback
    if (this.isPlaying && this.playbackRecording) {
      this.replayInputForFrame();

      this.emitEvent('playback-frame', {
        frameNumber: this.frameNumber,
        progress: this.frameNumber / this.playbackRecording.totalFrames,
      });

      // Check for playback completion
      if (this.frameNumber >= this.playbackRecording.totalFrames) {
        this.stopPlayback();
      }
    }

    // Auto-checkpointing during recording
    if (
      this.isRecording &&
      this.config.enableCheckpoints &&
      this.frameNumber % this.config.checkpointInterval === 0
    ) {
      this.createCheckpoint(`auto_f${this.frameNumber}`);
    }
  }

  /**
   * Replay all input events scheduled for the current frame.
   */
  private replayInputForFrame(): void {
    if (!this.playbackRecording || !this.inputReplayCallback) return;

    while (
      this.playbackIndex < this.playbackRecording.events.length &&
      this.playbackRecording.events[this.playbackIndex].frameNumber <= this.frameNumber
    ) {
      const event = this.playbackRecording.events[this.playbackIndex];
      this.inputReplayCallback(event);
      this.emitEvent('input-replayed', { event });
      this.playbackIndex++;
    }
  }

  // ===========================================================================
  // Input Recording
  // ===========================================================================

  /**
   * Record an input event. Call this for every user interaction during recording.
   */
  recordInput(type: InputEventType, data: Record<string, unknown>, hand?: 'left' | 'right'): void {
    if (!this.isRecording) return;

    const event: InputEvent = {
      type,
      frameNumber: this.frameNumber,
      timestamp: performance.now() - this.startTime,
      hand,
      data: deepClone(data),
    };

    this.inputEvents.push(event);
    this.emitEvent('input-recorded', { event });
  }

  // ===========================================================================
  // Checkpointing
  // ===========================================================================

  /**
   * Create a state checkpoint.
   */
  createCheckpoint(label?: string): string {
    const id = label ?? `checkpoint_f${this.frameNumber}`;

    const objects: ObjectState[] = [];
    if (this.sceneAdapter) {
      for (const objId of this.sceneAdapter.getObjectIds()) {
        const state = this.sceneAdapter.getObjectState(objId);
        if (state) {
          objects.push(deepClone(state));
        }
      }
    }

    const checkpoint: Checkpoint = {
      id,
      frameNumber: this.frameNumber,
      timestamp: performance.now() - this.startTime,
      rngState: this.rng.getState(),
      objects,
      globalState: this.sceneAdapter ? deepClone(this.sceneAdapter.getGlobalState()) : {},
      physicsState: this.physicsAdapter
        ? deepClone(this.physicsAdapter.getSnapshot())
        : { accumulatedTime: 0, stepCount: 0, bodyStates: [] },
      metadata: { elapsedTime: this.elapsedTime, inputEventCount: this.inputEvents.length },
    };

    this.checkpoints.set(id, checkpoint);
    this.checkpointOrder.push(id);

    // Enforce max checkpoints (rolling buffer)
    while (this.checkpointOrder.length > this.config.maxCheckpoints) {
      const oldId = this.checkpointOrder.shift()!;
      if (oldId !== 'initial') {
        this.checkpoints.delete(oldId);
      }
    }

    this.emitEvent('checkpoint-created', {
      checkpointId: id,
      frameNumber: this.frameNumber,
      objectCount: objects.length,
    });

    return id;
  }

  /**
   * Restore a previously saved checkpoint.
   */
  restoreCheckpoint(checkpointId: string): boolean {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      console.warn(`[ReproducibleTraining] Checkpoint "${checkpointId}" not found.`);
      return false;
    }

    // Restore PRNG state
    this.rng.setState(checkpoint.rngState);

    // Restore frame number
    this.frameNumber = checkpoint.frameNumber;

    // Restore physics state
    if (this.physicsAdapter) {
      this.physicsAdapter.restoreSnapshot(deepClone(checkpoint.physicsState));
    }

    // Restore timestep accumulator
    this.timestepAccumulator.restore(
      checkpoint.physicsState.accumulatedTime,
      checkpoint.physicsState.stepCount,
    );

    // Restore scene state
    if (this.sceneAdapter) {
      for (const objState of checkpoint.objects) {
        this.sceneAdapter.setObjectState(objState.id, deepClone(objState));
      }
      this.sceneAdapter.setGlobalState(deepClone(checkpoint.globalState));
    }

    // Trim input events to checkpoint frame
    if (this.isRecording) {
      this.inputEvents = this.inputEvents.filter(
        (e) => e.frameNumber <= checkpoint.frameNumber,
      );
    }

    this.emitEvent('checkpoint-restored', {
      checkpointId,
      frameNumber: checkpoint.frameNumber,
    });

    return true;
  }

  /**
   * Get all checkpoint IDs in order.
   */
  getCheckpointIds(): string[] {
    return [...this.checkpointOrder];
  }

  /**
   * Get a specific checkpoint (without restoring it).
   */
  getCheckpoint(checkpointId: string): Checkpoint | undefined {
    const cp = this.checkpoints.get(checkpointId);
    return cp ? deepClone(cp) : undefined;
  }

  // ===========================================================================
  // Session Comparison
  // ===========================================================================

  /**
   * Compare two recorded sessions and produce a detailed diff.
   *
   * @param recordingA First session recording
   * @param recordingB Second session recording
   * @param positionThreshold Position difference threshold for reporting (meters)
   * @param rotationThreshold Rotation difference threshold (radians)
   */
  compareSessions(
    recordingA: InputRecording,
    recordingB: InputRecording,
    positionThreshold: number = 0.01,
    rotationThreshold: number = 0.02,
  ): ComparisonResult {
    this.emitEvent('comparison-started', {
      sessionA: recordingA.sessionId,
      sessionB: recordingB.sessionId,
    });

    const diffs: SessionDiff[] = [];
    const maxFrames = Math.max(recordingA.totalFrames, recordingB.totalFrames);

    // Build frame-indexed event maps
    const eventsA = this.buildFrameEventMap(recordingA.events);
    const eventsB = this.buildFrameEventMap(recordingB.events);

    const allFrames = new Set([...eventsA.keys(), ...eventsB.keys()]);

    for (const frame of Array.from(allFrames).sort((a, b) => a - b)) {
      const aEvents = eventsA.get(frame) ?? [];
      const bEvents = eventsB.get(frame) ?? [];

      // Compare event counts
      if (aEvents.length !== bEvents.length) {
        diffs.push({
          frameNumber: frame,
          timestamp: aEvents[0]?.timestamp ?? bEvents[0]?.timestamp ?? 0,
          diffType: aEvents.length > bEvents.length ? 'event-extra' : 'event-missing',
          description: `Event count mismatch: A=${aEvents.length}, B=${bEvents.length}`,
          sessionAValue: aEvents.length,
          sessionBValue: bEvents.length,
          magnitude: Math.abs(aEvents.length - bEvents.length) / Math.max(aEvents.length, bEvents.length, 1),
        });
      }

      // Compare matching events
      const minLen = Math.min(aEvents.length, bEvents.length);
      for (let i = 0; i < minLen; i++) {
        const a = aEvents[i];
        const b = bEvents[i];

        if (a.type !== b.type) {
          diffs.push({
            frameNumber: frame,
            timestamp: a.timestamp,
            diffType: 'state',
            description: `Event type mismatch: "${a.type}" vs "${b.type}"`,
            sessionAValue: a.type,
            sessionBValue: b.type,
            magnitude: 1,
          });
          continue;
        }

        // Position comparison
        if (
          a.type === 'controller-position' ||
          a.type === 'headset-position'
        ) {
          const posA = a.data.position as Vec3;
          const posB = b.data.position as Vec3;
          if (posA && posB) {
            const dist = vec3Distance(posA, posB);
            if (dist > positionThreshold) {
              diffs.push({
                frameNumber: frame,
                timestamp: a.timestamp,
                diffType: 'position',
                objectId: a.hand ?? 'headset',
                description: `Position difference: ${dist.toFixed(4)}m`,
                sessionAValue: posA,
                sessionBValue: posB,
                magnitude: dist,
              });
            }
          }
        }

        // Timing comparison
        const timeDiff = Math.abs(a.timestamp - b.timestamp);
        if (timeDiff > 16.67) {
          // More than 1 frame at 60fps
          diffs.push({
            frameNumber: frame,
            timestamp: a.timestamp,
            diffType: 'timing',
            description: `Timing difference: ${timeDiff.toFixed(1)}ms`,
            sessionAValue: a.timestamp,
            sessionBValue: b.timestamp,
            magnitude: timeDiff,
          });
        }
      }
    }

    // Calculate overall similarity
    const maxPossibleDiffs = maxFrames * 2; // rough upper bound
    const overallSimilarity = Math.max(0, 1 - diffs.length / Math.max(maxPossibleDiffs, 1));

    // Calculate per-object similarity
    const perObjectSimilarity = new Map<string, number>();
    const objectDiffCounts = new Map<string, number>();
    const objectTotalFrames = new Map<string, number>();

    for (const diff of diffs) {
      if (diff.objectId) {
        objectDiffCounts.set(diff.objectId, (objectDiffCounts.get(diff.objectId) ?? 0) + 1);
        objectTotalFrames.set(diff.objectId, maxFrames);
      }
    }

    for (const [objId, count] of objectDiffCounts) {
      const total = objectTotalFrames.get(objId) ?? maxFrames;
      perObjectSimilarity.set(objId, Math.max(0, 1 - count / total));
    }

    // Average timing deviation
    const timingDiffs = diffs.filter((d) => d.diffType === 'timing');
    const timingDeviation =
      timingDiffs.length > 0
        ? timingDiffs.reduce((sum, d) => sum + d.magnitude, 0) / timingDiffs.length
        : 0;

    const result: ComparisonResult = {
      sessionAId: recordingA.sessionId,
      sessionBId: recordingB.sessionId,
      totalDiffs: diffs.length,
      diffs,
      overallSimilarity,
      perObjectSimilarity,
      timingDeviation,
      summary: this.generateComparisonSummary(diffs, overallSimilarity, timingDeviation),
    };

    this.emitEvent('comparison-completed', {
      totalDiffs: result.totalDiffs,
      overallSimilarity: result.overallSimilarity,
    });

    return result;
  }

  /**
   * Build a map from frame number to input events for that frame.
   */
  private buildFrameEventMap(events: InputEvent[]): Map<number, InputEvent[]> {
    const map = new Map<number, InputEvent[]>();
    for (const event of events) {
      if (!map.has(event.frameNumber)) {
        map.set(event.frameNumber, []);
      }
      map.get(event.frameNumber)!.push(event);
    }
    return map;
  }

  /**
   * Generate a human-readable comparison summary.
   */
  private generateComparisonSummary(
    diffs: SessionDiff[],
    similarity: number,
    timingDeviation: number,
  ): string {
    const positionDiffs = diffs.filter((d) => d.diffType === 'position').length;
    const rotationDiffs = diffs.filter((d) => d.diffType === 'rotation').length;
    const timingDiffs = diffs.filter((d) => d.diffType === 'timing').length;
    const stateDiffs = diffs.filter((d) => d.diffType === 'state').length;
    const eventDiffs = diffs.filter(
      (d) => d.diffType === 'event-missing' || d.diffType === 'event-extra',
    ).length;

    const lines: string[] = [
      `Overall similarity: ${(similarity * 100).toFixed(1)}%`,
      `Total differences: ${diffs.length}`,
    ];

    if (positionDiffs > 0) lines.push(`  Position diffs: ${positionDiffs}`);
    if (rotationDiffs > 0) lines.push(`  Rotation diffs: ${rotationDiffs}`);
    if (timingDiffs > 0)
      lines.push(`  Timing diffs: ${timingDiffs} (avg ${timingDeviation.toFixed(1)}ms)`);
    if (stateDiffs > 0) lines.push(`  State diffs: ${stateDiffs}`);
    if (eventDiffs > 0) lines.push(`  Event count diffs: ${eventDiffs}`);

    if (similarity > 0.99) {
      lines.push('Sessions are nearly identical.');
    } else if (similarity > 0.9) {
      lines.push('Sessions are very similar with minor deviations.');
    } else if (similarity > 0.7) {
      lines.push('Sessions have moderate differences.');
    } else {
      lines.push('Sessions have significant differences.');
    }

    return lines.join('\n');
  }

  // ===========================================================================
  // Desync Detection
  // ===========================================================================

  /**
   * Verify that the current scene state matches the expected state at this frame.
   * Useful during playback to detect non-determinism.
   */
  verifyDeterminism(expectedCheckpoint: Checkpoint): boolean {
    if (!this.sceneAdapter) return true;

    let desynced = false;

    for (const expected of expectedCheckpoint.objects) {
      const current = this.sceneAdapter.getObjectState(expected.id);
      if (!current) {
        this.emitEvent('desync-detected', {
          objectId: expected.id,
          reason: 'Object missing in current scene',
          frameNumber: this.frameNumber,
        });
        desynced = true;
        continue;
      }

      const posDist = vec3Distance(current.position, expected.position);
      if (posDist > 0.001) {
        this.emitEvent('desync-detected', {
          objectId: expected.id,
          reason: `Position desync: ${posDist.toFixed(6)}m`,
          expected: expected.position,
          actual: current.position,
          frameNumber: this.frameNumber,
        });
        desynced = true;
      }
    }

    return !desynced;
  }

  // ===========================================================================
  // Math.random Override
  // ===========================================================================

  /**
   * Override Math.random with the deterministic PRNG.
   */
  private overrideMathRandom(): void {
    if (!this.originalMathRandom) {
      this.originalMathRandom = Math.random;
    }
    const rng = this.rng;
    Math.random = () => rng.next();
  }

  /**
   * Restore the original Math.random.
   */
  private restoreMathRandom(): void {
    if (this.originalMathRandom) {
      Math.random = this.originalMathRandom;
      this.originalMathRandom = null;
    }
  }

  // ===========================================================================
  // PRNG Access
  // ===========================================================================

  /**
   * Get the deterministic RNG instance for direct use.
   */
  getRNG(): DeterministicRNG {
    return this.rng;
  }

  /**
   * Get the fixed timestep accumulator.
   */
  getTimestepAccumulator(): FixedTimestepAccumulator {
    return this.timestepAccumulator;
  }

  // ===========================================================================
  // State & Queries
  // ===========================================================================

  /**
   * Get the current session state.
   */
  getState(): SessionState {
    return {
      sessionId: this.sessionId,
      mode: this.mode,
      seed: this.config.seed,
      frameNumber: this.frameNumber,
      elapsedTime: this.elapsedTime,
      isRecording: this.isRecording,
      isPlaying: this.isPlaying,
      checkpointCount: this.checkpoints.size,
      inputEventCount: this.inputEvents.length,
      playbackProgress: this.playbackRecording
        ? this.frameNumber / Math.max(this.playbackRecording.totalFrames, 1)
        : 0,
    };
  }

  /**
   * Get the session ID.
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get the input recording from the current or most recent session.
   */
  getInputRecording(): InputRecording | null {
    if (this.inputEvents.length === 0) return null;

    return {
      sessionId: this.sessionId,
      seed: this.config.seed,
      startTime: this.startTime,
      endTime: performance.now(),
      totalFrames: this.frameNumber,
      events: [...this.inputEvents],
      metadata: { ...this.config.metadata },
    };
  }

  /**
   * Get a stored session recording by ID.
   */
  getStoredRecording(sessionId: string): InputRecording | undefined {
    return this.sessionRecordings.get(sessionId);
  }

  /**
   * Store an external recording for comparison.
   */
  storeRecording(recording: InputRecording): void {
    this.sessionRecordings.set(recording.sessionId, recording);
  }

  // ===========================================================================
  // Serialization
  // ===========================================================================

  /**
   * Export the current recording as a JSON string.
   */
  exportRecording(): string {
    const recording = this.getInputRecording();
    if (!recording) return '{}';
    return JSON.stringify(recording, null, 2);
  }

  /**
   * Import a recording from a JSON string.
   */
  importRecording(json: string): InputRecording {
    const recording: InputRecording = JSON.parse(json);
    this.sessionRecordings.set(recording.sessionId, recording);
    return recording;
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  /**
   * Register an event handler.
   */
  on(event: SessionEventType, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Remove an event handler.
   */
  off(event: SessionEventType, handler: EventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Emit an event.
   */
  private emitEvent(type: SessionEventType, data?: unknown): void {
    const event: SessionEvent = { type, timestamp: performance.now(), data };
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error(`[ReproducibleTraining] Error in event handler for "${type}":`, err);
        }
      }
    }
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.stop();
    this.restoreMathRandom();
    this.checkpoints.clear();
    this.checkpointOrder = [];
    this.inputEvents = [];
    this.sessionRecordings.clear();
    this.eventHandlers.clear();
    this.physicsAdapter = null;
    this.sceneAdapter = null;
    this.inputReplayCallback = null;
  }
}
