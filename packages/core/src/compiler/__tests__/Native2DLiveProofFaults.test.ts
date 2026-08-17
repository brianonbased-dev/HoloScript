import { describe, expect, it } from 'vitest';
import { Native2DCompiler } from '../Native2DCompiler';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloStateProperty,
} from '../../parser/HoloCompositionTypes';

/**
 * `@live_proof { falsifiedBy: [...] }` — the build-time teeth check.
 *
 * A check nobody has ever seen fail is indistinguishable from a check that CANNOT
 * fail. These tests exist to keep that distinction enforceable: the compiler must
 * refuse to emit a `fault-tested` verdict unless every declared fault actually
 * drives the claim false.
 *
 * The negative cases are the point. If they ever stop throwing, the gate has lost
 * its teeth and `fault-tested` becomes a decoration — exactly the failure mode the
 * feature was built to make impossible.
 */

function trait(name: string, config: HoloObjectTrait['config']): HoloObjectTrait {
  return { type: 'ObjectTrait', name, config };
}

function stateProp(key: string, value: unknown): HoloStateProperty {
  return { type: 'StateProperty', key, value } as HoloStateProperty;
}

/** Composition with `capacity: 200, load: 100, factor: 1.5` and one @live_proof verdict. */
function compositionWith(liveProofConfig: Record<string, unknown>): {
  composition: HoloComposition;
  objects: HoloObjectDecl[];
} {
  const verdict: HoloObjectDecl = {
    type: 'Object',
    name: 'Verdict',
    properties: [],
    traits: [trait('live_proof', liveProofConfig as HoloObjectTrait['config'])],
    children: [],
  };
  const composition = {
    type: 'Composition',
    name: 'proofFixture',
    state: {
      type: 'State',
      properties: [stateProp('load', 100), stateProp('capacity', 200), stateProp('factor', 1.5)],
    },
    templates: [],
    objects: [verdict],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
  } as unknown as HoloComposition;
  return { composition, objects: [verdict] };
}

function compile(liveProofConfig: Record<string, unknown>): string {
  const { composition, objects } = compositionWith(liveProofConfig);
  return new Native2DCompiler().generateReactComponent('Fixture', objects, composition, {
    format: 'react',
  });
}

const CLAIM = 'capacity >= load * factor';

describe('@live_proof falsifiedBy — a check must be shown to fail', () => {
  it('refuses a fault that does NOT falsify the claim', () => {
    // load 10 against capacity 200 leaves the beam comfortably safe, so this
    // "fault" proves nothing. Shipping it would be theatre.
    expect(() =>
      compile({
        claim: CLAIM,
        label: 'Structural margin',
        falsifiedBy: [{ load: 10, because: 'a lightly loaded beam is still safe' }],
      })
    ).toThrow(/DID NOT go red under declared fault 1/);
  });

  it('names decoration for what it is in the error message', () => {
    expect(() =>
      compile({
        claim: CLAIM,
        falsifiedBy: [{ load: 10, because: 'still safe' }],
      })
    ).toThrow(/A check that cannot fail is decoration, not a proof/);
  });

  it('accepts faults that genuinely drive the claim false', () => {
    const code = compile({
      claim: CLAIM,
      label: 'Structural margin',
      falsifiedBy: [
        { load: 200, because: 'an overloaded beam must never read as safe' },
        { capacity: 40, because: 'a beam weaker than its load must never read as safe' },
      ],
    });
    expect(code).toContain('data-proof-independence="fault-tested"');
    expect(code).toContain('setLoad(200)');
    expect(code).toContain('setCapacity(40)');
  });

  it('restores every disturbed field from the composition initial state', () => {
    const code = compile({
      claim: CLAIM,
      falsifiedBy: [
        { load: 200, because: 'overloaded' },
        { capacity: 40, because: 'too weak' },
      ],
    });
    // "Put it back" is derived, never hand-authored: load -> 100, capacity -> 200.
    expect(code).toContain('setCapacity(200); setLoad(100)');
    expect(code).toContain('Put it back');
  });

  it('rejects a fault naming a state field that does not exist', () => {
    expect(() =>
      compile({
        claim: CLAIM,
        falsifiedBy: [{ lode: 200, because: 'typo in the field name' }],
      })
    ).toThrow(/sets unknown state field "lode"/);
  });

  it('requires a plain-language because for every fault', () => {
    expect(() =>
      compile({ claim: CLAIM, falsifiedBy: [{ load: 200 }] })
    ).toThrow(/needs a plain-language "because"/);
  });

  it('rejects a fault that changes nothing', () => {
    expect(() =>
      compile({ claim: CLAIM, falsifiedBy: [{ because: 'changes nothing at all' }] })
    ).toThrow(/changes no state field/);
  });

  it('refuses a proof that is already falsified before any fault is applied', () => {
    // capacity >= load * 10 is false at the initial state, so nothing could be
    // watched breaking — it starts broken.
    expect(() =>
      compile({
        claim: 'capacity >= load * 10',
        label: 'Impossible margin',
        falsifiedBy: [{ load: 200, because: 'overloaded' }],
      })
    ).toThrow(/already FALSIFIED by the composition's own initial state/);
  });

  it('rejects a claim naming something that is not a state field', () => {
    expect(() =>
      compile({
        claim: 'capacity >= wobble',
        falsifiedBy: [{ load: 200, because: 'overloaded' }],
      })
    ).toThrow(/threw when evaluated/);
  });

  it('rejects falsifiedBy that is not an array', () => {
    expect(() =>
      compile({ claim: CLAIM, falsifiedBy: { load: 200, because: 'overloaded' } })
    ).toThrow(/expected an array of faults/);
  });

  it('emits a machine-readable receipt of what was broken', () => {
    const code = compile({
      claim: CLAIM,
      falsifiedBy: [{ load: 200, because: 'an overloaded beam must never read as safe' }],
    });
    expect(code).toContain('data-proof-faults=');
    expect(code).toContain('an overloaded beam must never read as safe');
  });
});

describe('@live_proof without falsifiedBy — unchanged, and honest about it', () => {
  it('still emits the self-referential label and no fault UI', () => {
    const code = compile({ claim: CLAIM, label: 'Structural margin' });
    expect(code).toContain('data-proof-independence="self-referential"');
    expect(code).not.toContain('fault-tested');
    expect(code).not.toContain('Put it back');
  });

  it('is byte-identical to an empty falsifiedBy array', () => {
    const withoutKey = compile({ claim: CLAIM, label: 'Structural margin' });
    const withEmpty = compile({ claim: CLAIM, label: 'Structural margin', falsifiedBy: [] });
    expect(withEmpty).toBe(withoutKey);
  });
});
