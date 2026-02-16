/**
 * InputBindings.ts
 *
 * Rebindable input action system: composite axes, chord combos,
 * binding profiles, and conflict detection.
 *
 * @module input
 */

// =============================================================================
// TYPES
// =============================================================================

export type BindingSource = 'key' | 'mouseButton' | 'gamepadButton' | 'gamepadAxis';

export interface InputBinding {
  id: string;
  action: string;
  source: BindingSource;
  code: string;            // Key code, button index, or axis index
  modifiers?: string[];    // Required modifier keys (e.g., ['Shift', 'Ctrl'])
  scale?: number;          // Axis scale (-1 for inverted)
}

export interface CompositeAxis {
  name: string;
  positive: string;        // Action or key for +1
  negative: string;        // Action or key for -1
}

export interface ChordBinding {
  id: string;
  action: string;
  keys: string[];           // All must be pressed simultaneously
  order: 'any' | 'sequence'; // Whether order matters
}

export interface BindingProfile {
  id: string;
  name: string;
  bindings: InputBinding[];
  composites: CompositeAxis[];
  chords: ChordBinding[];
}

export interface BindingConflict {
  action1: string;
  action2: string;
  binding: string;
  severity: 'warning' | 'error';
}

// =============================================================================
// INPUT BINDINGS
// =============================================================================

let _bindingId = 0;
let _chordId = 0;

export class InputBindings {
  private profiles: Map<string, BindingProfile> = new Map();
  private activeProfileId: string | null = null;

  constructor() {
    // Create default profile
    this.createProfile('default', 'Default');
    this.activeProfileId = 'default';

    // Default Bindings
    const p = this.profiles.get('default')!;
    p.bindings.push({
        id: `bind_${_bindingId++}`,
        action: 'VoicePushToTalk',
        source: 'key',
        code: 'KeyV'
    });
  }

  // ---------------------------------------------------------------------------
  // Profile Management
  // ---------------------------------------------------------------------------

  createProfile(id: string, name: string): BindingProfile {
    const profile: BindingProfile = { id, name, bindings: [], composites: [], chords: [] };
    this.profiles.set(id, profile);
    return profile;
  }

  deleteProfile(id: string): boolean {
    if (this.activeProfileId === id) return false;
    return this.profiles.delete(id);
  }

  setActiveProfile(id: string): boolean {
    if (!this.profiles.has(id)) return false;
    this.activeProfileId = id;
    return true;
  }

  getActiveProfile(): BindingProfile | null {
    if (!this.activeProfileId) return null;
    return this.profiles.get(this.activeProfileId) ?? null;
  }

  getProfile(id: string): BindingProfile | undefined {
    return this.profiles.get(id);
  }

  getProfileCount(): number {
    return this.profiles.size;
  }

  // ---------------------------------------------------------------------------
  // Binding Management
  // ---------------------------------------------------------------------------

  bind(action: string, source: BindingSource, code: string, modifiers?: string[], scale?: number): InputBinding | null {
    const profile = this.getActiveProfile();
    if (!profile) return null;

    const binding: InputBinding = {
      id: `bind_${_bindingId++}`,
      action, source, code,
      modifiers: modifiers ?? [],
      scale: scale ?? 1,
    };
    profile.bindings.push(binding);
    return binding;
  }

  unbind(bindingId: string): boolean {
    const profile = this.getActiveProfile();
    if (!profile) return false;
    const idx = profile.bindings.findIndex(b => b.id === bindingId);
    if (idx < 0) return false;
    profile.bindings.splice(idx, 1);
    return true;
  }

  unbindAction(action: string): number {
    const profile = this.getActiveProfile();
    if (!profile) return 0;
    const before = profile.bindings.length;
    profile.bindings = profile.bindings.filter(b => b.action !== action);
    return before - profile.bindings.length;
  }

  getBindingsForAction(action: string): InputBinding[] {
    const profile = this.getActiveProfile();
    if (!profile) return [];
    return profile.bindings.filter(b => b.action === action);
  }

  // ---------------------------------------------------------------------------
  // Composite Axes
  // ---------------------------------------------------------------------------

  addCompositeAxis(name: string, positive: string, negative: string): void {
    const profile = this.getActiveProfile();
    if (!profile) return;
    profile.composites.push({ name, positive, negative });
  }

  getCompositeAxes(): CompositeAxis[] {
    return this.getActiveProfile()?.composites ?? [];
  }

  /**
   * Resolve a composite axis value from key states.
   */
  resolveComposite(name: string, keyStates: Map<string, boolean>): number {
    const profile = this.getActiveProfile();
    if (!profile) return 0;
    const comp = profile.composites.find(c => c.name === name);
    if (!comp) return 0;

    const pos = keyStates.get(comp.positive) ? 1 : 0;
    const neg = keyStates.get(comp.negative) ? 1 : 0;
    return pos - neg;
  }

  // ---------------------------------------------------------------------------
  // Chord Bindings
  // ---------------------------------------------------------------------------

  addChord(action: string, keys: string[], order: 'any' | 'sequence' = 'any'): ChordBinding {
    const profile = this.getActiveProfile();
    const chord: ChordBinding = { id: `chord_${_chordId++}`, action, keys, order };
    if (profile) profile.chords.push(chord);
    return chord;
  }

  isChordActive(chordId: string, pressedKeys: Set<string>): boolean {
    const profile = this.getActiveProfile();
    if (!profile) return false;
    const chord = profile.chords.find(c => c.id === chordId);
    if (!chord) return false;
    return chord.keys.every(k => pressedKeys.has(k));
  }

  // ---------------------------------------------------------------------------
  // Conflict Detection
  // ---------------------------------------------------------------------------

  detectConflicts(): BindingConflict[] {
    const profile = this.getActiveProfile();
    if (!profile) return [];

    const conflicts: BindingConflict[] = [];
    const bindingMap = new Map<string, string[]>(); // code -> action[]

    for (const b of profile.bindings) {
      const key = `${b.source}:${b.code}:${(b.modifiers ?? []).sort().join('+')}`;
      if (!bindingMap.has(key)) bindingMap.set(key, []);
      bindingMap.get(key)!.push(b.action);
    }

    for (const [binding, actions] of bindingMap) {
      if (actions.length > 1) {
        const unique = [...new Set(actions)];
        for (let i = 0; i < unique.length; i++) {
          for (let j = i + 1; j < unique.length; j++) {
            conflicts.push({
              action1: unique[i],
              action2: unique[j],
              binding,
              severity: 'warning',
            });
          }
        }
      }
    }

    return conflicts;
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  exportProfile(profileId?: string): string {
    const profile = profileId ? this.profiles.get(profileId) : this.getActiveProfile();
    if (!profile) return '{}';
    return JSON.stringify(profile, null, 2);
  }

  importProfile(json: string): BindingProfile | null {
    try {
      const data = JSON.parse(json) as BindingProfile;
      if (!data.id || !data.name) return null;
      this.profiles.set(data.id, data);
      return data;
    } catch {
      return null;
    }
  }
}
