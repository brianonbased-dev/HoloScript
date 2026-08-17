import { describe, expect, it } from 'vitest';
import { TRAIT_UI_AFFORDANCES } from '../derived-trait-ui.generated';
import { DERIVED_TRAIT_SCHEMAS } from '../derived-trait-schemas.generated';

/**
 * Guards the generated editor artifact — the half of the chain that runs at build time
 * (`.holo` `ui:` block → gen-trait-schemas → TRAIT_UI_AFFORDANCES). The other half
 * (artifact → inspector controls) is covered in @holoscript/studio.
 *
 * These assert SHAPE and INVARIANTS, not specific numbers, so re-tuning a trait's range
 * is a one-file edit rather than a test break. What they will not tolerate is the
 * artifact silently going empty or incoherent.
 */
describe('TRAIT_UI_AFFORDANCES — generated editor artifact', () => {
  const entries = Object.entries(TRAIT_UI_AFFORDANCES);

  it('is non-empty — an empty artifact means the ui: pipeline silently stopped working', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('lists only props that actually carry an affordance', () => {
    for (const [trait, props] of entries) {
      expect(props.length, `${trait} has an entry but no props`).toBeGreaterThan(0);
      for (const prop of props) {
        const carries =
          prop.label !== undefined ||
          prop.min !== undefined ||
          prop.max !== undefined ||
          prop.step !== undefined ||
          prop.hidden !== undefined;
        expect(carries, `${trait}.${prop.name} carries no affordance`).toBe(true);
      }
    }
  });

  it('never emits an inverted or non-finite range', () => {
    for (const [trait, props] of entries) {
      for (const prop of props) {
        if (prop.min === undefined && prop.max === undefined) continue;
        expect(Number.isFinite(prop.min), `${trait}.${prop.name} min`).toBe(true);
        expect(Number.isFinite(prop.max), `${trait}.${prop.name} max`).toBe(true);
        expect(prop.min!, `${trait}.${prop.name} range inverted`).toBeLessThanOrEqual(prop.max!);
      }
    }
  });

  it('only ranges and steps numeric props', () => {
    for (const [trait, props] of entries) {
      for (const prop of props) {
        if (prop.min !== undefined || prop.max !== undefined || prop.step !== undefined) {
          expect(prop.type, `${trait}.${prop.name} is ${prop.type}, not rangeable`).toBe('number');
        }
      }
    }
  });

  it('emits only positive steps', () => {
    for (const [trait, props] of entries) {
      for (const prop of props) {
        if (prop.step === undefined) continue;
        expect(prop.step, `${trait}.${prop.name} step`).toBeGreaterThan(0);
      }
    }
  });

  it('agrees with the full schema artifact on every prop it mentions', () => {
    // The slim artifact is a projection of the full one — a divergence means the two
    // generator outputs drifted and an editor would render something the validator
    // does not recognise.
    const fullByTrait = new Map(DERIVED_TRAIT_SCHEMAS.map((s) => [s.name, s]));
    for (const [trait, props] of entries) {
      const full = fullByTrait.get(trait);
      expect(full, `${trait} missing from the full schema artifact`).toBeDefined();
      for (const prop of props) {
        const fullProp = full!.properties.find((p) => p.name === prop.name);
        expect(fullProp, `${trait}.${prop.name} missing from full schema`).toBeDefined();
        expect(fullProp).toEqual(prop);
      }
    }
  });
});
