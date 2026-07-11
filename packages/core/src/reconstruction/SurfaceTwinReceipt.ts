/**
 * SurfaceTwinReceipt — @verified_view v1 (Framing B, Slice 1): does a 2D surface faithfully
 * mirror the twin it claims to?
 *
 * A projection may declare `entity` (a StateAuthority entity id) in the `holoViewContract`.
 * This pure checker compares, per entity-bound IDENTITY projection, the DISPLAYED value (what
 * the surface renders) against the AUTHORITATIVE value (the twin's truth — e.g. from
 * `fetch_authoritative_state`). A divergence flips the verdict to FALSIFIED — "the dashboard
 * is lying about the twin".
 *
 * NON-CIRCULAR (W.767/W.769): the two inputs come from INDEPENDENT sources — the rendered
 * surface vs the authority layer — never a re-run of the same binding. In production the
 * displayed values are read from the rendered DOM the surface authored, and the authoritative
 * values from the StateAuthority layer: two independent reads. This function is the pure,
 * testable CORE; the live-DOM + live-fetch harness (and its jsdom/Playwright CI lane) is the
 * next slice — see research/2026-07-10_verified-view-v1-design.md.
 *
 * TRANSFORM DISCIPLINE (premortem "refuse, don't guess"): IDENTITY projections (transform-free
 * scalar @bind) compare raw-for-raw. Slice 3 adds FORMATTED @bind (precision/prefix/suffix): the
 * checker RE-APPLIES the compiler-declared transform to the authoritative value and compares to the
 * DOM text (`$1.20` vs a twin of 1.2), so a formatted projection is checkable, not blind. The
 * transform is compiler-derived, never re-parsed from the render, so it is not a new self-passing
 * seam — the RAW value still comes from the INDEPENDENT authority side. Bindings with NO scalar
 * value transform (@chart / @sparkline / @each / @model) still ABSTAIN — never pass, never falsify
 * (abstention is NOT agreement; mirrors cross-perceiver fact-class scoping).
 *
 * Pairs: PerceiverConsensusReceipt (the sibling cross-perceiver differ), the co-emitted
 * holoViewContract (Native2DCompiler.buildViewContract), fetch_authoritative_state.
 */
import { createHash } from 'node:crypto';

export const SURFACE_TWIN_VERSION = 'surface-twin-v1';

export type SurfaceTwinScalar = string | number | boolean | null;

/**
 * The declared value transform a formatted @bind applies to its raw source, mirrored from the
 * compiler's structured transform table (precision → toFixed, prefix/suffix wrap). Slice 3: an
 * independent checker RE-APPLIES this to the authoritative twin value and compares to the DOM
 * text — so a formatted projection ($1.20 vs a twin of 1.2) is twin-checkable instead of
 * abstaining. Compiler-derived, never re-parsed from JSX, so it cannot become a new self-passing
 * seam; the RAW value still comes from the INDEPENDENT authority side.
 */
export interface SurfaceTwinTransform {
  /** integer digit count for toFixed; mirrors `(value ?? 0).toFixed(precision)`. */
  precision?: number;
  /** literal text prepended (currency, etc.). */
  prefix?: string;
  /** literal text appended (unit, %, etc.). */
  suffix?: string;
}

/** A projection as recorded in the holoViewContract (v1: gains optional `entity` + `identity`;
 *  Slice 3 gains optional `transform` for formatted binds). */
export interface SurfaceTwinProjection {
  element: string;
  node: string;
  entity?: string;
  identity: boolean;
  /** Slice 3: the declared value transform for a formatted (non-identity) @bind. When present,
   *  the checker re-applies it to the authoritative value rather than abstaining. Absent for
   *  identity projections and for un-modelable bindings (@chart/@sparkline/@each/@model). */
  transform?: SurfaceTwinTransform;
}

export interface SurfaceTwinDivergence {
  node: string;
  entity: string;
  displayed: SurfaceTwinScalar;
  authoritative: SurfaceTwinScalar;
  /** For a formatted projection: the authoritative value AFTER the declared transform — what the
   *  surface SHOULD have shown. Absent for identity projections (raw compares directly). */
  expected?: SurfaceTwinScalar;
  detail: string;
}

export type SurfaceTwinAbstentionReason =
  | 'no-entity-binding' // projection declares no twin entity → not twin-checked (coverage, not a fault)
  | 'non-identity-transform' // formatted/charted/listed → pending the transform algebra (Slice 3)
  | 'authority-unavailable' // the authority could not be REACHED for this entity (fetch failed) — not a lie
  | 'authority-missing' // the authority WAS reached but has no value for this entity/field
  | 'display-missing'; // no displayed value was provided for this node

export interface SurfaceTwinAbstention {
  node: string;
  entity?: string;
  reason: SurfaceTwinAbstentionReason;
}

export interface SurfaceTwinReceipt {
  version: typeof SURFACE_TWIN_VERSION;
  verdict: 'CONSENSUS' | 'FALSIFIED';
  /** Entity-bound IDENTITY projections actually compared (abstentions excluded). */
  checked: number;
  divergences: SurfaceTwinDivergence[];
  abstentions: SurfaceTwinAbstention[];
  /** sha256 over the canonical {version, verdict, checked, sorted divergences+abstentions}. */
  receiptHash: string;
}

export interface SurfaceTwinInput {
  contract: { projections: SurfaceTwinProjection[] };
  /** node → the value the surface RENDERS (DOM text; numbers compared by normalized string). */
  displayedValues: Record<string, SurfaceTwinScalar>;
  /**
   * entity id → the twin's authoritative state. Either a scalar (the entity IS the value) or a
   * nested object keyed by the node's post-root field path (`"reactor.temp"` → field `temp`).
   */
  authoritativeState: Record<string, Record<string, unknown> | SurfaceTwinScalar>;
  /**
   * Entities whose authority could NOT be reached (a failed live fetch). Their projections
   * abstain as `authority-unavailable` — the app couldn't reach the twin, which is NOT the same
   * as the dashboard lying. Set by {@link verifySurfaceTwinLive}; omit for a static snapshot.
   */
  unavailableEntities?: readonly string[];
}

/**
 * Resolve the authoritative value for a node against an entity's state. The field is the node's
 * segments AFTER the first (the local render root) — `"reactor.temp"` → field `temp`; a scalar
 * entity value is used directly. Returns {found:false} when the field is absent (→ abstain).
 */
function resolveAuthoritative(
  entityState: Record<string, unknown> | SurfaceTwinScalar | undefined,
  node: string
): { found: boolean; value: SurfaceTwinScalar } {
  if (entityState === undefined) return { found: false, value: null };
  if (entityState === null || typeof entityState !== 'object') {
    return { found: true, value: entityState };
  }
  const dot = node.indexOf('.');
  const field = dot >= 0 ? node.slice(dot + 1) : node;
  let cur: unknown = entityState;
  for (const seg of field.split('.')) {
    if (cur !== null && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return { found: false, value: null };
    }
  }
  return { found: true, value: cur as SurfaceTwinScalar };
}

/** Identity projections render the raw value, so compare by normalized string (the DOM is text);
 *  a number and its string form are equal (42 === "42"). */
function displayEquals(a: SurfaceTwinScalar, b: SurfaceTwinScalar): boolean {
  return String(a) === String(b);
}

/**
 * Re-apply a formatted @bind's declared transform to a raw value, EXACTLY mirroring the compiler's
 * React render path (Native2DCompiler.buildBindContentExpr):
 *   `${prefix}${(value ?? 0).toFixed(precision)}${suffix}`   (with precision), or
 *   `${prefix}${(value ?? 0)}${suffix}`                       (no precision).
 * Pure and independent of the render — the verifier applies it to the AUTHORITATIVE value, so a
 * formatted display can be checked against the twin. A mismatch between what this computes and what
 * the surface rendered is a real divergence (incl. a transform-drift: the surface rendered a
 * different precision than the contract declares → the recomputed value won't match the DOM text).
 */
export function applyProjectionTransform(
  raw: SurfaceTwinScalar,
  transform: SurfaceTwinTransform
): string {
  const base = raw ?? 0;
  const value =
    transform.precision !== undefined ? Number(base).toFixed(transform.precision) : String(base);
  return `${transform.prefix ?? ''}${value}${transform.suffix ?? ''}`;
}

/**
 * Check a surface's entity-bound projections against the authoritative twin state. FALSIFIED on
 * any divergence between a displayed value and its twin's truth; non-identity/entity-less/
 * missing cases abstain with a declared reason. sha256-bound.
 */
export function checkSurfaceTwinCorrespondence(input: SurfaceTwinInput): SurfaceTwinReceipt {
  const { contract, displayedValues, authoritativeState } = input;
  const unavailable = new Set(input.unavailableEntities ?? []);
  const divergences: SurfaceTwinDivergence[] = [];
  const abstentions: SurfaceTwinAbstention[] = [];
  let checked = 0;

  for (const p of contract.projections ?? []) {
    if (!p.entity) {
      abstentions.push({ node: p.node, reason: 'no-entity-binding' });
      continue;
    }
    // Checkable = a transform-free identity bind, OR a formatted bind whose declared transform we
    // can re-apply (Slice 3). @chart/@sparkline/@each/@model carry no scalar value transform → they
    // still abstain (refuse, don't guess).
    const transform = p.transform;
    if (!p.identity && !transform) {
      abstentions.push({ node: p.node, entity: p.entity, reason: 'non-identity-transform' });
      continue;
    }
    if (unavailable.has(p.entity)) {
      abstentions.push({ node: p.node, entity: p.entity, reason: 'authority-unavailable' });
      continue;
    }
    if (!(p.node in displayedValues)) {
      abstentions.push({ node: p.node, entity: p.entity, reason: 'display-missing' });
      continue;
    }
    const auth = resolveAuthoritative(authoritativeState[p.entity], p.node);
    if (!auth.found) {
      abstentions.push({ node: p.node, entity: p.entity, reason: 'authority-missing' });
      continue;
    }
    checked++;
    const displayed = displayedValues[p.node];
    // Identity → compare raw-for-raw; formatted → re-apply the declared transform to the twin value.
    const expected: SurfaceTwinScalar = transform
      ? applyProjectionTransform(auth.value, transform)
      : auth.value;
    if (!displayEquals(displayed, expected)) {
      divergences.push({
        node: p.node,
        entity: p.entity,
        displayed,
        authoritative: auth.value,
        ...(transform ? { expected } : {}),
        detail: transform
          ? `surface shows ${JSON.stringify(displayed)} but twin "${p.entity}" holds ${JSON.stringify(auth.value)} which formats to ${JSON.stringify(expected)}`
          : `surface shows ${JSON.stringify(displayed)} but twin "${p.entity}" holds ${JSON.stringify(auth.value)}`,
      });
    }
  }

  const verdict: 'CONSENSUS' | 'FALSIFIED' = divergences.length > 0 ? 'FALSIFIED' : 'CONSENSUS';
  const canonical = JSON.stringify({
    version: SURFACE_TWIN_VERSION,
    verdict,
    checked,
    divergences: [...divergences].sort((a, b) => a.node.localeCompare(b.node)),
    abstentions: [...abstentions].sort((a, b) =>
      (a.node + a.reason).localeCompare(b.node + b.reason)
    ),
  });
  const receiptHash = createHash('sha256').update(canonical).digest('hex');

  return { version: SURFACE_TWIN_VERSION, verdict, checked, divergences, abstentions, receiptHash };
}

/**
 * Fetch the authoritative state for one twin entity. In production this is a thin adapter over
 * the `fetch_authoritative_state` MCP tool; in tests it is a mock. Returns the entity's state
 * (scalar or field object), or null/undefined (or throws) when the authority is unreachable.
 */
export type AuthoritativeStateFetcher = (
  entity: string
) => Promise<Record<string, unknown> | SurfaceTwinScalar | null | undefined>;

/**
 * verifySurfaceTwinLive — the production-shaped runtime twin check: fetch the authoritative value
 * for each entity the surface claims to mirror (via the INJECTED fetcher), then compare against
 * the displayed values. The fetcher is dependency-injected so the same function runs in
 * production (real `fetch_authoritative_state`) and in CI (a mock) — the seam is the entry point,
 * not just a test double.
 *
 * A fetch FAILURE (throw / null / undefined) makes that entity's projections abstain as
 * `authority-unavailable` — the app couldn't reach the twin, which is NOT the dashboard lying.
 * Only a REACHED authority that DIVERGES from the displayed value flips the verdict to FALSIFIED.
 */
export async function verifySurfaceTwinLive(input: {
  contract: { projections: SurfaceTwinProjection[] };
  displayedValues: Record<string, SurfaceTwinScalar>;
  fetchAuthoritativeState: AuthoritativeStateFetcher;
}): Promise<SurfaceTwinReceipt> {
  const { contract, displayedValues, fetchAuthoritativeState } = input;
  const entities = [
    ...new Set(
      (contract.projections ?? [])
        .map((p) => p.entity)
        .filter((e): e is string => typeof e === 'string' && e.length > 0)
    ),
  ];

  const authoritativeState: Record<string, Record<string, unknown> | SurfaceTwinScalar> = {};
  const unavailableEntities: string[] = [];

  const results = await Promise.allSettled(entities.map((e) => fetchAuthoritativeState(e)));
  results.forEach((r, i) => {
    const entity = entities[i];
    if (r.status === 'fulfilled' && r.value !== null && r.value !== undefined) {
      authoritativeState[entity] = r.value as Record<string, unknown> | SurfaceTwinScalar;
    } else {
      unavailableEntities.push(entity); // threw, or returned null/undefined → unreachable
    }
  });

  return checkSurfaceTwinCorrespondence({
    contract,
    displayedValues,
    authoritativeState,
    unavailableEntities,
  });
}
