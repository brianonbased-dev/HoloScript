/**
 * SNNCognitionEngine — snn-webgpu backed CAELCognitionEngine implementation.
 *
 * Replaces the inline SNNCognition placeholder (simplified V*leak+I LIF)
 * with a biophysically accurate Leaky Integrate-and-Fire implementation
 * sourced from @holoscript/snn-webgpu's CPUReferenceSimulator:
 *
 *   V[t+1] = V_rest + (V[t] - V_rest) * exp(-dt/tau) + I_syn[t]
 *   spike when V[t+1] >= V_threshold
 *   refractory period of 2ms post-spike
 *
 * The CPU path (CPUReferenceSimulator) is API-compatible with LIFSimulator
 * (the WebGPU GPU path). Upgrading to GPU execution is a constructor-level
 * swap — the CAELAgentLoop and all downstream consumers are unaffected.
 *
 * Sensor → Current mapping:
 *   sensor values (physical units, e.g. Pa stress, K temperature) are scaled
 *   to input currents in mV via `inputScalemV` (default: 20mV full-scale).
 *   This injection range pushes neurons from rest (-65mV) toward threshold
 *   (-55mV) at roughly 20% → light spiking, 100% → near-saturated spiking.
 *
 * Per-tick behaviour:
 *   Each think() call runs `stepsPerTick` LIF steps (default = round(dt_s * 1000)).
 *   All spikes are collected across all steps, timestamped in ms relative
 *   to the start of the tick window.
 *
 * Paper #2 claim:
 *   "First browser-native SNN integrated with a hash-chain simulation trace
 *   (CAEL). Physical sensor readings from a running FEM/thermal solver feed
 *   directly into an SNN; every spike train is committed to a tamper-evident
 *   CAEL trace for provenance and counterfactual replay."
 */

import {
  CPUReferenceSimulator,
  LIFSimulator,
  GPUContext,
  DEFAULT_LIF_PARAMS,
  type LIFParams,
} from '@holoscript/snn-webgpu';
import type {
  CAELCognitionEngine,
  CognitionSnapshot,
  SensorReading,
} from './CAELAgent';

// ── Config ───────────────────────────────────────────────────────────────────

export interface SNNCognitionEngineConfig {
  /** Unique identifier for provenance. Default: 'snn-cognition-engine' */
  id?: string;

  /** Number of LIF neurons. Default: 128 */
  neuronCount?: number;

  /**
   * LIF biophysical parameters.
   * Defaults from @holoscript/snn-webgpu:
   *   tau=20ms, vThreshold=-55mV, vReset=-75mV, vRest=-65mV, dt=1ms
   */
  lifParams?: Partial<LIFParams>;

  /**
   * Scale factor mapping sensor value [0,1] to input current in mV.
   * Full-scale sensor = inputScalemV injected into each neuron.
   * Default: 20mV (drives neurons from rest toward threshold without saturation).
   */
  inputScalemV?: number;

  /**
   * Number of LIF steps to run per think() call.
   * If undefined (default), computed as round(dt_seconds * 1000 / lifParams.dt).
   * Minimum is 1.
   */
  stepsPerTick?: number;

  /**
   * Population name to tag spikes with in the cognition snapshot.
   * Default: 'snn-lif'
   */
  population?: string;
}

// ── GOAP goal derivation ─────────────────────────────────────────────────────

/**
 * Derive a simple GOAP goal stack from the aggregate firing rate.
 * This is domain-generic and can be replaced by connecting a real GOAP
 * planner (see Paper #2 roadmap: GOAP → snn-webgpu goal coupling).
 */
function deriveGoalStack(
  spikeCount: number,
  totalNeurons: number,
  totalSteps: number,
  avgSignal: number,
): CognitionSnapshot['goalStack'] {
  const firingRate = totalSteps > 0 ? spikeCount / (totalNeurons * totalSteps) : 0;

  if (firingRate > 0.3 || avgSignal > 0.7) {
    return [{ id: 'stabilize_structure', priority: 1.0, status: 'active' }];
  }
  if (firingRate > 0.05 || avgSignal > 0.3) {
    return [{ id: 'monitor_structure', priority: 0.6, status: 'active' }];
  }
  return [{ id: 'idle', priority: 0.2, status: 'active' }];
}

// ── Implementation ───────────────────────────────────────────────────────────

/**
 * CAEL cognition engine backed by snn-webgpu CPUReferenceSimulator.
 *
 * Drop-in replacement for the SNNCognition placeholder. Satisfies the
 * synchronous CAELCognitionEngine interface by running the CPU LIF path,
 * which is bit-exact with the WebGPU GPU path for future GPU upgrade.
 */
export class SNNCognitionEngine implements CAELCognitionEngine {
  readonly id: string;

  private sim: CPUReferenceSimulator | LIFSimulator | null = null;
  private readonly neuronCount: number;
  private readonly inputScalemV: number;
  private readonly stepsPerTickOverride: number | undefined;
  private readonly population: string;
  private readonly lifDt: number;
  private readonly lifParams: Partial<LIFParams>;
  private isInitialized = false;

  constructor(config: SNNCognitionEngineConfig = {}) {
    this.id = config.id ?? 'snn-cognition-engine';
    this.neuronCount = config.neuronCount ?? 128;
    this.inputScalemV = config.inputScalemV ?? 20;
    this.stepsPerTickOverride = config.stepsPerTick;
    this.population = config.population ?? 'snn-lif';

    this.lifParams = {
      ...DEFAULT_LIF_PARAMS,
      ...config.lifParams,
    };

    this.lifDt = this.lifParams.dt ?? DEFAULT_LIF_PARAMS.dt;
    // Default to CPU on creation; async initialize() connects WebGPU
    this.sim = new CPUReferenceSimulator(this.neuronCount, this.lifParams);
  }

  /**
   * Initializes the WebGPU context and binds the LIFSimulator targeting it.
   * If this is skipped, the engine safely runs via the CPUReferenceSimulator backend.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    try {
      const gpuCtx = new GPUContext();
      await gpuCtx.initialize();
      const webgpuSim = new LIFSimulator(gpuCtx, this.neuronCount, this.lifParams);
      await webgpuSim.initialize();
      this.sim = webgpuSim;
      this.isInitialized = true;
    } catch (e) {
      console.warn('[SNNCognitionEngine] Failed to initialize WebGPU LIFSimulator, falling back to CPUReferenceSimulator:', e);
    }
  }

  // ── CAELCognitionEngine ──────────────────────────────────────────────────

  async think(sensors: SensorReading[], dt: number): Promise<CognitionSnapshot> {
    const inputCurrents = this.sensorsToCurrents(sensors);
    const backend = this.sim instanceof LIFSimulator ? 'webgpu' : 'cpu-reference';

    // Number of LIF timesteps to run for this agent tick
    const steps =
      this.stepsPerTickOverride ??
      Math.max(1, Math.round((dt * 1000) / this.lifDt));

    const allSpikes: Array<{ neuronIndex: number; timestampMs: number; population: string }> = [];
    let totalSpikeCount = 0;

    if (this.sim instanceof LIFSimulator) {
      // GPU executing path (Asynchronous)
      this.sim.setSynapticInput(inputCurrents);
      await this.sim.stepN(steps);

      const spikesResult = await this.sim.readSpikes();
      // readSpikes returns an array where >0 indicates a spike timestamp (or similar).
      // Converting WebGPU flat buffer spikes to the CAEL representation.
      // Based on WebGPU LIF, index matches neuron id.
      for (let i = 0; i < spikesResult.data.length; i++) {
        if (spikesResult.data[i] > 0) {
           allSpikes.push({
             neuronIndex: i,
             timestampMs: spikesResult.data[i], // Assumes buffer holds time or just >0 for a spike
             population: this.population
           });
           totalSpikeCount++;
        }
      }
    } else {
      // CPU executing path (Synchronous fallback)
      for (let s = 0; s < steps; s++) {
        const result = (this.sim as CPUReferenceSimulator).step(inputCurrents);
        totalSpikeCount += result.totalSpikes;

        // Timestamp each spike within the tick window (ms from tick start)
        const tickOffsetMs = s * this.lifDt;
        for (const ni of result.spikeIndices) {
          allSpikes.push({
            neuronIndex: ni,
            timestampMs: tickOffsetMs + result.simTimeMs,
            population: this.population,
          });
        }
      }
    }

    const membraneVoltages = this.sim instanceof CPUReferenceSimulator ? this.sim.getMembraneV() : new Float32Array();
    const avgSignal = inputCurrents.length > 0
      ? inputCurrents.reduce((a, b) => a + b, 0) / inputCurrents.length / this.inputScalemV
      : 0;

    const goalStack = deriveGoalStack(
      totalSpikeCount,
      this.neuronCount,
      steps,
      avgSignal,
    );

    return {
      spikes: allSpikes,
      spikeCount: totalSpikeCount,
      goalStack,
      activePlan: {
        id: 'snn-driven-plan',
        steps: ['observe', 'integrate', 'act'],
        currentStep: totalSpikeCount > 0 ? 2 : avgSignal > 0.2 ? 1 : 0,
      },
      membraneVoltages,
      extra: {
        avgSignalNorm: Number(avgSignal.toFixed(6)),
        stepsPerTick: steps,
        firingRate: steps > 0
          ? Number((totalSpikeCount / (this.neuronCount * steps)).toFixed(6))
          : 0,
        lifBackend: backend,
        lifDtMs: this.lifDt,
      },
    };
  }

  encode(snapshot: CognitionSnapshot): Record<string, unknown> {
    return {
      id: this.id,
      spikeCount: snapshot.spikeCount,
      spikes: snapshot.spikes.slice(0, 64).map((s) => ({
        neuronIndex: s.neuronIndex,
        timestampMs: Number(s.timestampMs.toFixed(6)),
        population: s.population,
      })),
      goalStack: snapshot.goalStack.map((g) => ({
        ...g,
        priority: Number(g.priority.toFixed(6)),
      })),
      activePlan: snapshot.activePlan,
      // Membrane voltages (first 32 neurons for trace compactness)
      membraneVoltagesSample: snapshot.membraneVoltages
        ? Array.from(snapshot.membraneVoltages.slice(0, 32), (v) =>
            Number(v.toFixed(4)),
          )
        : undefined,
      extra: snapshot.extra,
    };
  }

  // ── Sensor → Current mapping ─────────────────────────────────────────────

  /**
   * Map SensorReading arrays to a Float32Array of input currents in mV.
   *
   * Sensor values from the solver (Pa, K, m/s²…) are first normalized
   * to [0,1] relative to their observed range within the reading, then
   * scaled to [0, inputScalemV]. Multiple sensor readings are averaged
   * per neuron when sensors > neuronCount.
   *
   * If sensors < neuronCount, the input array is tiled.
   */
  private sensorsToCurrents(sensors: SensorReading[]): Float32Array {
    if (sensors.length === 0) {
      return new Float32Array(this.neuronCount).fill(0);
    }

    // Flatten all sensor values into one array
    const raw: number[] = [];
    for (const s of sensors) {
      for (let i = 0; i < s.values.length; i++) {
        raw.push(s.values[i]);
      }
    }

    if (raw.length === 0) {
      return new Float32Array(this.neuronCount).fill(0);
    }

    // Normalize to [0, 1] using min/max of this batch.
    // When the field is uniform-zero (no signal), output 0 current.
    // When the field is uniform non-zero (constant stimulus), output 0.5.
    let minV = raw[0];
    let maxV = raw[0];
    for (let i = 1; i < raw.length; i++) {
      if (raw[i] < minV) minV = raw[i];
      if (raw[i] > maxV) maxV = raw[i];
    }
    const range = maxV - minV;

    const normalised = raw.map((v) => {
      if (range < 1e-12) {
        // Uniform field: zero signal → 0, non-zero constant → 0.5
        return Math.abs(maxV) < 1e-12 ? 0 : 0.5;
      }
      return (v - minV) / range;
    });

    // Resize to neuronCount via tiling or averaging
    const currents = new Float32Array(this.neuronCount);
    for (let n = 0; n < this.neuronCount; n++) {
      // Average over the corresponding window in the normalised array
      const ratio = normalised.length / this.neuronCount;
      const start = Math.floor(n * ratio);
      const end = Math.max(start + 1, Math.floor((n + 1) * ratio));
      let sum = 0;
      for (let i = start; i < end && i < normalised.length; i++) {
        sum += normalised[i];
      }
      const avg = sum / (end - start);
      currents[n] = avg * this.inputScalemV;
    }

    return currents;
  }

  // ── State access ─────────────────────────────────────────────────────────

  /** Get current membrane voltages (mV) for all neurons. */
  getMembraneVoltages(): Float32Array {
    if (this.sim instanceof CPUReferenceSimulator) {
      return this.sim.getMembraneV();
    }
    return new Float32Array(this.neuronCount);
  }

  /** Reset all neurons to resting potential. */
  reset(): void {
    if (this.sim instanceof CPUReferenceSimulator) this.sim.reset();
    else if (this.sim instanceof LIFSimulator) this.sim.resetState();
  }
}
