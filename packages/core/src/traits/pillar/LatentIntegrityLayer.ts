/**
 * LatentIntegrityLayer — security detectors for RecursiveMAS latent-space communication.
 *
 * W.610-W.614 Byzantine-FMARL stack was text-token only. RecursiveMAS (arxiv:2604.25917)
 * moves the attack surface to Pillar 4-tuple vectors exchanged via RecursiveLinkTrait.
 *
 * Two new vectors (directly from the task spec):
 * 1. LATENT-SPACE BYZANTINE: corrupted 4-tuple that passes all text checks and shifts
 *    Pillar dispatch. Detection: cosine similarity anomaly on incoming RecursiveLink
 *    vectors (flag >2σ deviation from expected Pillar distribution per context).
 *
 * 2. LATENT-SPACE SYCOPHANCY: approval drift via recursive latent refinement (no text
 *    signal). Detection: centroid drift across sessions toward known approval-region
 *    attractors (latent equivalent of P.620.02 contradictory probe / W.617).
 *
 * This layer provides the two detectors + integration points for RecursiveLinkTrait
 * and the existing Two-Axis machinery in SemanticCollaborationContract (which already
 * implements cosine_anomaly + centroid_drift on truth_approval slices).
 *
 * Deliverables per task:
 * - LatentByzantineDetector
 * - LatentSycophancyProbe
 * - Update hooks to W.610-W.614 docs (done via this file + contract comments)
 *
 * Connects to: RecursiveLinkTrait (prereq), SemanticCollaborationContract (shared
 * integrity reasons + compute helpers), PillarRegistry (context for expected
 * distributions), G.620.02 sycophancy blind spot, Two-Axis Agent Integrity Framework.
 */

import type { PillarSlice } from './SemanticCollaborationContract';
import type { RecursiveLinkMessage } from './RecursiveLinkTrait';

// Re-export the shared reasons for convenience (they live in the contract today)
export type {
  IntegrityFailReason,
} from './SemanticCollaborationContract';

// --- Latent Byzantine Detector (cosine anomaly on RecursiveLink vectors) -----

export interface LatentByzantineConfig {
  /** Standard deviations for anomaly flagging (task specifies >2σ) */
  sigmaThreshold: number;
  /** Minimum history size before flagging */
  minHistory: number;
}

export interface ByzantineAnomalyResult {
  isAnomalous: boolean;
  cosineSimilarity: number;
  deviationSigma?: number;
  reason?: string;
}

export class LatentByzantineDetector {
  private history: number[] = []; // rolling cosine similarities or vector norms per context

  constructor(private config: LatentByzantineConfig = { sigmaThreshold: 2, minHistory: 10 }) {}

  /**
   * Compute cosine similarity between two PillarSlices (treated as latent vectors).
   * Uses the 4-tuple positions (pos_1, pos_2) + domain as proxy features.
   */
  private cosine(a: PillarSlice, b: PillarSlice): number {
    // Simple 4D cosine on positions (extend with domain encoding if richer features needed)
    const va = [a.pos_1, a.pos_2, 0, 0]; // pad for domain if desired
    const vb = [b.pos_1, b.pos_2, 0, 0];
    const dot = va[0]*vb[0] + va[1]*vb[1];
    const na = Math.sqrt(va[0]*va[0] + va[1]*va[1]);
    const nb = Math.sqrt(vb[0]*vb[0] + vb[1]*vb[1]);
    return dot / (na * nb || 1);
  }

  /**
   * Check an incoming RecursiveLink vector against recent history for the context.
   * Returns anomaly result. In production this would be fed from RecursiveLink receive events.
   */
  check(incoming: RecursiveLinkMessage, recentSlices: PillarSlice[]): ByzantineAnomalyResult {
    if (recentSlices.length < this.config.minHistory) {
      return { isAnomalous: false, cosineSimilarity: 1.0 };
    }

    // Compare against mean of recent slices for the same pillar/domain context
    const similarities = recentSlices
      .filter(s => s.pillar_domain === incoming.slice.pillar_domain)
      .map(s => this.cosine(incoming.slice, s));

    if (similarities.length === 0) return { isAnomalous: false, cosineSimilarity: 1.0 };

    const mean = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    const variance = similarities.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / similarities.length;
    const std = Math.sqrt(variance) || 0.001;

    const sim = this.cosine(incoming.slice, recentSlices[recentSlices.length - 1]);
    const z = std > 0 ? Math.abs(sim - mean) / std : 0;

    const isAnomalous = z > this.config.sigmaThreshold;

    return {
      isAnomalous,
      cosineSimilarity: sim,
      deviationSigma: z,
      reason: isAnomalous ? `Latent Byzantine anomaly: ${z.toFixed(2)}σ deviation on ${incoming.slice.pillar_domain}` : undefined,
    };
  }
}

// --- Latent Sycophancy Probe (centroid drift on RecursiveLink vectors) ------

export interface LatentSycophancyConfig {
  driftThreshold: number; // equivalent to contract's 0.4 on truth_approval
  minSamples: number;
}

export interface SycophancyDriftResult {
  isDrifting: boolean;
  driftScore: number;
  reason?: string;
}

export class LatentSycophancyProbe {
  private centroid: [number, number] = [0.5, 0.5]; // approval axis proxy (pos_1=truth, pos_2=approval)
  private n = 0;

  constructor(private config: LatentSycophancyConfig = { driftThreshold: 0.4, minSamples: 5 }) {}

  /**
   * Update running centroid from a RecursiveLink message's slice on truth_approval or approval-heavy domains.
   */
  observe(msg: RecursiveLinkMessage): void {
    const s = msg.slice;
    // Heuristic: truth_approval or intent domains carry the approval pressure in pos_2
    if (s.pillar_domain === 'truth_approval' || s.pillar_domain === 'intent') {
      const n = this.n;
      this.centroid[0] = (this.centroid[0] * n + s.pos_1) / (n + 1);
      this.centroid[1] = (this.centroid[1] * n + s.pos_2) / (n + 1);
      this.n++;
    }
  }

  /**
   * Probe the current incoming message for approval drift.
   * Mirrors the computeApprovalBias + threshold logic from SemanticCollaborationContract.
   */
  probe(incoming: RecursiveLinkMessage): SycophancyDriftResult {
    if (this.n < this.config.minSamples) {
      return { isDrifting: false, driftScore: 0 };
    }

    const s = incoming.slice;
    const approvalComponent = this.centroid[1];
    const incomingPressure = s.pos_2;
    const driftScore = Math.abs(approvalComponent - 0.5) * 0.5 + Math.abs(incomingPressure - 0.5) * 0.5;

    const isDrifting = driftScore > this.config.driftThreshold;

    return {
      isDrifting,
      driftScore,
      reason: isDrifting
        ? `Latent sycophancy drift: ${driftScore.toFixed(3)} toward approval attractor on ${s.pillar_domain}`
        : undefined,
    };
  }
}

// --- Convenience factory for attaching to RecursiveLink flows ----------------

export interface LatentIntegrityLayerConfig {
  byzantine?: Partial<LatentByzantineConfig>;
  sycophancy?: Partial<LatentSycophancyConfig>;
}

export function createLatentIntegrityLayer(config: LatentIntegrityLayerConfig = {}) {
  const byz = new LatentByzantineDetector(config.byzantine as any);
  const syc = new LatentSycophancyProbe(config.sycophancy as any);

  return {
    byzantine: byz,
    sycophancy: syc,
    // Helper for RecursiveLink receive handlers
    checkMessage(msg: RecursiveLinkMessage, recent: PillarSlice[]) {
      const b = byz.check(msg, recent);
      const s = syc.probe(msg);
      return { byzantine: b, sycophancy: s };
    },
  };
}

export default { LatentByzantineDetector, LatentSycophancyProbe, createLatentIntegrityLayer };
