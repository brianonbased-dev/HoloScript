/**
 * affective-harm.test.ts — the valence→harm bridge (B3, task_1783916935078_txb7).
 *
 * Fixtures encode the two SSOT floor cases (vibe recipe §5 caught-stub #2), the consent asymmetry,
 * and the cardinal negative: incoherence alone is NEVER harm (spike seed d03). End-to-end tests
 * run the composed IR through resolveBeneficiary — the bridge adds facts, the floor decides.
 */
import { describe, expect, it } from 'vitest';

import {
  UAAL_AFFECTIVE_HARM_CONSTANTS,
  UAAL_AUDIENCE_THRESHOLDS,
  affectCentroid,
  composeAffectiveHarm,
  deriveAffectiveHarm,
  type UAALAffectiveSceneIR,
} from '../affective-harm';
import { resolveBeneficiary } from '../beneficiary';
import type { UAALVibeAtom } from '../vibe';

const light = (id: string, kelvin: number, lux: number): UAALVibeAtom => ({
  id,
  kind: 'light',
  kelvin,
  lux,
});
const palette = (id: string, hue: number): UAALVibeAtom => ({ id, kind: 'palette', hue });
const audio = (id: string, bpm: number, db: number): UAALVibeAtom => ({
  id,
  kind: 'audio',
  bpm,
  db,
});

/** Coherent TENSE scene (spike d04): fear-quadrant physics, faithfully declared. */
const hauntedCorridor = (audience?: UAALAffectiveSceneIR['audience']): UAALAffectiveSceneIR => ({
  declared_vibe: 'tense',
  atoms: [light('l', 6500, 900), palette('p', 215), audio('a', 150, 74)],
  ...(audience !== undefined ? { audience } : {}),
});

/** Declared-SERENE space with blaring speakers (spike h3 + hot dB): the calm-promise case. */
const blaringCourtyard = (audience?: UAALAffectiveSceneIR['audience']): UAALAffectiveSceneIR => ({
  declared_vibe: 'serene',
  atoms: [light('l', 3150, 105), palette('p', 44), audio('a', 170, 88)],
  ...(audience !== undefined ? { audience } : {}),
});

/**
 * PURE-VALENCE discord: a cozy den with cold DIM light + cold palette, quiet audio. Strongly
 * incoherent (coherence ≈ 0.2) with every arousal LOW — the true cardinal negative. (Spike d03
 * is NOT this case: its 950-lux floodlight is an arousal excess — glare is the photic
 * blaring-speaker — and the derivation correctly fires on it; see the positive test below.)
 */
const coldPaletteDen = (audience?: UAALAffectiveSceneIR['audience']): UAALAffectiveSceneIR => ({
  declared_vibe: 'cozy',
  atoms: [light('l', 6500, 120), palette('p', 210), audio('a', 60, 36)],
  ...(audience !== undefined ? { audience } : {}),
});

describe('the cardinal distinction: incoherence is never harm by itself', () => {
  it('pure valence discord (cold dim den) is strongly incoherent yet derives ZERO harm at any audience', () => {
    for (const classes of [['adult'], ['child'], ['adult', 'child']] as const) {
      const derivation = deriveAffectiveHarm(coldPaletteDen({ classes: [...classes] }));
      expect(derivation.findings).toEqual([]);
      expect(derivation.impacts).toEqual([{ beneficiary: 'humans', value: 0, axis: 'affective' }]);
    }
  });

  it('the same discord in the AROUSAL-EXCESS direction under a calm promise IS harm (h3)', () => {
    const derivation = deriveAffectiveHarm(blaringCourtyard({ classes: ['adult'] }));
    expect(derivation.findings.map((f) => f.harm)).toContain('calm_promise_violation');
  });

  it('d03: a 950-lux floodlight in a cozy den IS a photic calm-promise violation', () => {
    const d03 = deriveAffectiveHarm({
      declared_vibe: 'cozy',
      atoms: [light('l', 6500, 950), palette('p', 30), audio('a', 60, 36)],
      audience: { classes: ['adult'] },
    });
    expect(d03.findings.map((f) => f.harm)).toEqual(['calm_promise_violation']);
    expect(d03.findings[0].evidence).toContain("atom 'l'");
  });
});

describe('SSOT floor case (a): high-arousal fear at a child — consent asymmetry', () => {
  it('the SAME coherent tense scene: harm at a child, no impact at adults', () => {
    const atChild = deriveAffectiveHarm(hauntedCorridor({ classes: ['child'] }));
    expect(atChild.findings.map((f) => f.harm)).toEqual(['fear_targeting']);

    const atAdults = deriveAffectiveHarm(hauntedCorridor({ classes: ['adult'] }));
    expect(atAdults.findings).toEqual([]);
    expect(atAdults.impacts).toEqual([{ beneficiary: 'humans', value: 0, axis: 'affective' }]);
  });

  it('composes to a floor breach through resolveBeneficiary', () => {
    const ir = composeAffectiveHarm({}, hauntedCorridor({ classes: ['child'] }));
    const resolution = resolveBeneficiary(ir);
    expect(resolution.status).toBe('resolved');
    expect(resolution.answer?.humanFloorHeld).toBe(false);
  });
});

describe('SSOT floor case (b): sensory overload in a declared-calm space', () => {
  it('fires BOTH overload (88dB > 85 adult ceiling) and calm-promise violation', () => {
    const derivation = deriveAffectiveHarm(blaringCourtyard({ classes: ['adult'] }));
    expect(derivation.findings.map((f) => f.harm).sort()).toEqual([
      'calm_promise_violation',
      'sensory_overload',
    ]);
  });

  it('child ceiling (75dB) is stricter: 80dB fires for a child, not for adults', () => {
    const scene = (classes: Array<'adult' | 'child'>): UAALAffectiveSceneIR => ({
      declared_vibe: 'energetic',
      atoms: [light('l', 3800, 900), palette('p', 15), audio('a', 172, 80)],
      audience: { classes },
    });
    expect(deriveAffectiveHarm(scene(['child'])).findings.map((f) => f.harm)).toEqual([
      'sensory_overload',
    ]);
    expect(deriveAffectiveHarm(scene(['adult'])).findings).toEqual([]);
    // Mixed audience: the most sensitive present class sets the ceiling.
    expect(deriveAffectiveHarm(scene(['adult', 'child'])).findings.map((f) => f.harm)).toEqual([
      'sensory_overload',
    ]);
  });
});

describe('audience three-state → honesty inherited through resolveBeneficiary', () => {
  it('audience UNSTATED: bridge derives nothing; the composed IR abstains at the floor', () => {
    const derivation = deriveAffectiveHarm(hauntedCorridor());
    expect(derivation.audienceStated).toBe(false);
    expect(derivation.impacts).toEqual([]);

    const resolution = resolveBeneficiary(composeAffectiveHarm({}, hauntedCorridor()));
    expect(resolution.status).toBe('unresolvable');
    expect(resolution.gap?.code).toBe('beneficiary.unstated_impact');
  });

  it('audience explicitly EMPTY: humans declared unaffected; the floor resolves held', () => {
    const ir = composeAffectiveHarm({}, blaringCourtyard({ classes: [] }));
    expect(ir.unaffected).toContain('humans');
    const resolution = resolveBeneficiary(ir);
    expect(resolution.status).toBe('resolved');
    expect(resolution.answer?.humanFloorHeld).toBe(true);
  });

  it('audience stated + clean scene: value:0 affective impact makes the floor CERTIFIABLE', () => {
    const resolution = resolveBeneficiary(
      composeAffectiveHarm({}, coldPaletteDen({ classes: ['adult'] }))
    );
    expect(resolution.status).toBe('resolved');
    expect(resolution.answer?.humanFloorHeld).toBe(true);
  });

  it('composition only APPENDS — pre-existing impacts and unaffected survive', () => {
    const base = {
      impacts: [{ beneficiary: 'agents' as const, value: 2 }],
      unaffected: ['self' as const],
    };
    const ir = composeAffectiveHarm(base, hauntedCorridor({ classes: ['child'] }));
    expect(ir.impacts?.[0]).toEqual({ beneficiary: 'agents', value: 2 });
    expect(ir.impacts?.some((i) => i.harmful === true && i.beneficiary === 'humans')).toBe(true);
    expect(ir.unaffected).toContain('self');
  });
});

describe('published constants stay anchored (changing any is a re-derivation)', () => {
  it('dB ceilings carry the WHO–NIOSH anchors; quadrant + promise constants fixed', () => {
    expect(UAAL_AUDIENCE_THRESHOLDS.adult.dbCeiling).toBe(85);
    expect(UAAL_AUDIENCE_THRESHOLDS.child.dbCeiling).toBe(75);
    expect(UAAL_AFFECTIVE_HARM_CONSTANTS.FEAR_VALENCE_MAX).toBe(-0.3);
    expect(UAAL_AFFECTIVE_HARM_CONSTANTS.FEAR_AROUSAL_MIN).toBe(0.7);
    expect(UAAL_AFFECTIVE_HARM_CONSTANTS.CALM_PROMISE_AROUSAL_MAX).toBe(0.3);
    expect(UAAL_AFFECTIVE_HARM_CONSTANTS.VIOLATION_AROUSAL_MIN).toBe(0.7);
  });

  it('affectCentroid scopes to stated axes (palette contributes no arousal vote)', () => {
    const centroid = affectCentroid([palette('p', 30), audio('a', 170, 88)]);
    expect(centroid.valence).toBeCloseTo(1, 5); // palette only
    expect(centroid.arousal).toBeCloseTo(((170 - 40) / 140 + (88 - 30) / 60) / 2, 5); // audio only
  });
});
