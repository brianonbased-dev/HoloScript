/**
 * deriveLotusHealth — paper-audit structural readiness mapped to lotus bloom.
 *
 * This is the keystone of the "living lotus": it turns the machine-generated
 * paper-audit (`docs/public/papers-status.json`) into a per-petal bloom state and
 * an aggregate openness. The result is a structural-readiness proxy over audit
 * tokens. It does not execute evidence, bind tokens to individual claims, or
 * verify that a paper's empirical claims are true (I.007, F.037, F.099).
 *
 * It is a PURE, deterministic reduction (no I/O, no clock) — the caller reads the
 * audit JSON; this maps it. That keeps it CAEL/SimulationContract-friendly and
 * makes the score reproducible from the supplied tokens. It guarantees neither
 * the correctness nor the freshness of those tokens, so every result carries an
 * explicit unverified-claim-support label.
 *
 * Token weights: ✅ = 1.0 (passing), ⚠️ = 0.5 (partial), ❌ = 0.0 (failing/red),
 * ➖ = not-applicable (excluded from the denominator).
 *
 * @module traits/deriveLotusHealth
 */

import type { LotusBloomState } from './BotanicalLotusTrait';

/** The audit token for one pillar of one paper. */
export type PillarToken = '✅' | '⚠️' | '❌' | '➖';

/** What the numeric score actually measures. Kept machine-readable downstream. */
export const LOTUS_HEALTH_BASIS = 'structural-readiness-proxy' as const;
/** Structural token reduction does not itself verify empirical paper claims. */
export const LOTUS_CLAIM_SUPPORT = 'unverified' as const;

export type LotusHealthBasis = typeof LOTUS_HEALTH_BASIS;
export type LotusClaimSupport = typeof LOTUS_CLAIM_SUPPORT;

/** One pillar cell in the paper-audit matrix (`papers-status.json`). */
export interface PaperPillarCell {
  token: PillarToken;
  evidence?: string;
  /** Optional v3 manifest scope for the detector that produced this cell. */
  scope?: string;
  /** Optional source signal; preserved for audit, never upgraded by this reducer. */
  claimSupport?: string;
}

/** One paper row from `docs/public/papers-status.json`. */
export interface PaperStatusRow {
  rowId: string | number;
  title: string;
  retired?: boolean;
  /** Keyed by pillar name (novelty, rtxBench, fullLoop, …). */
  pillars: Record<string, PaperPillarCell>;
}

/** The `papers-status.json` document (only the fields this reduction needs). */
export interface PapersStatusDoc {
  schema?: string;
  generatedAt?: string;
  canonicalRouterPath?: string;
  matrixSourcePath?: string;
  scriptCommit?: string;
  papers: PaperStatusRow[];
}

/** Per-paper health + the petal bloom state it maps to. */
export interface PaperHealth {
  rowId: string;
  title: string;
  /** 0..1 mean token weight over applicable (non-➖) pillars. */
  health: number;
  bloom: LotusBloomState;
  retired: boolean;
  passing: number;
  partial: number;
  /** Failing/red pillar count — the signal that wilts a non-retired paper. */
  failing: number;
  /** Explicit semantic boundary for `health` and `bloom`. */
  basis: LotusHealthBasis;
  /** Always unverified: structural scoring is not claim verification. */
  claimSupport: LotusClaimSupport;
  /** Claim-support labels supplied by source cells, retained without promotion. */
  sourceClaimSupport: string[];
}

/** The whole flower's health: one entry per petal + a cell-weighted aggregate. */
export interface LotusHealth {
  /** Cell-weighted mean over every applicable pillar of every paper (0..1). */
  aggregate: number;
  /** The aggregate as a bloom state — drives the hero flower's overall openness. */
  aggregateBloom: LotusBloomState;
  perPaper: PaperHealth[];
  /** Explicit semantic boundary for the aggregate and every per-paper score. */
  basis: LotusHealthBasis;
  /** Always unverified: no evidence is executed by this pure reduction. */
  claimSupport: LotusClaimSupport;
  /** Distinct claim-support labels present in source cells. */
  sourceClaimSupport: string[];
  sourceSchema?: string;
  sourceScriptCommit?: string;
  generatedAt?: string;
}

const TOKEN_WEIGHT: Record<Exclude<PillarToken, '➖'>, number> = {
  '✅': 1.0,
  '⚠️': 0.5,
  '❌': 0.0,
};

/**
 * Failing-pillar count at/above which a non-retired paper wilts (rather than
 * merely budding). Red cells mean a benchmark was attempted and failed or a
 * claim is contradicted (e.g. the TVCG NAFEMS 300× discrepancy) — that is a
 * wilt, not an unopened bud.
 */
const WILT_FAILING_THRESHOLD = 3;
const WILT_HEALTH_CEILING = 0.7;

function sourceClaimSupportForRow(row: PaperStatusRow): string[] {
  return [
    ...new Set(
      Object.values(row.pillars)
        .map((cell) => cell?.claimSupport)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    ),
  ].sort();
}

/**
 * Map a paper's health to a bloom state. Retired papers are dead petals (wilted);
 * papers with several failing pillars and low health wilt; otherwise the petal
 * opens with health. `sealed` = an early, unproven bud; `wilted` = degraded.
 */
export function bloomForPaperHealth(
  health: number,
  retired: boolean,
  failing: number
): LotusBloomState {
  if (retired) return 'wilted';
  if (failing >= WILT_FAILING_THRESHOLD && health < WILT_HEALTH_CEILING) return 'wilted';
  if (health >= 0.9) return 'full';
  if (health >= 0.75) return 'blooming';
  if (health >= 0.55) return 'budding';
  return 'sealed';
}

/** Reduce one paper row to its health + bloom. */
export function paperHealth(row: PaperStatusRow): PaperHealth {
  let sum = 0;
  let applicable = 0;
  let passing = 0;
  let partial = 0;
  let failing = 0;
  for (const key of Object.keys(row.pillars)) {
    const token = row.pillars[key]?.token;
    if (token === '➖' || token == null) continue;
    applicable += 1;
    sum += TOKEN_WEIGHT[token as Exclude<PillarToken, '➖'>] ?? 0;
    if (token === '✅') passing += 1;
    else if (token === '⚠️') partial += 1;
    else if (token === '❌') failing += 1;
  }
  const health = applicable > 0 ? sum / applicable : 0;
  const retired = row.retired === true;
  return {
    rowId: String(row.rowId),
    title: row.title,
    health,
    bloom: bloomForPaperHealth(health, retired, failing),
    retired,
    passing,
    partial,
    failing,
    basis: LOTUS_HEALTH_BASIS,
    claimSupport: LOTUS_CLAIM_SUPPORT,
    sourceClaimSupport: sourceClaimSupportForRow(row),
  };
}

/**
 * Reduce the full paper-audit document to lotus health: one bloom-bearing entry
 * per petal (paper) plus the cell-weighted aggregate that drives the hero
 * flower's overall openness. Pure and deterministic.
 */
export function deriveLotusHealth(doc: PapersStatusDoc): LotusHealth {
  const perPaper = (doc.papers ?? []).map(paperHealth);

  // Aggregate is CELL-weighted (every applicable pillar of every paper counts
  // once) — a paper with more graded pillars contributes more, matching the
  // audit's own token totals rather than averaging small and large papers alike.
  let sum = 0;
  let applicable = 0;
  for (const row of doc.papers ?? []) {
    for (const key of Object.keys(row.pillars)) {
      const token = row.pillars[key]?.token;
      if (token === '➖' || token == null) continue;
      applicable += 1;
      sum += TOKEN_WEIGHT[token as Exclude<PillarToken, '➖'>] ?? 0;
    }
  }
  const aggregate = applicable > 0 ? sum / applicable : 0;
  const sourceClaimSupport = [
    ...new Set(perPaper.flatMap((paper) => paper.sourceClaimSupport)),
  ].sort();

  return {
    aggregate,
    // Preserve the existing aggregate bloom ladder for compatibility. A retired
    // paper does not drag the whole flower to "dead"; failing-driven wilt remains
    // a per-petal visualization rather than an aggregate rule.
    aggregateBloom: bloomForPaperHealth(aggregate, false, 0),
    perPaper,
    basis: LOTUS_HEALTH_BASIS,
    claimSupport: LOTUS_CLAIM_SUPPORT,
    sourceClaimSupport,
    sourceSchema: doc.schema,
    sourceScriptCommit: doc.scriptCommit,
    generatedAt: doc.generatedAt,
  };
}
