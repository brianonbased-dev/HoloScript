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

import type { ProvenanceContext, ProvenanceValue } from '../traits/ProvenanceSemiring';
import { isWebGpuEnvironmentPresent } from '../../reconstruction/webgpuGate';
import type { ReconstructionManifest } from '../../reconstruction/HoloMapRuntime';
import { assertHoloMapManifestContract } from '../../reconstruction/simulationContractBinding';

export enum DispatchTier {
  TIER_1_NEUROMORPHIC = 'tier-1-neuromorphic',
  TIER_1_BROWSER = 'tier-1-browser',
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
}

export interface DispatchPolicyConfig {
  /** Enable Tier-1 Browser (WebGPU SNN) path */
  tier1BrowserEnabled: boolean;
  /** Enable Tier-1 Neuromorphic (NIR) path */
  tier1NeuromorphicEnabled: boolean;
  /** Specific NIR device target, if any */
  tier1NeuromorphicDevice?: NeuromorphicDeviceTarget;
  /** Runtime NIR device probe. Defaults to global/env discovery signals. */
  neuromorphicRuntimeProbe?: NeuromorphicRuntimeProbe;
  /** Enable Tier-2 speculative LLM + CPU verifier */
  tier2Enabled: boolean;
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
  /** Runtime probe evidence for Tier-1 neuromorphic decisions */
  neuromorphicProbe?: NeuromorphicRuntimeProbeResult;
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

    // --- Tier 2-Speculative --------------------------------------------------
    if (this.config.tier2Enabled) {
      const decision = await this.tryTier2(op);
      if (decision.accepted) {
        decision.metrics.latencyEstimateMs = performance.now() - start;
        return decision;
      }
      lastRejectionReason = decision.metrics.fallbackReason;
      lastRejectionMetrics = undefined;
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

  private isTraitSnnCompatible(trait: string): boolean {
    // MVP: only @grabbable and interaction traits are mapped to SNN hot path.
    const snnTraits = new Set(['grabbable', 'hoverable', 'clickable', 'draggable', 'throwable']);
    return snnTraits.has(trait);
  }

  private async llmPropose(_op: DispatchableOperation): Promise<unknown> {
    // Stub: real implementation would call ContextCompiler / LLMProvider.
    return { proposed: true, tier: 2 };
  }

  private async runCpuVerifier(op: DispatchableOperation, _proposal: unknown): Promise<boolean> {
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
    const canonical = JSON.stringify(value, Object.keys(value).sort());
    return `sha256:${await sha256Hex(canonical)}`;
  }
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
