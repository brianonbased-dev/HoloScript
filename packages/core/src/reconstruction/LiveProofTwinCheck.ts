/**
 * LiveProofTwinCheck — the wire from `@live_proof` to the independent oracle.
 *
 * `@live_proof { claim }` renders a verdict badge that re-runs its own formula. That earns
 * `self-referential`: it proves the badge faithfully displays the formula, not that the formula
 * is TRUE of anything. Declaring `falsifiedBy` faults earns `fault-tested` — the check
 * demonstrably goes red when broken on purpose — but its teeth are still its own formula's. A
 * claim could measure the wrong quantity entirely and pass fault injection.
 *
 * `verified` is the rung that needs someone else's teeth. {@link SurfaceTwinReceipt} is that
 * oracle: it compares DISPLAYED values against AUTHORITATIVE ones from the StateAuthority layer
 * (two independent reads). It checked projections, though — nothing connected it to a CLAIM.
 * This module is that connection, and it rests on one observation:
 *
 *   **A claim is only as independent as its inputs.** If every state path the claim reads is
 *   also displayed by an entity-bound, twin-checkable projection, then a fabricated input
 *   cannot hide — the same number is on screen being compared against the twin. The badge stops
 *   being a statement about its own arithmetic and becomes a statement about the twin.
 *
 * So `verified` = fault-tested AND fully twin-anchored. Both halves are load-bearing and
 * neither implies the other: anchoring proves the inputs are real, fault injection proves the
 * claim actually depends on them (a tautology like `true || temp < 100` reads an anchored input
 * and ignores it — fault injection is what rejects that). The ladder is monotone: each rung
 * strictly adds a guarantee rather than trading one for another.
 *
 * WHAT COMPILE TIME CANNOT DO: it can prove the inputs are twin-CHECKABLE, never that the twin
 * AGREES — that is inherently runtime. So `verified` is a coverage claim, and
 * {@link checkLiveProofTwinVerdict} is what closes it against a live receipt. The case it exists
 * for is the uncomfortable one: a badge showing green whose inputs diverge from the twin. That
 * is not a passing proof, it is a lying surface, and the verdict must say so regardless of what
 * colour the badge rendered.
 *
 * Pairs: SurfaceTwinReceipt (the oracle), Native2DCompiler.buildLiveProofElement (the emitter),
 * PerceiverConsensusReceipt (the sibling cross-perceiver differ).
 */
import { createHash } from 'node:crypto';
import {
  isTwinCheckable,
  type SurfaceTwinProjection,
  type SurfaceTwinReceipt,
} from './SurfaceTwinReceipt';

export const LIVE_PROOF_TWIN_VERSION = 'live-proof-twin-v1';

/**
 * How independent a `@live_proof` verdict is from the thing it claims to prove, weakest first.
 * Emitted as `data-proof-independence` on the badge.
 */
export type LiveProofIndependence = 'self-referential' | 'fault-tested' | 'verified';

/** One claim input, and the entity-bound projection that anchors it to a twin. */
export interface LiveProofAnchor {
  /** The state path the claim reads, e.g. `"reactor.temp"`. */
  input: string;
  /** The view-contract node displaying that exact path (equal to `input` — see below). */
  node: string;
  /** The StateAuthority entity that node is checked against. */
  entity: string;
}

/**
 * The machine-readable independence receipt for one `@live_proof` claim. Co-emitted with the
 * surface so an independent consumer re-derives it from the ARTIFACT rather than trusting the
 * compiler that produced it.
 */
export interface LiveProofBinding {
  claim: string;
  label: string;
  independence: LiveProofIndependence;
  /** Every state path the claim reads (over-approximated — see {@link deriveLiveProofInputs}). */
  inputs: string[];
  /** The inputs that ARE twin-anchored. `verified` requires this to cover `inputs`. */
  anchors: LiveProofAnchor[];
  /** The inputs that are not — precisely why a claim did not reach `verified`. */
  unanchored: string[];
}

export type LiveProofTwinVerdict = 'VERIFIED' | 'FALSIFIED' | 'ABSTAIN';

export type LiveProofAbstentionReason =
  | 'independence-insufficient' // the claim never reached compile-time `verified` — nothing to close
  | 'authority-unreachable' // an anchored input's twin could not be read (not a lie)
  | 'receipt-mismatch'; // the receipt does not cover this binding's anchors — wrong contract

export interface LiveProofTwinReceipt {
  version: typeof LIVE_PROOF_TWIN_VERSION;
  /**
   * Whether the badge's INDEPENDENCE holds — NOT whether the claim is true. A legitimately red
   * proof over faithful inputs is `VERIFIED` (the surface is honestly reporting a broken claim);
   * a green badge over diverging inputs is `FALSIFIED` (the surface is lying about the twin).
   * Read alongside {@link displayedState}, which carries what the badge actually rendered.
   */
  verdict: LiveProofTwinVerdict;
  claim: string;
  /** What the badge rendered, carried through so the two facts are never conflated. */
  displayedState: 'pass' | 'falsified';
  /** Anchored inputs the twin confirmed. */
  confirmed: string[];
  /** Anchored inputs whose displayed value diverged from the twin — each one falsifies. */
  divergent: Array<{ input: string; entity: string; detail: string }>;
  abstention?: { reason: LiveProofAbstentionReason; detail: string };
  /** One sentence a non-developer can act on. */
  reason: string;
  /** sha256 over {version, verdict, claim, displayedState, sorted confirmed/divergent}. */
  receiptHash: string;
}

/**
 * Identifiers-with-dots, and whether the match is a CALLEE (immediately followed by `(`).
 * The claim char-class the compiler enforces admits only these plus operators and literals.
 */
const PATH_RE = /([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s*(\()?/g;

/**
 * The state paths a claim READS.
 *
 * Deliberately an OVER-approximation: a name inside a string literal, or in a branch that never
 * evaluates, still counts as read. Over-approximating is the safe direction here — every extra
 * input is one more thing that must be twin-anchored before the claim may call itself `verified`,
 * so the error can only ever cost a claim its top label, never grant one it did not earn.
 *
 * Two narrowings, both of which REMOVE non-reads rather than admit guesses:
 *   - a path whose root is not a known state field is not a state read at all (`Math.max`);
 *   - a CALLEE's last segment is a method name, not a data field (`temp.toFixed(1)` reads
 *     `temp`), and a bare callee is a function, not a read at all (`isNaN(x)` reads only `x`).
 */
export function deriveLiveProofInputs(claim: string, stateFields: Iterable<string>): string[] {
  const known = new Set(stateFields);
  const found = new Set<string>();
  for (const match of claim.matchAll(PATH_RE)) {
    const [, rawPath, callee] = match;
    let path = rawPath;
    if (callee) {
      const dot = path.lastIndexOf('.');
      if (dot < 0) continue; // bare function call — reads nothing
      path = path.slice(0, dot); // strip the method name, keep the receiver
    }
    if (known.has(path.split('.')[0])) found.add(path);
  }
  return [...found].sort();
}

/**
 * Match each claim input to a twin-checkable projection that displays that EXACT path.
 *
 * Exact, never prefix: a claim reading `reactor.pressure` is NOT anchored by a projection of
 * `reactor.temp`, even though both are rooted at the same entity — the pressure the badge reads
 * would be nobody's business but the badge's. Refuse, don't guess. When several projections
 * display the same path, the first in contract order wins (the contract is sorted, so this is
 * deterministic); they are all checked against the same authority anyway.
 */
export function anchorLiveProofClaim(input: {
  inputs: readonly string[];
  projections: readonly SurfaceTwinProjection[];
}): { anchors: LiveProofAnchor[]; unanchored: string[] } {
  const byNode = new Map<string, SurfaceTwinProjection>();
  for (const p of input.projections) {
    if (!p.entity || !isTwinCheckable(p)) continue;
    if (!byNode.has(p.node)) byNode.set(p.node, p);
  }
  const anchors: LiveProofAnchor[] = [];
  const unanchored: string[] = [];
  for (const path of input.inputs) {
    const p = byNode.get(path);
    if (p?.entity) anchors.push({ input: path, node: p.node, entity: p.entity });
    else unanchored.push(path);
  }
  return { anchors, unanchored };
}

/**
 * The compile-time rung a claim earns. `verified` needs BOTH halves — see the module header for
 * why neither implies the other.
 */
export function gradeLiveProofIndependence(input: {
  faultTested: boolean;
  inputs: readonly string[];
  unanchored: readonly string[];
}): LiveProofIndependence {
  if (!input.faultTested) return 'self-referential';
  // A claim reading NOTHING (a constant) is anchored to nothing, whatever the projections say.
  if (input.inputs.length === 0 || input.unanchored.length > 0) return 'fault-tested';
  return 'verified';
}

/**
 * Close a `verified` claim against a live twin receipt — the half compile time cannot do.
 *
 * The three outcomes, and the discipline behind each:
 *   FALSIFIED — an anchored input's displayed value diverges from the twin. The claim is reading
 *               a number the twin does not hold, so its verdict means nothing. This fires even
 *               when the badge rendered green; that combination is precisely the failure the
 *               oracle exists to catch, and treating a green badge as reassurance here would
 *               reintroduce the self-referentiality the whole ladder is built to escape.
 *   ABSTAIN   — the claim never earned `verified`, or the authority could not be REACHED, or the
 *               receipt does not cover these anchors. Not reaching the twin is not the same as
 *               the surface lying about it (mirrors SurfaceTwinReceipt's abstention discipline).
 *   VERIFIED  — every anchored input was compared against the twin and agreed. The badge's
 *               verdict — green OR red — now rests on independently confirmed inputs.
 *
 * The receipt passed in MUST be the one derived from the same view contract the binding was
 * built against. That is checked, not assumed: an anchor absent from both the divergence and
 * abstention lists was either compared-and-agreed or never in the contract at all, so the
 * agreeing count is reconciled against the receipt's own `checked` total, and a shortfall
 * abstains as `receipt-mismatch` rather than reading as consensus.
 */
export function checkLiveProofTwinVerdict(input: {
  binding: LiveProofBinding;
  displayedState: 'pass' | 'falsified';
  twinReceipt: SurfaceTwinReceipt;
}): LiveProofTwinReceipt {
  const { binding, displayedState, twinReceipt } = input;
  const seal = (
    verdict: LiveProofTwinVerdict,
    reason: string,
    parts: {
      confirmed?: string[];
      divergent?: LiveProofTwinReceipt['divergent'];
      abstention?: LiveProofTwinReceipt['abstention'];
    } = {}
  ): LiveProofTwinReceipt => {
    const confirmed = (parts.confirmed ?? []).slice().sort();
    const divergent = (parts.divergent ?? [])
      .slice()
      .sort((a, b) => a.input.localeCompare(b.input));
    const receiptHash = createHash('sha256')
      .update(
        JSON.stringify({
          version: LIVE_PROOF_TWIN_VERSION,
          verdict,
          claim: binding.claim,
          displayedState,
          confirmed,
          divergent,
        })
      )
      .digest('hex');
    return {
      version: LIVE_PROOF_TWIN_VERSION,
      verdict,
      claim: binding.claim,
      displayedState,
      confirmed,
      divergent,
      ...(parts.abstention ? { abstention: parts.abstention } : {}),
      reason,
      receiptHash,
    };
  };

  if (binding.independence !== 'verified') {
    const why = binding.unanchored.length
      ? `${binding.unanchored.length} of its ${binding.inputs.length} input(s) are not checked against anything outside this surface: ${binding.unanchored.join(', ')}`
      : `it is labelled "${binding.independence}"`;
    return seal(
      'ABSTAIN',
      `"${binding.label}" cannot be independently confirmed — ${why}. Nothing here says it is wrong; it says nobody outside the surface has checked it.`,
      { abstention: { reason: 'independence-insufficient', detail: why } }
    );
  }

  const divergentByNode = new Map(twinReceipt.divergences.map((d) => [d.node, d]));
  const abstainedByNode = new Map(twinReceipt.abstentions.map((a) => [a.node, a]));

  const divergent: LiveProofTwinReceipt['divergent'] = [];
  const confirmed: string[] = [];
  const unreachable: Array<{ input: string; detail: string }> = [];

  for (const anchor of binding.anchors) {
    const d = divergentByNode.get(anchor.node);
    if (d) {
      divergent.push({ input: anchor.input, entity: anchor.entity, detail: d.detail });
      continue;
    }
    const a = abstainedByNode.get(anchor.node);
    if (a) {
      unreachable.push({ input: anchor.input, detail: a.reason });
      continue;
    }
    confirmed.push(anchor.input);
  }

  // A divergence is decisive and outranks an unreachable sibling: one input proven fabricated
  // falsifies the claim whether or not the others could be read.
  if (divergent.length > 0) {
    const badge = displayedState === 'pass' ? 'shows this claim as HOLDING' : 'already shows red';
    return seal(
      'FALSIFIED',
      `"${binding.label}" is reading ${divergent.length === 1 ? 'a number' : 'numbers'} the real thing does not have, so its verdict means nothing — the surface ${badge}. ${divergent.map((d) => d.detail).join('; ')}`,
      { confirmed, divergent }
    );
  }

  if (unreachable.length > 0) {
    const detail = unreachable.map((u) => `${u.input} (${u.detail})`).join(', ');
    return seal(
      'ABSTAIN',
      `"${binding.label}" could not be confirmed right now — the real values behind ${detail} could not be read. That is a connection problem, not evidence the surface is wrong.`,
      { confirmed, abstention: { reason: 'authority-unreachable', detail } }
    );
  }

  // Every anchor landed in `confirmed`, which means each was compared and agreed — UNLESS the
  // receipt came from a different contract and never contained them. Reconcile against the
  // receipt's own count rather than taking silence for agreement.
  if (twinReceipt.checked < confirmed.length) {
    const detail = `binding needs ${confirmed.length} checked projection(s), receipt checked ${twinReceipt.checked}`;
    return seal(
      'ABSTAIN',
      `"${binding.label}" could not be confirmed — the evidence offered does not cover what this claim depends on (${detail}).`,
      { confirmed, abstention: { reason: 'receipt-mismatch', detail } }
    );
  }

  const verdictWord = displayedState === 'pass' ? 'holds' : 'is broken';
  return seal(
    'VERIFIED',
    `"${binding.label}" ${verdictWord}, and every number behind it was checked against the real thing and matched (${confirmed.join(', ')}). This verdict does not depend on the surface's own arithmetic.`,
    { confirmed }
  );
}
