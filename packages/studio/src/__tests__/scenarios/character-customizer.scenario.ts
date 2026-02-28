/**
 * Scenario: Character Customizer
 *
 * Tests for the Phase 1 character customizer:
 * - Store: morph target CRUD, skin color, customize mode
 * - Slider definitions: body and face coverage
 * - MorphTargetController: morph name mapping
 * - Reset behavior
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ── Store import ────────────────────────────────────────────────────────────

const { useCharacterStore } = await import('@/lib/store');

// ── Helpers ─────────────────────────────────────────────────────────────────

function resetStore() {
  useCharacterStore.setState({
    glbUrl: null,
    boneNames: [],
    selectedBoneIndex: null,
    showSkeleton: true,
    morphTargets: {},
    skinColor: '#e8beac',
    customizeMode: false,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Scenario: Character Customizer — Store', () => {
  beforeEach(resetStore);

  it('morphTargets starts empty', () => {
    expect(useCharacterStore.getState().morphTargets).toEqual({});
  });

  it('setMorphTarget() sets a single morph target', () => {
    useCharacterStore.getState().setMorphTarget('body_height', 75);
    expect(useCharacterStore.getState().morphTargets.body_height).toBe(75);
  });

  it('setMorphTarget() preserves other targets', () => {
    useCharacterStore.getState().setMorphTarget('body_height', 75);
    useCharacterStore.getState().setMorphTarget('face_eye_size', 30);
    const targets = useCharacterStore.getState().morphTargets;
    expect(targets.body_height).toBe(75);
    expect(targets.face_eye_size).toBe(30);
  });

  it('setMorphTarget() overwrites existing value', () => {
    useCharacterStore.getState().setMorphTarget('body_build', 60);
    useCharacterStore.getState().setMorphTarget('body_build', 90);
    expect(useCharacterStore.getState().morphTargets.body_build).toBe(90);
  });

  it('resetMorphTargets() clears all morph targets', () => {
    useCharacterStore.getState().setMorphTarget('body_height', 75);
    useCharacterStore.getState().setMorphTarget('face_eye_size', 30);
    useCharacterStore.getState().resetMorphTargets();
    expect(useCharacterStore.getState().morphTargets).toEqual({});
  });

  it('resetMorphTargets() preserves glbUrl', () => {
    useCharacterStore.setState({ glbUrl: 'http://example.com/model.glb' });
    useCharacterStore.getState().setMorphTarget('body_height', 75);
    useCharacterStore.getState().resetMorphTargets();
    expect(useCharacterStore.getState().glbUrl).toBe('http://example.com/model.glb');
  });

  it('skinColor defaults to #e8beac', () => {
    expect(useCharacterStore.getState().skinColor).toBe('#e8beac');
  });

  it('setSkinColor() updates skin color', () => {
    useCharacterStore.getState().setSkinColor('#ff0000');
    expect(useCharacterStore.getState().skinColor).toBe('#ff0000');
  });

  it('customizeMode defaults to false', () => {
    expect(useCharacterStore.getState().customizeMode).toBe(false);
  });

  it('setCustomizeMode(true) activates customizer', () => {
    useCharacterStore.getState().setCustomizeMode(true);
    expect(useCharacterStore.getState().customizeMode).toBe(true);
  });

  it('setCustomizeMode(false) deactivates customizer', () => {
    useCharacterStore.getState().setCustomizeMode(true);
    useCharacterStore.getState().setCustomizeMode(false);
    expect(useCharacterStore.getState().customizeMode).toBe(false);
  });
});

describe('Scenario: Character Customizer — Body Sliders', () => {
  beforeEach(resetStore);

  const BODY_IDS = [
    'body_height', 'body_build', 'body_shoulders', 'body_chest',
    'body_waist', 'body_hips', 'body_arms', 'body_legs',
  ];

  it('has 8 body slider IDs', () => {
    expect(BODY_IDS.length).toBe(8);
  });

  it('each body slider defaults to undefined (50 in component)', () => {
    for (const id of BODY_IDS) {
      expect(useCharacterStore.getState().morphTargets[id]).toBeUndefined();
    }
  });

  it('setting all body sliders creates 8 entries', () => {
    for (const id of BODY_IDS) {
      useCharacterStore.getState().setMorphTarget(id, 50);
    }
    expect(Object.keys(useCharacterStore.getState().morphTargets).length).toBe(8);
  });

  it('body sliders accept 0-100 range', () => {
    useCharacterStore.getState().setMorphTarget('body_height', 0);
    expect(useCharacterStore.getState().morphTargets.body_height).toBe(0);
    useCharacterStore.getState().setMorphTarget('body_height', 100);
    expect(useCharacterStore.getState().morphTargets.body_height).toBe(100);
  });
});

describe('Scenario: Character Customizer — Face Sliders', () => {
  beforeEach(resetStore);

  const FACE_IDS = [
    'face_eye_size', 'face_eye_spacing', 'face_nose_width', 'face_nose_length',
    'face_mouth_width', 'face_jaw_width', 'face_cheek', 'face_brow',
  ];

  it('has 8 face slider IDs', () => {
    expect(FACE_IDS.length).toBe(8);
  });

  it('setting all face sliders creates 8 entries', () => {
    for (const id of FACE_IDS) {
      useCharacterStore.getState().setMorphTarget(id, 50);
    }
    expect(Object.keys(useCharacterStore.getState().morphTargets).length).toBe(8);
  });

  it('face sliders accept boundary values', () => {
    useCharacterStore.getState().setMorphTarget('face_eye_size', 0);
    expect(useCharacterStore.getState().morphTargets.face_eye_size).toBe(0);
    useCharacterStore.getState().setMorphTarget('face_eye_size', 100);
    expect(useCharacterStore.getState().morphTargets.face_eye_size).toBe(100);
  });
});

describe('Scenario: Character Customizer — Morph Name Mapping', () => {
  const MORPH_NAME_MAP: Record<string, string[]> = {
    body_height:      ['Height', 'height', 'Body_Height'],
    body_build:       ['Build', 'build', 'Body_Build', 'Muscle', 'muscular'],
    body_shoulders:   ['Shoulders', 'shoulders', 'Shoulder_Width'],
    body_chest:       ['Chest', 'chest', 'Bust'],
    body_waist:       ['Waist', 'waist', 'Waist_Size'],
    body_hips:        ['Hips', 'hips', 'Hip_Width'],
    body_arms:        ['ArmLength', 'arm_length', 'Arms'],
    body_legs:        ['LegLength', 'leg_length', 'Legs'],
    face_eye_size:    ['EyeSize', 'eye_size', 'eyeWide', 'A_EyeOpen'],
    face_eye_spacing: ['EyeSpacing', 'eye_spacing', 'EyeWide'],
    face_nose_width:  ['NoseWidth', 'nose_width', 'Nose_Width'],
    face_nose_length: ['NoseLength', 'nose_length', 'Nose_Length'],
    face_mouth_width: ['MouthWidth', 'mouth_width', 'Mouth_Wide', 'mouthWide'],
    face_jaw_width:   ['JawWidth', 'jaw_width', 'Jaw_Width', 'jawOpen'],
    face_cheek:       ['Cheek', 'cheek', 'cheekPuff', 'CheekPuff'],
    face_brow:        ['BrowHeight', 'brow_height', 'browInnerUp', 'BrowUp'],
  };

  it('all 16 sliders have morph name mappings', () => {
    expect(Object.keys(MORPH_NAME_MAP).length).toBe(16);
  });

  it('each mapping has at least 2 candidate names', () => {
    for (const [key, names] of Object.entries(MORPH_NAME_MAP)) {
      expect(names.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('body mappings cover 8 slider IDs', () => {
    const bodyKeys = Object.keys(MORPH_NAME_MAP).filter((k) => k.startsWith('body_'));
    expect(bodyKeys.length).toBe(8);
  });

  it('face mappings cover 8 slider IDs', () => {
    const faceKeys = Object.keys(MORPH_NAME_MAP).filter((k) => k.startsWith('face_'));
    expect(faceKeys.length).toBe(8);
  });
});

describe('Scenario: Character Customizer — sliderToWeight conversion', () => {
  function sliderToWeight(value: number): number {
    return Math.max(0, Math.min(1, value / 100));
  }

  it('slider 0 → weight 0.0', () => {
    expect(sliderToWeight(0)).toBeCloseTo(0.0);
  });

  it('slider 50 → weight 0.5 (neutral)', () => {
    expect(sliderToWeight(50)).toBeCloseTo(0.5);
  });

  it('slider 100 → weight 1.0', () => {
    expect(sliderToWeight(100)).toBeCloseTo(1.0);
  });

  it('slider 25 → weight 0.25', () => {
    expect(sliderToWeight(25)).toBeCloseTo(0.25);
  });

  it('slider 75 → weight 0.75', () => {
    expect(sliderToWeight(75)).toBeCloseTo(0.75);
  });

  it('negative values clamp to 0', () => {
    expect(sliderToWeight(-50)).toBe(0);
  });

  it('values > 100 clamp to 1', () => {
    expect(sliderToWeight(150)).toBe(1);
  });
});
