/**
 * FACSSystem.ts
 *
 * Facial Action Coding System — 52 Action Unit definitions,
 * compound expression presets, 15 viseme mappings, and morph
 * target delta computation utilities.
 *
 * Compatible with Apple ARKit, Unreal MetaHuman, VRM, and VTuber tracking.
 *
 * @see W.240: FACS 52 AUs are the universal facial expression standard
 * @see P.CHAR.001: Shape-Sculpt-to-Morph-Target pipeline
 * @see G.CHAR.001: Sparse morph targets to reduce memory (31MB → 3MB)
 * @module character
 */

// =============================================================================
// Action Unit Definition
// =============================================================================

export interface ActionUnitDefinition {
  /** FACS AU number (e.g., 1, 2, 4, ...) */
  id: number;
  /** Standard FACS name */
  name: string;
  /** Primary facial region affected */
  region: 'brow' | 'eye' | 'nose' | 'mouth' | 'jaw' | 'tongue' | 'cheek' | 'head' | 'gaze';
  /** Description of the muscular action */
  description: string;
  /** Whether this AU is typically bilateral (left+right) */
  bilateral: boolean;
  /** Apple ARKit blend shape name(s) mapping */
  arkitMapping?: string[];
}

// =============================================================================
// Complete 52 Action Unit Registry
// =============================================================================

export const FACS_ACTION_UNITS: ActionUnitDefinition[] = [
  // Upper Face — Brow & Forehead
  { id: 1, name: 'Inner Brow Raise', region: 'brow', description: 'Frontalis (medial)', bilateral: true, arkitMapping: ['browInnerUp'] },
  { id: 2, name: 'Outer Brow Raise', region: 'brow', description: 'Frontalis (lateral)', bilateral: true, arkitMapping: ['browOuterUpLeft', 'browOuterUpRight'] },
  { id: 4, name: 'Brow Lowerer', region: 'brow', description: 'Corrugator supercilii + Depressor supercilii', bilateral: true, arkitMapping: ['browDownLeft', 'browDownRight'] },

  // Upper Face — Eyes
  { id: 5, name: 'Upper Lid Raise', region: 'eye', description: 'Levator palpebrae superioris', bilateral: true, arkitMapping: ['eyeWideLeft', 'eyeWideRight'] },
  { id: 6, name: 'Cheek Raise', region: 'eye', description: 'Orbicularis oculi (orbital)', bilateral: true, arkitMapping: ['cheekSquintLeft', 'cheekSquintRight'] },
  { id: 7, name: 'Lid Tightener', region: 'eye', description: 'Orbicularis oculi (palpebral)', bilateral: true, arkitMapping: ['eyeSquintLeft', 'eyeSquintRight'] },
  { id: 43, name: 'Eyes Closed', region: 'eye', description: 'Relaxation of Levator palpebrae superioris', bilateral: true, arkitMapping: ['eyeBlinkLeft', 'eyeBlinkRight'] },
  { id: 45, name: 'Blink', region: 'eye', description: 'Rapid Orbicularis oculi contraction', bilateral: true, arkitMapping: ['eyeBlinkLeft', 'eyeBlinkRight'] },
  { id: 46, name: 'Wink', region: 'eye', description: 'Unilateral Orbicularis oculi', bilateral: false, arkitMapping: ['eyeBlinkLeft'] },

  // Nose
  { id: 9, name: 'Nose Wrinkler', region: 'nose', description: 'Levator labii superioris alaeque nasi', bilateral: true, arkitMapping: ['noseSneerLeft', 'noseSneerRight'] },
  { id: 10, name: 'Upper Lip Raiser', region: 'nose', description: 'Levator labii superioris', bilateral: true },
  { id: 11, name: 'Nasolabial Deepener', region: 'nose', description: 'Zygomaticus minor', bilateral: true },

  // Mouth — Lip Position
  { id: 12, name: 'Lip Corner Puller', region: 'mouth', description: 'Zygomaticus major', bilateral: true, arkitMapping: ['mouthSmileLeft', 'mouthSmileRight'] },
  { id: 13, name: 'Sharp Lip Puller', region: 'mouth', description: 'Levator anguli oris (caninus)', bilateral: true },
  { id: 14, name: 'Dimpler', region: 'mouth', description: 'Buccinator', bilateral: true, arkitMapping: ['mouthDimpleLeft', 'mouthDimpleRight'] },
  { id: 15, name: 'Lip Corner Depressor', region: 'mouth', description: 'Depressor anguli oris (triangularis)', bilateral: true, arkitMapping: ['mouthFrownLeft', 'mouthFrownRight'] },
  { id: 16, name: 'Lower Lip Depressor', region: 'mouth', description: 'Depressor labii inferioris', bilateral: true, arkitMapping: ['mouthLowerDownLeft', 'mouthLowerDownRight'] },
  { id: 17, name: 'Chin Raiser', region: 'mouth', description: 'Mentalis', bilateral: false },
  { id: 18, name: 'Lip Pucker', region: 'mouth', description: 'Incisivii labii + Orbicularis oris', bilateral: false, arkitMapping: ['mouthPucker'] },
  { id: 20, name: 'Lip Stretcher', region: 'mouth', description: 'Risorius + Platysma', bilateral: true, arkitMapping: ['mouthStretchLeft', 'mouthStretchRight'] },
  { id: 22, name: 'Lip Funneler', region: 'mouth', description: 'Orbicularis oris', bilateral: false, arkitMapping: ['mouthFunnel'] },
  { id: 23, name: 'Lip Tightener', region: 'mouth', description: 'Orbicularis oris', bilateral: false, arkitMapping: ['mouthPressLeft', 'mouthPressRight'] },
  { id: 24, name: 'Lip Pressor', region: 'mouth', description: 'Orbicularis oris', bilateral: false },
  { id: 25, name: 'Lips Part', region: 'mouth', description: 'Depressor labii + Mentalis', bilateral: false },
  { id: 26, name: 'Jaw Drop', region: 'jaw', description: 'Masseter + internal pterygoid relaxation', bilateral: false, arkitMapping: ['jawOpen'] },
  { id: 27, name: 'Mouth Stretch', region: 'jaw', description: 'Pterygoids + Digastric', bilateral: false },
  { id: 28, name: 'Lip Suck', region: 'mouth', description: 'Mentalis', bilateral: false, arkitMapping: ['mouthRollLower', 'mouthRollUpper'] },

  // Tongue & Cheeks
  { id: 19, name: 'Tongue Show', region: 'tongue', description: 'Tongue protrusion', bilateral: false, arkitMapping: ['tongueOut'] },
  { id: 21, name: 'Neck Tightener', region: 'jaw', description: 'Platysma', bilateral: false },
  { id: 29, name: 'Jaw Thrust', region: 'jaw', description: 'External pterygoid', bilateral: false, arkitMapping: ['jawForward'] },
  { id: 30, name: 'Jaw Sideways', region: 'jaw', description: 'Lateral pterygoid', bilateral: false, arkitMapping: ['jawLeft', 'jawRight'] },
  { id: 31, name: 'Jaw Clench', region: 'jaw', description: 'Masseter + Temporalis', bilateral: false },
  { id: 32, name: 'Lip Bite', region: 'mouth', description: 'Lower lip drawn under upper teeth', bilateral: false },
  { id: 33, name: 'Cheek Blow', region: 'cheek', description: 'Buccinator expansion', bilateral: true, arkitMapping: ['cheekPuff'] },
  { id: 34, name: 'Cheek Puff', region: 'cheek', description: 'Unilateral cheek inflation', bilateral: false },
  { id: 35, name: 'Cheek Suck', region: 'cheek', description: 'Buccinator contraction', bilateral: true },
  { id: 36, name: 'Tongue Bulge', region: 'tongue', description: 'Tongue pressed into cheek', bilateral: false },
  { id: 37, name: 'Lip Wipe', region: 'mouth', description: 'Tongue wipes lips', bilateral: false },
  { id: 38, name: 'Nostril Dilator', region: 'nose', description: 'Nasalis (alar)', bilateral: true },
  { id: 39, name: 'Nostril Compressor', region: 'nose', description: 'Nasalis (transverse)', bilateral: true },

  // Head Position
  { id: 51, name: 'Head Turn Left', region: 'head', description: 'Neck rotation left', bilateral: false },
  { id: 52, name: 'Head Turn Right', region: 'head', description: 'Neck rotation right', bilateral: false },
  { id: 53, name: 'Head Up', region: 'head', description: 'Neck extension', bilateral: false },
  { id: 54, name: 'Head Down', region: 'head', description: 'Neck flexion', bilateral: false },
  { id: 55, name: 'Head Tilt Left', region: 'head', description: 'Lateral neck flexion left', bilateral: false },
  { id: 56, name: 'Head Tilt Right', region: 'head', description: 'Lateral neck flexion right', bilateral: false },
  { id: 57, name: 'Head Forward', region: 'head', description: 'Cervical protraction', bilateral: false },
  { id: 58, name: 'Head Back', region: 'head', description: 'Cervical retraction', bilateral: false },

  // Eye Gaze
  { id: 61, name: 'Eyes Turn Left', region: 'gaze', description: 'Lateral rectus (left), Medial rectus (right)', bilateral: false, arkitMapping: ['eyeLookOutLeft', 'eyeLookInRight'] },
  { id: 62, name: 'Eyes Turn Right', region: 'gaze', description: 'Medial rectus (left), Lateral rectus (right)', bilateral: false, arkitMapping: ['eyeLookInLeft', 'eyeLookOutRight'] },
  { id: 63, name: 'Eyes Up', region: 'gaze', description: 'Superior rectus', bilateral: false, arkitMapping: ['eyeLookUpLeft', 'eyeLookUpRight'] },
  { id: 64, name: 'Eyes Down', region: 'gaze', description: 'Inferior rectus', bilateral: false, arkitMapping: ['eyeLookDownLeft', 'eyeLookDownRight'] },
];

// =============================================================================
// Compound Expression Presets
// =============================================================================

export interface CompoundExpression {
  name: string;
  weights: Record<number, number>;
}

export const EXPRESSION_PRESETS: CompoundExpression[] = [
  { name: 'happy', weights: { 6: 0.8, 12: 1.0 } },
  { name: 'sad', weights: { 1: 0.6, 4: 0.3, 15: 0.8 } },
  { name: 'angry', weights: { 4: 1.0, 5: 0.5, 7: 0.6, 23: 0.8 } },
  { name: 'surprised', weights: { 1: 1.0, 2: 1.0, 5: 0.8, 26: 0.7 } },
  { name: 'disgusted', weights: { 9: 0.9, 10: 0.7, 17: 0.4 } },
  { name: 'fearful', weights: { 1: 1.0, 2: 0.8, 4: 0.5, 5: 0.8, 20: 0.9 } },
  { name: 'contempt', weights: { 12: 0.5, 14: 0.7 } },
  { name: 'thinking', weights: { 4: 0.4, 7: 0.3, 28: 0.5 } },
  { name: 'confused', weights: { 1: 0.5, 4: 0.6, 7: 0.3, 15: 0.3 } },
  { name: 'smirk', weights: { 12: 0.7, 14: 0.4 } },
];

// =============================================================================
// 15-Viseme System
// =============================================================================

export interface VisemeDefinition {
  name: string;
  phonemes: string[];
  weights: Record<number, number>;
}

export const VISEME_15: VisemeDefinition[] = [
  { name: 'sil', phonemes: ['(silence)'], weights: {} },
  { name: 'aa', phonemes: ['ah', 'father'], weights: { 25: 0.8, 26: 0.5 } },
  { name: 'ee', phonemes: ['ee', 'see'], weights: { 25: 0.4, 12: 0.3 } },
  { name: 'ih', phonemes: ['ih', 'bit'], weights: { 25: 0.3, 20: 0.2 } },
  { name: 'oh', phonemes: ['oh', 'go'], weights: { 25: 0.6, 27: 0.4 } },
  { name: 'oo', phonemes: ['oo', 'too'], weights: { 25: 0.3, 10: 0.2 } },
  { name: 'pp', phonemes: ['pp', 'bb', 'mm'], weights: { 28: 0.8 } },
  { name: 'ff', phonemes: ['ff', 'vv'], weights: { 25: 0.1, 10: 0.4 } },
  { name: 'th', phonemes: ['th'], weights: { 25: 0.3, 19: 0.5 } },
  { name: 'dd', phonemes: ['dd', 'tt', 'nn'], weights: { 25: 0.2, 19: 0.3 } },
  { name: 'kk', phonemes: ['kk', 'gg'], weights: { 25: 0.2, 26: 0.3 } },
  { name: 'ch', phonemes: ['ch', 'jj', 'sh'], weights: { 25: 0.3, 22: 0.4 } },
  { name: 'ss', phonemes: ['ss', 'zz'], weights: { 25: 0.15, 20: 0.3 } },
  { name: 'nn', phonemes: ['ng'], weights: { 25: 0.1, 26: 0.15 } },
  { name: 'rr', phonemes: ['rr', 'll'], weights: { 25: 0.25, 22: 0.2 } },
];

// =============================================================================
// Morph Target Delta Computation
// =============================================================================

export interface VertexDelta {
  /** Index into the vertex buffer */
  vertexIndex: number;
  /** Position delta (dx, dy, dz) */
  delta: [number, number, number];
  /** Normal delta (optional, for smooth lighting) */
  normalDelta?: [number, number, number];
}

export interface SparseMorphTarget {
  /** AU or viseme name */
  name: string;
  /** Only vertices that actually moved (sparse — G.CHAR.001) */
  deltas: VertexDelta[];
  /** Total vertex count of the base mesh */
  totalVertices: number;
}

/**
 * Compute sparse morph target from neutral and deformed meshes.
 *
 * Only stores vertices where the delta exceeds epsilon.
 * This reduces memory from ~31MB (52 AUs x 50K x 12B) to ~3MB.
 *
 * @param neutral - Neutral pose vertex positions (flat Float32Array, 3 values per vertex)
 * @param deformed - Deformed pose vertex positions (same layout)
 * @param epsilon - Minimum delta magnitude to include (default 0.0001)
 * @returns SparseMorphTarget with only affected vertices
 */
export function computeSparseMorphTarget(
  name: string,
  neutral: Float32Array,
  deformed: Float32Array,
  epsilon: number = 0.0001,
): SparseMorphTarget {
  const totalVertices = neutral.length / 3;
  const deltas: VertexDelta[] = [];

  for (let i = 0; i < totalVertices; i++) {
    const i3 = i * 3;
    const dx = deformed[i3] - neutral[i3];
    const dy = deformed[i3 + 1] - neutral[i3 + 1];
    const dz = deformed[i3 + 2] - neutral[i3 + 2];
    const magnitude = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (magnitude > epsilon) {
      deltas.push({ vertexIndex: i, delta: [dx, dy, dz] });
    }
  }

  return { name, deltas, totalVertices };
}

/**
 * Apply weighted morph targets to a base mesh.
 *
 * @param basePositions - Neutral pose positions (will be modified in place)
 * @param targets - Active morph targets with their weights
 */
export function applyMorphTargets(
  basePositions: Float32Array,
  targets: Array<{ target: SparseMorphTarget; weight: number }>,
): void {
  for (const { target, weight } of targets) {
    if (weight === 0) continue;
    for (const delta of target.deltas) {
      const i3 = delta.vertexIndex * 3;
      basePositions[i3] += delta.delta[0] * weight;
      basePositions[i3 + 1] += delta.delta[1] * weight;
      basePositions[i3 + 2] += delta.delta[2] * weight;
    }
  }
}

/**
 * Evaluate a compound expression into individual AU weights.
 */
export function evaluateExpression(expressionName: string): Record<number, number> {
  const preset = EXPRESSION_PRESETS.find(e => e.name === expressionName);
  return preset ? { ...preset.weights } : {};
}

/**
 * Get AU definition by ID.
 */
export function getActionUnit(id: number): ActionUnitDefinition | undefined {
  return FACS_ACTION_UNITS.find(au => au.id === id);
}

/**
 * Get viseme definition by name.
 */
export function getViseme(name: string): VisemeDefinition | undefined {
  return VISEME_15.find(v => v.name === name);
}
