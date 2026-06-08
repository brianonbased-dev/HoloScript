// Live HoloMesh trust formula — the system under attack (Paper 21 Phase 4).
//
// PROBLEM THIS CLOSES (deep-ratchet 2026-05-29 verdict OVERCLAIMED):
// Before this module, run-attack.ts fed every attack a hardcoded synthetic
// trust ramp (`0.1 + i*0.01`). Attacks never touched the real trust system,
// so success_rate measured nothing about HoloMesh's actual defenses. USENIX
// Sec requires a DEMONSTRATED attack against the REAL formula plus a MEASURED
// defense — not a curve fit.
//
// WHAT THIS IS: a faithful, self-contained port of the production reputation
// formula `computeReputation` from
//   packages/mcp-server/src/holomesh/types.ts  (lines 217-236, V10/V11)
// plus the tier resolution from the same file. The adversarial package has an
// empty `dependencies` map by design (sandbox isolation, W.GOLD.035), and the
// mcp-server build is not a dependency, so the formula is inlined VERBATIM with
// a provenance pointer rather than mocked. Any divergence from production is a
// bug in THIS file: the byte-for-byte algebra is asserted in trust-model.test.ts
// against the documented production constants.
//
// The formula is the live anti-Sybil defense:
//   - V10: reuse only counts once a server has >= 3 real contributions.
//   - V11: passive reuse weight is bounded by 2x direct work, so a Sybil
//     cohort cross-vouching with minimal real work CANNOT reach authority tier.
// Wiring attacks to THIS is what makes the Phase 4 numbers mean something.

// ─── Production formula port (SSOT: holomesh/types.ts) ────────────────────────────────

/** Reputation tier thresholds — verbatim from holomesh/types.ts REPUTATION_TIERS. */
export const REPUTATION_TIERS = [
  { minScore: 100, tier: 'authority' as const },
  { minScore: 30, tier: 'expert' as const },
  { minScore: 5, tier: 'contributor' as const },
  { minScore: 0, tier: 'newcomer' as const },
] as const;

export type ReputationTier = (typeof REPUTATION_TIERS)[number]['tier'];

/** Verbatim from holomesh/types.ts resolveReputationTier. */
export function resolveReputationTier(score: number): ReputationTier {
  for (const t of REPUTATION_TIERS) {
    if (score >= t.minScore) return t.tier;
  }
  return 'newcomer';
}

/**
 * Reputation = directWork + reuseWeight   (verbatim port; SSOT pointer above)
 *   directWork = contributions * 0.3 + queriesAnswered * 0.2
 *   reuseWeight = min(effectiveReuseRate * 20, 40, directWork * 2)
 *
 * V10: effectiveReuseRate is 0 until contributions >= 3.
 * V11: reuseWeight bounded by 2x direct work — passive income (cross-vouch
 *      reuse) cannot exceed 2x active contribution. This is the anti-Sybil
 *      ceiling the Sybil/whitewasher attacks are measured against.
 */
export function computeReputation(
  contributions: number,
  queriesAnswered: number,
  reuseRate: number
): number {
  const effectiveReuseRate = contributions >= 3 ? reuseRate : 0;
  const directWorkScore = contributions * 0.3 + queriesAnswered * 0.2;
  const reuseWeight = Math.min(effectiveReuseRate * 20, 40, directWorkScore * 2);
  return Math.round((directWorkScore + reuseWeight) * 100) / 100;
}

/**
 * UNDEFENDED baseline (pre-reuse-ceiling) for Paper 21 Phase 4 defense-efficacy
 * measurement. Reuse weight is NOT bounded — passive cross-vouch reuse converts
 * 1:1 (×20) into reputation with no absolute cap and no direct-work ceiling. This
 * is the formula a Sybil cohort defeats: a cohort that pumps reuseRate via mutual
 * vouching, with minimal real work, can reach authority tier. Running each attack
 * against this baseline and against the production V11 formula yields the measured
 * defense efficacy (`success_rate_defended <= 0.5 * baseline`). The >=3
 * contribution floor is retained (it is not the anti-Sybil control under test).
 *
 * NOTE the production V11 formula combines TWO reuse bounds — the absolute
 * `min(·,40)` cap and the `directWork*2` per-server ceiling. Both are removed
 * here, so the measured efficacy is attributable to the reuse-bounding
 * collectively; disaggregating which bound dominates for a given attack config is
 * a separate measurement (see summary.json `interpretation`).
 */
export function computeReputationV10(
  contributions: number,
  queriesAnswered: number,
  reuseRate: number
): number {
  const effectiveReuseRate = contributions >= 3 ? reuseRate : 0;
  const directWorkScore = contributions * 0.3 + queriesAnswered * 0.2;
  const reuseWeight = effectiveReuseRate * 20; // UNDEFENDED: no absolute cap, no anti-Sybil ceiling
  return Math.round((directWorkScore + reuseWeight) * 100) / 100;
}

/** Formula version under test: 'v11' = defended (production); 'v10' = undefended baseline. */
export type TrustFormulaVersion = 'v10' | 'v11';

export function computeReputationFor(
  version: TrustFormulaVersion,
  contributions: number,
  queriesAnswered: number,
  reuseRate: number
): number {
  return version === 'v10'
    ? computeReputationV10(contributions, queriesAnswered, reuseRate)
    : computeReputation(contributions, queriesAnswered, reuseRate);
}

// ─── Attack-facing trust normalization ──────────────────────────────────────────

/**
 * The attacks compare trust against thresholds in [0, 1] (targetTrust=0.9,
 * etc). Production reputation is an unbounded score where 100 = authority.
 * Normalize reputation → [0, 1] by the authority ceiling so the two scales
 * are commensurable. T(s) = min(reputation, AUTHORITY_CEILING) / AUTHORITY_CEILING.
 *
 * This makes "T(s) >= 0.9" mean "reputation >= 90" — i.e. the attacker must
 * drive the REAL formula to near-authority, which the V11 bound makes hard
 * for Sybil/whitewashing without genuine sustained contribution.
 */
export const AUTHORITY_CEILING = 100;

export function reputationToTrust(reputation: number): number {
  if (reputation <= 0) return 0;
  return Math.min(reputation, AUTHORITY_CEILING) / AUTHORITY_CEILING;
}

/**
 * Per-server reputation accumulator. One instance models the trust state of a
 * single MCP server in the testbed mesh. Attacks mutate this through the
 * behavior they emit each round (contributions, queries answered, reuse from
 * vouching peers); `trust()` reads the LIVE computed value — never a canned
 * series.
 */
export class ServerTrustState {
  private contributions: number;
  private queriesAnswered: number;
  /** Reuse rate = (reuses of this server's entries by OTHER servers) per entry.
   *  Cross-vouching in a Sybil cohort drives reuse up; the V11 bound caps it. */
  private reuseRate: number;
  /** Formula version this state computes reputation against. Default 'v11'
   *  (production/defended) so existing callers and the byte-for-byte port test
   *  are unaffected; Phase-4 baseline runs pass 'v10' (undefended). */
  private readonly formula: TrustFormulaVersion;

  constructor(
    init: {
      contributions?: number;
      queriesAnswered?: number;
      reuseRate?: number;
    } = {},
    formula: TrustFormulaVersion = 'v11'
  ) {
    this.contributions = Math.max(0, init.contributions ?? 0);
    this.queriesAnswered = Math.max(0, init.queriesAnswered ?? 0);
    this.reuseRate = Math.max(0, init.reuseRate ?? 0);
    this.formula = formula;
  }

  /** Record genuine cooperative work this round (real contributions + queries). */
  recordWork(contributions: number, queriesAnswered: number): void {
    this.contributions += Math.max(0, contributions);
    this.queriesAnswered += Math.max(0, queriesAnswered);
  }

  /** Record reuse pressure (e.g. cross-vouching peers reusing this server's
   *  entries). Reuse rate is an average, so we move it toward `target` rather
   *  than summing — this models a per-entry reuse ratio that the V11 ceiling
   *  then bounds. */
  applyReusePressure(target: number): void {
    this.reuseRate = Math.max(this.reuseRate, Math.max(0, target));
  }

  get reputation(): number {
    return computeReputationFor(
      this.formula,
      this.contributions,
      this.queriesAnswered,
      this.reuseRate
    );
  }

  get tier(): ReputationTier {
    return resolveReputationTier(this.reputation);
  }

  /** Live trust in [0,1] — what observeOwnTrust() returns. */
  trust(): number {
    return reputationToTrust(this.reputation);
  }

  snapshot(): {
    contributions: number;
    queriesAnswered: number;
    reuseRate: number;
    reputation: number;
    tier: ReputationTier;
    trust: number;
  } {
    return {
      contributions: this.contributions,
      queriesAnswered: this.queriesAnswered,
      reuseRate: this.reuseRate,
      reputation: this.reputation,
      tier: this.tier,
      trust: this.trust(),
    };
  }
}
