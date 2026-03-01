/**
 * ExpressionPresets.ts — Facial Expression Presets
 *
 * ARKit-compatible blendshape presets for character facial animation.
 */

export interface ExpressionPreset {
  name: string;
  category: 'emotion' | 'viseme' | 'custom';
  blendshapes: Record<string, number>; // Blendshape name → weight 0..1
}

// ═══════════════════════════════════════════════════════════════════
// Emotion Presets
// ═══════════════════════════════════════════════════════════════════

export const EXPRESSION_PRESETS: ExpressionPreset[] = [
  {
    name: 'neutral',
    category: 'emotion',
    blendshapes: {},
  },
  {
    name: 'happy',
    category: 'emotion',
    blendshapes: { mouthSmileLeft: 0.8, mouthSmileRight: 0.8, cheekSquintLeft: 0.4, cheekSquintRight: 0.4, eyeSquintLeft: 0.3, eyeSquintRight: 0.3 },
  },
  {
    name: 'sad',
    category: 'emotion',
    blendshapes: { mouthFrownLeft: 0.7, mouthFrownRight: 0.7, browInnerUp: 0.5, eyeSquintLeft: 0.2, eyeSquintRight: 0.2 },
  },
  {
    name: 'angry',
    category: 'emotion',
    blendshapes: { browDownLeft: 0.8, browDownRight: 0.8, mouthFrownLeft: 0.4, mouthFrownRight: 0.4, noseSneerLeft: 0.5, noseSneerRight: 0.5, jawOpen: 0.15 },
  },
  {
    name: 'surprised',
    category: 'emotion',
    blendshapes: { browInnerUp: 0.9, browOuterUpLeft: 0.7, browOuterUpRight: 0.7, eyeWideLeft: 0.8, eyeWideRight: 0.8, jawOpen: 0.5, mouthFunnel: 0.3 },
  },
  {
    name: 'disgusted',
    category: 'emotion',
    blendshapes: { noseSneerLeft: 0.8, noseSneerRight: 0.8, mouthUpperUpLeft: 0.4, mouthUpperUpRight: 0.4, browDownLeft: 0.3, browDownRight: 0.3 },
  },
  {
    name: 'fearful',
    category: 'emotion',
    blendshapes: { browInnerUp: 0.7, eyeWideLeft: 0.6, eyeWideRight: 0.6, mouthStretchLeft: 0.4, mouthStretchRight: 0.4, jawOpen: 0.2 },
  },
  {
    name: 'wink-left',
    category: 'emotion',
    blendshapes: { eyeBlinkLeft: 1.0, mouthSmileLeft: 0.4, mouthSmileRight: 0.3 },
  },

  // ═══════════════════════════════════════════════════════════════════
  // Viseme Presets (lip-sync)
  // ═══════════════════════════════════════════════════════════════════
  { name: 'viseme-AA', category: 'viseme', blendshapes: { jawOpen: 0.6, mouthFunnel: 0.1 } },
  { name: 'viseme-EE', category: 'viseme', blendshapes: { mouthSmileLeft: 0.5, mouthSmileRight: 0.5, jawOpen: 0.15 } },
  { name: 'viseme-OO', category: 'viseme', blendshapes: { mouthFunnel: 0.7, mouthPucker: 0.5, jawOpen: 0.2 } },
  { name: 'viseme-FF', category: 'viseme', blendshapes: { mouthFunnel: 0.3, mouthLowerDownLeft: 0.3, mouthLowerDownRight: 0.3 } },
  { name: 'viseme-TH', category: 'viseme', blendshapes: { tongueOut: 0.4, jawOpen: 0.1 } },
  { name: 'viseme-MM', category: 'viseme', blendshapes: { mouthClose: 0.9, mouthPressLeft: 0.4, mouthPressRight: 0.4 } },
];

/**
 * Get a preset by name.
 */
export function getPreset(name: string): ExpressionPreset | undefined {
  return EXPRESSION_PRESETS.find(p => p.name === name);
}

/**
 * Get presets by category.
 */
export function presetsByCategory(category: ExpressionPreset['category']): ExpressionPreset[] {
  return EXPRESSION_PRESETS.filter(p => p.category === category);
}

/**
 * Blend two expression presets together.
 */
export function blendExpressions(a: ExpressionPreset, b: ExpressionPreset, weight: number): Record<string, number> {
  const w = Math.max(0, Math.min(1, weight));
  const result: Record<string, number> = {};
  const allKeys = new Set([...Object.keys(a.blendshapes), ...Object.keys(b.blendshapes)]);
  for (const key of allKeys) {
    const va = a.blendshapes[key] ?? 0;
    const vb = b.blendshapes[key] ?? 0;
    result[key] = va * (1 - w) + vb * w;
  }
  return result;
}

/**
 * Count the number of active blendshapes in a preset.
 */
export function activeBlendshapeCount(preset: ExpressionPreset): number {
  return Object.values(preset.blendshapes).filter(v => v > 0).length;
}
