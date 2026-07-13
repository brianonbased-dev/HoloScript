/**
 * affective-harm.ts — the valence→harm bridge (Track B3, task_1783916935078_txb7).
 *
 * DERIVES beneficiary impacts from a scene's physics-derived affect, so the affective-harm floor
 * (research/2026-07-12_vibe-into-uaal-and-training-recipe.md §5 caught-stub #2) composes into
 * resolveBeneficiary instead of being asserted. The cardinal distinction this module encodes:
 * **incoherence is never harm by itself.** A cozy den with cold DIM light and a cold palette fails
 * its declared register badly (coherence ≈ 0.2) yet hurts no one. Discord and harm are different
 * facts; only three crisp, derivable patterns cross the line:
 *
 *   1. `sensory_overload`  — an atom's ABSOLUTE physics exceeds a published audience ceiling
 *      (dB anchors: 85 dB adult / 75 dB child, WHO–NIOSH sustained-exposure). Physics → harm
 *      directly; no declaration needed.
 *   2. `fear_targeting`    — the scene's derived affect centroid sits in the fear quadrant
 *      (valence ≤ −0.3, arousal ≥ 0.7) AND a non-consent-capable class (child) is in the audience.
 *      The consent asymmetry is the crisp axis: adults in a declared-tense space chose the haunted
 *      house; a child cannot — the SAME coherent scene is entertainment at one audience and harm
 *      at the other.
 *   3. `calm_promise_violation` — the declared register promises calm (target arousal ≤ 0.3:
 *      serene, cozy — derived from the register table, not enumerated) AND the scene's measured
 *      arousal centroid is high (≥ 0.7). Occupants selected the space FOR its declared property
 *      (a sensory-safe room); a blaring reality breaks that protection contract. Note the
 *      direction: only AROUSAL EXCESS converts discord to harm — wrong colour temperature in a
 *      cozy room is incoherence, not injury.
 *
 * Audience is three-state, mirroring opaque true/false/absent: `audience.classes` non-empty
 * (stated, derivable) · `[]` (explicitly nobody — humans unaffected) · `audience` absent
 * (UNSTATED). On unstated audience the bridge derives NOTHING — the composed beneficiary IR then
 * has no stated human impact and resolveBeneficiary abstains with `beneficiary.unstated_impact`.
 * The bridge inherits the three-body honesty discipline for free by composing, never bypassing.
 *
 * @module @holoscript/uaal
 */

import type { UAALBeneficiaryIR, UAALBeneficiaryImpact } from './beneficiary';
import type { UAALVibeAtom, UAALVibeIR } from './vibe';
import { UAAL_VIBE_REGISTERS, deriveAffect, recoverVibe, vibeDeclarations } from './vibe';

// =============================================================================
// TYPES
// =============================================================================

/** Audience classes with published sensitivity profiles. Extend the table to add classes. */
export type UAALAudienceClass = 'adult' | 'child';

export interface UAALAudience {
  /** Present classes. `[]` = explicitly nobody (≠ absent, which is UNSTATED). */
  classes: UAALAudienceClass[];
  [key: string]: unknown;
}

/** A vibe scene IR carrying an (optional) audience declaration. */
export interface UAALAffectiveSceneIR extends UAALVibeIR {
  audience?: UAALAudience;
}

export type UAALAffectiveHarmClass = 'sensory_overload' | 'fear_targeting' | 'calm_promise_violation';

export interface UAALAffectiveHarmFinding {
  harm: UAALAffectiveHarmClass;
  /** The atom (overload) or axis evidence (quadrant/violation) the finding derives from. */
  evidence: string;
  /** The audience class whose threshold fired. */
  audienceClass: UAALAudienceClass;
}

export interface AffectiveHarmDerivation {
  /** False iff `audience` is absent from the IR — the bridge derives nothing (honest abstention upstream). */
  audienceStated: boolean;
  /** True iff audience is explicitly empty — humans are declared unaffected on this axis. */
  audienceEmpty: boolean;
  findings: UAALAffectiveHarmFinding[];
  /** Beneficiary impacts to append: harmful per finding, or one neutral value:0 when clean. */
  impacts: UAALBeneficiaryImpact[];
}

// =============================================================================
// PUBLISHED CONSTANTS — anchored, fixed; never tuned per-scene
// =============================================================================

export const UAAL_AUDIENCE_THRESHOLDS: Record<UAALAudienceClass, { dbCeiling: number }> = {
  /** WHO–NIOSH sustained-exposure anchor. */
  adult: { dbCeiling: 85 },
  /** WHO safe-listening guidance for children. */
  child: { dbCeiling: 75 },
};

export const UAAL_AFFECTIVE_HARM_CONSTANTS = {
  /** Fear quadrant: valence at or below this... */
  FEAR_VALENCE_MAX: -0.3,
  /** ...AND arousal at or above this. Anchored to the tense register's (−0.5, 0.75) neighborhood. */
  FEAR_AROUSAL_MIN: 0.7,
  /** A declared register with target arousal ≤ this is a calm PROMISE (serene 0.15, cozy 0.25 qualify). */
  CALM_PROMISE_AROUSAL_MAX: 0.3,
  /** Measured arousal centroid ≥ this in a calm-promised space = the overload direction of discord. */
  VIOLATION_AROUSAL_MIN: 0.7,
} as const;

// =============================================================================
// DERIVATION
// =============================================================================

function isNum(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v);
}

/** Scene affect centroid over stated axes only (fact-class scoping: silent axes don't vote). */
export function affectCentroid(atoms: UAALVibeAtom[]): { valence: number | null; arousal: number | null } {
  const valences: number[] = [];
  const arousals: number[] = [];
  for (const atom of atoms) {
    const affect = deriveAffect(atom);
    if (affect.valence !== null) valences.push(affect.valence);
    if (affect.arousal !== null) arousals.push(affect.arousal);
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return { valence: mean(valences), arousal: mean(arousals) };
}

/**
 * Derive affective-harm impacts from a scene + its audience. Pure and total: never throws, never
 * reads labels/text (physics only, the spike discipline). See module header for the three classes
 * and the audience three-state contract.
 */
export function deriveAffectiveHarm(scene: UAALAffectiveSceneIR): AffectiveHarmDerivation {
  const { FEAR_VALENCE_MAX, FEAR_AROUSAL_MIN, CALM_PROMISE_AROUSAL_MAX, VIOLATION_AROUSAL_MIN } =
    UAAL_AFFECTIVE_HARM_CONSTANTS;

  if (!scene.audience || !Array.isArray(scene.audience.classes)) {
    return { audienceStated: false, audienceEmpty: false, findings: [], impacts: [] };
  }
  const classes = scene.audience.classes.filter(
    (c): c is UAALAudienceClass => c === 'adult' || c === 'child',
  );
  if (classes.length === 0) {
    return { audienceStated: true, audienceEmpty: true, findings: [], impacts: [] };
  }

  const atoms = (scene.atoms || []).filter((a) => a && typeof a.id === 'string');
  const findings: UAALAffectiveHarmFinding[] = [];

  // 1. sensory_overload — absolute dB against the most sensitive present class.
  const mostSensitive = classes.reduce((a, b) =>
    UAAL_AUDIENCE_THRESHOLDS[a].dbCeiling <= UAAL_AUDIENCE_THRESHOLDS[b].dbCeiling ? a : b,
  );
  for (const atom of atoms) {
    if (atom.kind === 'audio' && isNum(atom.db) && atom.db > UAAL_AUDIENCE_THRESHOLDS[mostSensitive].dbCeiling) {
      findings.push({ harm: 'sensory_overload', evidence: atom.id, audienceClass: mostSensitive });
    }
  }

  // 2. fear_targeting — fear-quadrant centroid at a non-consent-capable audience.
  const centroid = affectCentroid(atoms);
  if (
    classes.includes('child') &&
    centroid.valence !== null &&
    centroid.arousal !== null &&
    centroid.valence <= FEAR_VALENCE_MAX &&
    centroid.arousal >= FEAR_AROUSAL_MIN
  ) {
    findings.push({
      harm: 'fear_targeting',
      evidence: `centroid v=${centroid.valence.toFixed(2)} a=${centroid.arousal.toFixed(2)}`,
      audienceClass: 'child',
    });
  }

  // 3. calm_promise_violation — arousal excess against a calm-promising declaration. The promise
  //    is derived from the register table (target arousal), never from an enumerated name list.
  //    MAX atom arousal, not the centroid: one blaring speaker breaks a sensory-safe room no
  //    matter how dim the lights are — the same single-screaming-atom semantics the vibe spike's
  //    iteration-1 mean-only aggregator violated (W.827). Fear (above) stays a centroid because a
  //    scene targets fear as a gestalt; overload is a single-source injury.
  const declarations = vibeDeclarations(scene);
  const effective = declarations.find((d) => d.dominant === true) ?? declarations[0];
  const target = effective
    ? (effective.target ?? UAAL_VIBE_REGISTERS[effective.register] ?? null)
    : null;
  if (target && target.arousal <= CALM_PROMISE_AROUSAL_MAX && !recoverVibe(scene).coheres) {
    let loudest: { id: string; arousal: number } | null = null;
    for (const atom of atoms) {
      const arousal = deriveAffect(atom).arousal;
      if (arousal !== null && (loudest === null || arousal > loudest.arousal)) {
        loudest = { id: atom.id, arousal };
      }
    }
    if (loudest && loudest.arousal >= VIOLATION_AROUSAL_MIN) {
      findings.push({
        harm: 'calm_promise_violation',
        evidence: `declared ${effective!.register} (target a=${target.arousal}) vs atom '${loudest.id}' a=${loudest.arousal.toFixed(2)}`,
        audienceClass: mostSensitive,
      });
    }
  }

  const impacts: UAALBeneficiaryImpact[] =
    findings.length > 0
      ? findings.map((f) => ({
          beneficiary: 'humans' as const,
          harmful: true,
          axis: 'affective',
          harm: f.harm,
          evidence: f.evidence,
          audienceClass: f.audienceClass,
        }))
      : [
          // Audience stated, no harm class fired: an honest, explicit "no affective effect" so the
          // floor is CERTIFIABLE on this axis (value 0 — neither benefit nor harm).
          { beneficiary: 'humans' as const, value: 0, axis: 'affective' },
        ];

  return { audienceStated: true, audienceEmpty: false, findings, impacts };
}

// =============================================================================
// COMPOSITION SEAM — into resolveBeneficiary, never around it
// =============================================================================

/**
 * Compose a scene's derived affective-harm impacts into a beneficiary IR. The returned IR is what
 * resolveBeneficiary consumes — the bridge only ADDS derived facts, it never decides the floor:
 *
 *   - audience UNSTATED  → nothing appended; if no other human impact is stated,
 *     resolveBeneficiary abstains (`beneficiary.unstated_impact`) — inherited honesty.
 *   - audience `[]`      → humans appended to `unaffected` (explicit no-effect on this axis).
 *   - harm derived       → `harmful:true` impacts appended → the existing hard human floor fires.
 *   - clean              → one `value:0` affective impact appended → the floor is certifiable.
 */
export function composeAffectiveHarm(
  base: UAALBeneficiaryIR,
  scene: UAALAffectiveSceneIR,
): UAALBeneficiaryIR {
  const derivation = deriveAffectiveHarm(scene);
  if (!derivation.audienceStated) return { ...base };
  if (derivation.audienceEmpty) {
    const unaffected = new Set([...(base.unaffected || []), 'humans' as const]);
    return { ...base, unaffected: [...unaffected] };
  }
  return { ...base, impacts: [...(base.impacts || []), ...derivation.impacts] };
}
