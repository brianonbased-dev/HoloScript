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
import { RegularGrid3D } from './RegularGrid3D';
import { hashGeometry } from './SimulationContract';

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
 * - SNNCognitionEngine: snn-webgpu backed LIF cognition (default path)
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
  think(sensors: SensorReading[], dt: number): Promise<CognitionSnapshot> | CognitionSnapshot;
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
  async tick(dt: number): Promise<ActionDecision> {
    const contracted = this.recorder.getContractedSimulation();
    const solver = this.recorder.getSolver();
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
    const cognition = await this.config.cognition.think(readings, dt);
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

// ── Concrete Phase 2 Implementations ───────────────────────────────────────

export interface FieldSensorPoint {
  /** Normalized position in [0,1] for each axis. */
  x: number;
  y?: number;
  z?: number;
}

export interface FieldSensorBridgeConfig {
  id?: string;
  fieldName?: string;
  points: FieldSensorPoint[];
}

/**
 * Samples a solver field (default: von_mises_stress) at fixed spatial points.
 */
export class FieldSensorBridge implements CAELSensorBridge {
  readonly id: string;
  readonly fieldNames: readonly string[];
  private readonly points: FieldSensorPoint[];

  constructor(config: FieldSensorBridgeConfig) {
    this.id = config.id ?? 'field-sensor-bridge';
    this.fieldNames = [config.fieldName ?? 'von_mises_stress'];
    this.points = config.points;
  }

  sample(solver: SimSolver, simTime: number): SensorReading[] {
    const readings: SensorReading[] = [];

    for (const fieldName of this.fieldNames) {
      const field = solver.getField(fieldName);
      if (!field) continue;

      const values = this.sampleField(field, this.points);
      const positions = new Float64Array(
        this.points.flatMap((p) => [p[0], p[1] ?? 0, p[2] ?? 0])
      );

      readings.push({ fieldName, simTime, values, positions });
    }

    return readings;
  }

  encode(readings: SensorReading[]): Record<string, unknown> {
    return {
      id: this.id,
      readings: readings.map((r) => ({
        fieldName: r.fieldName,
        simTime: Number(r.simTime.toFixed(9)),
        values: Array.from(r.values, (v) => Number(v.toFixed(6))),
        positions: r.positions ? Array.from(r.positions, (v) => Number(v.toFixed(6))) : undefined,
      })),
    };
  }

  private sampleField(field: FieldData, points: FieldSensorPoint[]): Float32Array {
    if (field instanceof RegularGrid3D) {
      const out = new Float32Array(points.length);
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const ix = Math.max(0, Math.min(field.nx - 1, Math.round((p[0] ?? 0) * (field.nx - 1))));
        const iy = Math.max(0, Math.min(field.ny - 1, Math.round((p[1] ?? 0) * (field.ny - 1))));
        const iz = Math.max(0, Math.min(field.nz - 1, Math.round((p[2] ?? 0) * (field.nz - 1))));
        out[i] = field.get(ix, iy, iz, 0);
      }
      return out;
    }

    const arr = field instanceof Float64Array ? new Float32Array(field) : field;
    const out = new Float32Array(points.length);
    for (let i = 0; i < points.length; i++) {
      const idx = Math.max(0, Math.min(arr.length - 1, Math.round(points[i].x * (arr.length - 1))));
      out[i] = arr[idx];
    }
    return out;
  }
}

export interface SimpleActionSelectorConfig {
  id?: string;
  defaultActionType?: string;
}

/**
 * GOAP utility selector — picks highest utility action and records alternatives.
 */
export class SimpleActionSelector implements CAELActionSelector {
  readonly id: string;
  private readonly defaultActionType: string;

  constructor(config: SimpleActionSelectorConfig = {}) {
    this.id = config.id ?? 'simple-action-selector';
    this.defaultActionType = config.defaultActionType ?? 'hold';
  }

  select(cognition: CognitionSnapshot, simTime: number): ActionDecision {
    const utilities = this.extractUtilities(cognition);

    const actions = Object.entries(utilities).map(([type, utility]) => ({
      type,
      params: { simTime },
      utility,
    }));

    if (actions.length === 0) {
      return {
        chosen: { type: this.defaultActionType, params: { simTime }, utility: 0 },
        alternatives: [],
        reason: 'no_utility_data',
      };
    }

    actions.sort((a, b) => (b.utility ?? 0) - (a.utility ?? 0));
    return {
      chosen: actions[0],
      alternatives: actions.slice(1),
      reason: 'max_utility',
    };
  }

  encode(decision: ActionDecision): Record<string, unknown> {
    return {
      id: this.id,
      chosen: {
        type: decision.chosen.type,
        params: decision.chosen.params,
        utility: decision.chosen.utility,
      },
      alternatives: decision.alternatives.map((a) => ({
        type: a.type,
        params: a.params,
        utility: a.utility,
      })),
      reason: decision.reason,
    };
  }

  private extractUtilities(cognition: CognitionSnapshot): Record<string, number> {
    const fromExtra = cognition.extra?.actionUtilities;
    if (fromExtra && typeof fromExtra === 'object') {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(fromExtra as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
      }
      return out;
    }

    const fallback = cognition.activePlan?.steps ?? [this.defaultActionType];
    const out: Record<string, number> = {};
    for (let i = 0; i < fallback.length; i++) {
      out[fallback[i]] = Number((1 - i * 0.1).toFixed(6));
    }
    return out;
  }
}

export interface StructuralActionMapperConfig {
  id?: string;
  /** Geometry arrays used for before/after world-state integrity hashing. */
  vertices?: Float32Array | Float64Array;
  elements?: Uint32Array;
  /** Preferred field to include in world-state hashing. */
  integrityFieldName?: string;
}

/**
 * Maps structural actions (e.g. add_load) to solver mutations.
 */
export class StructuralActionMapper implements CAELActionMapper {
  readonly id: string;
  private readonly vertices?: Float32Array | Float64Array;
  private readonly elements?: Uint32Array;
  private readonly integrityFieldName: string;

  constructor(config: StructuralActionMapperConfig = {}) {
    this.id = config.id ?? 'structural-action-mapper';
    this.vertices = config.vertices;
    this.elements = config.elements;
    this.integrityFieldName = config.integrityFieldName ?? 'von_mises_stress';
  }

  apply(action: AgentAction, solver: SimSolver, _simTime: number): WorldDelta {
    const hashBefore = this.hashWorldState(solver);

    let details: Record<string, unknown> = { applied: false };
    if (action.type === 'add_load' || action.type === 'modify_load') {
      const mut = solver as unknown as {
        updateLoad?: (id: string, force: [number, number, number]) => void;
      };
      const loadId = String(action.params.loadId ?? 'agent-load');
      const fx = Number(action.params.fx ?? 0);
      const fy = Number(action.params.fy ?? 0);
      const fz = Number(action.params.fz ?? 0);
      if (typeof mut.updateLoad === 'function') {
        mut.updateLoad(loadId, [fx, fy, fz]);
        details = { applied: true, loadId, force: [fx, fy, fz] };
      } else {
        details = { applied: false, reason: 'solver_has_no_updateLoad', loadId, force: [fx, fy, fz] };
      }
    } else {
      details = { applied: false, reason: 'unsupported_action_type', actionType: action.type };
    }

    const hashAfter = this.hashWorldState(solver);

    return {
      type: 'custom',
      description: `Applied action ${action.type}`,
      details,
      hashBefore,
      hashAfter,
    };
  }

  encode(delta: WorldDelta): Record<string, unknown> {
    return {
      id: this.id,
      type: delta.type,
      description: delta.description,
      details: delta.details,
      hashBefore: delta.hashBefore,
      hashAfter: delta.hashAfter,
    };
  }

  private hashWorldState(solver: SimSolver): string {
    const geoHash = this.vertices && this.elements
      ? hashGeometry(this.vertices, this.elements)
      : 'geo-unavailable';

    const field = solver.getField(this.integrityFieldName);
    const fieldHash = this.hashFieldData(field);
    return `${geoHash}|${fieldHash}`;
  }

  private hashFieldData(field: FieldData | null): string {
    if (!field) return 'field-none';

    const arr = field instanceof RegularGrid3D
      ? field.data
      : field instanceof Float64Array
        ? new Float32Array(field)
        : field;

    let h = 2166136261;
    for (let i = 0; i < arr.length; i++) {
      const q = Math.round(arr[i] * 1e6);
      h ^= (q & 0xff); h = Math.imul(h, 16777619);
      h ^= ((q >> 8) & 0xff); h = Math.imul(h, 16777619);
      h ^= ((q >> 16) & 0xff); h = Math.imul(h, 16777619);
      h ^= ((q >> 24) & 0xff); h = Math.imul(h, 16777619);
    }
    return `field-${(h >>> 0).toString(16).padStart(8, '0')}`;
  }
}
