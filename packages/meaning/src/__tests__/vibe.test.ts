/**
 * vibe.test.ts — the vibe family (Track B1 → B-REG, task_1783916935077_6ps9).
 *
 * Seed fixtures are the falsifiability spike's 23 scenes VERBATIM
 * (ai-ecosystem scripts/research/vibe-falsifiability-spike.mjs → research/vibe-spike/spike-verdict.json,
 * VERDICT: FAMILY). Ground truth (`coherent`, `dissonant_atoms`) is fixed BY CONSTRUCTION from the
 * measurables — never from the recognizer's own output (that would encode the recognizer as spec).
 */
import { describe, expect, it } from 'vitest';

import {
  UAAL_VIBE_CONSTANTS,
  UAAL_VIBE_REGISTERS,
  benchmarkVibe,
  lexicalVibe,
  recoverVibe,
  registersOppose,
  resolveVibe,
  type UAALVibeAtom,
  type UAALVibeIR,
  type UAALVibeMetadata,
} from '../vibe';
import { UAAL_RESOLVED_FAMILIES, gradeByResolver, hasResolver } from '../verifier';

// ── The spike's seed scenes (13 design + 10 held-out) ────────────────────────────────────────────
const light = (id: string, kelvin: number, lux: number, label?: string): UAALVibeAtom => ({
  id,
  kind: 'light',
  kelvin,
  lux,
  ...(label ? { label } : {}),
});
const palette = (id: string, hue: number, label?: string): UAALVibeAtom => ({
  id,
  kind: 'palette',
  hue,
  ...(label ? { label } : {}),
});
const audio = (id: string, bpm: number, db: number, label?: string): UAALVibeAtom => ({
  id,
  kind: 'audio',
  bpm,
  db,
  ...(label ? { label } : {}),
});

interface SeedScene {
  id: string;
  ir: UAALVibeIR;
  coherent: boolean;
  /** For incoherent scenes: the atoms constructed off-target (vt2 ground truth). */
  dissonantAtoms?: string[];
}

const scene = (
  id: string,
  declared: string,
  coherent: boolean,
  text: string,
  atoms: UAALVibeAtom[],
  dissonantAtoms?: string[]
): SeedScene => ({ id, ir: { declared_vibe: declared, text, atoms }, coherent, dissonantAtoms });

const SEED: SeedScene[] = [
  scene('d01', 'cozy', true, 'a warm snug reading nook', [
    light('l', 2700, 180),
    palette('p', 35),
    audio('a', 62, 38),
  ]),
  scene('d02', 'cozy', true, 'soft homely cabin evening', [
    light('l', 2900, 140),
    palette('p', 25),
    audio('a', 55, 35),
  ]),
  scene(
    'd03',
    'cozy',
    false,
    'a warm snug den',
    [light('l', 6500, 950), palette('p', 30), audio('a', 60, 36)],
    ['l']
  ),
  scene('d04', 'tense', true, 'harsh ominous interrogation room', [
    light('l', 6500, 900),
    palette('p', 215),
    audio('a', 150, 74),
  ]),
  scene('d05', 'tense', true, 'edgy menacing corridor', [
    light('l', 6200, 820),
    palette('p', 230),
    audio('a', 160, 78),
  ]),
  scene(
    'd06',
    'tense',
    false,
    'tense standoff',
    [light('l', 2700, 120), palette('p', 35), audio('a', 58, 36)],
    ['l', 'p', 'a']
  ),
  scene('d07', 'serene', true, 'calm tranquil garden dawn', [
    light('l', 3200, 110),
    palette('p', 45),
    audio('a', 48, 32),
  ]),
  scene('d08', 'serene', true, 'peaceful still lakeside', [
    light('l', 3000, 90),
    palette('p', 40),
    audio('a', 44, 30),
  ]),
  scene(
    'd09',
    'serene',
    false,
    'a gentle clearing',
    [light('l', 3100, 100), palette('p', 42), audio('a', 176, 88)],
    ['a']
  ),
  scene('d10', 'energetic', true, 'vibrant lively arcade floor', [
    light('l', 3800, 900),
    palette('p', 15),
    audio('a', 172, 84),
  ]),
  scene('d11', 'energetic', true, 'upbeat electric dance hall', [
    light('l', 4000, 950),
    palette('p', 20),
    audio('a', 168, 86),
  ]),
  scene(
    'd12',
    'energetic',
    false,
    'a lively plaza',
    [light('l', 2800, 80), palette('p', 40), audio('a', 46, 30)],
    ['l', 'a']
  ),
  scene(
    'd13',
    'cozy',
    false,
    'comfy hearth corner',
    [light('l', 2750, 150), palette('p', 220), audio('a', 165, 82)],
    ['p', 'a']
  ),
  scene('h1', 'cozy', true, 'a small room with a lamp and a record player', [
    light('l', 2850, 160),
    palette('p', 28),
    audio('a', 66, 40),
  ]),
  scene('h2', 'tense', true, 'a basement with strip lighting and a ticking device', [
    light('l', 6400, 870),
    palette('p', 225),
    audio('a', 155, 76),
  ]),
  scene(
    'h3',
    'serene',
    false,
    'a courtyard with speakers at full volume',
    [light('l', 3150, 105), palette('p', 44), audio('a', 170, 86)],
    ['a']
  ),
  scene(
    'h4',
    'energetic',
    false,
    'a hall after closing time',
    [light('l', 2750, 70), palette('p', 38), audio('a', 50, 31)],
    ['l', 'a']
  ),
  scene(
    'h5',
    'cozy',
    false,
    'warm snug comfy homely soft',
    [light('l', 6500, 980), palette('p', 210), audio('a', 162, 80)],
    ['l', 'p', 'a']
  ),
  scene(
    'h6',
    'tense',
    false,
    'tense harsh ominous menacing edgy',
    [light('l', 2700, 130), palette('p', 32), audio('a', 52, 33)],
    ['l', 'p', 'a']
  ),
  scene('h7', 'cozy', true, 'a den where the record player runs a little brisk', [
    light('l', 2800, 170),
    palette('p', 33),
    audio('a', 132, 52),
  ]),
  scene('h8', 'serene', true, 'a meadow with one brighter patch of sky', [
    light('l', 3600, 260),
    palette('p', 48),
    audio('a', 47, 31),
  ]),
  scene('h9', 'tense', true, 'a corridor of cold strip light with one faded green poster', [
    light('l', 6300, 850),
    palette('p', 92),
    audio('a', 152, 75),
  ]),
  scene('h10', 'energetic', true, 'a gym floor at full tilt under slightly amber light', [
    light('l', 3400, 880),
    palette('p', 30),
    audio('a', 175, 85),
  ]),
];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('recoverVibe — spike parity on the 23 seed scenes', () => {
  it('recovers every constructed verdict from physics alone', () => {
    for (const s of SEED) {
      expect(recoverVibe(s.ir).coheres, s.id).toBe(s.coherent);
    }
  });

  it('flips on a measurable swap (h1 lamp physically goes cold+harsh), never on a label swap', () => {
    const h1 = SEED.find((s) => s.id === 'h1')!;
    const swapped = clone(h1.ir);
    swapped.atoms![0].kelvin = 6500;
    swapped.atoms![0].lux = 950;
    expect(recoverVibe(h1.ir).coheres).toBe(true);
    expect(recoverVibe(swapped).coheres).toBe(false);

    const relabeled = clone(h1.ir);
    relabeled.text = 'tense harsh ominous menacing edgy';
    expect(recoverVibe(relabeled).coheres).toBe(true);
  });

  it('one screaming atom dominates (the spike iteration-2 mean+max semantics)', () => {
    // d13: light is perfectly cozy; palette+audio scream — the mean alone would soften this.
    const d13 = SEED.find((s) => s.id === 'd13')!;
    const recovered = recoverVibe(d13.ir);
    expect(recovered.coheres).toBe(false);
    expect(recovered.dissonantAtoms).toEqual(['p', 'a']);
  });

  it('coerces unknown register / empty scenes to coheres:false (the resolver is the honest layer)', () => {
    expect(recoverVibe({ declared_vibe: 'moody', atoms: [light('l', 2700, 100)] }).coheres).toBe(
      false
    );
    expect(recoverVibe({ declared_vibe: 'cozy', atoms: [] }).coheres).toBe(false);
  });
});

describe('resolveVibe — crisp gaps only, no false gaps', () => {
  it('resolves every determinate seed scene (no false gaps across all 23)', () => {
    for (const s of SEED) {
      const resolution = resolveVibe(s.ir);
      expect(resolution.status, s.id).toBe('resolved');
      expect(resolution.answer?.coheres, s.id).toBe(s.coherent);
    }
  });

  it('abstains on a scene with no declared register (vibe.unstated_affect @ declared_vibe)', () => {
    const resolution = resolveVibe({ atoms: [light('l', 2700, 100)] });
    expect(resolution.status).toBe('unresolvable');
    expect(resolution.reason).toBe('missing_precondition');
    expect(resolution.gap?.code).toBe('vibe.unstated_affect');
    expect(resolution.gap?.evidence).toBe('declared_vibe');
  });

  it('abstains on an unknown register with no inline target; an inline target settles it', () => {
    const unknown = resolveVibe({ declared_vibe: 'moody', atoms: [light('l', 2700, 100)] });
    expect(unknown.status).toBe('unresolvable');
    expect(unknown.gap?.evidence).toBe('register:moody');

    const inline = resolveVibe({
      declared: [{ register: 'moody', target: { valence: 0.6, arousal: 0.25 } }],
      atoms: [light('l', 2700, 100)],
    });
    expect(inline.status).toBe('resolved');
  });

  it('abstains on an atom with no derivable affect; declaring it unaffected settles it', () => {
    const ir: UAALVibeIR = {
      declared_vibe: 'cozy',
      atoms: [light('l', 2700, 100), { id: 'rug', kind: 'prop' }],
    };
    const gap = resolveVibe(ir);
    expect(gap.status).toBe('unresolvable');
    expect(gap.gap?.code).toBe('vibe.unstated_affect');
    expect(gap.gap?.evidence).toBe('rug');

    const settled = resolveVibe({ ...ir, unaffected: ['rug'] });
    expect(settled.status).toBe('resolved');
    expect(settled.answer?.coheres).toBe(true);
  });

  it('abstains on an affect-silent scene (all atoms unaffected / none present)', () => {
    const empty = resolveVibe({ declared_vibe: 'cozy', atoms: [] });
    expect(empty.status).toBe('unresolvable');
    expect(empty.gap?.evidence).toBe('atoms');

    const allExempt = resolveVibe({
      declared_vibe: 'cozy',
      atoms: [{ id: 'rug', kind: 'prop' }],
      unaffected: ['rug'],
    });
    expect(allExempt.status).toBe('unresolvable');
    expect(allExempt.gap?.evidence).toBe('atoms');
  });

  it('abstains on opposing registers with no dominant (vibe.unresolved_dissonance)', () => {
    const resolution = resolveVibe({
      declared: [{ register: 'cozy' }, { register: 'tense' }],
      atoms: [light('l', 2700, 100)],
    });
    expect(resolution.status).toBe('unresolvable');
    expect(resolution.reason).toBe('unprioritized_conflict');
    expect(resolution.gap?.code).toBe('vibe.unresolved_dissonance');
    expect(resolution.gap?.evidence).toBe('cozy|tense');
  });

  it('a declared dominant settles the opposition; compatible registers are determinate', () => {
    const dominant = resolveVibe({
      declared: [{ register: 'cozy', dominant: true }, { register: 'tense' }],
      atoms: [light('l', 2700, 180), palette('p', 35), audio('a', 62, 38)],
    });
    expect(dominant.status).toBe('resolved');
    expect(dominant.answer?.register).toBe('cozy');
    expect(dominant.answer?.coheres).toBe(true);

    const compatible = resolveVibe({
      declared: [{ register: 'cozy' }, { register: 'serene' }],
      atoms: [light('l', 2700, 180), palette('p', 35), audio('a', 62, 38)],
    });
    expect(compatible.status).toBe('resolved');
    expect(compatible.answer?.register).toBe('cozy');
  });

  it('registersOppose is a crisp table check: cozy⊥tense, cozy∥serene, tense∥energetic on arousal only', () => {
    expect(registersOppose(UAAL_VIBE_REGISTERS.cozy, UAAL_VIBE_REGISTERS.tense)).toBe(true);
    expect(registersOppose(UAAL_VIBE_REGISTERS.cozy, UAAL_VIBE_REGISTERS.serene)).toBe(false);
    // tense vs energetic: valence signs differ → opposing (both are high-arousal).
    expect(registersOppose(UAAL_VIBE_REGISTERS.tense, UAAL_VIBE_REGISTERS.energetic)).toBe(true);
  });
});

describe('benchmarkVibe — vt1-vt4 + emergent_beats_lexical on the seed fixtures', () => {
  const rows = SEED.map((s) => ({
    completion: s.ir,
    metadata: {
      id: s.id,
      coherent: s.coherent,
      ...(s.dissonantAtoms ? { dissonant_atoms: s.dissonantAtoms } : {}),
    } as UAALVibeMetadata,
  }));

  it('passes every test at the standard thresholds', () => {
    const result = benchmarkVibe(rows);
    expect(result.n).toBe(SEED.length);
    expect(result.tests.vt1_discrimination.pass, JSON.stringify(result.misses.vt1)).toBe(true);
    expect(result.tests.vt2_dissonant_atom_fidelity.pass, JSON.stringify(result.misses.vt2)).toBe(
      true
    );
    expect(result.tests.vt3_structural_sanity.pass).toBe(true);
    expect(result.tests.vt4_falsification_flip.pass, JSON.stringify(result.misses.vt4)).toBe(true);
    expect(result.tests.emergent_beats_lexical.pass).toBe(true);
    expect(result.pass).toBe(true);
  });

  it('lexicalVibe reads only surface text (blind on mood-word-free scenes)', () => {
    const moodFree = SEED.find((s) => s.id === 'h1')!;
    expect(lexicalVibe(moodFree.ir, true)).toBe(true);
    expect(lexicalVibe(moodFree.ir, false)).toBe(false); // pure fallback — no words to read
    const misleading = SEED.find((s) => s.id === 'h5')!;
    expect(lexicalVibe(misleading.ir, false)).toBe(true); // fooled by 'warm snug comfy homely soft'
  });
});

describe('verifier of record — vibe is a registered family', () => {
  it('appears in UAAL_RESOLVED_FAMILIES and hasResolver', () => {
    expect(UAAL_RESOLVED_FAMILIES).toContain('vibe');
    expect(hasResolver('vibe')).toBe(true);
  });

  it('gradeByResolver returns the resolver verdict verbatim (resolved + gap cases)', () => {
    const resolved = gradeByResolver('vibe', SEED[0].ir);
    expect(resolved.family).toBe('vibe');
    expect(resolved.status).toBe('resolved');
    expect((resolved.answer as { coheres: boolean }).coheres).toBe(true);

    const gap = gradeByResolver('vibe', { atoms: [] });
    expect(gap.status).toBe('unresolvable');
    expect(gap.gap?.code).toBe('vibe.unstated_affect');
  });
});

describe('published constants stay the spike values (changing any is a family re-verdict)', () => {
  it('constants and registers match the spike receipt', () => {
    expect(UAAL_VIBE_CONSTANTS.COHERES_THRESHOLD).toBe(0.5);
    expect(UAAL_VIBE_CONSTANTS.DMAX).toBe(0.8);
    expect(UAAL_VIBE_CONSTANTS.MEAN_WEIGHT + UAAL_VIBE_CONSTANTS.MAX_WEIGHT).toBe(1);
    expect(UAAL_VIBE_REGISTERS.cozy).toEqual({ valence: 0.6, arousal: 0.25 });
    expect(UAAL_VIBE_REGISTERS.tense).toEqual({ valence: -0.5, arousal: 0.75 });
  });
});
