import { describe, it, expect, beforeEach } from 'vitest';
import { InputBindings } from '../InputBindings';

describe('InputBindings', () => {
  let bindings: InputBindings;

  beforeEach(() => { bindings = new InputBindings(); });

  // ---------------------------------------------------------------------------
  // Profile Management
  // ---------------------------------------------------------------------------

  it('starts with a default profile', () => {
    expect(bindings.getProfileCount()).toBe(1);
    expect(bindings.getActiveProfile()?.id).toBe('default');
  });

  it('createProfile adds a new profile', () => {
    bindings.createProfile('custom', 'Custom');
    expect(bindings.getProfileCount()).toBe(2);
  });

  it('setActiveProfile switches profile', () => {
    bindings.createProfile('p2', 'Profile 2');
    expect(bindings.setActiveProfile('p2')).toBe(true);
    expect(bindings.getActiveProfile()?.id).toBe('p2');
  });

  it('setActiveProfile rejects unknown id', () => {
    expect(bindings.setActiveProfile('nope')).toBe(false);
  });

  it('deleteProfile cannot delete active profile', () => {
    expect(bindings.deleteProfile('default')).toBe(false);
  });

  it('deleteProfile removes inactive profile', () => {
    bindings.createProfile('temp', 'Temp');
    expect(bindings.deleteProfile('temp')).toBe(true);
    expect(bindings.getProfileCount()).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Binding Management
  // ---------------------------------------------------------------------------

  it('bind adds binding to active profile', () => {
    const b = bindings.bind('jump', 'key', 'Space');
    expect(b).not.toBeNull();
    expect(bindings.getBindingsForAction('jump')).toHaveLength(1);
  });

  it('unbind removes individual binding', () => {
    const b = bindings.bind('fire', 'key', 'KeyF')!;
    expect(bindings.unbind(b.id)).toBe(true);
    expect(bindings.getBindingsForAction('fire')).toHaveLength(0);
  });

  it('unbindAction removes all bindings for an action', () => {
    bindings.bind('run', 'key', 'ShiftLeft');
    bindings.bind('run', 'gamepadButton', '6');
    const count = bindings.unbindAction('run');
    expect(count).toBe(2);
    expect(bindings.getBindingsForAction('run')).toHaveLength(0);
  });

  it('getBindingsForAction returns empty for unknown', () => {
    expect(bindings.getBindingsForAction('nope')).toEqual([]);
  });

  it('binding has correct scale default', () => {
    const b = bindings.bind('look', 'gamepadAxis', '0')!;
    expect(b.scale).toBe(1);
  });

  it('binding with custom scale', () => {
    const b = bindings.bind('invertY', 'gamepadAxis', '1', [], -1)!;
    expect(b.scale).toBe(-1);
  });

  // ---------------------------------------------------------------------------
  // Composite Axes
  // ---------------------------------------------------------------------------

  it('addCompositeAxis creates composite', () => {
    bindings.addCompositeAxis('horizontal', 'KeyD', 'KeyA');
    expect(bindings.getCompositeAxes()).toHaveLength(1);
  });

  it('resolveComposite returns +1 for positive', () => {
    bindings.addCompositeAxis('h', 'KeyD', 'KeyA');
    const keys = new Map([['KeyD', true], ['KeyA', false]]);
    expect(bindings.resolveComposite('h', keys)).toBe(1);
  });

  it('resolveComposite returns -1 for negative', () => {
    bindings.addCompositeAxis('h', 'KeyD', 'KeyA');
    const keys = new Map([['KeyD', false], ['KeyA', true]]);
    expect(bindings.resolveComposite('h', keys)).toBe(-1);
  });

  it('resolveComposite returns 0 when both pressed', () => {
    bindings.addCompositeAxis('h', 'KeyD', 'KeyA');
    const keys = new Map([['KeyD', true], ['KeyA', true]]);
    expect(bindings.resolveComposite('h', keys)).toBe(0);
  });

  it('resolveComposite returns 0 for unknown', () => {
    expect(bindings.resolveComposite('nope', new Map())).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Chord Bindings
  // ---------------------------------------------------------------------------

  it('addChord creates chord binding', () => {
    const chord = bindings.addChord('superJump', ['Space', 'ShiftLeft']);
    expect(chord.action).toBe('superJump');
    expect(chord.keys).toHaveLength(2);
  });

  it('isChordActive detects all keys pressed', () => {
    const chord = bindings.addChord('combo', ['a', 'b', 'c']);
    const pressed = new Set(['a', 'b', 'c', 'd']);
    expect(bindings.isChordActive(chord.id, pressed)).toBe(true);
  });

  it('isChordActive returns false if key missing', () => {
    const chord = bindings.addChord('combo', ['a', 'b']);
    expect(bindings.isChordActive(chord.id, new Set(['a']))).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Conflict Detection
  // ---------------------------------------------------------------------------

  it('detectConflicts finds same-code bindings', () => {
    bindings.bind('jump', 'key', 'Space');
    bindings.bind('confirm', 'key', 'Space');
    const conflicts = bindings.detectConflicts();
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].action1).not.toBe(conflicts[0].action2);
  });

  it('no conflicts for different codes', () => {
    bindings.bind('jump', 'key', 'Space');
    bindings.bind('fire', 'key', 'KeyF');
    const conflicts = bindings.detectConflicts();
    expect(conflicts).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  it('exportProfile returns JSON string', () => {
    bindings.bind('test', 'key', 'KeyT');
    const json = bindings.exportProfile();
    expect(typeof json).toBe('string');
    const parsed = JSON.parse(json);
    expect(parsed.id).toBe('default');
  });

  it('importProfile creates profile from JSON', () => {
    const profile = { id: 'imported', name: 'Imported', bindings: [], composites: [], chords: [] };
    const result = bindings.importProfile(JSON.stringify(profile));
    expect(result).not.toBeNull();
    expect(bindings.getProfile('imported')?.name).toBe('Imported');
  });

  it('importProfile rejects invalid JSON', () => {
    expect(bindings.importProfile('not json')).toBeNull();
  });
});
