import { describe, expect, it } from 'vitest';
import {
  anchorLiveProofClaim,
  checkLiveProofTwinVerdict,
  deriveLiveProofInputs,
  gradeLiveProofIndependence,
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
