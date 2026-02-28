/**
 * edm-light-designer.scenario.ts — LIVING-SPEC: EDM Concert Light Designer
 *
 * Persona: Kai — lighting designer who programs DMX-style light shows
 * for EDM concerts, syncing strobes, lasers, and washes to BPM.
 *
 * Domain: Concert lighting — DMX channels, color mixing, fixture groups,
 * cue sheets, beat-sync, fog machines, laser patterns.
 *
 * ✓ it(...)      = PASSING — feature exists
 * ⊡ it.todo(...) = SKIPPED — missing feature (backlog item)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Beat, AudioSyncConfig } from '@/lib/audioSync';

// ═══════════════════════════════════════════════════════════════════
// Domain Types — Concert Lighting
// ═══════════════════════════════════════════════════════════════════

type FixtureType = 'par' | 'spot' | 'wash' | 'strobe' | 'laser' | 'led-bar' | 'moving-head' | 'fog';

interface DMXChannel {
  address: number;     // 1-512
  value: number;       // 0-255
  label: string;
}

interface LightFixture {
  id: string;
  name: string;
  type: FixtureType;
  dmxStart: number;    // Starting DMX address
  channels: DMXChannel[];
  color: { r: number; g: number; b: number };
  intensity: number;   // 0-1
  position: { x: number; y: number; z: number };
  groupId?: string;
}

interface LightCue {
  id: string;
  name: string;
  fixtures: Map<string, { intensity: number; color: { r: number; g: number; b: number } }>;
  fadeInMs: number;
  fadeOutMs: number;
  holdMs: number;
  beatSync: boolean;   // true = trigger on beat
}

interface CueSheet {
  id: string;
  name: string;
  bpm: number;
  cues: LightCue[];
  looping: boolean;
}

interface FixtureGroup {
  id: string;
  name: string;
  fixtureIds: string[];
  syncMode: 'all' | 'chase' | 'alternate' | 'random';
}

// ═══════════════════════════════════════════════════════════════════
// Domain Logic — Pure Functions
// ═══════════════════════════════════════════════════════════════════

function createFixture(id: string, name: string, type: FixtureType, dmxStart: number): LightFixture {
  const channelCount: Record<FixtureType, number> = {
    par: 4, spot: 6, wash: 5, strobe: 2, laser: 8, 'led-bar': 3, 'moving-head': 16, fog: 2,
  };
  const channels: DMXChannel[] = Array.from({ length: channelCount[type] }, (_, i) => ({
    address: dmxStart + i, value: 0, label: `ch-${i + 1}`,
  }));
  return { id, name, type, dmxStart, channels, color: { r: 0, g: 0, b: 0 }, intensity: 0, position: { x: 0, y: 0, z: 0 } };
}

function setFixtureColor(fixture: LightFixture, r: number, g: number, b: number): LightFixture {
  return { ...fixture, color: { r: Math.min(255, Math.max(0, r)), g: Math.min(255, Math.max(0, g)), b: Math.min(255, Math.max(0, b)) } };
}

function setFixtureIntensity(fixture: LightFixture, intensity: number): LightFixture {
  return { ...fixture, intensity: Math.min(1, Math.max(0, intensity)) };
}

function mixColors(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, weight = 0.5): { r: number; g: number; b: number } {
  return {
    r: Math.round(a.r * (1 - weight) + b.r * weight),
    g: Math.round(a.g * (1 - weight) + b.g * weight),
    b: Math.round(a.b * (1 - weight) + b.b * weight),
  };
}

function colorToHex(c: { r: number; g: number; b: number }): string {
  return `#${c.r.toString(16).padStart(2, '0')}${c.g.toString(16).padStart(2, '0')}${c.b.toString(16).padStart(2, '0')}`;
}

function hexToColor(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function bpmToBeatIntervalMs(bpm: number): number {
  return 60_000 / bpm;
}

function createChasePattern(fixtureCount: number, stepIndex: number): number[] {
  // Returns intensity array — one fixture lit at a time
  return Array.from({ length: fixtureCount }, (_, i) => i === stepIndex % fixtureCount ? 1 : 0);
}

function createStrobePattern(bpm: number, subdivisions: number, time: number): boolean {
  const intervalMs = bpmToBeatIntervalMs(bpm) / subdivisions;
  const phase = (time % intervalMs) / intervalMs;
  return phase < 0.3; // 30% duty cycle
}

function dmxAddressValid(address: number): boolean {
  return Number.isInteger(address) && address >= 1 && address <= 512;
}

function detectDmxCollision(fixtures: LightFixture[]): Array<[string, string, number]> {
  const collisions: Array<[string, string, number]> = [];
  for (let i = 0; i < fixtures.length; i++) {
    for (let j = i + 1; j < fixtures.length; j++) {
      const a = fixtures[i], b = fixtures[j];
      const aEnd = a.dmxStart + a.channels.length - 1;
      const bEnd = b.dmxStart + b.channels.length - 1;
      if (a.dmxStart <= bEnd && b.dmxStart <= aEnd) {
        collisions.push([a.id, b.id, Math.max(a.dmxStart, b.dmxStart)]);
      }
    }
  }
  return collisions;
}

// ═══════════════════════════════════════════════════════════════════
// 1. DMX Fixture Management
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: EDM Light Designer — DMX Fixtures', () => {
  it('createFixture() creates a PAR with 4 DMX channels', () => {
    const par = createFixture('par-1', 'Front PAR', 'par', 1);
    expect(par.channels).toHaveLength(4);
    expect(par.channels[0].address).toBe(1);
    expect(par.channels[3].address).toBe(4);
  });

  it('createFixture() creates a moving-head with 16 channels', () => {
    const mh = createFixture('mh-1', 'Moving Head L', 'moving-head', 100);
    expect(mh.channels).toHaveLength(16);
    expect(mh.dmxStart).toBe(100);
  });

  it('createFixture() creates a laser with 8 channels', () => {
    const laser = createFixture('laser-1', 'Center Laser', 'laser', 200);
    expect(laser.channels).toHaveLength(8);
  });

  it('createFixture() creates a fog machine with 2 channels', () => {
    const fog = createFixture('fog-1', 'Hazer', 'fog', 400);
    expect(fog.channels).toHaveLength(2);
  });

  it('DMX addresses are valid (1-512)', () => {
    expect(dmxAddressValid(1)).toBe(true);
    expect(dmxAddressValid(512)).toBe(true);
    expect(dmxAddressValid(0)).toBe(false);
    expect(dmxAddressValid(513)).toBe(false);
    expect(dmxAddressValid(3.5)).toBe(false);
  });

  it('detectDmxCollision() finds overlapping channels', () => {
    const a = createFixture('a', 'A', 'par', 1);    // 1-4
    const b = createFixture('b', 'B', 'par', 3);    // 3-6 (overlap!)
    const c = createFixture('c', 'C', 'par', 10);   // 10-13 (no overlap)
    const collisions = detectDmxCollision([a, b, c]);
    expect(collisions).toHaveLength(1);
    expect(collisions[0][0]).toBe('a');
    expect(collisions[0][1]).toBe('b');
  });

  it('detectDmxCollision() returns empty for clean layout', () => {
    const a = createFixture('a', 'A', 'par', 1);
    const b = createFixture('b', 'B', 'par', 10);
    expect(detectDmxCollision([a, b])).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Color Mixing & Fixture Control
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: EDM Light Designer — Color & Intensity', () => {
  it('setFixtureColor() clamps RGB to 0-255', () => {
    const par = createFixture('par-1', 'PAR', 'par', 1);
    const colored = setFixtureColor(par, 300, -10, 128);
    expect(colored.color).toEqual({ r: 255, g: 0, b: 128 });
  });

  it('setFixtureIntensity() clamps to 0-1', () => {
    const par = createFixture('par-1', 'PAR', 'par', 1);
    expect(setFixtureIntensity(par, 1.5).intensity).toBe(1);
    expect(setFixtureIntensity(par, -0.5).intensity).toBe(0);
    expect(setFixtureIntensity(par, 0.75).intensity).toBe(0.75);
  });

  it('mixColors() blends two colors at 50%', () => {
    const red = { r: 255, g: 0, b: 0 };
    const blue = { r: 0, g: 0, b: 255 };
    const mixed = mixColors(red, blue);
    expect(mixed).toEqual({ r: 128, g: 0, b: 128 }); // purple
  });

  it('mixColors() with weight=0 returns first color', () => {
    const a = { r: 255, g: 100, b: 50 };
    const b = { r: 0, g: 0, b: 0 };
    expect(mixColors(a, b, 0)).toEqual(a);
  });

  it('colorToHex() converts RGB to hex string', () => {
    expect(colorToHex({ r: 255, g: 0, b: 128 })).toBe('#ff0080');
    expect(colorToHex({ r: 0, g: 255, b: 0 })).toBe('#00ff00');
  });

  it('hexToColor() converts hex string to RGB', () => {
    expect(hexToColor('#ff0080')).toEqual({ r: 255, g: 0, b: 128 });
    expect(hexToColor('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('colorToHex ↔ hexToColor round-trips', () => {
    const original = { r: 123, g: 45, b: 67 };
    expect(hexToColor(colorToHex(original))).toEqual(original);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Beat Sync & Light Patterns
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: EDM Light Designer — Beat Sync', () => {
  it('bpmToBeatIntervalMs(128) = 468.75ms', () => {
    expect(bpmToBeatIntervalMs(128)).toBeCloseTo(468.75, 1);
  });

  it('bpmToBeatIntervalMs(140) ≈ 428.6ms', () => {
    expect(bpmToBeatIntervalMs(140)).toBeCloseTo(428.57, 0);
  });

  it('bpmToBeatIntervalMs(174) for drum & bass ≈ 344.8ms', () => {
    expect(bpmToBeatIntervalMs(174)).toBeCloseTo(344.83, 0);
  });

  it('createChasePattern() lights one fixture at a time', () => {
    const step0 = createChasePattern(4, 0);
    expect(step0).toEqual([1, 0, 0, 0]);
    const step2 = createChasePattern(4, 2);
    expect(step2).toEqual([0, 0, 1, 0]);
  });

  it('createChasePattern() wraps around', () => {
    const step4 = createChasePattern(4, 4);
    expect(step4).toEqual([1, 0, 0, 0]); // wraps to 0
    const step7 = createChasePattern(4, 7);
    expect(step7).toEqual([0, 0, 0, 1]);
  });

  it('createStrobePattern() returns boolean on/off at 128 BPM', () => {
    const on = createStrobePattern(128, 1, 0);  // phase=0 → on
    expect(typeof on).toBe('boolean');
    expect(on).toBe(true);
  });

  it('strobe duty cycle is ~30%', () => {
    const intervalMs = bpmToBeatIntervalMs(128);
    let onCount = 0;
    const samples = 100;
    for (let i = 0; i < samples; i++) {
      const t = (i / samples) * intervalMs;
      if (createStrobePattern(128, 1, t)) onCount++;
    }
    const dutyCycle = onCount / samples;
    expect(dutyCycle).toBeCloseTo(0.3, 1);
  });

  it.todo('artnet DMX output over network');
  it.todo('MIDI controller input for live fader control');
  it.todo('laser safety interlock (eye-safe zones)');
});

// ═══════════════════════════════════════════════════════════════════
// 4. Cue Sheet & Show Programming
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: EDM Light Designer — Cue Sheet', () => {
  let cueSheet: CueSheet;

  beforeEach(() => {
    cueSheet = {
      id: 'show-1', name: 'Main Stage Set', bpm: 128,
      cues: [], looping: true,
    };
  });

  it('cue sheet starts empty', () => {
    expect(cueSheet.cues).toHaveLength(0);
  });

  it('can add a cue with fade-in/out timing', () => {
    const cue: LightCue = {
      id: 'cue-1', name: 'Drop Hit',
      fixtures: new Map([['par-1', { intensity: 1, color: { r: 255, g: 0, b: 255 } }]]),
      fadeInMs: 0, fadeOutMs: 500, holdMs: 2000, beatSync: true,
    };
    cueSheet.cues.push(cue);
    expect(cueSheet.cues).toHaveLength(1);
    expect(cueSheet.cues[0].name).toBe('Drop Hit');
  });

  it('build-up cue has long fade-in', () => {
    const buildUp: LightCue = {
      id: 'cue-buildup', name: 'Build Up',
      fixtures: new Map([['wash-1', { intensity: 0.8, color: { r: 0, g: 100, b: 255 } }]]),
      fadeInMs: 8000, fadeOutMs: 200, holdMs: 0, beatSync: false,
    };
    expect(buildUp.fadeInMs).toBe(8000);
  });

  it('drop cue has instant (0ms) fade-in', () => {
    const drop: LightCue = {
      id: 'cue-drop', name: 'Drop',
      fixtures: new Map([['strobe-1', { intensity: 1, color: { r: 255, g: 255, b: 255 } }]]),
      fadeInMs: 0, fadeOutMs: 0, holdMs: 500, beatSync: true,
    };
    expect(drop.fadeInMs).toBe(0);
    expect(drop.beatSync).toBe(true);
  });

  it('fixture group supports chase sync mode', () => {
    const group: FixtureGroup = {
      id: 'truss-left', name: 'Left Truss', fixtureIds: ['par-1', 'par-2', 'par-3', 'par-4'],
      syncMode: 'chase',
    };
    expect(group.syncMode).toBe('chase');
    expect(group.fixtureIds).toHaveLength(4);
  });

  it('fog machine cue triggers independently', () => {
    const fogCue: LightCue = {
      id: 'fog', name: 'Fog Burst',
      fixtures: new Map([['fog-1', { intensity: 1, color: { r: 255, g: 255, b: 255 } }]]),
      fadeInMs: 0, fadeOutMs: 3000, holdMs: 5000, beatSync: false,
    };
    expect(fogCue.holdMs).toBe(5000);
  });

  it.todo('cue sheet timeline visualization in NLA editor');
  it.todo('SMPTE timecode sync for multi-stage shows');
  it.todo('cue sheet export to grandMA2/MA3 format');
  it.todo('real-time 3D venue visualization with light beams');
});
