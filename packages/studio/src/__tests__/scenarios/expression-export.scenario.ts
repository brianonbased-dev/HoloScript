/**
 * Scenario: Expression Editor & Export (Phase 4)
 *
 * Tests for:
 * - Expression presets (emotion + viseme definitions)
 * - applyPresetWeights with intensity blending
 * - lerpPresets interpolation
 * - Character Card export format
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EMOTION_PRESETS,
  VISEME_PRESETS,
  ALL_PRESETS,
  applyPresetWeights,
  lerpPresets,
  type ExpressionPreset,
} from '../../lib/ExpressionPresets';
import { buildCharacterCard } from '../../components/character/ExportPanel';

const { useCharacterStore } = await import('@/lib/store');

// ── Helpers ─────────────────────────────────────────────────────────────────

function resetStore() {
  useCharacterStore.setState({
    morphTargets: {},
    skinColor: '#e8beac',
    equippedItems: {},
    customizeMode: false,
    panelMode: 'skeleton',
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Scenario: Expression Presets — Catalogue', () => {
  it('has 8 emotion presets', () => {
    expect(EMOTION_PRESETS.length).toBe(8);
  });

  it('has 8 viseme presets', () => {
    expect(VISEME_PRESETS.length).toBe(8);
  });

  it('ALL_PRESETS contains 16 total presets', () => {
    expect(ALL_PRESETS.length).toBe(16);
  });

  it('all presets have unique IDs', () => {
    const ids = ALL_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all presets have required fields', () => {
    for (const p of ALL_PRESETS) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.emoji).toBeTruthy();
      expect(['emotion', 'viseme', 'custom']).toContain(p.category);
      expect(Object.keys(p.weights).length).toBeGreaterThan(0);
    }
  });

  it('emotion presets include happy, sad, angry, surprised', () => {
    const names = EMOTION_PRESETS.map((p) => p.name.toLowerCase());
    expect(names).toContain('happy');
    expect(names).toContain('sad');
    expect(names).toContain('angry');
    expect(names).toContain('surprised');
  });

  it('neutral preset has all sliders at 50', () => {
    const neutral = EMOTION_PRESETS.find((p) => p.id === 'expr_neutral')!;
    for (const value of Object.values(neutral.weights)) {
      expect(value).toBe(50);
    }
  });

  it('viseme presets affect mouth_width and jaw_width', () => {
    for (const v of VISEME_PRESETS) {
      expect(v.weights).toHaveProperty('face_mouth_width');
      expect(v.weights).toHaveProperty('face_jaw_width');
    }
  });
});

describe('Scenario: Expression Presets — applyPresetWeights', () => {
  beforeEach(resetStore);

  it('applies preset weights to store at full intensity', () => {
    const happy = EMOTION_PRESETS.find((p) => p.id === 'expr_happy')!;
    const s = useCharacterStore.getState();
    applyPresetWeights(happy, s.setMorphTarget, 1.0, s.morphTargets);
    const mt = useCharacterStore.getState().morphTargets;
    expect(mt.face_mouth_width).toBe(75);
    expect(mt.face_cheek).toBe(70);
  });

  it('applies preset weights at half intensity (blended)', () => {
    const happy = EMOTION_PRESETS.find((p) => p.id === 'expr_happy')!;
    const s = useCharacterStore.getState();
    applyPresetWeights(happy, s.setMorphTarget, 0.5, s.morphTargets);
    const mt = useCharacterStore.getState().morphTargets;
    // face_mouth_width: default 50, target 75, at 0.5 = 50 + (75-50)*0.5 = 62.5 → 63
    expect(mt.face_mouth_width).toBe(63);
  });

  it('applies at zero intensity (no change)', () => {
    const happy = EMOTION_PRESETS.find((p) => p.id === 'expr_happy')!;
    const s = useCharacterStore.getState();
    applyPresetWeights(happy, s.setMorphTarget, 0, s.morphTargets);
    const mt = useCharacterStore.getState().morphTargets;
    // At intensity 0, should stay at default (50)
    expect(mt.face_mouth_width).toBe(50);
  });

  it('clamps values to 0-100 range', () => {
    const extreme: ExpressionPreset = {
      id: 'test', name: 'Test', emoji: '🧪', category: 'custom',
      weights: { face_eye_size: 200 },
    };
    const s = useCharacterStore.getState();
    applyPresetWeights(extreme, s.setMorphTarget, 1.0, s.morphTargets);
    expect(useCharacterStore.getState().morphTargets.face_eye_size).toBe(100);
  });
});

describe('Scenario: Expression Presets — lerpPresets', () => {
  it('t=0 returns "from" weights', () => {
    const from = EMOTION_PRESETS.find((p) => p.id === 'expr_happy')!;
    const to = EMOTION_PRESETS.find((p) => p.id === 'expr_sad')!;
    const result = lerpPresets(from, to, 0);
    expect(result.face_mouth_width).toBe(from.weights.face_mouth_width);
  });

  it('t=1 returns "to" weights', () => {
    const from = EMOTION_PRESETS.find((p) => p.id === 'expr_happy')!;
    const to = EMOTION_PRESETS.find((p) => p.id === 'expr_sad')!;
    const result = lerpPresets(from, to, 1);
    expect(result.face_mouth_width).toBe(to.weights.face_mouth_width);
  });

  it('t=0.5 returns midpoint', () => {
    const from = EMOTION_PRESETS.find((p) => p.id === 'expr_happy')!;
    const to = EMOTION_PRESETS.find((p) => p.id === 'expr_sad')!;
    const result = lerpPresets(from, to, 0.5);
    const expectedMouth = Math.round(
      (from.weights.face_mouth_width ?? 50) * 0.5 + (to.weights.face_mouth_width ?? 50) * 0.5
    );
    expect(result.face_mouth_width).toBe(expectedMouth);
  });

  it('includes keys from both presets', () => {
    const from: ExpressionPreset = {
      id: 'a', name: 'A', emoji: '🧪', category: 'custom',
      weights: { face_eye_size: 80 },
    };
    const to: ExpressionPreset = {
      id: 'b', name: 'B', emoji: '🧪', category: 'custom',
      weights: { face_jaw_width: 60 },
    };
    const result = lerpPresets(from, to, 0.5);
    expect(result).toHaveProperty('face_eye_size');
    expect(result).toHaveProperty('face_jaw_width');
  });
});

describe('Scenario: Character Card Export', () => {
  beforeEach(resetStore);

  it('buildCharacterCard produces valid structure', () => {
    const card = buildCharacterCard({
      morphTargets: { body_height: 75 },
      skinColor: '#ff0000',
      equippedItems: {},
    });
    expect(card.version).toBe('1.0');
    expect(card.generator).toBe('HoloScript Studio');
    expect(card.character.morphTargets.body_height).toBe(75);
    expect(card.character.skinColor).toBe('#ff0000');
  });

  it('exportedAt is a valid ISO date', () => {
    const card = buildCharacterCard({ morphTargets: {}, skinColor: '#000', equippedItems: {} });
    expect(new Date(card.exportedAt).toISOString()).toBe(card.exportedAt);
  });

  it('includes equipped items in export', () => {
    const card = buildCharacterCard({
      morphTargets: {},
      skinColor: '#e8beac',
      equippedItems: {
        hair: { id: 'hair_short', name: 'Short Cut', slot: 'hair', thumbnail: '💇', category: 'hair' },
      },
    });
    expect(card.character.equippedItems.hair?.id).toBe('hair_short');
  });

  it('morphTargets are a deep copy', () => {
    const original = { body_height: 75 };
    const card = buildCharacterCard({ morphTargets: original, skinColor: '#000', equippedItems: {} });
    card.character.morphTargets.body_height = 100;
    expect(original.body_height).toBe(75); // original unchanged
  });
});
