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
 * TRANSFORM DISCIPLINE (premortem "refuse, don't guess"): only IDENTITY projections (a
 * transform-free scalar @bind, where raw displayed == raw source) are compared for value
 * equality. Non-identity projections (formatted @bind / @chart / @sparkline / @each / @model)
 * ABSTAIN with a declared reason — never pass, never falsify — until the declared transform
 * algebra (Slice 3). Abstention is NOT agreement (mirrors cross-perceiver fact-class scoping).
 *
 * Pairs: PerceiverConsensusReceipt (the sibling cross-perceiver differ), the co-emitted
 * holoViewContract (Native2DCompiler.buildViewContract), fetch_authoritative_state.
 */
import { createHash } from 'node:crypto';

export const SURFACE_TWIN_VERSION = 'surface-twin-v1';

export type SurfaceTwinScalar = string | number | boolean | null;

/** A projection as recorded in the holoViewContract (v1: gains optional `entity` + `identity`). */
export interface SurfaceTwinProjection {
  element: string;
  node: string;
  entity?: string;
  identity: boolean;
}

export interface SurfaceTwinDivergence {
  node: string;
  entity: string;
  displayed: SurfaceTwinScalar;
  authoritative: SurfaceTwinScalar;
  detail: string;
}

export type SurfaceTwinAbstentionReason =
  | 'no-entity-binding' // projection declares no twin entity → not twin-checked (coverage, not a fault)
  | 'non-identity-transform' // formatted/charted/listed → pending the transform algebra (Slice 3)
  | 'authority-missing' // the authoritative state has no value for this entity/field
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
 * Check a surface's entity-bound projections against the authoritative twin state. FALSIFIED on
 * any divergence between a displayed value and its twin's truth; non-identity/entity-less/
 * missing cases abstain with a declared reason. sha256-bound.
 */
export function checkSurfaceTwinCorrespondence(input: SurfaceTwinInput): SurfaceTwinReceipt {
  const { contract, displayedValues, authoritativeState } = input;
  const divergences: SurfaceTwinDivergence[] = [];
  const abstentions: SurfaceTwinAbstention[] = [];
  let checked = 0;

  for (const p of contract.projections ?? []) {
    if (!p.entity) {
      abstentions.push({ node: p.node, reason: 'no-entity-binding' });
      continue;
    }
    if (!p.identity) {
      abstentions.push({ node: p.node, entity: p.entity, reason: 'non-identity-transform' });
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
    if (!displayEquals(displayed, auth.value)) {
      divergences.push({
        node: p.node,
        entity: p.entity,
        displayed,
        authoritative: auth.value,
        detail: `surface shows ${JSON.stringify(displayed)} but twin "${p.entity}" holds ${JSON.stringify(auth.value)}`,
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
