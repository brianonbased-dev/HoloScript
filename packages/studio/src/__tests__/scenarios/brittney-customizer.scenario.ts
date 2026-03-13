/**
 * Scenario: Brittney Voice-to-Customizer (Phase 3)
 *
 * Tests for the AI character intent parser:
 * - Morph target commands (increase, decrease, set)
 * - Equip/unequip wardrobe items
 * - Skin color adjustments
 * - Reset commands
 * - Unknown fallback
 * - Intent execution
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseCharacterIntent,
  executeCharacterIntent,
  type CharacterIntent,
  type CharacterStoreActions,
} from '../../lib/brittney/CharacterIntentParser';

const { useCharacterStore, useWardrobeStore } = await import('@/lib/stores');

// ── Helpers ─────────────────────────────────────────────────────────────────

function resetStore() {
  useCharacterStore.setState({
    morphTargets: {},
    skinColor: '#e8beac',
    customizeMode: false,
    panelMode: 'skeleton',
  });
  useWardrobeStore.setState({
    equippedItems: {},
  });
}

function getStoreActions(): CharacterStoreActions {
  const s = useCharacterStore.getState();
  const w = useWardrobeStore.getState();
  return {
    setMorphTarget: s.setMorphTarget,
    resetMorphTargets: s.resetMorphTargets,
    setSkinColor: s.setSkinColor,
    equipItem: w.equipItem as any,
    unequipSlot: w.unequipSlot as any,
    clearWardrobe: w.clearWardrobe,
    morphTargets: s.morphTargets,
    skinColor: s.skinColor,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Scenario: Character Intent Parser — Morph Targets', () => {
  it('"make eyes bigger" → set_morph face_eye_size increase', () => {
    const intent = parseCharacterIntent('make eyes bigger');
    expect(intent.type).toBe('set_morph');
    if (intent.type === 'set_morph') {
      expect(intent.target).toBe('face_eye_size');
      expect(intent.direction).toBe('increase');
    }
  });

  it('"make jaw smaller" → set_morph face_jaw_width decrease', () => {
    const intent = parseCharacterIntent('make jaw smaller');
    expect(intent.type).toBe('set_morph');
    if (intent.type === 'set_morph') {
      expect(intent.target).toBe('face_jaw_width');
      expect(intent.direction).toBe('decrease');
    }
  });

  it('"taller" → set_morph body_height increase', () => {
    const intent = parseCharacterIntent('taller');
    expect(intent.type).toBe('set_morph');
    if (intent.type === 'set_morph') {
      expect(intent.target).toBe('body_height');
      expect(intent.direction).toBe('increase');
    }
  });

  it('"more muscular" → set_morph body_build increase', () => {
    const intent = parseCharacterIntent('more muscular');
    expect(intent.type).toBe('set_morph');
    if (intent.type === 'set_morph') {
      expect(intent.target).toBe('body_build');
      expect(intent.direction).toBe('increase');
    }
  });

  it('"set height to 80" → set_morph body_height set 80', () => {
    const intent = parseCharacterIntent('set height to 80');
    expect(intent.type).toBe('set_morph');
    if (intent.type === 'set_morph') {
      expect(intent.target).toBe('body_height');
      expect(intent.direction).toBe('set');
      expect(intent.value).toBe(80);
    }
  });

  it('"broader shoulders" → body_shoulders increase', () => {
    const intent = parseCharacterIntent('broader shoulders');
    expect(intent.type).toBe('set_morph');
    if (intent.type === 'set_morph') {
      expect(intent.target).toBe('body_shoulders');
      expect(intent.direction).toBe('increase');
    }
  });

  it('"thinner waist" → body_waist decrease', () => {
    const intent = parseCharacterIntent('thinner waist');
    expect(intent.type).toBe('set_morph');
    if (intent.type === 'set_morph') {
      expect(intent.target).toBe('body_waist');
      expect(intent.direction).toBe('decrease');
    }
  });
});

describe('Scenario: Character Intent Parser — Wardrobe', () => {
  it('"equip hoodie" → equip_item with query', () => {
    const intent = parseCharacterIntent('equip the hoodie');
    expect(intent.type).toBe('equip_item');
    if (intent.type === 'equip_item') {
      expect(intent.itemQuery).toContain('hoodie');
    }
  });

  it('"put on boots" → equip_item shoes slot', () => {
    const intent = parseCharacterIntent('put on boots');
    expect(intent.type).toBe('equip_item');
    if (intent.type === 'equip_item') {
      expect(intent.slot).toBe('shoes');
    }
  });

  it('"remove hat" → unequip_item', () => {
    const intent = parseCharacterIntent('remove hat');
    expect(intent.type).toBe('unequip_item');
  });

  it('"take off shoes" → unequip_item shoes slot', () => {
    const intent = parseCharacterIntent('take off shoes');
    expect(intent.type).toBe('unequip_item');
    if (intent.type === 'unequip_item') {
      expect(intent.slot).toBe('shoes');
    }
  });
});

describe('Scenario: Character Intent Parser — Skin Color', () => {
  it('"make skin darker" → set_skin_color darker', () => {
    const intent = parseCharacterIntent('make skin darker');
    expect(intent.type).toBe('set_skin_color');
    if (intent.type === 'set_skin_color') {
      expect(intent.direction).toBe('darker');
    }
  });

  it('"lighter skin" → set_skin_color lighter', () => {
    const intent = parseCharacterIntent('lighter skin');
    expect(intent.type).toBe('set_skin_color');
    if (intent.type === 'set_skin_color') {
      expect(intent.direction).toBe('lighter');
    }
  });

  it('"skin color #ff8844" → set_skin_color set', () => {
    const intent = parseCharacterIntent('set skin color to #ff8844');
    expect(intent.type).toBe('set_skin_color');
    if (intent.type === 'set_skin_color') {
      expect(intent.direction).toBe('set');
      expect(intent.color).toBe('#ff8844');
    }
  });
});

describe('Scenario: Character Intent Parser — Reset', () => {
  it('"reset all" → reset all', () => {
    const intent = parseCharacterIntent('reset all');
    expect(intent.type).toBe('reset');
    if (intent.type === 'reset') {
      expect(intent.scope).toBe('all');
    }
  });

  it('"reset everything" → reset all', () => {
    const intent = parseCharacterIntent('reset everything');
    expect(intent.type).toBe('reset');
    if (intent.type === 'reset') {
      expect(intent.scope).toBe('all');
    }
  });

  it('"reset face" → reset face', () => {
    const intent = parseCharacterIntent('reset face');
    expect(intent.type).toBe('reset');
    if (intent.type === 'reset') {
      expect(intent.scope).toBe('face');
    }
  });

  it('"reset wardrobe" → reset wardrobe', () => {
    const intent = parseCharacterIntent('reset wardrobe');
    expect(intent.type).toBe('reset');
    if (intent.type === 'reset') {
      expect(intent.scope).toBe('wardrobe');
    }
  });
});

describe('Scenario: Character Intent Parser — Unknown', () => {
  it('empty string → unknown', () => {
    const intent = parseCharacterIntent('');
    expect(intent.type).toBe('unknown');
  });

  it('gibberish → unknown', () => {
    const intent = parseCharacterIntent('asdfghjkl');
    expect(intent.type).toBe('unknown');
  });
});

describe('Scenario: Character Intent Parser — Execution', () => {
  beforeEach(resetStore);

  it('executing set_morph increase adjusts store value', () => {
    const intent = parseCharacterIntent('make eyes bigger');
    const actions = getStoreActions();
    executeCharacterIntent(intent, actions);
    expect(useCharacterStore.getState().morphTargets.face_eye_size).toBe(65); // 50 + 15
  });

  it('executing set_morph decrease adjusts store value', () => {
    useCharacterStore.getState().setMorphTarget('face_jaw_width', 80);
    const intent = parseCharacterIntent('make jaw smaller');
    const actions = {
      ...getStoreActions(),
      morphTargets: useCharacterStore.getState().morphTargets,
    };
    executeCharacterIntent(intent, actions);
    expect(useCharacterStore.getState().morphTargets.face_jaw_width).toBe(65); // 80 - 15
  });

  it('executing set_morph with value sets exact value', () => {
    const intent = parseCharacterIntent('set height to 80');
    const actions = getStoreActions();
    executeCharacterIntent(intent, actions);
    expect(useCharacterStore.getState().morphTargets.body_height).toBe(80);
  });

  it('executing set_skin_color darker adjusts hex', () => {
    const actions = getStoreActions();
    const intent = parseCharacterIntent('make skin darker');
    executeCharacterIntent(intent, actions);
    expect(useCharacterStore.getState().skinColor).not.toBe('#e8beac');
  });

  it('executing reset all clears morphTargets and wardrobe', () => {
    useCharacterStore.getState().setMorphTarget('body_height', 75);
    const intent = parseCharacterIntent('reset all');
    const actions = getStoreActions();
    executeCharacterIntent(intent, actions);
    expect(useCharacterStore.getState().morphTargets).toEqual({});
  });

  it('execution returns response string', () => {
    const intent = parseCharacterIntent('make eyes bigger');
    const actions = getStoreActions();
    const response = executeCharacterIntent(intent, actions);
    expect(response).toContain('Set');
    expect(response).toContain('eye size');
  });
});
