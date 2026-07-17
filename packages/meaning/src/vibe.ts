/**
 * vibe.ts — the VIBE family: affective coherence to a declared register, physics-derived only.
 *
 * The 16th-family candidate authorized by the Track B1 falsifiability spike
 * (research/2026-07-13_vibe-spike-verdict.md, VERDICT: FAMILY). The fatal trap the spike existed to
 * test (W.818): if per-atom valence is AUTHOR-ASSERTED, a recognizer "beating" a mood-word baseline
 * just reads the field the author deposited the answer in — a tautological edge. The only honest
 * design derives every atom's affect from MEASURABLE properties via FIXED, published mappings
 * (kelvin→valence via the Kruithof anchor, hue→valence via colour-affect, lux/bpm/dB→arousal via
 * tempo-arousal), so a swap that flips coherence flips a physical fact. The recognizer never reads
 * a mood word; `lexicalVibe` (the mood-word baseline) exists so the benchmark can PROVE it didn't
 * need to (`emergent_beats_lexical`).
 *
 * Scope is coherence-to-declared-intent, NEVER correctness-of-vibe: the family answers "do the
 * scene's measurable atoms cohere with the register its author declared?" — not whether the vibe
 * is good, appropriate, or tasteful. Abstention triggers are CRISP set-membership checks only
 * (`vibe.unstated_affect`, `vibe.unresolved_dissonance`); no margins, no taste scores.
 *
 * Constants (COHERES_THRESHOLD, DMAX, mean+max blend weights, DISSONANT_ATOM_THRESHOLD) are the
 * spike's frozen values — iteration 1 of the spike used pure mean dispersion, which washed out a
 * single strongly-dissonant atom, contradicting the SSOT's own semantics (a cozy scene with 9 warm
 * atoms + 1 harsh fluorescent FLIPS to dissonant); the blend keeps the mean's tolerance of mild
 * natural variation while letting one screaming atom dominate.
 *
 * @module @holoscript/uaal
 */

import type { UAALEmergentBaselineTest, UAALRateTest, UAALResolution, UAALSemanticBenchmarkRow } from './semantic';
import { cloneJson, makeRateTest, rate, safeParseCompletion, structuredGap } from './semantic';

// =============================================================================
// TYPES — atoms carry measurables, declarations carry the register
// =============================================================================

/** A fixed affect target: valence in [-1,1] (warm/pleasant ↔ cold/harsh), arousal in [0,1]. */
export interface UAALAffectTarget {
  valence: number;
  arousal: number;
}

/**
 * One measurable scene atom. `kind` selects which measurables carry affect: 'light' (kelvin, lux),
 * 'palette' (hue in degrees), 'audio' (bpm, db). `label` is surface text — visible ONLY to
 * `lexicalVibe`, never to the recognizer. An atom whose kind is unknown or whose measurables are
 * all absent has UNSTATED affect (the resolveVibe gap), unlike an axis its kind simply doesn't
 * carry (palette has no arousal — silent axis, not a gap; fact-class scoping as in resolveAccess).
 */
export interface UAALVibeAtom {
  id: string;
  kind?: string;
  kelvin?: number;
  lux?: number;
  hue?: number;
  bpm?: number;
  db?: number;
  label?: string;
  [key: string]: unknown;
}

/**
 * One declared register. `register` names an entry in UAAL_VIBE_REGISTERS; `target` may instead
 * (or additionally) state the affect target inline. `dominant: true` settles a multi-declaration
 * conflict the way an explicit precedence settles a deontic dilemma.
 */
export interface UAALVibeDeclaration {
  register: string;
  target?: UAALAffectTarget;
  dominant?: boolean;
  [key: string]: unknown;
}

export interface UAALVibeIR {
  /** Convenience single declaration (the spike's shape); merged ahead of `declared`. */
  declared_vibe?: string;
  declared?: UAALVibeDeclaration[];
  atoms?: UAALVibeAtom[];
  /** Atom ids explicitly declared affect-neutral — an honest "this atom carries no affect". */
  unaffected?: string[];
  /** Surface prose. Visible only to lexicalVibe. */
  text?: string;
  query?: { [key: string]: unknown };
  [key: string]: unknown;
}

export interface UAALVibeMetadata extends Record<string, unknown> {
  id?: string;
  coherent?: boolean;
  /** For incoherent rows: the atom ids that break the register (vt2 ground truth). */
  dissonant_atoms?: string[];
}

export interface VibeRecovery {
  /** 1 − blended dissonance / DMAX, clamped to [0,1]. */
  coherence: number;
  coheres: boolean;
  /** |coherence − COHERES_THRESHOLD| — reported so a knife-edge is visible, never load-bearing. */
  margin: number;
  /** Atoms whose affect distance to the target exceeds DISSONANT_ATOM_THRESHOLD. */
  dissonantAtoms: string[];
  /** The register the verdict was computed against (dominant ?? first declared). */
  register: string | null;
}

export interface UAALVibeBenchmarkResult {
  n: number;
  tests: {
    vt1_discrimination: UAALRateTest;
    vt2_dissonant_atom_fidelity: UAALRateTest;
    vt3_structural_sanity: UAALRateTest;
    vt4_falsification_flip: UAALRateTest;
    emergent_beats_lexical: UAALEmergentBaselineTest & { lexicalRate: number };
  };
  pass: boolean;
  misses: {
    vt1: string[];
    vt2: string[];
    vt4: string[];
  };
}

// =============================================================================
// PUBLISHED CONSTANTS — the spike's frozen values; changing any is a family re-verdict
// =============================================================================

/** The seed registers (fixed affect targets). Extending this table is additive and safe. */
export const UAAL_VIBE_REGISTERS: Record<string, UAALAffectTarget> = {
  cozy: { valence: 0.6, arousal: 0.25 },
  tense: { valence: -0.5, arousal: 0.75 },
  serene: { valence: 0.55, arousal: 0.15 },
  energetic: { valence: 0.35, arousal: 0.85 },
};

export const UAAL_VIBE_CONSTANTS = {
  /** coherence ≥ this ⇒ coheres. */
  COHERES_THRESHOLD: 0.5,
  /** Blended dissonance beyond this normalizer ⇒ zero coherence. */
  DMAX: 0.8,
  /** Mean keeps tolerance of mild variation; max lets one screaming atom dominate (spike iter-2). */
  MEAN_WEIGHT: 0.5,
  MAX_WEIGHT: 0.5,
  /** Per-atom distance beyond this ⇒ the atom is reported dissonant. */
  DISSONANT_ATOM_THRESHOLD: 0.55,
} as const;

export const UAAL_VIBE_THRESHOLDS = {
  vt1: 0.95,
  vt2: 0.9,
  vt3: 0.95,
  vt4: 0.95,
  emergentEdge: 0.05,
} as const;

// =============================================================================
// FIXED PHYSICS→AFFECT MAPPINGS (published anchors; NEVER read labels)
// =============================================================================

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Kruithof-curve affect anchor: 2700K incandescent → +0.73 warm; 6500K daylight-fluorescent → −0.73. */
export function kelvinToValence(kelvin: number): number {
  return clamp((4600 - kelvin) / 2600, -1, 1);
}

/** Illuminance → arousal: 50lx dim → 0; 1000lx bright → 1. */
export function luxToArousal(lux: number): number {
  return clamp((lux - 50) / 950, 0, 1);
}

/** Colour-affect hue anchor: ~30° orange = warm pole; ~210° cyan-blue = cool pole. */
export function hueToValence(hueDeg: number): number {
  return Math.cos(((hueDeg - 30) * Math.PI) / 180);
}

/** Tempo-arousal (the most replicated music-affect result): largo 40bpm → 0; presto 180bpm → 1. */
export function bpmToArousal(bpm: number): number {
  return clamp((bpm - 40) / 140, 0, 1);
}

/** Loudness → arousal: 30dB hush → 0; 90dB loud → 1. */
export function dbToArousal(db: number): number {
  return clamp((db - 30) / 60, 0, 1);
}

export interface UAALDerivedAffect {
  /** null = the axis is silent for this atom (kind doesn't carry it or measurable absent). */
  valence: number | null;
  arousal: number | null;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v);
}

/**
 * Derive an atom's affect STRICTLY from its measurables. Returns null axes for whatever the atom
 * does not state; an atom with BOTH axes null has unstated affect (resolveVibe's gap; recoverVibe
 * coerces by skipping it). Unknown kinds derive nothing — there is no mapping to read them by.
 */
export function deriveAffect(atom: UAALVibeAtom): UAALDerivedAffect {
  switch (atom.kind) {
    case 'light':
      return {
        valence: isNum(atom.kelvin) ? kelvinToValence(atom.kelvin) : null,
        arousal: isNum(atom.lux) ? luxToArousal(atom.lux) : null,
      };
    case 'palette':
      return { valence: isNum(atom.hue) ? hueToValence(atom.hue) : null, arousal: null };
    case 'audio': {
      const axes: number[] = [];
      if (isNum(atom.bpm)) axes.push(bpmToArousal(atom.bpm));
      if (isNum(atom.db)) axes.push(dbToArousal(atom.db));
      return { valence: null, arousal: axes.length ? axes.reduce((a, b) => a + b, 0) / axes.length : null };
    }
    default:
      return { valence: null, arousal: null };
  }
}

// =============================================================================
// HELPERS — declaration normalization + the crisp opposing-register check
// =============================================================================

/** Merge the convenience `declared_vibe` string ahead of the `declared` list. */
export function vibeDeclarations(ir: UAALVibeIR): UAALVibeDeclaration[] {
  const fromString: UAALVibeDeclaration[] =
    typeof ir.declared_vibe === 'string' && ir.declared_vibe.length > 0 ? [{ register: ir.declared_vibe }] : [];
  const fromList = (ir.declared || []).filter((d): d is UAALVibeDeclaration => Boolean(d && typeof d.register === 'string'));
  return [...fromString, ...fromList];
}

/** The declaration's affect target: inline target wins, else the published register table. */
function targetOf(decl: UAALVibeDeclaration): UAALAffectTarget | null {
  if (decl.target && isNum(decl.target.valence) && isNum(decl.target.arousal)) return decl.target;
  return UAAL_VIBE_REGISTERS[decl.register] ?? null;
}

/**
 * Two registers OPPOSE iff their target valences have opposite sign or their target arousals sit on
 * opposite sides of 0.5 — a crisp set-membership check on the published table (mirroring
 * resolveNormStatus's opposing-force dilemma), NOT a distance margin.
 */
export function registersOppose(a: UAALAffectTarget, b: UAALAffectTarget): boolean {
  const valenceOpposes = Math.sign(a.valence) !== Math.sign(b.valence) && a.valence !== 0 && b.valence !== 0;
  const arousalOpposes = (a.arousal - 0.5) * (b.arousal - 0.5) < 0;
  return valenceOpposes || arousalOpposes;
}

function affectStated(affect: UAALDerivedAffect): boolean {
  return affect.valence !== null || affect.arousal !== null;
}

/** Distance from an atom's derived affect to the target, over the atom's STATED axes only. */
function affectDistance(affect: UAALDerivedAffect, target: UAALAffectTarget): number {
  let sum = 0;
  let axes = 0;
  if (affect.valence !== null) {
    sum += ((affect.valence - target.valence) / 2) ** 2; // valence span 2 → normalize
    axes++;
  }
  if (affect.arousal !== null) {
    sum += (affect.arousal - target.arousal) ** 2;
    axes++;
  }
  return axes ? Math.sqrt(sum / axes) : 0;
}

// =============================================================================
// RECOVER — the coercing view (skips unstated atoms, first declaration wins)
// =============================================================================

/**
 * Recover coherence-to-declared-register from measurables alone. Like every recover*, this is the
 * COERCING view: an atom with unstated affect is skipped (indistinguishable from declared
 * unaffected), a multi-declaration conflict silently resolves to dominant ?? first, and a scene
 * with no resolvable target or no stated atom coerces to coheres:false. Use resolveVibe when the
 * unstated-vs-stated distinction matters.
 */
export function recoverVibe(ir: UAALVibeIR): VibeRecovery {
  const { COHERES_THRESHOLD, DMAX, MEAN_WEIGHT, MAX_WEIGHT, DISSONANT_ATOM_THRESHOLD } = UAAL_VIBE_CONSTANTS;
  const declarations = vibeDeclarations(ir);
  const effective = declarations.find((d) => d.dominant === true) ?? declarations[0];
  const target = effective ? targetOf(effective) : null;
  const registerName = effective ? effective.register : null;
  if (!target) {
    return { coherence: 0, coheres: false, margin: COHERES_THRESHOLD, dissonantAtoms: [], register: registerName };
  }

  const unaffected = new Set(ir.unaffected || []);
  const perAtom = (ir.atoms || [])
    .filter((atom) => atom && typeof atom.id === 'string' && !unaffected.has(atom.id))
    .map((atom) => ({ id: atom.id, affect: deriveAffect(atom) }))
    .filter((entry) => affectStated(entry.affect))
    .map((entry) => ({ id: entry.id, dist: affectDistance(entry.affect, target) }));

  if (perAtom.length === 0) {
    return { coherence: 0, coheres: false, margin: COHERES_THRESHOLD, dissonantAtoms: [], register: registerName };
  }

  const meanDist = perAtom.reduce((acc, a) => acc + a.dist, 0) / perAtom.length;
  const maxDist = Math.max(...perAtom.map((a) => a.dist));
  const dissonance = MEAN_WEIGHT * meanDist + MAX_WEIGHT * maxDist;
  const coherence = 1 - clamp(dissonance / DMAX, 0, 1);
  return {
    coherence,
    coheres: coherence >= COHERES_THRESHOLD,
    margin: Math.abs(coherence - COHERES_THRESHOLD),
    dissonantAtoms: perAtom.filter((a) => a.dist > DISSONANT_ATOM_THRESHOLD).map((a) => a.id),
    register: registerName,
  };
}

// =============================================================================
// LEXICAL BASELINE — reads ONLY surface text/labels (what the recognizer must beat)
// =============================================================================

export const UAAL_VIBE_MOOD_LEXICON: Record<string, string[]> = {
  cozy: ['cozy', 'warm', 'snug', 'comfy', 'homely', 'soft'],
  tense: ['tense', 'harsh', 'ominous', 'edgy', 'menacing', 'cold'],
  serene: ['serene', 'calm', 'peaceful', 'tranquil', 'gentle', 'still'],
  energetic: ['energetic', 'vibrant', 'lively', 'upbeat', 'electric', 'loud'],
};

function moodWordCounts(ir: UAALVibeIR): Record<string, number> {
  const text = [ir.text || '', ...(ir.atoms || []).map((a) => (typeof a.label === 'string' ? a.label : ''))]
    .join(' ')
    .toLowerCase();
  const counts: Record<string, number> = {};
  for (const [register, words] of Object.entries(UAAL_VIBE_MOOD_LEXICON)) {
    counts[register] = words.reduce((acc, w) => acc + (text.match(new RegExp(`\\b${w}\\b`, 'g')) || []).length, 0);
  }
  return counts;
}

/**
 * The mood-word baseline: plurality mood-word register === declared ⇒ coheres. Scenes with no mood
 * words fall back to `fallback`. This reads ONLY text/labels — it exists so `emergent_beats_lexical`
 * can prove the recognizer's verdict is not recoverable from surface vocabulary.
 */
export function lexicalVibe(ir: UAALVibeIR, fallback: boolean): boolean {
  const counts = moodWordCounts(ir);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return fallback;
  const declarations = vibeDeclarations(ir);
  const effective = declarations.find((d) => d.dominant === true) ?? declarations[0];
  const plurality = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  return effective ? plurality === effective.register : fallback;
}

// =============================================================================
// RESOLVE — the honest, three-body view (unstated affect → gap, not a pass)
// =============================================================================

/**
 * Resolve whether the scene coheres with its declared register, honest about what is UNKNOWN.
 * Determinate IRs always resolve; only genuine gaps flip (the no-false-gaps invariant asserted by
 * every family's resolution tests). The two triggers, both crisp set-membership checks:
 *
 *   - `vibe.unstated_affect` (missing_precondition) — the coherence question lacks a stated side:
 *     no declaration at all, a declared register with no resolvable target, an empty/affect-silent
 *     scene, or an atom whose affect is underivable and not declared `unaffected` (the analog of
 *     resolveOcclusion on opaque===undefined). You cannot certify a feel over unknown affect.
 *   - `vibe.unresolved_dissonance` (unprioritized_conflict) — ≥2 explicitly-declared OPPOSING
 *     registers with no declared dominant. Coherence to WHICH intent is genuinely indeterminate,
 *     exactly like an O-vs-F deontic dilemma with no precedence.
 *
 * Compatible (non-opposing) multi-declarations are determinate: the resolver answers against
 * dominant ?? first declared, the same coercion recoverVibe applies.
 */
export function resolveVibe(ir: UAALVibeIR): UAALResolution<VibeRecovery> {
  const declarations = vibeDeclarations(ir);

  if (declarations.length === 0) {
    return {
      query: 'vibe',
      status: 'unresolvable',
      reason: 'missing_precondition',
      gap: structuredGap('vibe', 'vibe.unstated_affect', 'missing_precondition', 'declared_vibe'),
      obstruction: 'no declared register — coherence-to-declared-intent has no declared intent to cohere with',
    };
  }

  const unresolvableDecl = declarations.find((decl) => targetOf(decl) === null);
  if (unresolvableDecl) {
    return {
      query: 'vibe',
      status: 'unresolvable',
      reason: 'missing_precondition',
      gap: structuredGap('vibe', 'vibe.unstated_affect', 'missing_precondition', `register:${unresolvableDecl.register}`),
      obstruction: `declared register '${unresolvableDecl.register}' has no published or inline affect target`,
    };
  }

  const hasDominant = declarations.some((decl) => decl.dominant === true);
  if (!hasDominant && declarations.length >= 2) {
    for (let i = 0; i < declarations.length; i++) {
      for (let j = i + 1; j < declarations.length; j++) {
        const a = targetOf(declarations[i]) as UAALAffectTarget;
        const b = targetOf(declarations[j]) as UAALAffectTarget;
        if (registersOppose(a, b)) {
          return {
            query: 'vibe',
            status: 'unresolvable',
            reason: 'unprioritized_conflict',
            gap: structuredGap(
              'vibe',
              'vibe.unresolved_dissonance',
              'unprioritized_conflict',
              `${declarations[i].register}|${declarations[j].register}`,
            ),
            obstruction: `opposing registers '${declarations[i].register}' and '${declarations[j].register}' declared with no dominant`,
          };
        }
      }
    }
  }

  const unaffected = new Set(ir.unaffected || []);
  const atoms = (ir.atoms || []).filter((atom) => atom && typeof atom.id === 'string');
  const consideredAtoms = atoms.filter((atom) => !unaffected.has(atom.id));

  const unstatedAtom = consideredAtoms.find((atom) => !affectStated(deriveAffect(atom)));
  if (unstatedAtom) {
    return {
      query: 'vibe',
      status: 'unresolvable',
      reason: 'missing_precondition',
      gap: structuredGap('vibe', 'vibe.unstated_affect', 'missing_precondition', unstatedAtom.id),
      obstruction: `atom '${unstatedAtom.id}' carries no derivable affect and is not declared unaffected`,
    };
  }

  if (consideredAtoms.length === 0) {
    return {
      query: 'vibe',
      status: 'unresolvable',
      reason: 'missing_precondition',
      gap: structuredGap('vibe', 'vibe.unstated_affect', 'missing_precondition', 'atoms'),
      obstruction: 'no affect-bearing atoms — certifying a feel over an affect-silent scene is confabulation',
    };
  }

  return { query: 'vibe', status: 'resolved', answer: recoverVibe(ir) };
}

// =============================================================================
// BENCHMARK — vt1-vt4 + emergent_beats_lexical (standard thresholds)
// =============================================================================

/** Push every affect-bearing atom to the register's own pole (the vt4 repair direction). */
function repairAtoms(ir: UAALVibeIR, target: UAALAffectTarget): void {
  for (const atom of ir.atoms || []) {
    if (atom.kind === 'light') {
      atom.kelvin = target.valence >= 0 ? 2800 : 6400;
      atom.lux = 50 + target.arousal * 950;
    } else if (atom.kind === 'palette') {
      atom.hue = target.valence >= 0 ? 30 : 210;
    } else if (atom.kind === 'audio') {
      atom.bpm = 40 + target.arousal * 140;
      atom.db = 30 + target.arousal * 60;
    }
  }
}

/** Push one affect-bearing atom to the OPPOSITE pole (the vt4 corruption direction). */
function corruptOneAtom(ir: UAALVibeIR, target: UAALAffectTarget): boolean {
  for (const atom of ir.atoms || []) {
    if (atom.kind === 'light') {
      atom.kelvin = target.valence >= 0 ? 6500 : 2700;
      atom.lux = target.arousal >= 0.5 ? 60 : 980;
      return true;
    }
    if (atom.kind === 'palette') {
      atom.hue = target.valence >= 0 ? 210 : 30;
      return true;
    }
    if (atom.kind === 'audio') {
      atom.bpm = target.arousal >= 0.5 ? 45 : 175;
      atom.db = target.arousal >= 0.5 ? 32 : 86;
      return true;
    }
  }
  return false;
}

/** Rewrite all surface text to an OPPOSING register's mood words (measurables untouched). */
function adversarialLabels(ir: UAALVibeIR): void {
  const declarations = vibeDeclarations(ir);
  const effective = declarations.find((d) => d.dominant === true) ?? declarations[0];
  const declared = effective?.register;
  const opposing = declared === 'tense' ? 'cozy' : 'tense';
  const words = UAAL_VIBE_MOOD_LEXICON[opposing].join(' ');
  ir.text = words;
  for (const atom of ir.atoms || []) {
    if (typeof atom.label === 'string') atom.label = words;
  }
}

/**
 * The family benchmark, mirroring benchmarkTelos:
 *   vt1_discrimination — recovered coheres === ground-truth coherent.
 *   vt2_dissonant_atom_fidelity — on incoherent rows, the recovered dissonant-atom set matches.
 *   vt3_structural_sanity — the verdict is invariant under adversarial mood-word rewrites (the
 *     recognizer provably reads physics, never labels — the spike's label-swap criterion).
 *   vt4_falsification_flip — corrupting one atom's measurables to the opposite pole (coherent
 *     rows) or repairing all atoms to the register pole (incoherent rows) flips the verdict.
 *   emergent_beats_lexical — vt1 beats the STRONGEST lexicalVibe fallback variant by ≥ 0.05
 *     (fallback-true, fallback-false, fallback-majority — the spike's strongest-variant discipline).
 */
export function benchmarkVibe(
  rows: Array<UAALSemanticBenchmarkRow<UAALVibeIR, UAALVibeMetadata>>,
): UAALVibeBenchmarkResult {
  let n = 0;
  let vt1 = 0;
  let vt2 = 0;
  let vt2denom = 0;
  let vt3 = 0;
  let vt4 = 0;
  const parsed: Array<{ ir: UAALVibeIR; truth: boolean }> = [];
  const misses = { vt1: [] as string[], vt2: [] as string[], vt4: [] as string[] };

  for (const row of rows) {
    const ir = safeParseCompletion<UAALVibeIR>(row.completion);
    if (!ir) continue;
    n++;

    const groundTruth = row.metadata || {};
    const expected = Boolean(groundTruth.coherent);
    parsed.push({ ir, truth: expected });
    const recovered = recoverVibe(ir);

    if (recovered.coheres === expected) {
      vt1++;
    } else if (misses.vt1.length < 8) {
      misses.vt1.push(`${groundTruth.id}: recovered coheres=${recovered.coheres} truth=${expected}`);
    }

    if (!expected) {
      vt2denom++;
      const want = [...(groundTruth.dissonant_atoms || [])].sort().join(',');
      const got = [...recovered.dissonantAtoms].sort().join(',');
      if (want === got) {
        vt2++;
      } else if (misses.vt2.length < 8) {
        misses.vt2.push(`${groundTruth.id}: got [${got}] want [${want}]`);
      }
    }

    const relabeled = cloneJson(ir);
    adversarialLabels(relabeled);
    if (recoverVibe(relabeled).coheres === recovered.coheres) vt3++;

    const mutated = cloneJson(ir);
    const declarations = vibeDeclarations(mutated);
    const effective = declarations.find((d) => d.dominant === true) ?? declarations[0];
    const target = effective ? targetOf(effective) : null;
    if (target) {
      const touched = expected ? corruptOneAtom(mutated, target) : (repairAtoms(mutated, target), true);
      const mutatedRecovered = recoverVibe(mutated);
      if (touched && mutatedRecovered.coheres !== recovered.coheres) {
        vt4++;
      } else if (misses.vt4.length < 8) {
        misses.vt4.push(`${groundTruth.id}: coheres stayed ${recovered.coheres} after ${expected ? 'corruption' : 'repair'}`);
      }
    } else if (misses.vt4.length < 8) {
      misses.vt4.push(`${groundTruth.id}: no resolvable register to mutate against`);
    }
  }

  const vt1Rate = rate(vt1, n);
  const majority = parsed.filter((p) => p.truth).length / (parsed.length || 1) >= 0.5;
  const lexicalVariants: Array<(ir: UAALVibeIR) => boolean> = [
    (ir) => lexicalVibe(ir, true),
    (ir) => lexicalVibe(ir, false),
    (ir) => lexicalVibe(ir, majority),
  ];
  const lexicalRate = Math.max(
    ...lexicalVariants.map((fn) => rate(parsed.filter((p) => fn(p.ir) === p.truth).length, parsed.length)),
  );
  const emergentEdge = vt1Rate - lexicalRate;

  const tests = {
    vt1_discrimination: makeRateTest(vt1, n, UAAL_VIBE_THRESHOLDS.vt1),
    vt2_dissonant_atom_fidelity: makeRateTest(vt2, vt2denom, UAAL_VIBE_THRESHOLDS.vt2),
    vt3_structural_sanity: makeRateTest(vt3, n, UAAL_VIBE_THRESHOLDS.vt3),
    vt4_falsification_flip: makeRateTest(vt4, n, UAAL_VIBE_THRESHOLDS.vt4),
    emergent_beats_lexical: {
      emergentRate: vt1Rate,
      lexicalRate,
      edge: emergentEdge,
      floor: UAAL_VIBE_THRESHOLDS.emergentEdge,
      pass: emergentEdge >= UAAL_VIBE_THRESHOLDS.emergentEdge,
    },
  };

  return {
    n,
    tests,
    pass: Object.values(tests).every((test) => test.pass),
    misses,
  };
}
