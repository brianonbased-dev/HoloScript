/**
 * Scenario: Particle System — Presets & Insertion
 *
 * Tests for the particle preset panel:
 * - Preset data structure validation
 * - Trait snippet generation
 * - Code insertion logic
 */

import { describe, it, expect } from 'vitest';

// ── Particle preset types (mirrors ParticlePanel interface) ──

interface ParticlePreset {
  id: string;
  name: string;
  type: string;
  description: string;
  emoji: string;
  color: string;
  traitSnippet: string;
}

// ── Sample presets (matching what /api/particles would return) ──

const SAMPLE_PRESETS: ParticlePreset[] = [
  {
    id: 'fire_01',
    name: 'Campfire',
    type: 'fire',
    description: 'Warm crackling campfire with embers',
    emoji: '🔥',
    color: '#ff6b35',
    traitSnippet: '  @particles(type: "fire", count: 200, color: "#ff6b35", size: 0.3, lifetime: 1.5)',
  },
  {
    id: 'snow_01',
    name: 'Snowfall',
    type: 'snow',
    description: 'Gentle snow particles drifting down',
    emoji: '❄️',
    color: '#e0f0ff',
    traitSnippet: '  @particles(type: "snow", count: 500, color: "#e0f0ff", size: 0.1, lifetime: 8.0)',
  },
  {
    id: 'sparks_01',
    name: 'Welding Sparks',
    type: 'sparks',
    description: 'Hot metal sparks flying outward',
    emoji: '⚡',
    color: '#ffd700',
    traitSnippet: '  @particles(type: "sparks", count: 100, color: "#ffd700", size: 0.05, lifetime: 0.5)',
  },
  {
    id: 'magic_01',
    name: 'Arcane Swirl',
    type: 'magic',
    description: 'Mystical purple energy vortex',
    emoji: '✨',
    color: '#a855f7',
    traitSnippet: '  @particles(type: "magic", count: 300, color: "#a855f7", size: 0.2, lifetime: 3.0)',
  },
  {
    id: 'rain_01',
    name: 'Rainstorm',
    type: 'rain',
    description: 'Heavy rain with splashes',
    emoji: '🌧️',
    color: '#60a5fa',
    traitSnippet: '  @particles(type: "rain", count: 1000, color: "#60a5fa", size: 0.02, lifetime: 1.0)',
  },
];

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Scenario: Particle Presets — Data Structure', () => {
  it('all presets have unique IDs', () => {
    const ids = SAMPLE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all presets have required fields', () => {
    for (const p of SAMPLE_PRESETS) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.type).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.emoji).toBeTruthy();
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.traitSnippet).toContain('@particles');
    }
  });

  it('covers 5 particle types', () => {
    const types = new Set(SAMPLE_PRESETS.map((p) => p.type));
    expect(types.size).toBe(5);
    expect(types).toContain('fire');
    expect(types).toContain('snow');
    expect(types).toContain('sparks');
  });
});

describe('Scenario: Particle Presets — Trait Snippets', () => {
  it('fire preset has count and lifetime params', () => {
    const fire = SAMPLE_PRESETS.find((p) => p.type === 'fire')!;
    expect(fire.traitSnippet).toContain('count:');
    expect(fire.traitSnippet).toContain('lifetime:');
  });

  it('snow preset has higher count than fire', () => {
    const fire = SAMPLE_PRESETS.find((p) => p.type === 'fire')!;
    const snow = SAMPLE_PRESETS.find((p) => p.type === 'snow')!;
    const getCount = (s: string) => parseInt(s.match(/count:\s*(\d+)/)?.[1] ?? '0');
    expect(getCount(snow.traitSnippet)).toBeGreaterThan(getCount(fire.traitSnippet));
  });

  it('all snippets start with @particles', () => {
    for (const p of SAMPLE_PRESETS) {
      expect(p.traitSnippet.trim()).toMatch(/^@particles/);
    }
  });
});

describe('Scenario: Particle Presets — Code Insertion', () => {
  function insertPreset(code: string, preset: ParticlePreset): string {
    return code + `\nobject "Particles_${preset.name}" {\n${preset.traitSnippet}\n}\n`;
  }

  it('inserts an object block at end of code', () => {
    const result = insertPreset('scene "My Scene" {}', SAMPLE_PRESETS[0]);
    expect(result).toContain('object "Particles_Campfire"');
    expect(result).toContain('@particles');
  });

  it('preserves existing code when inserting', () => {
    const original = 'scene "Test" { object "Cube" { @mesh(src: "cube") } }';
    const result = insertPreset(original, SAMPLE_PRESETS[1]);
    expect(result).toContain(original);
    expect(result).toContain('Particles_Snowfall');
  });

  it('inserted block wraps trait snippet in object', () => {
    const result = insertPreset('', SAMPLE_PRESETS[2]);
    expect(result).toContain('object "Particles_Welding Sparks"');
    expect(result).toContain(SAMPLE_PRESETS[2].traitSnippet);
    expect(result.indexOf('{')).toBeLessThan(result.indexOf('@particles'));
  });

  it('multiple insertions create multiple objects', () => {
    let code = '';
    SAMPLE_PRESETS.forEach((p) => { code = insertPreset(code, p); });
    const objectCount = (code.match(/object "Particles_/g) || []).length;
    expect(objectCount).toBe(SAMPLE_PRESETS.length);
  });
});
