import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InputBindings } from '@holoscript/engine/input/InputBindings';

// =============================================================================
// C249 — Input Bindings
// =============================================================================

describe('InputBindings', () => {
  let ib: InputBindings;
  beforeEach(() => {
    ib = new InputBindings();
  });

  it('constructor creates default profile', () => {
    expect(ib.getProfileCount()).toBe(1);
    expect(ib.getActiveProfile()?.name).toBe('Default');
  });

  it('createProfile adds new profile', () => {
    ib.createProfile('gamepad', 'Gamepad');
    expect(ib.getProfileCount()).toBe(2);
    expect(ib.getProfile('gamepad')?.name).toBe('Gamepad');
  });

  it('deleteProfile removes non-active profile', () => {
    ib.createProfile('extra', 'Extra');
    expect(ib.deleteProfile('extra')).toBe(true);
    expect(ib.getProfileCount()).toBe(1);
  });

  it('deleteProfile refuses to delete active profile', () => {
    expect(ib.deleteProfile('default')).toBe(false);
    expect(ib.getProfileCount()).toBe(1);
  });

  it('setActiveProfile switches profile', () => {
    ib.createProfile('custom', 'Custom');
    expect(ib.setActiveProfile('custom')).toBe(true);
    expect(ib.getActiveProfile()?.id).toBe('custom');
  });

  it('bind adds binding to active profile', () => {
    const b = ib.bind('jump', 'key', 'Space');
    expect(b).not.toBeNull();
    expect(b!.action).toBe('jump');
    expect(b!.code).toBe('Space');
  });

  it('unbind removes binding', () => {
    const b = ib.bind('jump', 'key', 'Space')!;
    expect(ib.unbind(b.id)).toBe(true);
    expect(ib.getBindingsForAction('jump')).toHaveLength(0);
  });

  it('unbindAction removes all bindings for action', () => {
    ib.bind('move', 'key', 'W');
    ib.bind('move', 'key', 'ArrowUp');
    expect(ib.unbindAction('move')).toBe(2);
  });

  it('getBindingsForAction returns matching bindings', () => {
    ib.bind('fire', 'key', 'F');
    ib.bind('fire', 'mouseButton', '0');
    ib.bind('jump', 'key', 'Space');
    expect(ib.getBindingsForAction('fire')).toHaveLength(2);
  });

  it('addCompositeAxis and resolveComposite', () => {
    ib.addCompositeAxis('horizontal', 'D', 'A');
    const keys = new Map<string, boolean>([
      ['D', true],
      ['A', false],
    ]);
    expect(ib.resolveComposite('horizontal', keys)).toBe(1);
    keys.set('D', false);
    keys.set('A', true);
    expect(ib.resolveComposite('horizontal', keys)).toBe(-1);
    keys.set('D', true);
    expect(ib.resolveComposite('horizontal', keys)).toBe(0);
  });

  it('addChord and isChordActive', () => {
    const chord = ib.addChord('save', ['Control', 'KeyS']);
    const pressed = new Set(['Control', 'KeyS']);
    expect(ib.isChordActive(chord.id, pressed)).toBe(true);
    pressed.delete('KeyS');
    expect(ib.isChordActive(chord.id, pressed)).toBe(false);
  });

  it('detectConflicts finds overlapping bindings', () => {
    ib.bind('jump', 'key', 'Space');
    ib.bind('interact', 'key', 'Space');
    const conflicts = ib.detectConflicts();
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    expect(conflicts[0].action1).toBe('jump');
    expect(conflicts[0].action2).toBe('interact');
  });

  it('exportProfile and importProfile round-trip', () => {
    ib.bind('fire', 'key', 'F');
    const json = ib.exportProfile();
    expect(json).toContain('fire');
    const imported = ib.importProfile(json);
    expect(imported).not.toBeNull();
    expect(imported!.bindings.some((b) => b.action === 'fire')).toBe(true);
  });

  it('importProfile returns null for invalid json', () => {
    expect(ib.importProfile('not json')).toBeNull();
    expect(ib.importProfile('{}')).toBeNull();
  });
});
