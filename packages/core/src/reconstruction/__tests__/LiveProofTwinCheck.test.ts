import { describe, expect, it } from 'vitest';
import {
  anchorLiveProofClaim,
  checkLiveProofTwinVerdict,
  deriveLiveProofInputs,
  extractLiveProofBadges,
  gradeLiveProofIndependence,
  verifyLiveProofsLive,
  LIVE_PROOF_TWIN_VERSION,
  type LiveProofBinding,
} from '../LiveProofTwinCheck';
import {
  checkSurfaceTwinCorrespondence,
  isTwinCheckable,
  type SurfaceTwinProjection,
} from '../SurfaceTwinReceipt';

/**
 * The `verified` rung: a @live_proof claim independently confirmed against the twin.
 *
 * The twin receipts here are produced by the REAL checker rather than hand-built, so these tests
 * fail if the oracle's semantics move underneath them — a hand-written receipt would keep passing
 * against an oracle that had stopped working.
 *
 * The load-bearing case is `a green badge over a diverging twin`. If that ever returns anything
 * but FALSIFIED, the rung is decoration: the surface would be showing numbers the twin does not
 * hold while claiming to have been independently checked, which is strictly worse than the
 * `self-referential` label it started with, because now it carries a promise.
 */

const IDENTITY_TEMP: SurfaceTwinProjection = {
  element: 'TempReadout',
  node: 'temp',
  entity: 'reactor-1',
  identity: true,
};

/** Run the real oracle over a one-projection surface. */
function twinReceipt(opts: {
  projections?: SurfaceTwinProjection[];
  displayed: Record<string, string | number | boolean | null>;
  authoritative: Record<string, Record<string, unknown> | string | number | boolean | null>;
  unavailable?: string[];
}) {
  return checkSurfaceTwinCorrespondence({
    contract: { projections: opts.projections ?? [IDENTITY_TEMP] },
    displayedValues: opts.displayed,
    authoritativeState: opts.authoritative,
    ...(opts.unavailable ? { unavailableEntities: opts.unavailable } : {}),
  });
}

const VERIFIED_BINDING: LiveProofBinding = {
  claim: 'temp < 100',
  label: 'Reactor within limits',
  independence: 'verified',
  inputs: ['temp'],
  anchors: [{ input: 'temp', node: 'temp', entity: 'reactor-1' }],
  unanchored: [],
};

describe('deriveLiveProofInputs — what a claim actually reads', () => {
  it('finds every state field a claim reads', () => {
    expect(deriveLiveProofInputs('capacity >= load * factor', ['capacity', 'load', 'factor'])).toEqual(
      ['capacity', 'factor', 'load']
    );
  });

  it('keeps the full dotted path, not just the root', () => {
    // A claim about reactor.temp is NOT a claim about everything under `reactor`; recording only
    // the root would let a projection of reactor.pressure pass as this claim's anchor.
    expect(deriveLiveProofInputs('reactor.temp < 100', ['reactor'])).toEqual(['reactor.temp']);
  });

  it('ignores names that are not state at all', () => {
    expect(deriveLiveProofInputs('Math.max(a, b) > 0', ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('reads the receiver of a method call, not the method name', () => {
    expect(deriveLiveProofInputs('temp.toFixed(1) === "20.0"', ['temp'])).toEqual(['temp']);
  });

  it('treats a bare call as a function, not a data read', () => {
    expect(deriveLiveProofInputs('isNaN(x)', ['x', 'isNaN'])).toEqual(['x']);
  });

  it('over-approximates rather than under-approximates', () => {
    // `load` inside a string literal is not really read, but counting it can only ever cost the
    // claim its top label. The opposite error would hand out a label nobody earned.
    expect(deriveLiveProofInputs('status === "load" && load < 5', ['load', 'status'])).toEqual([
      'load',
      'status',
    ]);
  });
});

describe('anchorLiveProofClaim — which inputs are twin-backed', () => {
  it('anchors an input displayed by an entity-bound identity projection', () => {
    const { anchors, unanchored } = anchorLiveProofClaim({
      inputs: ['temp'],
      projections: [IDENTITY_TEMP],
    });
    expect(anchors).toEqual([{ input: 'temp', node: 'temp', entity: 'reactor-1' }]);
    expect(unanchored).toEqual([]);
  });

  it('refuses a projection with no twin entity', () => {
    const { anchors, unanchored } = anchorLiveProofClaim({
      inputs: ['temp'],
      projections: [{ element: 'T', node: 'temp', identity: true }],
    });
    expect(anchors).toEqual([]);
    expect(unanchored).toEqual(['temp']);
  });

  it('refuses a projection the twin checker itself abstains on', () => {
    // A @chart carries no scalar transform, so the oracle never compares it. Anchoring to one
    // would claim independent confirmation from a check that is structurally incapable of running.
    const chart: SurfaceTwinProjection = {
      element: 'History',
      node: 'temp',
      entity: 'reactor-1',
      identity: false,
    };
    expect(isTwinCheckable(chart)).toBe(false);
    expect(anchorLiveProofClaim({ inputs: ['temp'], projections: [chart] }).unanchored).toEqual([
      'temp',
    ]);
  });

  it('accepts a formatted projection, because the oracle re-applies the transform', () => {
    const formatted: SurfaceTwinProjection = {
      element: 'Money',
      node: 'balance',
      entity: 'acct-9',
      identity: false,
      transform: { precision: 2, prefix: '$' },
    };
    expect(isTwinCheckable(formatted)).toBe(true);
    expect(anchorLiveProofClaim({ inputs: ['balance'], projections: [formatted] }).anchors).toEqual([
      { input: 'balance', node: 'balance', entity: 'acct-9' },
    ]);
  });

  it('does not accept a sibling path as an anchor', () => {
    // reactor.pressure is a different number from reactor.temp; sharing an entity is not sharing
    // a check. Refuse, don't guess.
    const { anchors, unanchored } = anchorLiveProofClaim({
      inputs: ['reactor.pressure'],
      projections: [{ element: 'T', node: 'reactor.temp', entity: 'reactor-1', identity: true }],
    });
    expect(anchors).toEqual([]);
    expect(unanchored).toEqual(['reactor.pressure']);
  });
});

describe('gradeLiveProofIndependence — the ladder', () => {
  it('is self-referential without fault injection, however well anchored', () => {
    expect(
      gradeLiveProofIndependence({ faultTested: false, inputs: ['temp'], unanchored: [] })
    ).toBe('self-referential');
  });

  it('stops at fault-tested when any input is unanchored', () => {
    expect(
      gradeLiveProofIndependence({
        faultTested: true,
        inputs: ['temp', 'headroom'],
        unanchored: ['headroom'],
      })
    ).toBe('fault-tested');
  });

  it('stops at fault-tested for a claim that reads nothing', () => {
    // A constant claim has no inputs to anchor, so "every input is anchored" is vacuously true.
    // Vacuous truth is exactly how a decoration talks its way onto the top rung.
    expect(gradeLiveProofIndependence({ faultTested: true, inputs: [], unanchored: [] })).toBe(
      'fault-tested'
    );
  });

  it('reaches verified only with both halves', () => {
    expect(
      gradeLiveProofIndependence({ faultTested: true, inputs: ['temp'], unanchored: [] })
    ).toBe('verified');
  });
});

describe('checkLiveProofTwinVerdict — closing the claim against a live twin', () => {
  it('FALSIFIES a green badge whose input diverges from the twin', () => {
    // THE case this rung exists for. The surface shows 20°, the claim "temp < 100" therefore reads
    // green — and the reactor is actually at 900°. A verdict system that reports this as passing is
    // worse than no verdict at all.
    const receipt = twinReceipt({
      displayed: { temp: 20 },
      authoritative: { 'reactor-1': { temp: 900 } },
    });
    expect(receipt.verdict).toBe('FALSIFIED');

    const out = checkLiveProofTwinVerdict({
      binding: VERIFIED_BINDING,
      displayedState: 'pass',
      twinReceipt: receipt,
    });
    expect(out.verdict).toBe('FALSIFIED');
    expect(out.divergent).toHaveLength(1);
    expect(out.divergent[0].entity).toBe('reactor-1');
    expect(out.reason).toMatch(/shows this claim as HOLDING/);
    expect(out.reason).toMatch(/its verdict means nothing/);
  });

  it('VERIFIES a claim whose inputs the twin confirms', () => {
    const receipt = twinReceipt({
      displayed: { temp: 20 },
      authoritative: { 'reactor-1': { temp: 20 } },
    });
    expect(receipt.verdict).toBe('CONSENSUS');
    expect(receipt.checked).toBe(1);

    const out = checkLiveProofTwinVerdict({
      binding: VERIFIED_BINDING,
      displayedState: 'pass',
      twinReceipt: receipt,
    });
    expect(out.verdict).toBe('VERIFIED');
    expect(out.confirmed).toEqual(['temp']);
    expect(out.reason).toMatch(/checked against the real thing and matched/);
  });

  it('VERIFIES an honestly RED claim — the verdict is about independence, not truth', () => {
    // temp is faithfully 900 and the badge says FALSIFIED. The surface is behaving perfectly;
    // conflating "the claim is false" with "the proof is untrustworthy" would punish honesty.
    const receipt = twinReceipt({
      displayed: { temp: 900 },
      authoritative: { 'reactor-1': { temp: 900 } },
    });
    const out = checkLiveProofTwinVerdict({
      binding: VERIFIED_BINDING,
      displayedState: 'falsified',
      twinReceipt: receipt,
    });
    expect(out.verdict).toBe('VERIFIED');
    expect(out.displayedState).toBe('falsified');
    expect(out.reason).toMatch(/is broken/);
  });

  it('ABSTAINS when the authority cannot be reached — unreachable is not lying', () => {
    const receipt = twinReceipt({
      displayed: { temp: 20 },
      authoritative: {},
      unavailable: ['reactor-1'],
    });
    const out = checkLiveProofTwinVerdict({
      binding: VERIFIED_BINDING,
      displayedState: 'pass',
      twinReceipt: receipt,
    });
    expect(out.verdict).toBe('ABSTAIN');
    expect(out.abstention?.reason).toBe('authority-unreachable');
    expect(out.reason).toMatch(/connection problem, not evidence the surface is wrong/);
  });

  it('ABSTAINS on a claim that never earned verified, and says which input is unbacked', () => {
    const out = checkLiveProofTwinVerdict({
      binding: {
        ...VERIFIED_BINDING,
        independence: 'fault-tested',
        inputs: ['temp', 'headroom'],
        unanchored: ['headroom'],
      },
      displayedState: 'pass',
      twinReceipt: twinReceipt({
        displayed: { temp: 20 },
        authoritative: { 'reactor-1': { temp: 20 } },
      }),
    });
    expect(out.verdict).toBe('ABSTAIN');
    expect(out.abstention?.reason).toBe('independence-insufficient');
    expect(out.reason).toMatch(/headroom/);
    expect(out.reason).toMatch(/Nothing here says it is wrong/);
  });

  it('ABSTAINS rather than reading silence as agreement when the receipt is for another surface', () => {
    // A receipt that never contained this claim's projection lists it in neither divergences nor
    // abstentions — indistinguishable from agreement unless the checked count is reconciled.
    const foreign = twinReceipt({
      projections: [{ element: 'Other', node: 'humidity', entity: 'weather-2', identity: true }],
      displayed: {},
      authoritative: {},
    });
    expect(foreign.checked).toBe(0);

    const out = checkLiveProofTwinVerdict({
      binding: VERIFIED_BINDING,
      displayedState: 'pass',
      twinReceipt: foreign,
    });
    expect(out.verdict).toBe('ABSTAIN');
    expect(out.abstention?.reason).toBe('receipt-mismatch');
  });

  it('lets one divergence outrank an unreachable sibling', () => {
    const receipt = twinReceipt({
      projections: [
        IDENTITY_TEMP,
        { element: 'P', node: 'psi', entity: 'pump-2', identity: true },
      ],
      displayed: { temp: 20, psi: 5 },
      authoritative: { 'reactor-1': { temp: 900 } },
      unavailable: ['pump-2'],
    });
    const out = checkLiveProofTwinVerdict({
      binding: {
        ...VERIFIED_BINDING,
        claim: 'temp < 100 && psi < 10',
        inputs: ['psi', 'temp'],
        anchors: [
          { input: 'temp', node: 'temp', entity: 'reactor-1' },
          { input: 'psi', node: 'psi', entity: 'pump-2' },
        ],
      },
      displayedState: 'pass',
      twinReceipt: receipt,
    });
    expect(out.verdict).toBe('FALSIFIED');
  });

  it('binds the verdict to a hash that moves when the verdict does', () => {
    const agree = checkLiveProofTwinVerdict({
      binding: VERIFIED_BINDING,
      displayedState: 'pass',
      twinReceipt: twinReceipt({
        displayed: { temp: 20 },
        authoritative: { 'reactor-1': { temp: 20 } },
      }),
    });
    const diverge = checkLiveProofTwinVerdict({
      binding: VERIFIED_BINDING,
      displayedState: 'pass',
      twinReceipt: twinReceipt({
        displayed: { temp: 20 },
        authoritative: { 'reactor-1': { temp: 900 } },
      }),
    });
    expect(agree.version).toBe(LIVE_PROOF_TWIN_VERSION);
    expect(agree.receiptHash).not.toBe(diverge.receiptHash);
    expect(agree.receiptHash).toHaveLength(64);
  });
});

/**
 * Markup below is the REAL shape renderToStaticMarkup produces for a compiled badge — attribute
 * values HTML-escaped, `data-proof-state` on a CHILD element for the richer rungs and on the badge
 * itself for `self-referential`. The end-to-end version (real compiler, real render, real
 * StateAuthority) lives in @holoscript/mcp-server's liveProofLiveAuthority.test.ts; these pin the
 * parsing edges that one surface cannot exercise.
 */
const VERIFIED_BADGE_HTML =
  '<div data-proof-claim="temp &lt; 100" data-proof-label="Reactor within limits" ' +
  'data-proof-independence="verified" ' +
  'data-proof-anchors="[{&quot;input&quot;:&quot;temp&quot;,&quot;node&quot;:&quot;temp&quot;,&quot;entity&quot;:&quot;reactor-1&quot;}]" ' +
  'class="flex flex-col gap-2">' +
  '<div data-proof-state="pass" class="rounded-md">✓ Reactor within limits holds</div>' +
  '</div>';

describe('extractLiveProofBadges — reading a badge back out of what rendered', () => {
  it('recovers claim, label, rung, rendered verdict and anchors', () => {
    const [badge] = extractLiveProofBadges(VERIFIED_BADGE_HTML);
    expect(badge.claim).toBe('temp < 100'); // entity-decoded
    expect(badge.label).toBe('Reactor within limits');
    expect(badge.independence).toBe('verified');
    expect(badge.displayedState).toBe('pass');
    expect(badge.anchors).toEqual([{ input: 'temp', node: 'temp', entity: 'reactor-1' }]);
  });

  it('reads the state off the badge itself when the rung puts it there', () => {
    const selfRef =
      '<div data-proof-claim="a &gt; 1" data-proof-label="Alpha" ' +
      'data-proof-independence="self-referential" data-proof-state="falsified">✗ Alpha FALSIFIED</div>';
    const [badge] = extractLiveProofBadges(selfRef);
    expect(badge.independence).toBe('self-referential');
    expect(badge.displayedState).toBe('falsified');
    expect(badge.anchors).toEqual([]);
  });

  it('never lets one badge borrow the next badge’s verdict', () => {
    // Two badges in sequence: the first is red, the second green. Scanning past the first badge's
    // boundary would report the wrong verdict for it — and a wrong verdict that LOOKS like a real
    // reading is worse than no reading, because nothing downstream can tell.
    const first =
      '<div data-proof-claim="a" data-proof-label="A" data-proof-independence="fault-tested">' +
      '<div data-proof-state="falsified">x</div></div>';
    const second =
      '<div data-proof-claim="b" data-proof-label="B" data-proof-independence="fault-tested">' +
      '<div data-proof-state="pass">y</div></div>';
    const badges = extractLiveProofBadges(first + second);
    expect(badges.map((b) => [b.claim, b.displayedState])).toEqual([
      ['a', 'falsified'],
      ['b', 'pass'],
    ]);
  });

  it('skips a claim that never rendered a verdict', () => {
    expect(
      extractLiveProofBadges('<div data-proof-claim="a" data-proof-independence="verified"></div>')
    ).toEqual([]);
  });

  it('does not hand a stateless badge the NEXT badge’s verdict', () => {
    // The sharp edge of the window. A badge that rendered no verdict of its own sits immediately
    // before one that did; an unbounded forward scan finds the neighbour's `pass` and reports the
    // stateless claim as HOLDING. That invents a verdict for a claim nobody evaluated — the single
    // worst thing this parser could do, since everything downstream treats it as a real reading.
    const stateless = '<div data-proof-claim="a" data-proof-independence="verified"></div>';
    const rendered =
      '<div data-proof-claim="b" data-proof-label="B" data-proof-independence="fault-tested">' +
      '<div data-proof-state="pass">y</div></div>';
    const badges = extractLiveProofBadges(stateless + rendered);
    expect(badges.map((b) => b.claim)).toEqual(['b']);
  });

  it('treats unreadable anchors as absent rather than guessing at them', () => {
    const broken = VERIFIED_BADGE_HTML.replace(/data-proof-anchors="[^"]*"/, 'data-proof-anchors="{{"');
    expect(extractLiveProofBadges(broken)[0].anchors).toEqual([]);
  });
});

describe('verifyLiveProofsLive — rendered surface + live authority, end to end', () => {
  const html =
    '<div data-holo-projects="temp">20</div>' + VERIFIED_BADGE_HTML;
  const contract = { projections: [IDENTITY_TEMP] };

  it('VERIFIED when the authority holds what the surface displays', async () => {
    const [r] = await verifyLiveProofsLive({
      html,
      contract,
      fetchAuthoritativeState: async (e) => (e === 'reactor-1' ? { temp: 20 } : null),
    });
    expect(r.receipt.verdict).toBe('VERIFIED');
  });

  it('FALSIFIED for a green badge the authority contradicts', async () => {
    const [r] = await verifyLiveProofsLive({
      html,
      contract,
      fetchAuthoritativeState: async () => ({ temp: 900 }),
    });
    expect(r.badge.displayedState).toBe('pass');
    expect(r.receipt.verdict).toBe('FALSIFIED');
  });

  it('ABSTAINS when the authority throws, never false-FALSIFIES', async () => {
    const [r] = await verifyLiveProofsLive({
      html,
      contract,
      fetchAuthoritativeState: async () => {
        throw new Error('StateAuthority down');
      },
    });
    expect(r.receipt.verdict).toBe('ABSTAIN');
    expect(r.receipt.abstention?.reason).toBe('authority-unreachable');
  });

  it('still issues a receipt for a weak badge — silence would read as approval', async () => {
    const weak =
      '<div data-proof-claim="temp &lt; 100" data-proof-label="Reactor within limits" ' +
      'data-proof-independence="fault-tested"><div data-proof-state="pass">ok</div></div>';
    const [r] = await verifyLiveProofsLive({
      html: weak,
      contract,
      fetchAuthoritativeState: async () => ({ temp: 20 }),
    });
    expect(r.receipt.verdict).toBe('ABSTAIN');
    expect(r.receipt.abstention?.reason).toBe('independence-insufficient');
  });

  it('returns nothing for a surface that declares no claims', async () => {
    expect(
      await verifyLiveProofsLive({
        html: '<div>no proofs here</div>',
        contract,
        fetchAuthoritativeState: async () => ({ temp: 20 }),
      })
    ).toEqual([]);
  });
});
