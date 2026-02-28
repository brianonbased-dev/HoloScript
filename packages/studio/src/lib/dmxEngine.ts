/**
 * dmxEngine.ts — Production DMX Lighting Engine
 *
 * Concert lighting domain logic: DMX fixtures, color mixing, beat sync,
 * cue sheets, ArtNet, MIDI mapping, laser safety, and venue layout.
 *
 * Used by: LightDesignerPanel, edm-light-designer scenario
 */

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export type FixtureType =
  | 'par'
  | 'spot'
  | 'wash'
  | 'strobe'
  | 'laser'
  | 'led-bar'
  | 'moving-head'
  | 'fog';

export interface DMXChannel {
  address: number; // 1-512
  value: number; // 0-255
  label: string;
}

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface LightFixture {
  id: string;
  name: string;
  type: FixtureType;
  dmxStart: number;
  channels: DMXChannel[];
  color: RGBColor;
  intensity: number; // 0-1
  position: { x: number; y: number; z: number };
  groupId?: string;
}

export interface LightCue {
  id: string;
  name: string;
  fixtures: Map<string, { intensity: number; color: RGBColor }>;
  fadeInMs: number;
  fadeOutMs: number;
  holdMs: number;
  beatSync: boolean;
}

export interface CueSheet {
  id: string;
  name: string;
  bpm: number;
  cues: LightCue[];
  looping: boolean;
}

export interface FixtureGroup {
  id: string;
  name: string;
  fixtureIds: string[];
  syncMode: 'all' | 'chase' | 'alternate' | 'random';
}

export interface ArtNetPacket {
  header: string;
  opcode: number;
  protocolVersion: number;
  universe: number;
  length: number;
  data: Uint8Array;
}

export interface SMPTETimecode {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
}

export type LaserSafetyZone = 'audience' | 'above-head' | 'backstage';

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

export const FIXTURE_CHANNEL_COUNTS: Record<FixtureType, number> = {
  par: 4,
  spot: 6,
  wash: 5,
  strobe: 2,
  laser: 8,
  'led-bar': 3,
  'moving-head': 16,
  fog: 2,
};

export const DMX_MIN_ADDRESS = 1;
export const DMX_MAX_ADDRESS = 512;
export const DMX_UNIVERSE_SIZE = 512;

// ═══════════════════════════════════════════════════════════════════
// Fixture Management
// ═══════════════════════════════════════════════════════════════════

export function createFixture(
  id: string,
  name: string,
  type: FixtureType,
  dmxStart: number
): LightFixture {
  const channels: DMXChannel[] = Array.from(
    { length: FIXTURE_CHANNEL_COUNTS[type] },
    (_, i) => ({
      address: dmxStart + i,
      value: 0,
      label: `ch-${i + 1}`,
    })
  );
  return {
    id,
    name,
    type,
    dmxStart,
    channels,
    color: { r: 0, g: 0, b: 0 },
    intensity: 0,
    position: { x: 0, y: 0, z: 0 },
  };
}

export function setFixtureColor(
  fixture: LightFixture,
  r: number,
  g: number,
  b: number
): LightFixture {
  return {
    ...fixture,
    color: {
      r: Math.min(255, Math.max(0, r)),
      g: Math.min(255, Math.max(0, g)),
      b: Math.min(255, Math.max(0, b)),
    },
  };
}

export function setFixtureIntensity(
  fixture: LightFixture,
  intensity: number
): LightFixture {
  return { ...fixture, intensity: Math.min(1, Math.max(0, intensity)) };
}

// ═══════════════════════════════════════════════════════════════════
// Color Utilities
// ═══════════════════════════════════════════════════════════════════

export function mixColors(
  a: RGBColor,
  b: RGBColor,
  weight = 0.5
): RGBColor {
  return {
    r: Math.round(a.r * (1 - weight) + b.r * weight),
    g: Math.round(a.g * (1 - weight) + b.g * weight),
    b: Math.round(a.b * (1 - weight) + b.b * weight),
  };
}

export function colorToHex(c: RGBColor): string {
  return `#${c.r.toString(16).padStart(2, '0')}${c.g
    .toString(16)
    .padStart(2, '0')}${c.b.toString(16).padStart(2, '0')}`;
}

export function hexToColor(hex: string): RGBColor {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// ═══════════════════════════════════════════════════════════════════
// Beat Sync & Light Patterns
// ═══════════════════════════════════════════════════════════════════

export function bpmToBeatIntervalMs(bpm: number): number {
  return 60_000 / bpm;
}

export function createChasePattern(
  fixtureCount: number,
  stepIndex: number
): number[] {
  return Array.from(
    { length: fixtureCount },
    (_, i) => (i === stepIndex % fixtureCount ? 1 : 0)
  );
}

export function createStrobePattern(
  bpm: number,
  subdivisions: number,
  time: number
): boolean {
  const intervalMs = bpmToBeatIntervalMs(bpm) / subdivisions;
  const phase = (time % intervalMs) / intervalMs;
  return phase < 0.3; // 30% duty cycle
}

// ═══════════════════════════════════════════════════════════════════
// DMX Validation
// ═══════════════════════════════════════════════════════════════════

export function dmxAddressValid(address: number): boolean {
  return (
    Number.isInteger(address) &&
    address >= DMX_MIN_ADDRESS &&
    address <= DMX_MAX_ADDRESS
  );
}

export function detectDmxCollision(
  fixtures: LightFixture[]
): Array<[string, string, number]> {
  const collisions: Array<[string, string, number]> = [];
  for (let i = 0; i < fixtures.length; i++) {
    for (let j = i + 1; j < fixtures.length; j++) {
      const a = fixtures[i],
        b = fixtures[j];
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
// Protocol & Hardware
// ═══════════════════════════════════════════════════════════════════

export function createArtNetPacket(universe = 0): ArtNetPacket {
  return {
    header: 'Art-Net\0',
    opcode: 0x5000,
    protocolVersion: 14,
    universe,
    length: DMX_UNIVERSE_SIZE,
    data: new Uint8Array(DMX_UNIVERSE_SIZE),
  };
}

export function midiToIntensity(cc: number): number {
  return cc / 127;
}

export function parseSMPTE(tc: string): SMPTETimecode {
  const [h, m, s, f] = tc.split(':').map(Number);
  return { hours: h, minutes: m, seconds: s, frames: f };
}

export function isLaserEyeSafe(
  zone: LaserSafetyZone,
  height: number
): boolean {
  if (zone === 'audience') return height > 2.5;
  return true; // backstage and above-head are safe
}

// ═══════════════════════════════════════════════════════════════════
// Export & Integration
// ═══════════════════════════════════════════════════════════════════

export function exportGrandMA(sheet: CueSheet): {
  format: string;
  version: string;
  show: string;
  bpm: number;
  cueCount: number;
  looping: boolean;
} {
  return {
    format: 'grandMA3',
    version: '1.0',
    show: sheet.name,
    bpm: sheet.bpm,
    cueCount: sheet.cues.length,
    looping: sheet.looping,
  };
}
