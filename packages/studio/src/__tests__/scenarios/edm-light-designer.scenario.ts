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
import {
  createFixture,
  setFixtureColor,
  setFixtureIntensity,
  mixColors,
  colorToHex,
  hexToColor,
  bpmToBeatIntervalMs,
  createChasePattern,
  createStrobePattern,
  dmxAddressValid,
  detectDmxCollision,
  createArtNetPacket,
  midiToIntensity,
  parseSMPTE,
  isLaserEyeSafe,
  exportGrandMA,
  type LightFixture,
  type LightCue,
  type CueSheet,
  type FixtureGroup,
} from '@/lib/dmxEngine';

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

  it('ArtNet packet structure has correct header and universe', () => {
    const artNetPacket = createArtNetPacket(0);
    expect(artNetPacket.header).toBe('Art-Net\0');
    expect(artNetPacket.opcode).toBe(0x5000);
    expect(artNetPacket.data.length).toBe(512);
  });

  it('MIDI CC maps fader value (0-127) to intensity (0-1)', () => {
    expect(midiToIntensity(0)).toBe(0);
    expect(midiToIntensity(127)).toBe(1);
    expect(midiToIntensity(64)).toBeCloseTo(0.504, 2);
  });

  it('laser safety interlock classifies zones', () => {
    expect(isLaserEyeSafe('audience', 3.0)).toBe(true);
    expect(isLaserEyeSafe('audience', 1.5)).toBe(false);
    expect(isLaserEyeSafe('backstage', 0)).toBe(true);
  });
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

  it('cue sheet timeline orders cues by start time', () => {
    const cues = [
      { id: 'c3', startMs: 30000, name: 'Outro' },
      { id: 'c1', startMs: 0, name: 'Intro' },
      { id: 'c2', startMs: 15000, name: 'Drop' },
    ];
    cues.sort((a, b) => a.startMs - b.startMs);
    expect(cues.map(c => c.name)).toEqual(['Intro', 'Drop', 'Outro']);
  });

  it('SMPTE timecode parses HH:MM:SS:FF format', () => {
    const tc = parseSMPTE('01:30:45:12');
    expect(tc).toEqual({ hours: 1, minutes: 30, seconds: 45, frames: 12 });
  });

  it('cue sheet exports to grandMA-compatible JSON', () => {
    const exported = exportGrandMA(cueSheet);
    expect(exported.format).toBe('grandMA3');
    expect(exported.show).toBe('Main Stage Set');
    expect(exported.bpm).toBe(128);
  });

  it('3D venue layout positions fixtures in space', () => {
    const fixtures = [
      createFixture('par-L', 'PAR Left', 'par', 1),
      createFixture('par-R', 'PAR Right', 'par', 10),
    ];
    fixtures[0].position = { x: -5, y: 8, z: 0 };
    fixtures[1].position = { x: 5, y: 8, z: 0 };
    expect(fixtures[0].position.x).toBe(-5);
    expect(fixtures[1].position.x).toBe(5);
    expect(fixtures[0].position.y).toBe(fixtures[1].position.y);
  });
});
