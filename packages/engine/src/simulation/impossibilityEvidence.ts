/**
 * Impossibility evidence wire format (`impossibility.v1`) — the **counterweight**
 * to the consensus-side `solverType` family (W.107 ui.session.v1, W.315
 * equivalence.v1, agent.dialog.v1, network.event.v1).
 *
 * Where the consensus family makes replay-equivalence the load-bearing
 * primitive (two observers of the same chain produce the same wire key),
 * THIS primitive makes **forward motion against named impossibilities** the
 * load-bearing artifact. It expects **plural ratings** for the same
 * impossibility from different agents — that is debate, and the framework
 * does not flatten it.
 *
 * **Grounding** (verify-before-design, W.106 + F.031): the 28 impossibilities
 * + the SOLVES/PARTIALLY/REFRAMES/DOESN'T_HELP rating scale + the per-format
 * (`hs`/`hsplus`/`holo`/`all`) attribution + the historical UPGRADE pattern
 * (Cross-Platform Determinism: DOESN'T_HELP → PARTIALLY after behavioral
 * reframing) are all from existing memos:
 *   - `research/2026-03-09_holoscript-three-format-impossibility-map.md`
 *   - `research/2026-03-09_holoscript-14-impossibilities-outside-the-box.md`
 * This module ships the *type-level encoding* of those memos, not a new
 * scoring system. Agents file evidence with W.* IDs the memos already use
 * (e.g. W.048 Symbol Grounding, W.051 Version Control for 3D, W.053 Digital
 * Preservation — the three SOLVES that have shipped).
 *
 * **Why this is not the wire-format family's sixth instance**: the family
 * (`<modality>.<binding>.v1`) types modality content bound to chain-time —
 * its primary operation is `wireFormatEquivalent`. The right operation here
 * is *not* equivalence — it is **rating progression** and **multi-rater
 * tolerance**. Wiring this to the same equivalence operator would erase
 * exactly the novelty the impossibilities are meant to capture (every
 * "novel" claim becomes just another payload that either matches or
 * doesn't). So `impossibility.v1` lives in the same family of `solverType`
 * tags but explicitly supports the asymmetric operations the consensus
 * primitives don't.
 */

import { stableStringify } from './equivalenceRecord';

/** The `solverType` constant for this wire format. */
export const IMPOSSIBILITY_V1 = 'impossibility.v1' as const;

export type ImpossibilityV1SolverType = typeof IMPOSSIBILITY_V1;

/**
 * Rating scale from `research/2026-03-09_holoscript-14-impossibilities-outside-
 * the-box.md`. Order is meaningful (SOLVES > PARTIALLY > REFRAMES > DOESN'T_HELP)
 * for progression checks, but no module here forces a monotonic upgrade rule —
 * agents may disagree, and DOWNGRADES (e.g. peer reviewer rejecting an
 * over-claimed SOLVES back to PARTIALLY) are first-class.
 */
export type ImpossibilityRating = 'SOLVES' | 'PARTIALLY' | 'REFRAMES' | 'DOESNT_HELP';

/** HoloScript format tags from the impossibility map's per-format attribution. */
export type FormatTag = 'hs' | 'hsplus' | 'holo' | 'all';

/**
 * Numeric rank for {@link ImpossibilityRating} (higher = stronger claim).
 * Useful for `direction()` checks against a prior rating; unrelated to the
 * wire-key calculation (the wire key is over the canonical evidence, not
 * over a numeric score).
 */
export function rank(rating: ImpossibilityRating): number {
  switch (rating) {
    case 'SOLVES':
      return 3;
    case 'PARTIALLY':
      return 2;
    case 'REFRAMES':
      return 1;
    case 'DOESNT_HELP':
      return 0;
  }
}

/** `'upgrade'` if newer > prior; `'downgrade'` if newer < prior; `'lateral'` if equal. */
export type RatingDirection = 'upgrade' | 'downgrade' | 'lateral';

/** Compute the direction between two ratings (no side-effects, no opinion on which is correct). */
export function direction(prior: ImpossibilityRating, current: ImpossibilityRating): RatingDirection {
  const d = rank(current) - rank(prior);
  if (d > 0) return 'upgrade';
  if (d < 0) return 'downgrade';
  return 'lateral';
}

/**
 * Evidence shipped against one of the 28 named impossibilities.
 * Agents file these as chain extensions; multiple agents may file
 * different evidence for the same {@link id}, with different ratings —
 * the chain preserves all of them, and downstream tooling decides
 * how to surface the disagreement (debate is first-class).
 */
export interface ImpossibilityEvidence {
  /** Knowledge-store / vault ID of the impossibility (e.g. `W.048` Symbol Grounding). */
  id: string;
  /** Human-readable problem name (e.g. `Symbol Grounding Problem`). */
  problem: string;
  /** Current rating per this evidence. */
  rating: ImpossibilityRating;
  /**
   * Optional prior rating, when this evidence is making a directional claim
   * (UPGRADE / DOWNGRADE / LATERAL). Absent for first-time evidence.
   * Documented historical example: Cross-Platform Determinism
   * `DOESN'T_HELP` → `PARTIALLY` after behavioral reframing.
   */
  priorRating?: ImpossibilityRating;
  /** Which format(s) the evidence applies to. */
  formats: ReadonlyArray<FormatTag>;
  /** Short paragraph: how the evidence works (the mechanism). */
  mechanism: string;
  /**
   * Pointers to the artifacts substantiating the evidence: file:line, commit
   * hashes, paper section references, benchmark-results memos, OTS receipts.
   * Per F.017, every claim needs a citation; this field is non-empty by contract.
   */
  evidenceRefs: ReadonlyArray<string>;
  /**
   * Stable handle of the agent that filed this evidence (claude1, gemini1,
   * mw01). Per W.111 NOT instance id. Multiple agents can file evidence
   * for the same id; this field disambiguates them.
   */
  filedBy: string;
}

/**
 * Schema for an `impossibility.v1` witness record. Mirrors the `solverType` /
 * `specVersion` slots used by the rest of the wire-format family for routing
 * uniformity, but NOT the `wireFormatEquivalent` operator — see file header.
 */
export interface ImpossibilityV1Record {
  solverType: ImpossibilityV1SolverType;
  specVersion: 1;
  /** The evidence itself. */
  evidence: ImpossibilityEvidence;
  /** Stable derived key over the canonical evidence (see {@link evidenceWireKey}). */
  wireKey: string;
  /**
   * Optional sender chain-time cursor at filing time (mirrors the
   * messaging.ts cursorAt extension — agent identity = handle + chain + depth).
   */
  cursorAt?: { chain: string; depth: number };
  /** Optional harness label. */
  label?: string;
}

const ALLOWED_RATINGS: ReadonlyArray<ImpossibilityRating> = [
  'SOLVES',
  'PARTIALLY',
  'REFRAMES',
  'DOESNT_HELP',
] as const;

const ALLOWED_FORMATS: ReadonlyArray<FormatTag> = ['hs', 'hsplus', 'holo', 'all'] as const;

/**
 * Validate an evidence object against the contract. Returns the input
 * unchanged when valid, or `{ error }` describing the first violation.
 *
 * Contract:
 *   - id, problem, mechanism, filedBy: non-empty strings
 *   - rating, priorRating?: in {@link ALLOWED_RATINGS}
 *   - formats: non-empty array, each entry in {@link ALLOWED_FORMATS}
 *   - evidenceRefs: non-empty array of non-empty strings (F.017 — every
 *     claim needs a citation; ungrounded evidence is not evidence)
 */
export function validateEvidence(raw: unknown): ImpossibilityEvidence | { error: string } {
  if (raw === undefined || raw === null || typeof raw !== 'object') {
    return { error: 'evidence must be a non-null object' };
  }
  const o = raw as Record<string, unknown>;
  for (const f of ['id', 'problem', 'mechanism', 'filedBy'] as const) {
    if (typeof o[f] !== 'string' || (o[f] as string).length === 0) {
      return { error: `evidence.${f} must be a non-empty string` };
    }
  }
  if (!ALLOWED_RATINGS.includes(o.rating as ImpossibilityRating)) {
    return { error: `evidence.rating must be one of ${ALLOWED_RATINGS.join('|')}` };
  }
  if (
    o.priorRating !== undefined &&
    !ALLOWED_RATINGS.includes(o.priorRating as ImpossibilityRating)
  ) {
    return {
      error: `evidence.priorRating, when present, must be one of ${ALLOWED_RATINGS.join('|')}`,
    };
  }
  if (!Array.isArray(o.formats) || o.formats.length === 0) {
    return { error: 'evidence.formats must be a non-empty array' };
  }
  for (const f of o.formats) {
    if (!ALLOWED_FORMATS.includes(f as FormatTag)) {
      return { error: `evidence.formats entries must be one of ${ALLOWED_FORMATS.join('|')}` };
    }
  }
  if (!Array.isArray(o.evidenceRefs) || o.evidenceRefs.length === 0) {
    return {
      error: 'evidence.evidenceRefs must be a non-empty array (F.017: every claim needs a citation)',
    };
  }
  for (const ref of o.evidenceRefs) {
    if (typeof ref !== 'string' || ref.length === 0) {
      return { error: 'evidence.evidenceRefs entries must be non-empty strings' };
    }
  }
  return o as unknown as ImpossibilityEvidence;
}

/**
 * Build the canonical wire snapshot used for hashing. Strips no semantic
 * fields. Sorts `formats` and `evidenceRefs` so insertion order does not
 * affect the wire key (per-rating, per-agent — but order-independent).
 */
function canonicalEvidenceSnapshot(ev: ImpossibilityEvidence): Record<string, unknown> {
  const sortedFormats = [...ev.formats].sort();
  const sortedRefs = [...ev.evidenceRefs].sort();
  const out: Record<string, unknown> = {
    id: ev.id,
    problem: ev.problem,
    rating: ev.rating,
    formats: sortedFormats,
    mechanism: ev.mechanism,
    evidenceRefs: sortedRefs,
    filedBy: ev.filedBy,
  };
  if (ev.priorRating !== undefined) out.priorRating = ev.priorRating;
  return out;
}

/** Single derived key for one piece of evidence. */
export function evidenceWireKey(ev: ImpossibilityEvidence): string {
  return stableStringify(canonicalEvidenceSnapshot(ev));
}

/**
 * Build an `impossibility.v1` witness record. Validates the evidence; throws
 * on contract violation (per W.087 — collisions surface at canonicalization
 * time, not silently). Optional `cursorAt` is preserved when supplied.
 */
export function buildImpossibilityV1Record(
  evidence: ImpossibilityEvidence,
  options: { label?: string; cursorAt?: { chain: string; depth: number } } = {},
): ImpossibilityV1Record {
  const v = validateEvidence(evidence);
  if ('error' in v) {
    throw new Error(`impossibility.v1: ${v.error}`);
  }
  return {
    solverType: IMPOSSIBILITY_V1,
    specVersion: 1,
    evidence: v,
    wireKey: evidenceWireKey(v),
    ...(options.cursorAt !== undefined ? { cursorAt: options.cursorAt } : {}),
    ...(options.label !== undefined ? { label: options.label } : {}),
  };
}

/**
 * Aggregate plural evidence for a single impossibility. EXPECTS disagreement —
 * does not collapse ratings to a winner. Returns the cohort grouped by
 * rating, the set of agents that filed, and the strongest + weakest rating
 * present. Downstream tooling decides whether disagreement = open debate or
 * resolved consensus; this function does not.
 */
export interface EvidenceCohort {
  /** The impossibility id all evidence in the cohort shares. */
  id: string;
  /** All evidence records, in input order. */
  records: ReadonlyArray<ImpossibilityV1Record>;
  /** Records grouped by rating. */
  byRating: Record<ImpossibilityRating, ReadonlyArray<ImpossibilityV1Record>>;
  /** Set of `filedBy` handles that contributed evidence. */
  agents: ReadonlyArray<string>;
  /** Strongest rating present in the cohort (max by {@link rank}). */
  strongest: ImpossibilityRating;
  /** Weakest rating present in the cohort (min by rank). */
  weakest: ImpossibilityRating;
  /** True iff at least two distinct ratings are present (debate is open). */
  inDispute: boolean;
}

export function aggregateEvidence(
  records: ReadonlyArray<ImpossibilityV1Record>,
): EvidenceCohort {
  if (records.length === 0) {
    throw new Error('impossibility.v1: aggregateEvidence requires at least one record');
  }
  const id = records[0].evidence.id;
  for (const r of records) {
    if (r.evidence.id !== id) {
      throw new Error(
        `impossibility.v1: aggregateEvidence requires uniform id; got ${id} and ${r.evidence.id}`,
      );
    }
  }
  const byRating: Record<ImpossibilityRating, ImpossibilityV1Record[]> = {
    SOLVES: [],
    PARTIALLY: [],
    REFRAMES: [],
    DOESNT_HELP: [],
  };
  const agentsSet = new Set<string>();
  for (const r of records) {
    byRating[r.evidence.rating].push(r);
    agentsSet.add(r.evidence.filedBy);
  }
  const presentRatings = (Object.keys(byRating) as ImpossibilityRating[]).filter(
    (k) => byRating[k].length > 0,
  );
  const ranked = presentRatings.map((r) => ({ r, n: rank(r) }));
  ranked.sort((a, b) => b.n - a.n);
  const strongest = ranked[0].r;
  const weakest = ranked[ranked.length - 1].r;
  return {
    id,
    records,
    byRating,
    agents: [...agentsSet].sort(),
    strongest,
    weakest,
    inDispute: presentRatings.length >= 2,
  };
}
