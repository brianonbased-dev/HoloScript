/**
 * ExpressionPresets — Named blend shape group configurations
 *
 * Each preset defines a set of morph target weights that together
 * form a recognizable facial expression. Presets are applied to
 * the character store and rendered via MorphTargetController.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface ExpressionPreset {
  id: string;
  name: string;
  emoji: string;
  /** Category for organizing in the UI */
  category: 'emotion' | 'viseme' | 'custom';
  /** Morph target weights (0-100 range, matching our slider system) */
  weights: Record<string, number>;
}

// ── Emotion Presets ─────────────────────────────────────────────────────────

export const EMOTION_PRESETS: ExpressionPreset[] = [
  {
    id: 'expr_neutral',
    name: 'Neutral',
    emoji: '😐',
    category: 'emotion',
    weights: {
      face_eye_size: 50,
      face_eye_spacing: 50,
      face_nose_width: 50,
      face_nose_length: 50,
      face_mouth_width: 50,
      face_jaw_width: 50,
      face_cheek: 50,
      face_brow: 50,
    },
  },
  {
    id: 'expr_happy',
    name: 'Happy',
    emoji: '😊',
    category: 'emotion',
    weights: {
      face_eye_size: 65,
      face_mouth_width: 75,
      face_cheek: 70,
      face_brow: 60,
      face_jaw_width: 45,
    },
  },
  {
    id: 'expr_sad',
    name: 'Sad',
    emoji: '😢',
    category: 'emotion',
    weights: {
      face_eye_size: 40,
      face_mouth_width: 35,
      face_cheek: 35,
      face_brow: 30,
      face_jaw_width: 50,
    },
  },
  {
    id: 'expr_angry',
    name: 'Angry',
    emoji: '😠',
    category: 'emotion',
    weights: {
      face_eye_size: 35,
      face_mouth_width: 40,
      face_cheek: 40,
      face_brow: 25,
      face_jaw_width: 65,
      face_nose_width: 55,
    },
  },
  {
    id: 'expr_surprised',
    name: 'Surprised',
    emoji: '😲',
    category: 'emotion',
    weights: {
      face_eye_size: 90,
      face_mouth_width: 70,
      face_jaw_width: 70,
      face_brow: 85,
      face_cheek: 45,
    },
  },
  {
    id: 'expr_wink',
    name: 'Wink',
    emoji: '😉',
    category: 'emotion',
    weights: {
      face_eye_size: 30,
      face_mouth_width: 65,
      face_cheek: 60,
      face_brow: 55,
    },
  },
  {
    id: 'expr_smirk',
    name: 'Smirk',
    emoji: '😏',
    category: 'emotion',
    weights: {
      face_eye_size: 45,
      face_mouth_width: 60,
      face_cheek: 55,
      face_brow: 40,
      face_jaw_width: 48,
    },
  },
  {
    id: 'expr_fear',
    name: 'Fear',
    emoji: '😨',
    category: 'emotion',
    weights: {
      face_eye_size: 85,
      face_mouth_width: 55,
      face_jaw_width: 60,
      face_brow: 80,
      face_cheek: 35,
      face_nose_width: 55,
    },
  },
];

// ── Viseme Presets (Lip Sync) ───────────────────────────────────────────────
// Based on standard 15-viseme set for speech animation

export const VISEME_PRESETS: ExpressionPreset[] = [
  {
    id: 'vis_sil',
    name: 'Silence',
    emoji: '🤐',
    category: 'viseme',
    weights: { face_mouth_width: 50, face_jaw_width: 50 },
  },
  {
    id: 'vis_aa',
    name: 'AA',
    emoji: '🅰️',
    category: 'viseme',
    weights: { face_mouth_width: 70, face_jaw_width: 75 },
  },
  {
    id: 'vis_ee',
    name: 'EE',
    emoji: '🇪',
    category: 'viseme',
    weights: { face_mouth_width: 75, face_jaw_width: 45 },
  },
  {
    id: 'vis_ih',
    name: 'IH',
    emoji: '🇮',
    category: 'viseme',
    weights: { face_mouth_width: 60, face_jaw_width: 50 },
  },
  {
    id: 'vis_oh',
    name: 'OH',
    emoji: '🇴',
    category: 'viseme',
    weights: { face_mouth_width: 55, face_jaw_width: 70 },
  },
  {
    id: 'vis_ou',
    name: 'OU',
    emoji: '🇺',
    category: 'viseme',
    weights: { face_mouth_width: 40, face_jaw_width: 65 },
  },
  {
    id: 'vis_ff',
    name: 'FF',
    emoji: '🇫',
    category: 'viseme',
    weights: { face_mouth_width: 45, face_jaw_width: 40 },
  },
  {
    id: 'vis_th',
    name: 'TH',
    emoji: '🇹',
    category: 'viseme',
    weights: { face_mouth_width: 55, face_jaw_width: 45 },
  },
];

// ── All presets ─────────────────────────────────────────────────────────────

export const ALL_PRESETS: ExpressionPreset[] = [...EMOTION_PRESETS, ...VISEME_PRESETS];

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Apply an expression preset to the store by setting each morph target weight.
 * Optionally blends with current values using an intensity factor (0-1).
 */
export function applyPresetWeights(
  preset: ExpressionPreset,
  setMorphTarget: (name: string, value: number) => void,
  intensity: number = 1.0,
  currentTargets: Record<string, number> = {}
): void {
  for (const [key, targetValue] of Object.entries(preset.weights)) {
    const current = currentTargets[key] ?? 50;
    const blended = Math.round(current + (targetValue - current) * intensity);
    setMorphTarget(key, Math.max(0, Math.min(100, blended)));
  }
}

/**
 * Interpolate between two presets for smooth transitions.
 * Returns a new weights map.
 */
export function lerpPresets(
  from: ExpressionPreset,
  to: ExpressionPreset,
  t: number
): Record<string, number> {
  const allKeys = new Set([...Object.keys(from.weights), ...Object.keys(to.weights)]);
  const result: Record<string, number> = {};
  for (const key of allKeys) {
    const a = from.weights[key] ?? 50;
    const b = to.weights[key] ?? 50;
    result[key] = Math.round(a + (b - a) * t);
  }
  return result;
}
