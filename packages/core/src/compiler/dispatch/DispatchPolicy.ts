/**
 * DispatchPolicy — NN-Primary, CPU-Backup HoloScript Inversion
 *
 * Routes trait execution across three tiers:
 *   Tier 1-Browser:      SNN-WebGPU (snn-webgpu package)
 *   Tier 1-Neuromorphic: NIR-targeted (Loihi 2 / SpiNNaker 2 / SynSense per CircuitBreaker.ts:71)
 *   Tier 1-WASM:         compiler-wasm LIF emulator fallback when WebGPU is absent
 *   Tier 2:              LLM-speculative with CPU verifier (CURE/SimulationContract/EffectInference)
 *   Tier 3:              CPU-direct deterministic (audit/replay/proof generation)
 *
 * The dispatch decision itself is a HoloScript trait recorded in CURE provenance.
 * MVP proving ground: @grabbable interaction trait.
 *
 * Source: research/2026-05-09_nn-primary-cpu-backup-holoscript-EVOLVED.md
 * @module @holoscript/core/compiler/dispatch
 */

import type { ProvenanceContext, ProvenanceValue } from '../traits/ProvenanceSemiring';
import { isWebGpuEnvironmentPresent } from '../../reconstruction/webgpuGate';
import type { ReconstructionManifest } from '../../reconstruction/HoloMapRuntime';
import { assertHoloMapManifestContract } from '../../reconstruction/simulationContractBinding';
import { ExpressionEvaluator } from '../../ReactiveState';

export enum DispatchTier {
  TIER_1_NEUROMORPHIC = 'tier-1-neuromorphic',
  TIER_1_BROWSER = 'tier-1-browser',
  TIER_1_WASM = 'tier-1-wasm',
  TIER_2_SPECULATIVE = 'tier-2-speculative',
  TIER_3_CPU_DIRECT = 'tier-3-cpu-direct',
}

export type NeuromorphicDeviceTarget = 'loihi' | 'spinnaker' | 'synsense' | 'akida';

export interface NeuromorphicRuntimeDevice {
  target: NeuromorphicDeviceTarget;
  id?: string;
  available?: boolean;
  source?: string;
}

export interface NeuromorphicRuntimeProbeResult {
  available: boolean;
  device?: NeuromorphicDeviceTarget;
  source: string;
  reason?: string;
  devices?: NeuromorphicRuntimeDevice[];
}

export type NeuromorphicRuntimeProbe = (
  preferredDevice?: NeuromorphicDeviceTarget
) => NeuromorphicRuntimeProbeResult | Promise<NeuromorphicRuntimeProbeResult>;

export interface DispatchEffectVerifierResult {
  passed: boolean;
  reason?: string;
}

export interface Tier3CpuDirectOutput {
  trait: string;
  nodeId: string;
  config: Record<string, unknown>;
}

export interface TraitEquivalenceOracleInput {
  operation: DispatchableOperation;
  proposal: unknown;
  tier3Output: unknown;
}

export interface TraitEquivalenceOracleResult {
  equivalent: boolean;
  source: string;
  reason?: string;
  score?: number;
  proposalFingerprint?: string;
  tier3Fingerprint?: string;
}

export type DispatchProposalProvider = (
  op: DispatchableOperation
) => unknown | null | Promise<unknown | null>;

export type Tier3CpuExecutor = (op: DispatchableOperation) => unknown | Promise<unknown>;

export type TraitEquivalenceOracle = (
  input: TraitEquivalenceOracleInput
) => TraitEquivalenceOracleResult | Promise<TraitEquivalenceOracleResult>;

export interface Tier1WasmRuntimeProbeResult {
  available: boolean;
  source: string;
  reason?: string;
  moduleValidated?: boolean;
}

export interface Tier1WasmEmulatorResult {
  accepted: boolean;
  source: string;
  runtime: Tier1WasmRuntimeProbeResult;
  reason?: string;
  steps?: number;
  spikeCount?: number;
  membranePotential?: number;
  inputChecksum?: number;
}

export type Tier1WasmRuntimeProbe = () =>
  | Tier1WasmRuntimeProbeResult
  | Promise<Tier1WasmRuntimeProbeResult>;

export type Tier1WasmExecutor = (
  op: DispatchableOperation,
  runtime: Tier1WasmRuntimeProbeResult
) => Tier1WasmEmulatorResult | Promise<Tier1WasmEmulatorResult>;

export type Tier1BrowserExecutor = (
  op: DispatchableOperation
) => Promise<{ accepted: boolean; source: string; steps?: number; reason?: string }>;

export interface DispatchPolicyConfig {
  /** Enable Tier-1 Browser (WebGPU SNN) path */
  tier1BrowserEnabled: boolean;
  /** Enable Tier-1 WASM SNN fallback path when WebGPU is absent */
  tier1WasmEnabled: boolean;
  /** Runtime WebAssembly probe. Defaults to validating a minimal WASM module. */
  tier1WasmRuntimeProbe?: Tier1WasmRuntimeProbe;
  /** compiler-wasm SNN emulator hook. Defaults to the built-in LIF emulator. */
  tier1WasmExecutor?: Tier1WasmExecutor;
  /** WebGPU SNN browser executor. Defaults to dynamic import of @holoscript/snn-webgpu. */
  tier1BrowserExecutor?: Tier1BrowserExecutor;
  /** Enable Tier-1 Neuromorphic (NIR) path */
  tier1NeuromorphicEnabled: boolean;
  /** Specific NIR device target, if any */
  tier1NeuromorphicDevice?: NeuromorphicDeviceTarget;
  /** Runtime NIR device probe. Defaults to global/env discovery signals. */
  neuromorphicRuntimeProbe?: NeuromorphicRuntimeProbe;
  /** Enable Tier-2 speculative LLM + CPU verifier */
  tier2Enabled: boolean;
  /** Tier-2 proposal source. Defaults to unavailable, so Tier-2 fails closed. */
  llmProposalProvider?: DispatchProposalProvider;
  /** Deterministic Tier-3 output source used as the semantic-equivalence baseline. */
  tier3CpuExecutor?: Tier3CpuExecutor;
  /** Compares Tier-2 proposal output with Tier-3 CPU-direct output. */
  traitEquivalenceOracle?: TraitEquivalenceOracle;
  /** Minimum alpha (acceptance rate) to allow Tier-2 promotion */
  tier2AlphaThreshold: number;
  /** Effect-checker verifier for Tier-2 acceptance gate */
  effectVerifier?: (traits: string[]) => Promise<DispatchEffectVerifierResult | null>;
  /** Simulation-contract verifier for Tier-2 acceptance gate */
  simulationContractVerifier?: (manifest: unknown) => Promise<boolean>;
  /** Rolling window size for alpha tracking */
  alphaWindowSize: number;
}

export interface DispatchableOperation {
  /** Trait name being dispatched, e.g. 'grabbable' */
  trait: string;
  /** Unique node / entity identifier */
  nodeId: string;
  /** Trait configuration payload */
  config?: Record<string, unknown>;
  /** Provenance context for CURE recording */
  provenanceContext?: ProvenanceContext;
  /** Optional HoloMap-style manifest for simulation-contract checks */
  manifest?: ReconstructionManifest;
}

export interface DispatchMetrics {
  tierAttempted: DispatchTier;
  tierAccepted: boolean;
  fallbackReason?: string;
  latencyEstimateMs: number;
  /** For Tier-2: speculative-decoding alpha at time of dispatch */
  alpha?: number;
  /** For Tier-2: result of the verifier gate independent from alpha. */
  verifierPassed?: boolean;
  /** For Tier-2: semantic equivalence against Tier-3 CPU direct output. */
  traitEquivalence?: TraitEquivalenceOracleResult;
  /** Runtime probe evidence for Tier-1 neuromorphic decisions */
  neuromorphicProbe?: NeuromorphicRuntimeProbeResult;
  /** Runtime probe evidence for Tier-1 WASM fallback decisions */
  wasmProbe?: Tier1WasmRuntimeProbeResult;
  /** compiler-wasm SNN emulator evidence for Tier-1 WASM fallback decisions */
  wasmEmulator?: Tier1WasmEmulatorResult;
  /** Runtime evidence for Tier-1 browser decisions */
  browserExecutor?: { accepted: boolean; source: string; steps?: number; reason?: string };
}

export interface DispatchDecision {
  tier: DispatchTier;
  accepted: boolean;
  provenance: ProvenanceValue;
  metrics: DispatchMetrics;
  /** Deterministic replay fingerprint for audit / proof generation */
  replayFingerprint?: string;
}

/**
 * Rolling-window alpha tracker for speculative-decoding acceptance rate.
 */
export class AlphaTracker {
  private window: boolean[] = [];
  private readonly size: number;

  constructor(size = 50) {
    this.size = size;
  }

  recordAttempt(success: boolean): void {
    this.window.push(success);
    if (this.window.length > this.size) {
      this.window.shift();
    }
  }

  getAlpha(): number {
    if (this.window.length === 0) return 0;
    const successes = this.window.filter((s) => s).length;
    return successes / this.window.length;
  }

  get windowLength(): number {
    return this.window.length;
  }
}

/**
 * DispatchPolicy — decides which tier executes a given trait operation.
 *
 * The decision itself is wrapped as a ProvenanceValue so it lands in the
 * CURE evidence pack and can be audited via the provenance semiring.
 */
export class DispatchPolicy {
  private config: DispatchPolicyConfig;
  private alphaTracker: AlphaTracker;

  constructor(config: Partial<DispatchPolicyConfig> = {}) {
    this.config = {
      tier1BrowserEnabled: false,
      tier1WasmEnabled: false,
      tier1NeuromorphicEnabled: false,
      tier2Enabled: false,
      tier2AlphaThreshold: 0.85,
      alphaWindowSize: 50,
      ...config,
    };
    this.alphaTracker = new AlphaTracker(this.config.alphaWindowSize);
  }

  /**
   * Route an operation to the highest viable tier, falling back as needed.
   */
  async route(op: DispatchableOperation): Promise<DispatchDecision> {
    const start = performance.now();

    let lastRejectionReason: string | undefined;
    let lastRejectionMetrics: Partial<DispatchMetrics> | undefined;

    // --- Tier 1-Neuromorphic -------------------------------------------------
    if (this.config.tier1NeuromorphicEnabled) {
      const decision = await this.tryTier1Neuromorphic(op);
      if (decision.accepted) {
        decision.metrics.latencyEstimateMs = performance.now() - start;
        return decision;
      }
      lastRejectionReason = decision.metrics.fallbackReason;
      lastRejectionMetrics = {
        neuromorphicProbe: decision.metrics.neuromorphicProbe,
      };
    }

    // --- Tier 1-Browser ------------------------------------------------------
    if (this.config.tier1BrowserEnabled) {
      const decision = await this.tryTier1Browser(op);
      if (decision.accepted) {
        decision.metrics.latencyEstimateMs = performance.now() - start;
        return decision;
      }
      lastRejectionReason = decision.metrics.fallbackReason;
      lastRejectionMetrics = undefined;
    }

    // --- Tier 1-WASM ---------------------------------------------------------
    if (this.config.tier1WasmEnabled) {
      const decision = await this.tryTier1Wasm(op);
      if (decision.accepted) {
        decision.metrics.latencyEstimateMs = performance.now() - start;
        return decision;
      }
      lastRejectionReason = decision.metrics.fallbackReason;
      lastRejectionMetrics = {
        wasmProbe: decision.metrics.wasmProbe,
        wasmEmulator: decision.metrics.wasmEmulator,
      };
    }

    // --- Tier 2-Speculative --------------------------------------------------
    if (this.config.tier2Enabled) {
      const decision = await this.tryTier2(op);
      if (decision.accepted) {
        decision.metrics.latencyEstimateMs = performance.now() - start;
        return decision;
      }
      lastRejectionReason = decision.metrics.fallbackReason;
      lastRejectionMetrics = {
        alpha: decision.metrics.alpha,
        verifierPassed: decision.metrics.verifierPassed,
        traitEquivalence: decision.metrics.traitEquivalence,
      };
    }

    // --- Tier 3-CPU Direct (always available) --------------------------------
    const decision = await this.fallbackTier3(
      op,
      lastRejectionReason ?? 'No higher tier accepted or enabled',
      lastRejectionMetrics
    );
    decision.metrics.latencyEstimateMs = performance.now() - start;
    return decision;
  }

  /** Current speculative-decoding alpha (Tier-2 acceptance rate). */
  getAlpha(): number {
    return this.alphaTracker.getAlpha();
  }

  // ---------------------------------------------------------------------------
  // TIER ATTEMPTERS
  // ---------------------------------------------------------------------------

  private async tryTier1Neuromorphic(op: DispatchableOperation): Promise<DispatchDecision> {
    const probe = await this.probeNeuromorphicRuntime();
    const deviceMatches =
      probe.available &&
      (!this.config.tier1NeuromorphicDevice ||
        probe.device === this.config.tier1NeuromorphicDevice);
    const traitCompatible = this.isTraitSnnCompatible(op.trait);
    const accepted = deviceMatches && traitCompatible;
    const reason = accepted
      ? undefined
      : this.describeNeuromorphicRejection(probe, traitCompatible);
    return this.buildDecision(DispatchTier.TIER_1_NEUROMORPHIC, accepted, op, reason, undefined, {
      neuromorphicProbe: probe,
    });
  }

  private async tryTier1Browser(op: DispatchableOperation): Promise<DispatchDecision> {
    const available = isWebGpuEnvironmentPresent();
    const traitCompatible = this.isTraitSnnCompatible(op.trait);

    if (!available || !traitCompatible) {
      const reason = !available
        ? 'WebGPU not available'
        : 'Trait is not mapped to the SNN/WebGPU hot path';
      return this.buildDecision(DispatchTier.TIER_1_BROWSER, false, op, reason);
    }

    const executor = this.config.tier1BrowserExecutor ?? runTier1BrowserSnn;
    try {
      const result = await executor(op);
      const reason = result.accepted
        ? undefined
        : result.reason ?? 'Tier-1 browser executor rejected dispatch';
      return this.buildDecision(
        DispatchTier.TIER_1_BROWSER,
        result.accepted,
        op,
        reason,
        undefined,
        { browserExecutor: result }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.buildDecision(DispatchTier.TIER_1_BROWSER, false, op, message, undefined, {
        browserExecutor: { accepted: false, source: 'tier-1-browser-error', reason: message },
      });
    }
  }

  private async tryTier1Wasm(op: DispatchableOperation): Promise<DispatchDecision> {
    const runtime = await this.probeWasmRuntime();
    const traitCompatible = this.isTraitSnnCompatible(op.trait);

    if (!runtime.available || !traitCompatible) {
      const reason = this.describeWasmRejection(runtime, traitCompatible);
      return this.buildDecision(DispatchTier.TIER_1_WASM, false, op, reason, undefined, {
        wasmProbe: runtime,
      });
    }

    const emulator = await this.runTier1WasmEmulator(op, runtime);
    const reason = emulator.accepted
      ? undefined
      : emulator.reason ?? 'compiler-wasm SNN emulator rejected dispatch';

    return this.buildDecision(
      DispatchTier.TIER_1_WASM,
      emulator.accepted,
      op,
      reason,
      undefined,
      {
        wasmProbe: runtime,
        wasmEmulator: emulator,
      }
    );
  }

  private async tryTier2(op: DispatchableOperation): Promise<DispatchDecision> {
    const provider = this.config.llmProposalProvider;
    const proposal = provider ? (await provider(op)) ?? null : null;
    if (!proposal) {
      this.alphaTracker.recordAttempt(false);
      const alpha = this.alphaTracker.getAlpha();
      return this.buildDecision(
        DispatchTier.TIER_2_SPECULATIVE,
        false,
        op,
        `LLM proposal failed; alpha ${alpha.toFixed(2)} < threshold ${this.config.tier2AlphaThreshold}`,
        alpha,
        {
          verifierPassed: false,
          traitEquivalence: {
            equivalent: false,
            source: 'dispatch-policy',
            reason: 'LLM proposal provider returned no output',
            score: 0,
          },
        }
      );
    }

    // CPU verifier gate: EffectInference + SimulationContract
    const verifierPassed = await this.runCpuVerifier(op, proposal);
    const tier3Output = await this.runTier3CpuDirect(op);
    const traitEquivalence = await this.evaluateTraitEquivalence(op, proposal, tier3Output);
    this.alphaTracker.recordAttempt(traitEquivalence.equivalent);

    const alpha = this.alphaTracker.getAlpha();
    const accepted =
      verifierPassed && traitEquivalence.equivalent && alpha >= this.config.tier2AlphaThreshold;

    const reason = accepted
      ? undefined
      : this.describeTier2Rejection(verifierPassed, traitEquivalence, alpha);

    return this.buildDecision(DispatchTier.TIER_2_SPECULATIVE, accepted, op, reason, alpha, {
      verifierPassed,
      traitEquivalence,
    });
  }

  private async fallbackTier3(
    op: DispatchableOperation,
    reason: string,
    extraMetrics: Partial<DispatchMetrics> = {}
  ): Promise<DispatchDecision> {
    return this.buildDecision(
      DispatchTier.TIER_3_CPU_DIRECT,
      true,
      op,
      reason,
      undefined,
      extraMetrics
    );
  }

  // ---------------------------------------------------------------------------
  // VERIFIERS & HELPERS
  // ---------------------------------------------------------------------------

  private async probeNeuromorphicRuntime(): Promise<NeuromorphicRuntimeProbeResult> {
    const probe = this.config.neuromorphicRuntimeProbe ?? detectNeuromorphicRuntime;
    return probe(this.config.tier1NeuromorphicDevice);
  }

  private async probeWasmRuntime(): Promise<Tier1WasmRuntimeProbeResult> {
    const probe = this.config.tier1WasmRuntimeProbe ?? detectWasmRuntime;
    return probe();
  }

  private async runTier1WasmEmulator(
    op: DispatchableOperation,
    runtime: Tier1WasmRuntimeProbeResult
  ): Promise<Tier1WasmEmulatorResult> {
    const executor = this.config.tier1WasmExecutor ?? runCompilerWasmSnnEmulator;
    try {
      return await executor(op, runtime);
    } catch (error) {
      return {
        accepted: false,
        source: 'compiler-wasm-snn-emulator',
        runtime,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private describeNeuromorphicRejection(
    probe: NeuromorphicRuntimeProbeResult,
    traitCompatible: boolean
  ): string {
    if (!probe.available) {
      return probe.reason ?? 'Neuromorphic runtime device not discovered';
    }
    if (
      this.config.tier1NeuromorphicDevice &&
      probe.device !== this.config.tier1NeuromorphicDevice
    ) {
      return `NIR runtime discovered ${probe.device ?? 'unknown'} but requires ${this.config.tier1NeuromorphicDevice}`;
    }
    if (!traitCompatible) {
      return 'Trait is not mapped to the SNN/NIR hot path';
    }
    return 'Neuromorphic runtime probe did not accept dispatch';
  }

  private describeWasmRejection(
    runtime: Tier1WasmRuntimeProbeResult,
    traitCompatible: boolean
  ): string {
    if (!runtime.available) {
      return runtime.reason ?? 'WebAssembly runtime unavailable for Tier-1 WASM fallback';
    }
    if (!traitCompatible) {
      return 'Trait is not mapped to the SNN/WASM hot path';
    }
    return 'compiler-wasm SNN emulator did not accept dispatch';
  }

  private isTraitSnnCompatible(trait: string): boolean {
    // MVP: only @grabbable and interaction traits are mapped to SNN hot path.
    const snnTraits = new Set(['grabbable', 'hoverable', 'clickable', 'draggable', 'throwable']);
    return snnTraits.has(trait);
  }

  private async runCpuVerifier(op: DispatchableOperation, _proposal: unknown): Promise<boolean> {
    let anyVerifierWired = false;

    // 1. EffectInference gate
    if (this.config.effectVerifier) {
      anyVerifierWired = true;
      const effectResult = await this.config.effectVerifier([op.trait]);
      if (!effectResult || !effectResult.passed) return false;
    }

    // 2. SimulationContract gate (when a manifest is supplied)
    if (op.manifest && this.config.simulationContractVerifier) {
      anyVerifierWired = true;
      const scPassed = await this.config.simulationContractVerifier(op.manifest);
      if (!scPassed) return false;
    } else if (op.manifest) {
      // If a manifest is present but no custom verifier is wired, run the
      // default HoloMap contract assertion as a baseline gate.
      anyVerifierWired = true;
      try {
        assertHoloMapManifestContract(op.manifest);
      } catch {
        return false;
      }
    }

    // Fail closed when no verifiers are wired.
    return anyVerifierWired;
  }

  private async runTier3CpuDirect(op: DispatchableOperation): Promise<unknown> {
    const executor = this.config.tier3CpuExecutor ?? runTier3CpuDirectExecutor;
    return executor(op);
  }

  private async evaluateTraitEquivalence(
    op: DispatchableOperation,
    proposal: unknown,
    tier3Output: unknown
  ): Promise<TraitEquivalenceOracleResult> {
    const oracle = this.config.traitEquivalenceOracle ?? defaultTraitEquivalenceOracle;
    try {
      return await oracle({ operation: op, proposal, tier3Output });
    } catch (error) {
      return {
        equivalent: false,
        source: 'trait-equivalence-oracle',
        reason: error instanceof Error ? error.message : String(error),
        score: 0,
      };
    }
  }

  private describeTier2Rejection(
    verifierPassed: boolean,
    equivalence: TraitEquivalenceOracleResult,
    alpha: number
  ): string {
    const parts = [
      `Verifier ${verifierPassed ? 'passed' : 'rejected'}`,
      `equivalence ${equivalence.equivalent ? 'passed' : 'failed'}`,
      `alpha ${alpha.toFixed(2)} < threshold ${this.config.tier2AlphaThreshold}`,
    ];
    if (equivalence.reason) {
      parts.push(equivalence.reason);
    }
    return parts.join('; ');
  }

  // ---------------------------------------------------------------------------
  // PROVENANCE BUILDER
  // ---------------------------------------------------------------------------

  private async buildDecision(
    tier: DispatchTier,
    accepted: boolean,
    op: DispatchableOperation,
    fallbackReason?: string,
    alpha?: number,
    extraMetrics: Partial<DispatchMetrics> = {}
  ): Promise<DispatchDecision> {
    const metrics: DispatchMetrics = {
      tierAttempted: tier,
      tierAccepted: accepted,
      fallbackReason,
      latencyEstimateMs: 0,
      alpha,
      ...extraMetrics,
    };

    const provenanceContext: ProvenanceContext = op.provenanceContext ?? {
      authorityLevel: 50, // AGENT default
      sourceType: 'system',
    };

    const provenance: ProvenanceValue = {
      value: { tier, accepted, nodeId: op.nodeId, trait: op.trait },
      source: 'dispatch-policy',
      context: provenanceContext,
    };

    const replayFingerprint = await this.hashDecision(provenance);

    return {
      tier,
      accepted,
      provenance,
      metrics,
      replayFingerprint,
    };
  }

  private async hashDecision(provenance: ProvenanceValue): Promise<string> {
    const value = provenance.value as Record<string, unknown>;
    const canonical = stableStringify(value);
    return `sha256:${await sha256Hex(canonical)}`;
  }
}

export function createTier3CpuDirectOutput(op: DispatchableOperation): Tier3CpuDirectOutput {
  return {
    trait: op.trait,
    nodeId: op.nodeId,
    config: op.config ?? {},
  };
}

async function runTier3CpuDirectExecutor(op: DispatchableOperation): Promise<Tier3CpuDirectOutput> {
  const evaluator = new ExpressionEvaluator(op.config ?? {});
  const evaluatedConfig: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(op.config ?? {})) {
    if (typeof value === 'string') {
      evaluatedConfig[key] = evaluator.evaluate(value);
    } else {
      evaluatedConfig[key] = value;
    }
  }
  return {
    trait: op.trait,
    nodeId: op.nodeId,
    config: evaluatedConfig,
  };
}

async function runLlmProposalProvider(op: DispatchableOperation): Promise<unknown | null> {
  try {
    const { createProviderManager } = await import('@holoscript/llm-provider');
    const manager = createProviderManager();
    const response = await manager.generateHoloScript({
      prompt: `Propose trait dispatch for ${op.trait} on node ${op.nodeId}`,
    });
    return response ?? null;
  } catch {
    return null;
  }
}

async function runTier1BrowserSnn(
  op: DispatchableOperation
): Promise<{ accepted: boolean; source: string; steps?: number; reason?: string }> {
  try {
    // @ts-ignore — optional dependency not declared in core package.json
    const snnWebgpu = await import('@holoscript/snn-webgpu');
    const { GPUContext, LIFSimulator, DEFAULT_LIF_PARAMS } = snnWebgpu as {
      GPUContext: new () => { initialize(): Promise<unknown> };
      LIFSimulator: new (ctx: unknown, neurons: number, params: unknown) => { initialize(): Promise<unknown>; stepN(steps: number): Promise<unknown> };
      DEFAULT_LIF_PARAMS: unknown;
    };
    const ctx = new GPUContext();
    await ctx.initialize();
    const simulator = new LIFSimulator(ctx, 1, DEFAULT_LIF_PARAMS);
    await simulator.initialize();
    const input = stableStringify({ trait: op.trait, nodeId: op.nodeId, config: op.config });
    const steps = Math.max(1, Math.min(64, input.length));
    await simulator.stepN(steps);
    return { accepted: true, source: 'snn-webgpu', steps };
  } catch (error) {
    return {
      accepted: false,
      source: 'snn-webgpu',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function detectWasmRuntime(): Tier1WasmRuntimeProbeResult {
  const runtime = globalThis as typeof globalThis & {
    WebAssembly?: {
      validate?: (bytes: Uint8Array) => boolean;
    };
  };
  const validate = runtime.WebAssembly?.validate;

  if (typeof validate !== 'function') {
    return {
      available: false,
      source: 'global-webassembly',
      reason: 'WebAssembly.validate is unavailable',
    };
  }

  const moduleValidated = validate(MINIMAL_WASM_MODULE);
  return {
    available: moduleValidated,
    source: 'global-webassembly',
    moduleValidated,
    reason: moduleValidated ? undefined : 'Minimal WebAssembly module failed validation',
  };
}

export function runCompilerWasmSnnEmulator(
  op: DispatchableOperation,
  runtime: Tier1WasmRuntimeProbeResult
): Tier1WasmEmulatorResult {
  if (!runtime.available) {
    return {
      accepted: false,
      source: 'compiler-wasm-snn-emulator',
      runtime,
      reason: runtime.reason ?? 'WebAssembly runtime unavailable',
    };
  }

  const input = stableStringify({
    trait: op.trait,
    nodeId: op.nodeId,
    config: op.config ?? {},
  });
  const steps = Math.max(1, Math.min(64, input.length));
  const state = emulateLifSteps(input, steps);

  return {
    accepted: true,
    source: 'compiler-wasm-snn-emulator',
    runtime,
    steps,
    spikeCount: state.spikeCount,
    membranePotential: state.membranePotential,
    inputChecksum: state.inputChecksum,
  };
}

async function defaultTraitEquivalenceOracle(
  input: TraitEquivalenceOracleInput
): Promise<TraitEquivalenceOracleResult> {
  const proposalCanonical = stableStringify(input.proposal);
  const tier3Canonical = stableStringify(input.tier3Output);
  const equivalent = proposalCanonical === tier3Canonical;
  return {
    equivalent,
    source: 'canonical-json',
    reason: equivalent ? 'canonical outputs match' : 'canonical outputs differ',
    score: equivalent ? 1 : 0,
    proposalFingerprint: `sha256:${await sha256Hex(proposalCanonical)}`,
    tier3Fingerprint: `sha256:${await sha256Hex(tier3Canonical)}`,
  };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? 'undefined';
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = canonicalize(record[key]);
  }
  return sorted;
}

async function sha256Hex(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(input));
    return bytesToHex(new Uint8Array(digest));
  }

  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(input).digest('hex');
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const MINIMAL_WASM_MODULE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
]);

function emulateLifSteps(
  input: string,
  steps: number
): { spikeCount: number; membranePotential: number; inputChecksum: number } {
  const vRest = -65;
  const vReset = -65;
  const vThreshold = -50;
  const tau = 12;

  let membranePotential = vRest;
  let spikeCount = 0;
  let inputChecksum = 2166136261;

  for (let i = 0; i < steps; i += 1) {
    const code = input.charCodeAt(i % input.length);
    inputChecksum ^= code;
    inputChecksum = Math.imul(inputChecksum, 16777619) >>> 0;

    const inputCurrent = 12 + (code % 17);
    membranePotential += (vRest - membranePotential + inputCurrent) / tau;
    if (membranePotential >= vThreshold) {
      spikeCount += 1;
      membranePotential = vReset;
    }
  }

  return {
    spikeCount,
    membranePotential: Number(membranePotential.toFixed(6)),
    inputChecksum,
  };
}

export function detectNeuromorphicRuntime(
  preferredDevice?: NeuromorphicDeviceTarget
): NeuromorphicRuntimeProbeResult {
  const globalDevices = readGlobalNeuromorphicDevices();
  const envDevices = readEnvNeuromorphicDevices();
  const devices = [...globalDevices, ...envDevices]
    .filter((device) => device.available !== false)
    .sort((a, b) => deviceRank(a.target) - deviceRank(b.target));

  const selected = preferredDevice
    ? devices.find((device) => device.target === preferredDevice)
    : devices[0];

  if (selected) {
    return {
      available: true,
      device: selected.target,
      source: selected.source ?? 'runtime',
      devices,
    };
  }

  return {
    available: false,
    source: devices.length ? 'runtime' : 'none',
    reason: preferredDevice
      ? `No ${preferredDevice} NIR runtime device discovered`
      : 'No NIR runtime device discovered',
    devices,
  };
}

function readGlobalNeuromorphicDevices(): NeuromorphicRuntimeDevice[] {
  const runtime = globalThis as typeof globalThis & {
    __HOLOSCRIPT_NIR_DEVICES__?: unknown;
  };
  return parseNeuromorphicDevices(runtime.__HOLOSCRIPT_NIR_DEVICES__, 'global');
}

function readEnvNeuromorphicDevices(): NeuromorphicRuntimeDevice[] {
  const env = typeof process !== 'undefined' ? process.env : undefined;
  if (!env) return [];

  const configured = parseNeuromorphicDevices(env.HOLOSCRIPT_NIR_DEVICE ?? env.NIR_DEVICE, 'env');
  const detected: NeuromorphicRuntimeDevice[] = [...configured];

  if (env.LOIHI2_HOST) {
    detected.push({ target: 'loihi', id: env.LOIHI2_HOST, available: true, source: 'env' });
  }
  if (env.SPINNAKER_BOARD) {
    detected.push({ target: 'spinnaker', id: env.SPINNAKER_BOARD, available: true, source: 'env' });
  }
  if (env.SYNSENSE_DEVICE) {
    detected.push({ target: 'synsense', id: env.SYNSENSE_DEVICE, available: true, source: 'env' });
  }
  if (env.AKIDA_DEVICE) {
    detected.push({ target: 'akida', id: env.AKIDA_DEVICE, available: true, source: 'env' });
  }

  return detected;
}

function parseNeuromorphicDevices(value: unknown, source: string): NeuromorphicRuntimeDevice[] {
  if (!value) return [];
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => toNeuromorphicDevice(entry.trim(), source))
      .filter((device): device is NeuromorphicRuntimeDevice => Boolean(device));
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => toNeuromorphicDevice(entry, source))
      .filter((device): device is NeuromorphicRuntimeDevice => Boolean(device));
  }
  return [];
}

function toNeuromorphicDevice(value: unknown, source: string): NeuromorphicRuntimeDevice | null {
  if (typeof value === 'string') {
    const target = normalizeNeuromorphicTarget(value);
    return target ? { target, available: true, source } : null;
  }
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const target = normalizeNeuromorphicTarget(record.target ?? record.device ?? record.kind);
  if (!target) return null;
  return {
    target,
    id: typeof record.id === 'string' ? record.id : undefined,
    available: record.available === false ? false : true,
    source: typeof record.source === 'string' ? record.source : source,
  };
}

function normalizeNeuromorphicTarget(value: unknown): NeuromorphicDeviceTarget | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toLowerCase().replace(/[\s_-]+/g, '');
  if (normalized === 'loihi' || normalized === 'loihi2') return 'loihi';
  if (normalized === 'spinnaker' || normalized === 'spinnaker2') return 'spinnaker';
  if (
    normalized === 'synsense' ||
    normalized === 'synsensespeck' ||
    normalized === 'synsensexylo'
  ) {
    return 'synsense';
  }
  if (normalized === 'akida') return 'akida';
  return null;
}

function deviceRank(device: NeuromorphicDeviceTarget): number {
  return ['loihi', 'spinnaker', 'synsense', 'akida'].indexOf(device);
}
