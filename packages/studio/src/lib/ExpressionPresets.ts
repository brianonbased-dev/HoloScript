/**
 * ExpressionPresets.ts — Facial Expression Presets
 *
 * ARKit-compatible blendshape presets for character facial animation.
 */

// Re-export emotion/viseme presets and blending utilities
export {
  EMOTION_PRESETS,
  VISEME_PRESETS,
  ALL_PRESETS,
  applyPresetWeights,
  lerpPresets,
  type ExpressionPreset,
} from './character/ExpressionPresets';

import type { ExpressionPreset } from './character/ExpressionPresets';

// ═══════════════════════════════════════════════════════════════════
// Emotion Presets
// ═══════════════════════════════════════════════════════════════════

export const EXPRESSION_PRESETS: ExpressionPreset[] = [
  {
    id: 'expr_neutral',
    name: 'neutral',
    emoji: '😐',
    category: 'emotion',
    weights: {},
  },
  {
    id: 'expr_happy',
    name: 'happy',
    emoji: '😊',
    category: 'emotion',
    weights: {
      mouthSmileLeft: 0.8,
      mouthSmileRight: 0.8,
      cheekSquintLeft: 0.4,
      cheekSquintRight: 0.4,
      eyeSquintLeft: 0.3,
      eyeSquintRight: 0.3,
    },
  },
  {
    id: 'expr_sad',
    name: 'sad',
    emoji: '😢',
    category: 'emotion',
    weights: {
      mouthFrownLeft: 0.7,
      mouthFrownRight: 0.7,
      browInnerUp: 0.5,
      eyeSquintLeft: 0.2,
      eyeSquintRight: 0.2,
    },
  },
  {
    id: 'expr_angry',
    name: 'angry',
    emoji: '😠',
    category: 'emotion',
    weights: {
      browDownLeft: 0.8,
      browDownRight: 0.8,
      mouthFrownLeft: 0.4,
      mouthFrownRight: 0.4,
      noseSneerLeft: 0.5,
      noseSneerRight: 0.5,
      jawOpen: 0.15,
    },
  },
  {
    id: 'expr_surprised',
    name: 'surprised',
    emoji: '😲',
    category: 'emotion',
    weights: {
      browInnerUp: 0.9,
      browOuterUpLeft: 0.7,
      browOuterUpRight: 0.7,
      eyeWideLeft: 0.8,
      eyeWideRight: 0.8,
      jawOpen: 0.5,
      mouthFunnel: 0.3,
    },
  },
  {
    id: 'expr_disgusted',
    name: 'disgusted',
    emoji: '🤢',
    category: 'emotion',
    weights: {
      noseSneerLeft: 0.8,
      noseSneerRight: 0.8,
      mouthUpperUpLeft: 0.4,
      mouthUpperUpRight: 0.4,
      browDownLeft: 0.3,
      browDownRight: 0.3,
    },
  },
  {
    id: 'expr_fearful',
    name: 'fearful',
    emoji: '😨',
    category: 'emotion',
    weights: {
      browInnerUp: 0.7,
      eyeWideLeft: 0.6,
      eyeWideRight: 0.6,
      mouthStretchLeft: 0.4,
      mouthStretchRight: 0.4,
      jawOpen: 0.2,
    },
  },
  {
    id: 'expr_wink-left',
    name: 'wink-left',
    emoji: '😉',
    category: 'emotion',
    weights: { eyeBlinkLeft: 1.0, mouthSmileLeft: 0.4, mouthSmileRight: 0.3 },
  },

  // ═══════════════════════════════════════════════════════════════════
  // Viseme Presets (lip-sync)
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'vis_aa',
    name: 'viseme-AA',
    emoji: '🅰️',
    category: 'viseme',
    weights: { jawOpen: 0.6, mouthFunnel: 0.1 },
  },
  {
    id: 'vis_ee',
    name: 'viseme-EE',
    emoji: '🇪',
    category: 'viseme',
    weights: { mouthSmileLeft: 0.5, mouthSmileRight: 0.5, jawOpen: 0.15 },
  },
  {
    id: 'vis_oo',
    name: 'viseme-OO',
    emoji: '🇴',
    category: 'viseme',
    weights: { mouthFunnel: 0.7, mouthPucker: 0.5, jawOpen: 0.2 },
  },
  {
    id: 'vis_ff',
    name: 'viseme-FF',
    emoji: '🇫',
    category: 'viseme',
    weights: { mouthFunnel: 0.3, mouthLowerDownLeft: 0.3, mouthLowerDownRight: 0.3 },
  },
  {
    id: 'vis_th',
    name: 'viseme-TH',
    emoji: '🇹',
    category: 'viseme',
    weights: { tongueOut: 0.4, jawOpen: 0.1 },
  },
  {
    id: 'vis_mm',
    name: 'viseme-MM',
    emoji: '🤐',
    category: 'viseme',
    weights: { mouthClose: 0.9, mouthPressLeft: 0.4, mouthPressRight: 0.4 },
  },
];

/**
 * Get a preset by name.
 */
export function getPreset(name: string): ExpressionPreset | undefined {
  return EXPRESSION_PRESETS.find((p) => p.name === name);
}

/**
 * Get presets by category.
 */
export function presetsByCategory(category: ExpressionPreset['category']): ExpressionPreset[] {
  return EXPRESSION_PRESETS.filter((p) => p.category === category);
}

/**
 * Blend two expression presets together.
 */
export function blendExpressions(
  a: ExpressionPreset,
  b: ExpressionPreset,
  weight: number
): Record<string, number> {
  const w = Math.max(0, Math.min(1, weight));
  const result: Record<string, number> = {};
  const allKeys = new Set([...Object.keys(a.weights), ...Object.keys(b.weights)]);
  for (const key of allKeys) {
    const va = a.weights[key] ?? 0;
    const vb = b.weights[key] ?? 0;
    result[key] = va * (1 - w) + vb * w;
  }
  return result;
}

/**
 * Count the number of active blendshapes in a preset.
 */
export function activeBlendshapeCount(preset: ExpressionPreset): number {
  return Object.values(preset.weights).filter((v) => (v as number) > 0).length;
}
