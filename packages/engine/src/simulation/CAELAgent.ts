/**
 * CAELAgent — Phase 2 interfaces for agent integration with CAEL traces.
 *
 * Extends Phase 1 (CAELRecorder/CAELTrace) with agent-specific primitives:
 *   O_t: perception (sensor bridge reads solver fields → SNN input)
 *   C_t: cognition trace (SNN spike train + GOAP goal stack, serialized)
 *   A_t: action (chosen action + alternatives considered)
 *   ΔW_t: world delta (what the action changed in the simulation)
 *
 * Usage:
 *   const agent = new CAELAgentLoop(recorder, sensor, cognition, actionMapper);
 *   agent.tick(dt);  // perception → cognition → action → physics → record
 *
 * Each tick appends 4 entries to the CAEL trace: perception, cognition, action, step.
 * The hash chain is maintained by the underlying CAELRecorder.
 */

import type { CAELRecorder } from './CAELRecorder';
import type { FieldData, SimSolver } from './SimSolver';

// ── Perception (O_t) ────────────────────────────────────────────────────────

/**
 * A sensor reading from the simulation. The bridge maps solver fields to
 * agent-consumable arrays (e.g., stress field → SNN input currents).
 */
export interface SensorReading {
  /** Which solver field was sampled */
  fieldName: string;
  /** Simulation time at sampling */
  simTime: number;
  /** Sampled values (length = number of sensor neurons) */
  values: Float64Array | Float32Array;
  /** Optional: spatial positions of sensor points */
  positions?: Float64Array;
}

/**
 * Bridges solver output fields to agent sensory input.
 *
 * Implementations define HOW the agent perceives the simulation:
 * - FieldSensorBridge: samples getField() at fixed spatial points
 * - StressSensorBridge: maps von Mises stress to SNN input currents
 * - ThermalSensorBridge: maps temperature field to SNN input
 */
export interface CAELSensorBridge {
  /** Unique sensor identifier (for provenance) */
  readonly id: string;
  /** Which solver field names this sensor reads */
  readonly fieldNames: readonly string[];
  /**
   * Sample the simulation state and produce sensor readings.
   * Called once per agent tick, BEFORE cognition.
   */
  sample(solver: SimSolver, simTime: number): SensorReading[];
  /**
   * Encode sensor readings for hashing (deterministic serialization).
   * Must produce identical output for identical readings.
   */
  encode(readings: SensorReading[]): Record<string, unknown>;
}

// ── Cognition (C_t) ─────────────────────────────────────────────────────────

/**
 * A snapshot of the agent's cognitive state at one timestep.
 */
export interface CognitionSnapshot {
  /** SNN spike events since last tick (neuronIndex + time) */
  spikes: Array<{ neuronIndex: number; timestampMs: number; population?: string }>;
  /** Number of SNN neurons that fired */
  spikeCount: number;
  /** GOAP goal stack (top = active goal) */
  goalStack: Array<{ id: string; priority: number; status: 'active' | 'satisfied' | 'failed' }>;
  /** Active plan (sequence of actions toward current goal) */
  activePlan?: { id: string; steps: string[]; currentStep: number };
  /** Optional: membrane voltages for full state reconstruction */
  membraneVoltages?: Float32Array;
  /** Optional: any additional cognitive state (working memory, attention, etc.) */
  extra?: Record<string, unknown>;
}

/**
 * Processes sensor input and produces a cognition snapshot + action selection.
 *
 * Implementations define HOW the agent thinks:
 * - SNNCognition: runs SNN step with sensor input as currents, reads spike output
 * - GOAPCognition: evaluates goal preconditions, selects next action from plan
 * - HybridCognition: SNN perception → GOAP planning (the intended architecture)
 */
export interface CAELCognitionEngine {
  /** Unique engine identifier (for provenance) */
  readonly id: string;
  /**
   * Process sensor input and produce cognition snapshot.
   * Called once per agent tick, AFTER perception, BEFORE action selection.
   *
   * @param sensors Sensor readings from the current tick
   * @param dt Time since last tick (seconds)
   * @returns Cognition snapshot including spike train and goal stack
   */
  think(sensors: SensorReading[], dt: number): CognitionSnapshot;
  /**
   * Encode cognition snapshot for hashing.
   * Spike times must be quantized to simulation timestep resolution
   * for deterministic hashing (see G.CAEL.934).
   */
  encode(snapshot: CognitionSnapshot): Record<string, unknown>;
}

// ── Action (A_t) ────────────────────────────────────────────────────────────

/**
 * An action the agent can take in the simulation.
 */
export interface AgentAction {
  /** Unique action type identifier */
  type: string;
  /** Action parameters (e.g., {nodeIndex: 42, force: [0, 0, 1000]}) */
  params: Record<string, unknown>;
  /** Expected utility or confidence (from the cognition engine) */
  utility?: number;
}

/**
 * The result of action selection: chosen action + alternatives considered.
 * The alternatives are critical for CAEL — they enable counterfactual analysis
 * ("what if the agent had chosen action B instead?").
 */
export interface ActionDecision {
  /** The action the agent chose to execute */
  chosen: AgentAction;
  /** Alternative actions that were considered but not chosen */
  alternatives: AgentAction[];
  /** Why this action was chosen (optional, for human-readable provenance) */
  reason?: string;
}

/**
 * Selects an action based on cognition state.
 * Separated from CognitionEngine to allow the same cognition to drive
 * different action policies (e.g., greedy vs exploratory).
 */
export interface CAELActionSelector {
  /** Unique selector identifier */
  readonly id: string;
  /**
   * Select an action based on the current cognition snapshot.
   * MUST return both the chosen action AND alternatives for provenance.
   */
  select(cognition: CognitionSnapshot, simTime: number): ActionDecision;
  /** Encode decision for hashing */
  encode(decision: ActionDecision): Record<string, unknown>;
}

// ── World Delta (ΔW_t) ──────────────────────────────────────────────────────

/**
 * Describes what changed in the simulation as a result of an agent action.
 */
export interface WorldDelta {
  /** What type of modification was made */
  type: 'add_load' | 'remove_load' | 'modify_material' | 'modify_constraint' | 'modify_geometry' | 'custom';
  /** Human-readable description */
  description: string;
  /** The modification details (solver-specific) */
  details: Record<string, unknown>;
  /** Geometry hash BEFORE the action */
  hashBefore: string;
  /** Geometry hash AFTER the action */
  hashAfter: string;
}

/**
 * Maps agent actions to simulation state changes.
 * This is where the agent's decision becomes physics.
 */
export interface CAELActionMapper {
  /** Unique mapper identifier */
  readonly id: string;
  /**
   * Apply an action to the simulation and return what changed.
   * The mapper modifies the solver state and records the delta.
   *
   * @param action The action to apply
   * @param solver The simulation solver to modify
   * @param simTime Current simulation time
   * @returns What changed in the world
   */
  apply(action: AgentAction, solver: SimSolver, simTime: number): WorldDelta;
  /** Encode delta for hashing */
  encode(delta: WorldDelta): Record<string, unknown>;
}

// ── Agent Loop (orchestrator) ───────────────────────────────────────────────

/**
 * Configuration for the CAEL agent loop.
 */
export interface CAELAgentConfig {
  /** Agent identifier (for multi-agent traces) */
  agentId: string;
  /** Sensor bridge (perception) */
  sensor: CAELSensorBridge;
  /** Cognition engine (SNN + GOAP) */
  cognition: CAELCognitionEngine;
  /** Action selector (decision making) */
  actionSelector: CAELActionSelector;
  /** Action mapper (decision → physics) */
  actionMapper: CAELActionMapper;
  /** Whether to record full membrane voltages (expensive but enables dream replay) */
  recordFullState?: boolean;
}

/**
 * The complete CAEL agent-environment loop.
 *
 * Each tick():
 *   1. Perception: sensor bridge samples solver fields → SensorReading[]
 *   2. Cognition: engine processes sensors → CognitionSnapshot (spikes + goals)
 *   3. Action: selector chooses action → ActionDecision (chosen + alternatives)
 *   4. Physics: mapper applies action → WorldDelta, then solver.step()
 *   5. Record: all four components appended to CAEL trace with hash chain
 *
 * The resulting trace satisfies:
 *   E_t = H(E_{t-1}, O_t, C_t, A_t, P_t, ΔW_t)
 */
export class CAELAgentLoop {
  private readonly recorder: CAELRecorder;
  private readonly config: CAELAgentConfig;
  private tickCount = 0;

  constructor(recorder: CAELRecorder, config: CAELAgentConfig) {
    this.recorder = recorder;
    this.config = config;

    // Record agent initialization in the trace
    this.recorder.logInteraction('cael.agent.init', {
      agentId: config.agentId,
      sensorId: config.sensor.id,
      cognitionId: config.cognition.id,
      actionSelectorId: config.actionSelector.id,
      actionMapperId: config.actionMapper.id,
      recordFullState: config.recordFullState ?? false,
    });
  }

  /**
   * Execute one complete agent-environment loop iteration.
   *
   * @param dt Wall-clock delta for this tick (seconds)
   * @returns The action decision made this tick
   */
  tick(dt: number): ActionDecision {
    const contracted = this.recorder.getContractedSimulation();
    const solver = (contracted as unknown as { solver: SimSolver }).solver;
    const prov = contracted.getProvenance();
    const simTime = prov.totalSimTime;

    // 1. PERCEPTION: sample the simulation state
    const readings = this.config.sensor.sample(solver, simTime);
    this.recorder.logInteraction('cael.perception', {
      agentId: this.config.agentId,
      tick: this.tickCount,
      sensor: this.config.sensor.encode(readings),
    });

    // 2. COGNITION: process sensors through SNN/GOAP
    const cognition = this.config.cognition.think(readings, dt);
    this.recorder.logInteraction('cael.cognition', {
      agentId: this.config.agentId,
      tick: this.tickCount,
      cognition: this.config.cognition.encode(cognition),
    });

    // 3. ACTION SELECTION: choose what to do
    const decision = this.config.actionSelector.select(cognition, simTime);
    this.recorder.logInteraction('cael.action', {
      agentId: this.config.agentId,
      tick: this.tickCount,
      decision: this.config.actionSelector.encode(decision),
    });

    // 4. APPLY ACTION → WORLD DELTA
    const delta = this.config.actionMapper.apply(decision.chosen, solver, simTime);
    this.recorder.logInteraction('cael.world_delta', {
      agentId: this.config.agentId,
      tick: this.tickCount,
      delta: this.config.actionMapper.encode(delta),
    });

    // 5. PHYSICS STEP (advances the contracted simulation)
    this.recorder.step(dt);

    this.tickCount++;
    return decision;
  }

  /** Get the current tick count */
  getTickCount(): number {
    return this.tickCount;
  }

  /** Get the underlying recorder for trace export */
  getRecorder(): CAELRecorder {
    return this.recorder;
  }

  /** Export the complete CAEL trace as JSONL */
  toJSONL(): string {
    return this.recorder.toJSONL();
  }
}
