/**
 * DispatchPolicy — NN-Primary, CPU-Backup HoloScript Inversion
 *
 * Routes trait execution across three tiers:
 *   Tier 1-Browser:      SNN-WebGPU (snn-webgpu package)
 *   Tier 1-Neuromorphic: NIR-targeted (Loihi 2 / SpiNNaker 2 / SynSense per CircuitBreaker.ts:71)
 *   Tier 2:              LLM-speculative with CPU verifier (CURE/SimulationContract/EffectInference)
 *   Tier 3:              CPU-direct deterministic (audit/replay/proof generation)
 *
 * The dispatch decision itself is a HoloScript trait recorded in CURE provenance.
 * MVP proving ground: @grabbable interaction trait.
 *
 * Source: research/2026-05-09_nn-primary-cpu-backup-holoscript-EVOLVED.md
 * @module @holoscript/core/compiler/dispatch
 */

import type {
  ProvenanceContext,
  ProvenanceValue,
} from '../traits/ProvenanceSemiring';
import type { EffectCheckResult } from '../safety/EffectChecker';
import { isWebGpuEnvironmentPresent } from '../../reconstruction/webgpuGate';
import type { ReconstructionManifest } from '../../reconstruction/HoloMapRuntime';
import { assertHoloMapManifestContract } from '../../reconstruction/simulationContractBinding';

export enum DispatchTier {
  TIER_1_NEUROMORPHIC = 'tier-1-neuromorphic',
  TIER_1_BROWSER = 'tier-1-browser',
  TIER_2_SPECULATIVE = 'tier-2-speculative',
  TIER_3_CPU_DIRECT = 'tier-3-cpu-direct',
}

export interface DispatchPolicyConfig {
  /** Enable Tier-1 Browser (WebGPU SNN) path */
  tier1BrowserEnabled: boolean;
  /** Enable Tier-1 Neuromorphic (NIR) path */
  tier1NeuromorphicEnabled: boolean;
  /** Specific NIR device target, if any */
  tier1NeuromorphicDevice?: 'loihi' | 'spinnaker' | 'synsense' | 'akida';
  /** Enable Tier-2 speculative LLM + CPU verifier */
  tier2Enabled: boolean;
  /** Minimum alpha (acceptance rate) to allow Tier-2 promotion */
  tier2AlphaThreshold: number;
  /** Effect-checker verifier for Tier-2 acceptance gate */
  effectVerifier?: (traits: string[]) => Promise<EffectCheckResult | null>;
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

    // --- Tier 1-Neuromorphic -------------------------------------------------
    if (this.config.tier1NeuromorphicEnabled) {
      const decision = await this.tryTier1Neuromorphic(op);
      if (decision.accepted) {
        decision.metrics.latencyEstimateMs = performance.now() - start;
        return decision;
      }
      lastRejectionReason = decision.metrics.fallbackReason;
    }

    // --- Tier 1-Browser ------------------------------------------------------
    if (this.config.tier1BrowserEnabled) {
      const decision = await this.tryTier1Browser(op);
      if (decision.accepted) {
        decision.metrics.latencyEstimateMs = performance.now() - start;
        return decision;
      }
      lastRejectionReason = decision.metrics.fallbackReason;
    }

    // --- Tier 2-Speculative --------------------------------------------------
    if (this.config.tier2Enabled) {
      const decision = await this.tryTier2(op);
      if (decision.accepted) {
        decision.metrics.latencyEstimateMs = performance.now() - start;
        return decision;
      }
      lastRejectionReason = decision.metrics.fallbackReason;
    }

    // --- Tier 3-CPU Direct (always available) --------------------------------
    const decision = this.fallbackTier3(op, lastRejectionReason ?? 'No higher tier accepted or enabled');
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
    const available = this.isNeuromorphicHardwarePresent();
    const accepted = available && this.isTraitSnnCompatible(op.trait);
    const reason = accepted ? undefined : 'Neuromorphic hardware not present or trait incompatible';
    return this.buildDecision(DispatchTier.TIER_1_NEUROMORPHIC, accepted, op, reason);
  }

  private async tryTier1Browser(op: DispatchableOperation): Promise<DispatchDecision> {
    const available = isWebGpuEnvironmentPresent();
    const accepted = available && this.isTraitSnnCompatible(op.trait);
    const reason = accepted ? undefined : 'WebGPU not available or trait incompatible';
    return this.buildDecision(DispatchTier.TIER_1_BROWSER, accepted, op, reason);
  }

  private async tryTier2(op: DispatchableOperation): Promise<DispatchDecision> {
    const proposal = await this.llmPropose(op);
    if (!proposal) {
      return this.buildDecision(DispatchTier.TIER_2_SPECULATIVE, false, op, 'LLM proposal failed');
    }

    // CPU verifier gate: EffectInference + SimulationContract
    const verifierPassed = await this.runCpuVerifier(op, proposal);
    this.alphaTracker.recordAttempt(verifierPassed);

    const alpha = this.alphaTracker.getAlpha();
    const accepted = verifierPassed && alpha >= this.config.tier2AlphaThreshold;

    const reason = accepted
      ? undefined
      : `Verifier ${verifierPassed ? 'passed' : 'rejected'}; alpha ${alpha.toFixed(2)} < threshold ${this.config.tier2AlphaThreshold}`;

    return this.buildDecision(DispatchTier.TIER_2_SPECULATIVE, accepted, op, reason, alpha);
  }

  private fallbackTier3(op: DispatchableOperation, reason: string): DispatchDecision {
    return this.buildDecision(DispatchTier.TIER_3_CPU_DIRECT, true, op, reason);
  }

  // ---------------------------------------------------------------------------
  // VERIFIERS & HELPERS
  // ---------------------------------------------------------------------------

  private isNeuromorphicHardwarePresent(): boolean {
    // TODO: replace with real runtime probe once NIR device discovery is wired.
    return !!this.config.tier1NeuromorphicDevice;
  }

  private isTraitSnnCompatible(trait: string): boolean {
    // MVP: only @grabbable and interaction traits are mapped to SNN hot path.
    const snnTraits = new Set([
      'grabbable',
      'hoverable',
      'clickable',
      'draggable',
      'throwable',
    ]);
    return snnTraits.has(trait);
  }

  private async llmPropose(_op: DispatchableOperation): Promise<unknown> {
    // Stub: real implementation would call ContextCompiler / LLMProvider.
    return { proposed: true, tier: 2 };
  }

  private async runCpuVerifier(
    op: DispatchableOperation,
    _proposal: unknown
  ): Promise<boolean> {
    // 1. EffectInference gate
    if (this.config.effectVerifier) {
      const effectResult = await this.config.effectVerifier([op.trait]);
      if (!effectResult || !effectResult.passed) return false;
    }

    // 2. SimulationContract gate (when a manifest is supplied)
    if (op.manifest && this.config.simulationContractVerifier) {
      const scPassed = await this.config.simulationContractVerifier(op.manifest);
      if (!scPassed) return false;
    } else if (op.manifest) {
      // If a manifest is present but no custom verifier is wired, run the
      // default HoloMap contract assertion as a baseline gate.
      try {
        assertHoloMapManifestContract(op.manifest);
      } catch {
        return false;
      }
    }

    // If no verifiers are wired, default to pass (scaffold mode).
    return true;
  }

  // ---------------------------------------------------------------------------
  // PROVENANCE BUILDER
  // ---------------------------------------------------------------------------

  private buildDecision(
    tier: DispatchTier,
    accepted: boolean,
    op: DispatchableOperation,
    fallbackReason?: string,
    alpha?: number
  ): DispatchDecision {
    const metrics: DispatchMetrics = {
      tierAttempted: tier,
      tierAccepted: accepted,
      fallbackReason,
      latencyEstimateMs: 0,
      alpha,
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

    const replayFingerprint = this.hashDecision(provenance);

    return {
      tier,
      accepted,
      provenance,
      metrics,
      replayFingerprint,
    };
  }

  private hashDecision(provenance: ProvenanceValue): string {
    const value = provenance.value as Record<string, unknown>;
    const canonical = JSON.stringify(value, Object.keys(value).sort());
    let hash = 0xcbf29ce484222325n;
    for (let i = 0; i < canonical.length; i++) {
      hash ^= BigInt(canonical.charCodeAt(i));
      hash *= 0x100000001b3n;
      hash &= 0xffffffffffffffffn;
    }
    return `fnv1a-64:${hash.toString(16)}`;
  }
}
