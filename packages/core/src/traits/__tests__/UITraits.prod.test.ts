/**
 * UITraits Production Tests
 *
 * Covers the spatial UI trait module:
 * - UI_TRAIT_DEFAULTS — all 12 trait configs
 * - UI_TRAIT_NAMES — constants array
 * - validateUITrait — validation logic per trait
 * - registerUITrait / getUITrait / getAllUITraits — registration registry
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
} from '../UITraits';

// ─── Tests: UI_TRAIT_NAMES ───────────────────────────────────────────────────

describe('UI_TRAIT_NAMES', () => {

  it('contains 12 trait names', () => {
    expect(UI_TRAIT_NAMES).toHaveLength(12);
  });

  it('includes ui_floating', () => {
    expect(UI_TRAIT_NAMES).toContain('ui_floating');
  });

  it('includes ui_anchored', () => {
    expect(UI_TRAIT_NAMES).toContain('ui_anchored');
  });

  it('includes ui_hand_menu', () => {
    expect(UI_TRAIT_NAMES).toContain('ui_hand_menu');
  });

  it('includes ui_billboard', () => {
    expect(UI_TRAIT_NAMES).toContain('ui_billboard');
  });

  it('includes ui_curved', () => {
    expect(UI_TRAIT_NAMES).toContain('ui_curved');
  });

  it('includes ui_docked', () => {
    expect(UI_TRAIT_NAMES).toContain('ui_docked');
  });

  it('includes ui_keyboard', () => {
    expect(UI_TRAIT_NAMES).toContain('ui_keyboard');
  });

  it('includes ui_voice', () => {
    expect(UI_TRAIT_NAMES).toContain('ui_voice');
  });

  it('includes ui_scrollable', () => {
    expect(UI_TRAIT_NAMES).toContain('ui_scrollable');
  });
});

// ─── Tests: UI_TRAIT_DEFAULTS ────────────────────────────────────────────────

describe('UI_TRAIT_DEFAULTS', () => {

  it('covers all 12 trait names', () => {
    const keys = Object.keys(UI_TRAIT_DEFAULTS);
    expect(keys).toHaveLength(12);
  });

  it('ui_floating defaults: follow_delay=0.3, distance=1.5', () => {
    const d = UI_TRAIT_DEFAULTS.ui_floating;
    expect(d.follow_delay).toBe(0.3);
    expect(d.distance).toBe(1.5);
    expect(d.lock_y).toBe(false);
    expect(d.easing).toBe('ease-out');
    expect(d.max_angle).toBe(45);
  });

  it('ui_anchored defaults: to=world, maintain_orientation=false', () => {
    const d = UI_TRAIT_DEFAULTS.ui_anchored;
    expect(d.to).toBe('world');
    expect(d.maintain_orientation).toBe(false);
  });

  it('ui_hand_menu defaults: hand=dominant, trigger=palm_up', () => {
    const d = UI_TRAIT_DEFAULTS.ui_hand_menu;
    expect(d.hand).toBe('dominant');
    expect(d.trigger).toBe('palm_up');
  });

  it('ui_billboard defaults: lock_axis=y, smoothing=0.1', () => {
    const d = UI_TRAIT_DEFAULTS.ui_billboard;
    expect(d.lock_axis).toBe('y');
    expect(d.smoothing).toBe(0.1);
  });

  it('ui_curved defaults: radius=2, arc_angle=120', () => {
    const d = UI_TRAIT_DEFAULTS.ui_curved;
    expect(d.radius).toBe(2);
    expect(d.arc_angle).toBe(120);
    expect(d.orientation).toBe('horizontal');
  });

  it('ui_docked defaults: position=bottom, auto_hide=false', () => {
    const d = UI_TRAIT_DEFAULTS.ui_docked;
    expect(d.position).toBe('bottom');
    expect(d.auto_hide).toBe(false);
    expect(d.animation).toBe('slide');
  });

  it('ui_keyboard defaults: type=full, haptics=true', () => {
    const d = UI_TRAIT_DEFAULTS.ui_keyboard;
    expect(d.type).toBe('full');
    expect(d.haptics).toBe(true);
  });

  it('ui_voice defaults: dictation=false, language=en-US', () => {
    const d = UI_TRAIT_DEFAULTS.ui_voice;
    expect(d.dictation).toBe(false);
    expect(d.language).toBe('en-US');
  });

  it('ui_draggable defaults: snap_grid=0, constrain_axis=null', () => {
    const d = UI_TRAIT_DEFAULTS.ui_draggable;
    expect(d.snap_grid).toBe(0);
    expect(d.constrain_axis).toBeNull();
    expect(d.min_distance).toBe(0.3);
    expect(d.max_distance).toBe(10);
  });

  it('ui_resizable defaults: keep_aspect=false', () => {
    const d = UI_TRAIT_DEFAULTS.ui_resizable;
    expect(d.keep_aspect).toBe(false);
    expect(Array.isArray(d.min_size)).toBe(true);
  });

  it('ui_minimizable defaults: minimize_to=corner', () => {
    const d = UI_TRAIT_DEFAULTS.ui_minimizable;
    expect(d.minimize_to).toBe('corner');
    expect(d.minimized_icon).toBe('default');
  });

  it('ui_scrollable defaults: direction=vertical, momentum=true', () => {
    const d = UI_TRAIT_DEFAULTS.ui_scrollable;
    expect(d.direction).toBe('vertical');
    expect(d.show_scrollbar).toBe(true);
    expect(d.momentum).toBe(true);
    expect(d.speed).toBe(1);
  });
});

// ─── Tests: validateUITrait — ui_floating ────────────────────────────────────

describe('validateUITrait — ui_floating', () => {

  it('valid config returns {valid:true, errors:[]}', () => {
    const r = validateUITrait('ui_floating', { follow_delay: 0.5, distance: 2 });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('negative follow_delay fails', () => {
    const r = validateUITrait('ui_floating', { follow_delay: -1 });
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/follow_delay/);
  });

  it('zero distance fails', () => {
    const r = validateUITrait('ui_floating', { distance: 0 });
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/distance/);
  });

  it('undefined optional fields are valid', () => {
    const r = validateUITrait('ui_floating', {});
    expect(r.valid).toBe(true);
  });
});

// ─── Tests: validateUITrait — ui_anchored ────────────────────────────────────

describe('validateUITrait — ui_anchored', () => {

  it('missing "to" fails', () => {
    const r = validateUITrait('ui_anchored', {});
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/'to'/);
  });

  it('valid "to" field passes', () => {
    const r = validateUITrait('ui_anchored', { to: 'head' });
    expect(r.valid).toBe(true);
  });
});

// ─── Tests: validateUITrait — ui_hand_menu ───────────────────────────────────

describe('validateUITrait — ui_hand_menu', () => {

  it('invalid hand value fails', () => {
    const r = validateUITrait('ui_hand_menu', { hand: 'foot' });
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/hand/);
  });

  it('valid hand values pass', () => {
    for (const h of ['left', 'right', 'dominant']) {
      expect(validateUITrait('ui_hand_menu', { hand: h }).valid).toBe(true);
    }
  });
});

// ─── Tests: validateUITrait — ui_curved ──────────────────────────────────────

describe('validateUITrait — ui_curved', () => {

  it('zero radius fails', () => {
    const r = validateUITrait('ui_curved', { radius: 0 });
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/radius/);
  });

  it('positive radius passes', () => {
    const r = validateUITrait('ui_curved', { radius: 3 });
    expect(r.valid).toBe(true);
  });
});

// ─── Tests: validateUITrait — ui_docked ──────────────────────────────────────

describe('validateUITrait — ui_docked', () => {

  it('invalid position fails', () => {
    const r = validateUITrait('ui_docked', { position: 'center' });
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/position/);
  });

  it('all valid position values pass', () => {
    for (const pos of ['top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right']) {
      expect(validateUITrait('ui_docked', { position: pos }).valid).toBe(true);
    }
  });
});

// ─── Tests: validateUITrait — unrecognized traits pass ───────────────────────

describe('validateUITrait — traits without extra rules', () => {

  it('ui_billboard with any config passes (no extra validation)', () => {
    const r = validateUITrait('ui_billboard', { lock_axis: 'x', smoothing: 0.5 });
    expect(r.valid).toBe(true);
  });

  it('ui_keyboard passes unchecked fields', () => {
    const r = validateUITrait('ui_keyboard', { type: 'numeric', haptics: false });
    expect(r.valid).toBe(true);
  });
});

// ─── Tests: Registry ─────────────────────────────────────────────────────────

describe('registerUITrait / getUITrait / getAllUITraits', () => {

  it('getUITrait returns undefined for unregistered trait', () => {
    // Fresh registration state (using a unique name not registered in previous imports)
    expect(getUITrait('ui_floating')).toBeUndefined();
  });

  it('registerUITrait and getUITrait round-trip', () => {
    const handler = {
      name: 'ui_floating' as UITraitName,
      defaultConfig: { follow_delay: 0.3, distance: 1.5 },
    };
    registerUITrait(handler);
    const retrieved = getUITrait('ui_floating');
    expect(retrieved).toBe(handler);
  });

  it('getAllUITraits returns all registered names', () => {
    const all = getAllUITraits();
    expect(all).toContain('ui_floating');
  });

  it('registering second handler for same name overwrites first', () => {
    const h1 = { name: 'ui_billboard' as UITraitName, defaultConfig: { smoothing: 0.1 } };
    const h2 = { name: 'ui_billboard' as UITraitName, defaultConfig: { smoothing: 0.5 } };
    registerUITrait(h1);
    registerUITrait(h2);
    expect(getUITrait('ui_billboard')).toBe(h2);
  });
});
