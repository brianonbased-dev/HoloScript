/**
 * Lotus Flower — Petal bloom-state derivation
 *
 * Pure function that derives a petal's bloom state from real evidence.
 * Brittney's `bloom_petal` / `wilt_petal` mutations MUST agree with this
 * function's output — disagreements are detectable architecturally and the
 * mutation is rejected at the route layer.
 *
 * This is the algebraic-trust hook for Paper 26: Brittney cannot lie about
 * a paper's bloom-state because the state is a pure function of evidence
 * (W.GOLD.001 — architecture beats alignment, applied to the paper-program
 * visualization itself).
 *
 * Bloom-state lifecycle:
 *   sealed   → no draft content; only skeleton / scaffold exists
 *   budding  → draft content present, contains \stub{} markers
 *   blooming → no stubs; has \todo{benchmark pending}; substantive draft
 *   full     → zero stubs, zero benchmark-pending todos, dual-anchored
 *   wilted   → regressed (anchor mismatch detected, retraction, removed evidence)
 *
 * When all 16 petals reach `full` → Lotus Genesis Trigger fires (I.007).
 *
 * @see docs/strategy/lotus-architecture.md — the architectural framing
 * @see research/2026-04-27_brittney-paper-scoping.md — Paper 26 scoping
 * @see ~/.ai-ecosystem/research/paper-audit-matrix.md — the live evidence source
 */

export type BloomState = 'sealed' | 'budding' | 'blooming' | 'full' | 'wilted';

/**
 * Evidence about a single paper, as collected by the matrix-reader. Pure data
 * — the derivation function takes this in and returns a bloom state without
 * any I/O of its own. This separation lets us test the derivation logic
 * independently from any matrix-parsing fragility (F.030 — matrix is always
 * stale; treat its parse output as untrusted input).
 */
export interface PetalEvidence {
  /** Stable identifier matching the @lotus_petal `paper_id` in garden.holo */
  paperId: string;
  /** Venue name from the matrix; informational only */
  venue?: string;
  /** Whether a `.tex` file exists for this paper at all */
  hasDraft: boolean;
  /** Count of `\stub{}` markers in the draft */
  stubCount: number;
  /** Count of `\todo{benchmark pending}` markers (specifically benchmark
   *  todos — non-benchmark prose todos do NOT count per I.007 trigger spec) */
  benchmarkTodoCount: number;
  /** Whether OpenTimestamps anchor exists and verifies */
  otsAnchored: boolean;
  /** Whether Base L2 anchor exists and verifies */
  baseAnchored: boolean;
  /** True if either anchor reports MISMATCH against current file state.
   *  This is the wilt signal — provenance break detected (F.029 + F.030).
   *  Note: a HISTORICAL hash mismatch on an actively-edited paper is NOT a
   *  wilt — the receipt remains valid evidence of the historical content
   *  (per matrix 2026-04-24 refresh "Historical-hash caveat"). Caller must
   *  distinguish "anchor missing entirely" (wilt) vs "current file diverged
   *  from anchor" (expected during editing). */
  anchorMismatch: boolean;
  /** True if the paper was explicitly retracted or moved off-program */
  retracted?: boolean;
}

export interface BloomDerivation {
  state: BloomState;
  /** Human-readable single-sentence reason. Brittney surfaces this when
   *  asked "why is petal X in state Y?" — it's the citation for the state. */
  reason: string;
  /** Specific evidence fields that drove the decision. Useful for
   *  Brittney's `propose_evidence` tool to suggest what's missing for the
   *  next bloom transition. */
  blockedBy?: Array<keyof PetalEvidence>;
}

/**
 * Derive the bloom-state of a single petal from evidence.
 *
 * Decision precedence (highest → lowest):
 *   1. Retracted → wilted (terminal, irreversible without founder action)
 *   2. Anchor mismatch with no anchor at all → wilted (provenance broke)
 *   3. No draft → sealed
 *   4. Draft + stubs → budding
 *   5. Draft, no stubs, has benchmark-todos → blooming
 *   6. Draft, no stubs, no benchmark-todos, dual-anchored → full
 *   7. Draft, no stubs, no benchmark-todos, NOT dual-anchored → blooming
 *      (full requires anchoring — bloom is "drafted," full is "anchored")
 *
 * The function is intentionally STRICT — `full` requires both anchors and
 * zero benchmark-todos AND zero stubs. The Lotus Genesis Trigger condition
 * (I.007) is "all 16 petals === full," and that condition must mean what it
 * says: no shortcuts, no half-measures.
 */
export function derivePetalBloomState(evidence: PetalEvidence): BloomDerivation {
  if (evidence.retracted) {
    return {
      state: 'wilted',
      reason: 'Paper retracted or moved off-program; terminal state.',
      blockedBy: ['retracted'],
    };
  }

  if (evidence.anchorMismatch && !evidence.otsAnchored && !evidence.baseAnchored) {
    return {
      state: 'wilted',
      reason: 'Anchor mismatch detected with no surviving anchors — provenance break.',
      blockedBy: ['anchorMismatch', 'otsAnchored', 'baseAnchored'],
    };
  }

  if (!evidence.hasDraft) {
    return {
      state: 'sealed',
      reason: 'No draft content yet; only skeleton or scaffold exists.',
      blockedBy: ['hasDraft'],
    };
  }

  if (evidence.stubCount > 0) {
    return {
      state: 'budding',
      reason: `Draft present with ${evidence.stubCount} \\stub{} marker(s); content scaffolding not complete.`,
      blockedBy: ['stubCount'],
    };
  }

  if (evidence.benchmarkTodoCount > 0) {
    return {
      state: 'blooming',
      reason: `Draft substantive (no stubs); ${evidence.benchmarkTodoCount} benchmark(s) still pending.`,
      blockedBy: ['benchmarkTodoCount'],
    };
  }

  // No stubs, no benchmark todos. The remaining gate is dual-anchoring.
  if (!evidence.otsAnchored || !evidence.baseAnchored) {
    const missing: Array<keyof PetalEvidence> = [];
    if (!evidence.otsAnchored) missing.push('otsAnchored');
    if (!evidence.baseAnchored) missing.push('baseAnchored');
    return {
      state: 'blooming',
      reason: `Content complete (no stubs, no benchmark-pending); awaiting ${missing.map((m) => m === 'otsAnchored' ? 'OpenTimestamps' : 'Base L2').join(' + ')} anchor for full bloom.`,
      blockedBy: missing,
    };
  }

  return {
    state: 'full',
    reason: 'Content complete and dual-anchored (OTS + Base). Petal is full bloom.',
  };
}

/**
 * Compose 16 evidence records into a Lotus-Genesis-readiness verdict.
 * Returns true iff every petal is `full` per derivePetalBloomState.
 *
 * This is the trigger condition Brittney watches — when the verdict flips to
 * true, she emits a `lotusGenesisReady` event. The actual genesis ceremony
 * (`scripts/plant-seed.mjs`) STILL requires Trezor confirmation; Brittney
 * never fires it autonomously (per I.007 trigger spec).
 */
export function deriveLotusGenesisReadiness(
  evidenceByPaperId: Map<string, PetalEvidence>,
): {
  ready: boolean;
  fullPetals: number;
  totalPetals: number;
  blockingPetals: Array<{ paperId: string; state: BloomState; reason: string }>;
} {
  const blockingPetals: Array<{ paperId: string; state: BloomState; reason: string }> = [];
  let fullPetals = 0;

  for (const [paperId, evidence] of evidenceByPaperId) {
    const derived = derivePetalBloomState(evidence);
    if (derived.state === 'full') {
      fullPetals++;
    } else {
      blockingPetals.push({ paperId, state: derived.state, reason: derived.reason });
    }
  }

  return {
    ready: blockingPetals.length === 0 && evidenceByPaperId.size > 0,
    fullPetals,
    totalPetals: evidenceByPaperId.size,
    blockingPetals,
  };
}
