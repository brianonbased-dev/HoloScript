import { describe, expect, it } from 'vitest';
import { Native2DCompiler } from '../Native2DCompiler';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloStateProperty,
} from '../../parser/HoloCompositionTypes';

/**
 * The `verified` rung, compiler side: when may a @live_proof badge claim its verdict was checked
 * by something other than itself?
 *
 * Only when both halves hold — the claim demonstrably goes red when broken (`falsifiedBy`) AND
 * every value it reads is displayed by an entity-bound projection the twin checker actually
 * compares. The negative cases below are the substance of the feature. Each describes a way a
 * claim could look independently confirmed while resting entirely on the surface's own
 * arithmetic; if any of them starts emitting `verified`, the label is a lie with a receipt
 * attached, which is worse than the `self-referential` honesty it replaced.
 */

function trait(name: string, config: unknown): HoloObjectTrait {
  return { type: 'ObjectTrait', name, config } as HoloObjectTrait;
}

function stateProp(key: string, value: unknown): HoloStateProperty {
  return { type: 'StateProperty', key, value } as HoloStateProperty;
}

function element(name: string, traits: HoloObjectTrait[]): HoloObjectDecl {
  return { type: 'Object', name, properties: [], traits, children: [] } as HoloObjectDecl;
}

const CLAIM = 'temp < 100';
const FAULT = [{ temp: 900, because: 'a reactor at 900 degrees must never read as within limits' }];

/** The readout that grounds `temp` in a twin, i.e. what makes the claim anchorable. */
function readout(overrides: { projects?: unknown; bind?: unknown } = {}): HoloObjectDecl {
  return element('TempReadout', [
    trait('bind', overrides.bind ?? { state: 'temp' }),
    trait('projects', overrides.projects ?? { node: 'temp', entity: 'reactor-1' }),
  ]);
}

function verdict(config: Record<string, unknown>): HoloObjectDecl {
  return element('Verdict', [trait('live_proof', config)]);
}

function compile(
  objects: HoloObjectDecl[],
  state: HoloStateProperty[] = [stateProp('temp', 20)],
  extraTraits: HoloObjectTrait[] = []
): string {
  const composition = {
    type: 'Composition',
    name: 'twinFixture',
    state: { type: 'State', properties: state },
    traits: extraTraits,
    templates: [],
    objects,
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
  } as unknown as HoloComposition;
  return new Native2DCompiler().generateReactComponent('Fixture', objects, composition, {
    format: 'react',
  });
}

const proven = { claim: CLAIM, label: 'Reactor within limits', falsifiedBy: FAULT };

describe('@live_proof verified — the claim is anchored to a twin', () => {
  it('reaches verified when its input is displayed against a twin entity', () => {
    const code = compile([readout(), verdict(proven)]);
    expect(code).toContain('data-proof-independence="verified"');
  });

  it('carries the anchors a runtime checker needs to finish the proof', () => {
    // Without the entity map the label would be the compiler vouching for itself — the same
    // circularity `verified` is supposed to break, one level up.
    const code = compile([readout(), verdict(proven)]);
    expect(code).toContain('data-proof-anchors=');
    expect(code).toContain('reactor-1');
    expect(code).toMatch(/checked against the real thing/);
  });

  it('does not depend on where the badge sits relative to what grounds it', () => {
    // Projections are collected mid-traversal, so anchoring against them as they arrive would
    // make the label depend on element order. A rung you can lose by moving a line is not a rung.
    const before = compile([verdict(proven), readout()]);
    const after = compile([readout(), verdict(proven)]);
    expect(before).toContain('data-proof-independence="verified"');
    expect(after).toContain('data-proof-independence="verified"');
  });

  it('publishes the binding in the view contract so a consumer re-derives it from the artifact', () => {
    const code = compile(
      [readout(), verdict(proven)],
      [stateProp('temp', 20)],
      [trait('verified_view', {})]
    );
    expect(code).toContain('export const holoViewContract');
    expect(code).toContain('"liveProofs"');
    expect(code).toContain('"independence":"verified"');
  });
});

describe('@live_proof verified — what it refuses', () => {
  it('stays fault-tested when the claim reads a value nothing displays', () => {
    const code = compile([verdict(proven)]);
    expect(code).toContain('data-proof-independence="fault-tested"');
    expect(code).not.toContain('data-proof-independence="verified"');
  });

  it('stays fault-tested when the displayed value is bound to no twin', () => {
    // A projection without `entity` is checked against nothing. Anchoring to it would mean the
    // surface confirming the surface.
    const code = compile([readout({ projects: { node: 'temp' } }), verdict(proven)]);
    expect(code).toContain('data-proof-independence="fault-tested"');
  });

  it('stays fault-tested when the anchoring projection is one the oracle abstains on', () => {
    // A @chart carries no scalar transform, so the twin checker never compares it. A claim cannot
    // borrow confirmation from a check that is structurally incapable of running.
    const chart = element('History', [
      trait('chart', { state: 'temp' }),
      trait('projects', { node: 'temp', entity: 'reactor-1' }),
    ]);
    const code = compile([chart, verdict(proven)]);
    expect(code).toContain('data-proof-independence="fault-tested"');
  });

  it('stays fault-tested when only SOME of the claim’s inputs are anchored', () => {
    // `psi` is real state, displayed nowhere. Grading on the anchored `temp` alone would award the
    // top label to a claim half of whose reasoning nobody outside the surface ever checked.
    const code = compile(
      [
        readout(),
        verdict({
          claim: 'temp < 100 && psi < 10',
          label: 'Reactor within limits',
          falsifiedBy: [{ temp: 900, because: 'an overheating reactor must never read as safe' }],
        }),
      ],
      [stateProp('temp', 20), stateProp('psi', 5)]
    );
    expect(code).toContain('data-proof-independence="fault-tested"');
    expect(code).not.toContain('data-proof-independence="verified"');
  });

  it('refuses outright a claim reading anything that is not composition state', () => {
    // A @computed value is in scope in the emitted JSX but is not a state field, so the build-time
    // evaluator cannot bind it — and a claim it cannot evaluate is one it cannot fault-test. The
    // composition is rejected rather than quietly graded down, which closes the half-anchored case
    // a rung earlier than the anchoring check does.
    const computed = element('Headroom', [
      trait('computed', { name: 'headroom', expr: '100 - temp' }),
    ]);
    expect(() =>
      compile([
        computed,
        readout(),
        verdict({
          claim: 'temp < 100 && headroom > 0',
          label: 'Reactor within limits',
          falsifiedBy: [{ temp: 900, because: 'an overheating reactor must never read as safe' }],
        }),
      ])
    ).toThrow(/Every name in a claim must be a composition state field/);
  });

  it('stays fault-tested when the anchor is a sibling field, not the one read', () => {
    const code = compile(
      [
        readout({ bind: { state: 'psi' }, projects: { node: 'psi', entity: 'reactor-1' } }),
        verdict(proven),
      ],
      [stateProp('temp', 20), stateProp('psi', 5)]
    );
    expect(code).toContain('data-proof-independence="fault-tested"');
  });

  it('stays self-referential without fault injection, however well anchored', () => {
    // Anchoring proves the inputs are real; it cannot prove the claim depends on them. A claim
    // that never went red on demand has shown no teeth, so it does not get the top rung.
    const code = compile([readout(), verdict({ claim: CLAIM, label: 'Reactor within limits' })]);
    expect(code).toContain('data-proof-independence="self-referential"');
    expect(code).not.toContain('data-proof-anchors=');
  });
});
