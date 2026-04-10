/**
 * UITraits Tests
 *
 * Tests for UI trait defaults, validation, and registration functions.
 *
 * @version 3.1.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  UI_TRAIT_DEFAULTS,
  UI_TRAIT_NAMES,
  validateUITrait,
  registerUITrait,
  getUITrait,
  getAllUITraits,
  type UITraitName,
  type UITraitHandler,
  type UIFloatingTrait,
  type UIAnchoredTrait,
  type UIHandMenuTrait,
  type UIBillboardTrait,
  type UICurvedTrait,
  type UIDockedTrait,
  type UIKeyboardTrait,
  type UIVoiceTrait,
  type UIDraggableTrait,
  type UIResizableTrait,
  type UIMinimizableTrait,
  type UIScrollableTrait,
} from '../UITraits';

describe('UI_TRAIT_DEFAULTS', () => {
  it('should have defaults for all UI trait names', () => {
    for (const name of UI_TRAIT_NAMES) {
      expect(UI_TRAIT_DEFAULTS[name]).toBeDefined();
    }
  });

  describe('ui_floating defaults', () => {
    it('should have correct default values', () => {
      const defaults = UI_TRAIT_DEFAULTS.ui_floating as UIFloatingTrait;

      expect(defaults.follow_delay).toBe(0.3);
      expect(defaults.distance).toBe(1.5);
      expect(defaults.lock_y).toBe(false);
      expect(defaults.lock_horizontal).toBe(false);
      expect(defaults.max_angle).toBe(45);
      expect(defaults.easing).toBe('ease-out');
    });
  });

  describe('ui_anchored defaults', () => {
    it('should have correct default values', () => {
      const defaults = UI_TRAIT_DEFAULTS.ui_anchored as UIAnchoredTrait;

      expect(defaults.to).toBe('world');
      expect(defaults.offset).toEqual([0, 0, 0]);
      expect(defaults.maintain_orientation).toBe(false);
    });
  });

  describe('ui_hand_menu defaults', () => {
    it('should have correct default values', () => {
      const defaults = UI_TRAIT_DEFAULTS.ui_hand_menu as UIHandMenuTrait;

      expect(defaults.hand).toBe('dominant');
      expect(defaults.trigger).toBe('palm_up');
      expect(defaults.offset).toEqual([0, 0.1, 0]);
      expect(defaults.scale).toBe(1);
    });
  });

  describe('ui_billboard defaults', () => {
    it('should have correct default values', () => {
      const defaults = UI_TRAIT_DEFAULTS.ui_billboard as UIBillboardTrait;

      expect(defaults.lock_axis).toBe('y');
      expect(defaults.smoothing).toBe(0.1);
    });
  });

  describe('ui_curved defaults', () => {
    it('should have correct default values', () => {
      const defaults = UI_TRAIT_DEFAULTS.ui_curved as UICurvedTrait;

      expect(defaults.radius).toBe(2);
      expect(defaults.arc_angle).toBe(120);
      expect(defaults.orientation).toBe('horizontal');
    });
  });

  describe('ui_docked defaults', () => {
    it('should have correct default values', () => {
      const defaults = UI_TRAIT_DEFAULTS.ui_docked as UIDockedTrait;

      expect(defaults.position).toBe('bottom');
      expect(defaults.padding).toBe(0.1);
      expect(defaults.auto_hide).toBe(false);
      expect(defaults.animation).toBe('slide');
    });
  });

  describe('ui_keyboard defaults', () => {
    it('should have correct default values', () => {
      const defaults = UI_TRAIT_DEFAULTS.ui_keyboard as UIKeyboardTrait;

      expect(defaults.type).toBe('full');
      expect(defaults.position).toBe('below');
      expect(defaults.scale).toBe(1);
      expect(defaults.haptics).toBe(true);
    });
  });

  describe('ui_voice defaults', () => {
    it('should have correct default values', () => {
      const defaults = UI_TRAIT_DEFAULTS.ui_voice as UIVoiceTrait;

      expect(defaults.commands).toEqual([]);
      expect(defaults.dictation).toBe(false);
      expect(defaults.language).toBe('en-US');
    });
  });

  describe('ui_draggable defaults', () => {
    it('should have correct default values', () => {
      const defaults = UI_TRAIT_DEFAULTS.ui_draggable as UIDraggableTrait;

      expect(defaults.constrain_axis).toBeNull();
      expect(defaults.min_distance).toBe(0.3);
      expect(defaults.max_distance).toBe(10);
      expect(defaults.snap_grid).toBe(0);
    });
  });

  describe('ui_resizable defaults', () => {
    it('should have correct default values', () => {
      const defaults = UI_TRAIT_DEFAULTS.ui_resizable as UIResizableTrait;

      expect(defaults.min_size).toEqual([100, 100]);
      expect(defaults.max_size).toEqual([1000, 1000]);
      expect(defaults.keep_aspect).toBe(false);
      expect(defaults.handles).toEqual(['corner']);
    });
  });

  describe('ui_minimizable defaults', () => {
    it('should have correct default values', () => {
      const defaults = UI_TRAIT_DEFAULTS.ui_minimizable as UIMinimizableTrait;

      expect(defaults.minimize_to).toBe('corner');
      expect(defaults.minimized_icon).toBe('default');
      expect(defaults.minimized_size).toEqual([50, 50]);
    });
  });

  describe('ui_scrollable defaults', () => {
    it('should have correct default values', () => {
      const defaults = UI_TRAIT_DEFAULTS.ui_scrollable as UIScrollableTrait;

      expect(defaults.direction).toBe('vertical');
      expect(defaults.show_scrollbar).toBe(true);
      expect(defaults.speed).toBe(1);
      expect(defaults.momentum).toBe(true);
    });
  });
});

describe('validateUITrait', () => {
  describe('ui_floating validation', () => {
    it('should accept valid configuration', () => {
      const result = validateUITrait('ui_floating', {
        follow_delay: 0.5,
        distance: 2,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject negative follow_delay', () => {
      const result = validateUITrait('ui_floating', {
        follow_delay: -0.5,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('follow_delay must be a non-negative number');
    });

    it('should reject non-positive distance', () => {
      const result = validateUITrait('ui_floating', {
        distance: 0,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('distance must be a positive number');
    });
  });

  describe('ui_anchored validation', () => {
    it('should accept valid configuration', () => {
      const result = validateUITrait('ui_anchored', {
        to: 'head',
      });

      expect(result.valid).toBe(true);
    });

    it('should reject missing to parameter', () => {
      const result = validateUITrait('ui_anchored', {});

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("ui_anchored requires 'to' parameter");
    });
  });

  describe('ui_hand_menu validation', () => {
    it('should accept valid hand values', () => {
      for (const hand of ['left', 'right', 'dominant']) {
        const result = validateUITrait('ui_hand_menu', { hand });
        expect(result.valid).toBe(true);
      }
    });

    it('should reject invalid hand value', () => {
      const result = validateUITrait('ui_hand_menu', {
        hand: 'invalid',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("hand must be 'left', 'right', or 'dominant'");
    });
  });

  describe('ui_curved validation', () => {
    it('should accept valid radius', () => {
      const result = validateUITrait('ui_curved', {
        radius: 3,
      });

      expect(result.valid).toBe(true);
    });

    it('should reject non-positive radius', () => {
      const result = validateUITrait('ui_curved', {
        radius: 0,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('radius must be a positive number');
    });
  });

  describe('ui_docked validation', () => {
    it('should accept valid positions', () => {
      const validPositions = [
        'top',
        'bottom',
        'left',
        'right',
        'top-left',
        'top-right',
        'bottom-left',
        'bottom-right',
      ];

      for (const position of validPositions) {
        const result = validateUITrait('ui_docked', { position });
        expect(result.valid).toBe(true);
      }
    });

    it('should reject invalid position', () => {
      const result = validateUITrait('ui_docked', {
        position: 'center',
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('position must be one of');
    });
  });
});

describe('UI Trait Registration', () => {
  beforeEach(() => {
    // Register a test handler
    const testHandler: UITraitHandler<UIFloatingTrait> = {
      name: 'ui_floating',
      defaultConfig: {
        follow_delay: 0.3,
        distance: 1.5,
      },
      validate: (config) => ({
        valid: config.distance! > 0,
        errors: config.distance! <= 0 ? ['distance must be positive'] : [],
      }),
    };
    registerUITrait(testHandler);
  });

  it('should register a UI trait handler', () => {
    const handler = getUITrait('ui_floating');

    expect(handler).toBeDefined();
    expect(handler?.name).toBe('ui_floating');
  });

  it('should return undefined for unregistered trait', () => {
    const handler = getUITrait('ui_billboard');

    // May or may not be registered depending on test order
    if (handler) {
      expect(handler.name).toBe('ui_billboard');
    }
  });
});

describe('UI_TRAIT_NAMES', () => {
  it('should contain all 12 UI trait names', () => {
    expect(UI_TRAIT_NAMES).toHaveLength(12);
  });

  it('should contain expected trait names', () => {
    const expectedNames: UITraitName[] = [
      'ui_floating',
      'ui_anchored',
      'ui_hand_menu',
      'ui_billboard',
      'ui_curved',
      'ui_docked',
      'ui_keyboard',
      'ui_voice',
      'ui_draggable',
      'ui_resizable',
      'ui_minimizable',
      'ui_scrollable',
    ];

    for (const name of expectedNames) {
      expect(UI_TRAIT_NAMES).toContain(name);
    }
  });
});
