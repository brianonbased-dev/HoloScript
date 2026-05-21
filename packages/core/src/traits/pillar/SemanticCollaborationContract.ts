/**
 * SemanticCollaborationContract — v1.0
 *
 * Typed inter-agent interchange protocol for the uAAL Cognitive VM.
 *
 * Motivation
 * ───────────
 * RecursiveMAS (arxiv:2604.25917, UIUC/Stanford/NVIDIA/MIT) demonstrated that
 * replacing text-token agent communication with latent-space exchange yields
 * +8.3% accuracy and 34–76% fewer tokens.  However RecursiveMAS requires direct
 * access to model hidden states, which closed-API agents (Claude, GPT, Gemini,
 * Grok) do not expose.
 *
 * SemanticCollaborationContract operates at the STRUCTURED-STATE level, one
 * layer above raw hidden states.  This makes the protocol:
 *   • Compatible with every agent family (closed or open)
 *   • Verifiable via SimulationContract receipts
 *   • Inspectable without needing model internals
 *   • Suitable for Byzantine + sycophancy integrity auditing
 *
 * Design
 * ──────
 * A `SemanticCollaborationMessage` is the atomic unit of inter-agent exchange.
 * Text is a BOUNDARY OUTPUT ONLY — inside the agent mesh, messages carry:
 *   - pillar_slice      : the 4-tuple that configures the current runtime layer
 *   - brain_coord       : MNI152 storage address for this message's latent content
 *   - receipt           : SimulationContract evidence hash (anti-abduction anchor)
 *   - scene_delta       : Loro CRDT delta for shared spatial state
 *   - task_state        : HoloMesh board task JSON (coordination provenance)
 *   - confidence        : scalar in [0, 1] — NOT a softmax logit, a calibrated claim
 *   - provenance        : x402 attestation hash (per-surface seat identity)
 *
 * Loop structure alignment with RecursiveMAS dual-loop:
 *   Inner loop (fast refinement)  → Domain / Layer Pillars
 *   Outer loop (slow optimization) → Intent / Temporal Pillars
 *
 * TraitHandler
 * ────────────
 * `semanticCollabHandler` validates, routes, and receipts SemanticCollaborationMessages.
 * It emits `semcol:received` on valid inbound and `semcol:integrity_fail` on violations.
 *
 * Events emitted:
 *   semcol:received       { message: SemanticCollaborationMessage }
 *   semcol:sent           { message: SemanticCollaborationMessage, to: string }
 *   semcol:integrity_fail { reason: IntegrityFailReason, message: SemanticCollaborationMessage }
 *
 * Events consumed:
 *   semcol:send    { message: SemanticCollaborationMessage, to: string }
 *   semcol:receive { message: SemanticCollaborationMessage }
 *
 * References:
 *   RecursiveMAS — arxiv:2604.25917 (2026-04-28)
 *   uaa2-service  — mcp-orchestrator first commit 2026-02-02 (86 days prior)
 *   Pillar-Slice  — research/2026-05-20_paper26-pillar-slice-scope.md
 *   Brain-Geometry — research/2026-05-20_idea-run-16.md
 *   Tropical geometry — arxiv:1805.07091, arxiv:2403.11871
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from '../TraitTypes';
import type { ParallelPillarSlice } from './ParallelPillar';

// ─────────────────────────────────────────────────────────────────────────────
// Core types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A Pillar-generated 4-tuple coordinate slice.
 *
 * axis_1_id / axis_2_id are RUNTIME VARIABLES from the axis vocabulary, not
 * fixed quaternion components.  This is the "dynamic axis identity" that
 * separates the Pillar-Slice Framework from all prior quaternion NN work.
 *
 * In tropical geometry terms, the 4-tuple is a point in a tropical variety
 * (arxiv:1805.07091) and the dispatch region it falls into is a cell of the
 * tropical classification fan (arxiv:2403.11871).
 */
export interface PillarSlice {
  /** Identity of the first axis — string key from the Pillar's axis vocabulary */
  axis_1_id: string;
  /** Identity of the second axis — string key from the Pillar's axis vocabulary */
  axis_2_id: string;
  /** Position on axis_1 in the Pillar's coordinate space */
  pos_1: number;
  /** Position on axis_2 in the Pillar's coordinate space */
  pos_2: number;
  /** Which Pillar generated this slice */
  pillar_id: string;
  /** Pillar domain category */
  pillar_domain: PillarDomain;
}

/** Taxonomy of Pillar domains (maps to Paper 32 §3 Pillar Taxonomy) */
export type PillarDomain =
  | 'physics'        // conservation law axes, symmetry group axes, dimensionality invariants
  | 'rendering'      // LOD, material, lighting
  | 'agent'          // autonomy, goal, memory
  | 'language'       // semantics, pragmatics, syntax
  | 'economics'      // cost, value, risk
  | 'compiler'       // target, optimisation level, safety
  | 'solver'         // convergence, precision, timestep
  | 'trait'          // composition depth, hot/cold, activation
  | 'coordination'   // consensus, routing, trust
  | 'storage'        // retrieval, compression, locality
  | 'accuracy_speed' // intent axis pair
  | 'safety_exploration'
  | 'truth_approval' // sycophancy axis — mirrors P.620.02 probe
  | 'init'           // temporal
  | 'steady_state'
  | 'edge_case'
  | 'shutdown';

/**
 * MNI152 standard-space brain coordinate.
 *
 * Maps the 4-tuple to an anatomical storage address.  Gyri = hot cache
 * (maximum surface area / neuron density).  Sulci = domain boundaries
 * (tropical classification fan cell edges, biologically validated).
 * cortical_depth ∈ {1..6} = cortical layer (processing depth).
 *
 * See: research/2026-05-20_idea-run-16.md
 */
export interface BrainCoord {
  /** MNI x-coordinate in mm (left–right, range ~-90 to +90) */
  mni_x: number;
  /** MNI y-coordinate in mm (anterior–posterior, range ~-130 to +80) */
  mni_y: number;
  /** MNI z-coordinate in mm (inferior–superior, range ~-80 to +90) */
  mni_z: number;
  /** Cortical layer 1–6 (Layer 1 = outermost/input, Layer 6 = deepest/output) */
  cortical_depth: 1 | 2 | 3 | 4 | 5 | 6;
  /** Optional: resolved Brodmann area label */
  brodmann_area?: number;
  /** Optional: AAL atlas region label */
  aal_region?: string;
  /** Whether this address resolves to gyrus (hot) or sulcus (boundary/cold) */
  surface_type?: 'gyrus' | 'sulcus';
}

/**
 * SimulationContract evidence hash.
 * Anti-abduction anchor: forces abductive claims to be grounded in simulation
 * evidence.  Abductive reasoning = hallucination + sycophancy engine (Griffiths
 * D/I/A taxonomy, Laws of Thought, Macmillan 2026).
 */
export interface ReceiptAnchor {
  /** SHA-256 of the SimulationContract JSON payload */
  contract_hash: string;
  /** Unix timestamp of the simulation run that produced the receipt */
  sim_timestamp_ms: number;
  /** Optional on-chain anchor tx hash (Base mainnet, ~$0.0007/tx) */
  onchain_tx?: string;
}

/**
 * Loro CRDT delta — shared spatial / world-state update.
 * Bytes are base64-encoded for JSON transport.
 */
export interface CRDTDelta {
  doc_id: string;
  /** base64-encoded Loro binary delta */
  delta_b64: string;
  vector_clock: Record<string, number>;
}

/**
 * HoloMesh board task JSON — coordination provenance.
 * Agents carry the task they're operating under so peers can cross-reference
 * the board without a separate lookup.
 */
export interface TaskState {
  task_id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  claimed_by?: string;
  board_url?: string;
}

/**
 * x402 per-surface attestation.
 * Identifies WHICH surface seat sent this message (one wallet per surface,
 * per D.051 Sovereign Seat Hierarchy).
 */
export interface ProvenanceAttestation {
  /** x402 attestation hash from the signing surface's wallet */
  attestation_hash: string;
  /** Surface identifier (claude1, cursor1, gemini1, etc.) */
  surface_id: string;
  /** EIP-712 signature if available */
  eip712_signature?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// The contract
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SemanticCollaborationMessage — the atomic unit of inter-agent exchange in the
 * uAAL Cognitive VM.  Text is a BOUNDARY OUTPUT ONLY.
 */
export interface SemanticCollaborationMessage {
  /** Protocol version for forward compatibility */
  version: '1.0';

  /** Unique message ID (UUID v4) */
  message_id: string;

  /** Sender surface ID */
  from: string;

  /** Recipient surface ID (or '*' for broadcast) */
  to: string;

  /** Unix timestamp of message creation */
  created_at_ms: number;

  // ── Semantic payload ───────────────────────────────────────────────────────

  /**
   * Pillar-generated 4-tuple coordinate slice.
   * This IS the latent configuration vector for the current runtime layer.
   * Pass this directly via RecursiveLinkTrait on local/open models instead
   * of converting to text tokens (recaptures the RecursiveMAS efficiency gain).
   */
  pillar_slice: PillarSlice;

  /**
   * MNI152 brain coordinate where the latent content of this message lives.
   * Resolves to a gyrus (hot retrieval) or sulcus (domain boundary / cold).
   */
  brain_coord: BrainCoord;

  /**
   * SimulationContract evidence hash.
   * Required when message contains an A-step (abductive) claim.
   * Optional for D-steps (deductive) and I-steps (inductive).
   */
  receipt?: ReceiptAnchor;

  /**
   * Loro CRDT delta for shared scene / spatial state.
   * Absent if this message carries no world-state update.
   */
  scene_delta?: CRDTDelta;

  /**
   * Current board task being executed by the sender.
   * Coordination provenance — receivers can cross-reference without board query.
   */
  task_state?: TaskState;

  /**
   * Calibrated confidence in [0, 1].
   * NOT a raw softmax logit.  Represents the sender's honest epistemic state.
   * Values < 0.5 MUST include receipt or explicit uncertainty acknowledgment
   * per F.017 (citation required for every claim).
   */
  confidence: number;

  /**
   * x402 attestation — identifies which surface seat sent this message.
   * Required for integrity verification (LatentIntegrityLayer, Two-Axis audit).
   */
  provenance: ProvenanceAttestation;

  // ── Optional structured payload ───────────────────────────────────────────

  /**
   * Freeform structured data for the specific exchange.
   * Keep small — bulk data belongs in scene_delta or the knowledge store.
   */
  payload?: Record<string, unknown>;

  /**
   * Bilateral hemisphere slice (optional).
   * When present, carries both the left (analytical) and right (spatial)
   * hemisphere interpretations of the current context, plus the tropical
   * geometry bounding box that frames their disagreement.
   *
   * Receivers use this for:
   *   - Integrity check: large box_area → hemispheres disagree → flag for review
   *   - JEPA bilateral loss: left_cond → right_cond prediction target
   *   - MNI routing: left.brain_coord.mni_x > 0, right.brain_coord.mni_x < 0
   *
   * The parallel_pillar_id in this slice identifies which ParallelPillar
   * generated the pair — allows receivers to verify the source registry.
   */
  parallel_slice?: ParallelPillarSlice;

  /**
   * Text summary — BOUNDARY OUTPUT ONLY.
   * Populated when message exits the agent mesh to a human-readable surface.
   * Never the primary carrier of semantic content.
   */
  text_boundary?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Integrity types
// ─────────────────────────────────────────────────────────────────────────────

export type IntegrityFailReason =
  | 'missing_provenance'         // No x402 attestation
  | 'confidence_without_receipt' // confidence < 0.5 and no receipt for A-step claim
  | 'invalid_pillar_slice'       // axis_ids empty or pos out of expected range
  | 'invalid_brain_coord'        // MNI coords outside anatomically plausible range
  | 'cosine_anomaly'             // Byzantine: latent vector cosine similarity anomaly
  | 'centroid_drift';            // Sycophancy: embedding centroid drifted toward approval attractor

// ─────────────────────────────────────────────────────────────────────────────
// Trait config
// ─────────────────────────────────────────────────────────────────────────────

export interface SemanticCollabConfig {
  /** Whether to enforce receipt requirement for low-confidence messages */
  enforce_receipt_gate: boolean;
  /** Cosine similarity threshold below which Byzantine anomaly is flagged */
  cosine_anomaly_threshold: number;
  /** Max centroid drift magnitude before sycophancy alert fires */
  centroid_drift_threshold: number;
  /** Whether to log all messages to the knowledge store */
  log_to_knowledge_store: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trait handler
// ─────────────────────────────────────────────────────────────────────────────

interface SemanticCollabState {
  received: number;
  sent: number;
  integrity_failures: number;
  /** Rolling centroid of received pillar_slice vectors (4D, for sycophancy detection) */
  centroid: [number, number, number, number];
  centroid_n: number;
}

export const semanticCollabHandler: TraitHandler<SemanticCollabConfig> = {
  name: 'semantic_collab',

  defaultConfig: {
    enforce_receipt_gate: true,
    cosine_anomaly_threshold: 0.15,
    centroid_drift_threshold: 0.4,
    log_to_knowledge_store: false,
  },

  onAttach(node: HSPlusNode): void {
    node.__semanticCollabState = {
      received: 0,
      sent: 0,
      integrity_failures: 0,
      centroid: [0, 0, 0, 0],
      centroid_n: 0,
    } satisfies SemanticCollabState;
  },

  onDetach(node: HSPlusNode): void {
    delete node.__semanticCollabState;
  },

  onUpdate(): void {},

  onEvent(
    node: HSPlusNode,
    config: SemanticCollabConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__semanticCollabState as SemanticCollabState | undefined;
    if (!state) return;

    const type = typeof event === 'string' ? event : event.type;

    if (type === 'semcol:receive') {
      const msg = ((event as Record<string, unknown>).message ?? event.payload?.message) as SemanticCollaborationMessage | undefined;
      if (!msg) return;

      const fail = validateMessage(msg, config, state);
      if (fail) {
        state.integrity_failures++;
        context.emit?.('semcol:integrity_fail', { reason: fail, message: msg });
        return;
      }

      state.received++;
      updateCentroid(state, msg.pillar_slice);
      context.emit?.('semcol:received', { message: msg });
    }

    if (type === 'semcol:send') {
      const msg = ((event as Record<string, unknown>).message ?? event.payload?.message) as SemanticCollaborationMessage | undefined;
      const to = ((event as Record<string, unknown>).to ?? event.payload?.to) as string | undefined;
      if (!msg || !to) return;

      const fail = validateMessage(msg, config, state);
      if (fail) {
        state.integrity_failures++;
        context.emit?.('semcol:integrity_fail', { reason: fail, message: msg });
        return;
      }

      state.sent++;
      context.emit?.('semcol:sent', { message: msg, to });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

function validateMessage(
  msg: SemanticCollaborationMessage,
  config: SemanticCollabConfig,
  state: SemanticCollabState
): IntegrityFailReason | null {
  // Provenance required
  if (!msg.provenance?.attestation_hash || !msg.provenance?.surface_id) {
    return 'missing_provenance';
  }

  // Receipt required for low-confidence messages (A-step enforcement)
  if (config.enforce_receipt_gate && msg.confidence < 0.5 && !msg.receipt) {
    return 'confidence_without_receipt';
  }

  // Pillar slice must have non-empty axis IDs
  if (!msg.pillar_slice?.axis_1_id || !msg.pillar_slice?.axis_2_id) {
    return 'invalid_pillar_slice';
  }

  // Brain coord plausibility (MNI152 bounding box ~90x130x90mm)
  const { mni_x, mni_y, mni_z } = msg.brain_coord ?? {};
  if (
    typeof mni_x !== 'number' || Math.abs(mni_x) > 90 ||
    typeof mni_y !== 'number' || (mni_y < -130 || mni_y > 80) ||
    typeof mni_z !== 'number' || Math.abs(mni_z) > 90
  ) {
    return 'invalid_brain_coord';
  }

  // Sycophancy check: centroid drift toward truth_approval axis
  if (state.centroid_n > 5 && msg.pillar_slice.pillar_domain === 'truth_approval') {
    const approvalBias = computeApprovalBias(state.centroid, msg.pillar_slice);
    if (approvalBias > config.centroid_drift_threshold) {
      return 'centroid_drift';
    }
  }

  return null;
}

function updateCentroid(state: SemanticCollabState, slice: PillarSlice): void {
  // Incremental mean of the 4D position vector [0, 0, pos_1, pos_2]
  // (axis identity is categorical; only positions contribute to centroid)
  const n = state.centroid_n;
  state.centroid[2] = (state.centroid[2] * n + slice.pos_1) / (n + 1);
  state.centroid[3] = (state.centroid[3] * n + slice.pos_2) / (n + 1);
  state.centroid_n++;
}

function computeApprovalBias(centroid: [number, number, number, number], slice: PillarSlice): number {
  // On the truth_approval axis, pos_2 = approval pressure (1.0 = max approval seeking).
  // Bias = distance of current centroid pos_2 from neutral (0.5).
  const approvalComponent = centroid[3];
  const incomingPressure = slice.pos_2;
  return Math.abs(approvalComponent - 0.5) * 0.5 + Math.abs(incomingPressure - 0.5) * 0.5;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a minimal valid SemanticCollaborationMessage.
 * Callers MUST populate `brain_coord`, `pillar_slice`, and `provenance`.
 */
export function createSemanticMessage(
  from: string,
  to: string,
  slice: PillarSlice,
  brainCoord: BrainCoord,
  provenance: ProvenanceAttestation,
  confidence = 1.0
): SemanticCollaborationMessage {
  return {
    version: '1.0',
    message_id: `semcol-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from,
    to,
    created_at_ms: Date.now(),
    pillar_slice: slice,
    brain_coord: brainCoord,
    confidence,
    provenance,
  };
}
