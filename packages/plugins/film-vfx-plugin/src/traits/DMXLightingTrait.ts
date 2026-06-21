/**
 * @dmx_lighting trait — DMX512 lighting control for film/VFX and stage
 *
 * Controls DMX universes, fixture channels, intensity, color, and gobos.
 * Supports Art-Net and sACN protocols for integration with physical
 * lighting rigs and LED walls.
 *
 * @module @holoscript/plugin-film-vfx
 */

// ============================================================================
// Types
// ============================================================================

export type FixtureType =
  | 'fresnel'
  | 'led_panel'
  | 'led_tube'
  | 'moving_head'
  | 'par'
  | 'profile'
  | 'strobe'
  | 'cyc_light'
  | 'follow_spot'
  | 'practical'
  | 'hmi'
  | 'tungsten'
  | 'rgb_wash'
  | 'pixel_bar';

export type DMXProtocol = 'dmx512' | 'artnet' | 'sacn';

export interface GoboConfig {
  /** Gobo wheel slot index */
  slot: number;
  /** Gobo rotation speed (degrees/sec, 0 = static) */
  rotation?: number;
  /** Gobo name/description */
  name?: string;
}

export interface DMXLightingConfig {
  /** DMX universe number (1-based) */
  universe: number;
  /** Start channel address (1-512) */
  channel: number;
  /** Number of channels this fixture uses */
  channelCount: number;
  /** Fixture type */
  fixtureType: FixtureType;
  /** Master intensity (0-255 DMX, or 0-100 percent) */
  intensity: number;
  /** Intensity unit */
  intensityUnit?: 'dmx' | 'percent';
  /** RGB color (0-255 per channel) */
  color: [number, number, number];
  /** Color temperature in Kelvin (for white fixtures) */
  colorTemp?: number;
  /** Gobo configuration (for moving heads / profiles) */
  gobo?: GoboConfig;
  /** Pan angle in degrees (for moving heads) */
  pan?: number;
  /** Tilt angle in degrees (for moving heads) */
  tilt?: number;
  /** Dimmer curve */
  dimmerCurve?: 'linear' | 'square' | 'inverse_square' | 'scurve';
  /** DMX protocol for output */
  protocol?: DMXProtocol;
  /** Art-Net subnet/universe (if protocol = artnet) */
  artnetSubnet?: number;
  /** Fixture label for patch list */
  label?: string;
  /** Group assignment (e.g., "key", "fill", "back", "practical") */
  group?: string;
}

export interface DMXOutputPacket {
  protocol: DMXProtocol;
  universe: number;
  /** 512-byte DMX universe payload. */
  data: Uint8Array;
  /** Protocol packet bytes, or raw DMX512 data for protocol = dmx512. */
  bytes: Uint8Array;
  sequence: number;
  artnetSubnet?: number;
  sacnMulticastAddress?: string;
}

export interface DMXFixtureSnapshot {
  id: string;
  label?: string;
  group?: string;
  fixtureType: FixtureType;
  universe: number;
  channel: number;
  channelCount: number;
  channels: number[];
  config: DMXLightingConfig;
  lastPacket?: DMXOutputPacket;
}

export interface DMXUniverseSnapshot {
  universe: number;
  buffer: Uint8Array;
  allocations: Array<{ channel: number; fixtureId: string }>;
  fixtures: DMXFixtureSnapshot[];
  lastPacket?: DMXOutputPacket;
  packetHistory: DMXOutputPacket[];
}

// ============================================================================
// Trait Handler
// ============================================================================

export interface DMXLightingTraitHandler {
  name: 'dmx_lighting';
  defaultConfig: DMXLightingConfig;
  onAttach(entity: unknown, config: DMXLightingConfig): void;
  onDetach(entity: unknown): void;
  onUpdate(entity: unknown, config: Partial<DMXLightingConfig>): void;
  onEvent(entity: unknown, event: string, payload: unknown): void;
  getFixtureSnapshot(entity: unknown): DMXFixtureSnapshot | undefined;
  getUniverseSnapshot(universe: number): DMXUniverseSnapshot | undefined;
  reset(): void;
}

interface FixtureRecord {
  id: string;
  entity: unknown;
  config: DMXLightingConfig;
  strobeValue: number;
  lastPacket?: DMXOutputPacket;
}

interface UniverseRecord {
  universe: number;
  buffer: Uint8Array;
  allocations: Map<number, string>;
  fixtures: Map<string, FixtureRecord>;
  lastPacket?: DMXOutputPacket;
  packetHistory: DMXOutputPacket[];
}

const DMX_UNIVERSE_SIZE = 512;
const PACKET_HISTORY_LIMIT = 32;

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

function assertIntegerRange(name: string, value: number, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`DMXLightingTrait ${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function normalizeConfig(input: DMXLightingConfig): DMXLightingConfig {
  const universe = assertIntegerRange('universe', input.universe, 1, 63_999);
  const channel = assertIntegerRange('channel', input.channel, 1, DMX_UNIVERSE_SIZE);
  const channelCount = assertIntegerRange('channelCount', input.channelCount, 1, DMX_UNIVERSE_SIZE);
  if (channel + channelCount - 1 > DMX_UNIVERSE_SIZE) {
    throw new Error(
      `DMXLightingTrait channel range ${channel}-${channel + channelCount - 1} exceeds 512`
    );
  }
  if (input.artnetSubnet !== undefined) {
    assertIntegerRange('artnetSubnet', input.artnetSubnet, 0, 15);
  }
  return {
    ...input,
    universe,
    channel,
    channelCount,
    protocol: input.protocol ?? 'dmx512',
    intensityUnit: input.intensityUnit ?? 'dmx',
    dimmerCurve: input.dimmerCurve ?? 'linear',
    intensity:
      input.intensityUnit === 'percent'
        ? Math.max(0, Math.min(100, input.intensity))
        : clampByte(input.intensity),
    color: [
      clampByte(input.color[0] ?? 0),
      clampByte(input.color[1] ?? 0),
      clampByte(input.color[2] ?? 0),
    ],
    pan: input.pan === undefined ? undefined : Math.max(0, Math.min(360, input.pan)),
    tilt: input.tilt === undefined ? undefined : Math.max(0, Math.min(270, input.tilt)),
    gobo: input.gobo
      ? {
          ...input.gobo,
          slot: clampByte(input.gobo.slot),
          rotation: input.gobo.rotation === undefined ? undefined : clampByte(input.gobo.rotation),
        }
      : undefined,
  };
}

function dmxIntensity(config: DMXLightingConfig): number {
  const raw =
    config.intensityUnit === 'percent'
      ? (Math.max(0, Math.min(100, config.intensity)) / 100) * 255
      : clampByte(config.intensity);
  const normalized = raw / 255;
  switch (config.dimmerCurve ?? 'linear') {
    case 'square':
      return clampByte(normalized * normalized * 255);
    case 'inverse_square':
      return clampByte(Math.sqrt(normalized) * 255);
    case 'scurve':
      return clampByte(normalized * normalized * (3 - 2 * normalized) * 255);
    case 'linear':
    default:
      return clampByte(raw);
  }
}

function fixtureDmxValues(fixture: FixtureRecord): number[] {
  const { config } = fixture;
  return [
    dmxIntensity(config),
    config.color[0],
    config.color[1],
    config.color[2],
    clampByte(((config.pan ?? 0) / 360) * 255),
    clampByte(((config.tilt ?? 0) / 270) * 255),
    clampByte(config.gobo?.slot ?? 0),
    clampByte(config.gobo?.rotation ?? 0),
    fixture.strobeValue,
  ];
}

function clonePacket(packet: DMXOutputPacket): DMXOutputPacket {
  return {
    ...packet,
    data: new Uint8Array(packet.data),
    bytes: new Uint8Array(packet.bytes),
  };
}

function writeAscii(target: Uint8Array, offset: number, value: string, width: number): void {
  for (let i = 0; i < width; i += 1) {
    target[offset + i] = i < value.length ? value.charCodeAt(i) & 0xff : 0;
  }
}

function writeU16BE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >> 8) & 0xff;
  target[offset + 1] = value & 0xff;
}

function writeU16LE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >> 8) & 0xff;
}

function writeU32BE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >> 24) & 0xff;
  target[offset + 1] = (value >> 16) & 0xff;
  target[offset + 2] = (value >> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function writeSacnFlagsAndLength(target: Uint8Array, offset: number, length: number): void {
  writeU16BE(target, offset, 0x7000 | length);
}

function dmxData(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(DMX_UNIVERSE_SIZE);
  out.set(data.subarray(0, DMX_UNIVERSE_SIZE));
  return out;
}

export function buildArtNetDmxPacket(options: {
  data: Uint8Array;
  universe: number;
  subnet?: number;
  sequence?: number;
}): Uint8Array {
  const data = dmxData(options.data);
  const packet = new Uint8Array(18 + DMX_UNIVERSE_SIZE);
  writeAscii(packet, 0, 'Art-Net', 8);
  writeU16LE(packet, 8, 0x5000);
  writeU16BE(packet, 10, 14);
  packet[12] = options.sequence ?? 0;
  packet[13] = 0;
  const portAddress = (((options.subnet ?? 0) & 0x0f) << 4) | ((options.universe - 1) & 0x0f);
  writeU16LE(packet, 14, portAddress);
  writeU16BE(packet, 16, DMX_UNIVERSE_SIZE);
  packet.set(data, 18);
  return packet;
}

export function sacnMulticastAddress(universe: number): string {
  const u = assertIntegerRange('sACN universe', universe, 1, 63_999);
  return `239.255.${(u >> 8) & 0xff}.${u & 0xff}`;
}

function defaultSacnCid(universe: number): Uint8Array {
  const cid = new Uint8Array(16);
  writeAscii(cid, 0, 'HoloScriptDMX', 12);
  writeU32BE(cid, 12, universe);
  return cid;
}

export function buildSacnDmxPacket(options: {
  data: Uint8Array;
  universe: number;
  sequence?: number;
  sourceName?: string;
  cid?: Uint8Array;
}): Uint8Array {
  const universe = assertIntegerRange('sACN universe', options.universe, 1, 63_999);
  const data = dmxData(options.data);
  const packet = new Uint8Array(126 + DMX_UNIVERSE_SIZE);
  writeU16BE(packet, 0, 0x0010);
  writeU16BE(packet, 2, 0x0000);
  writeAscii(packet, 4, 'ASC-E1.17', 12);

  writeSacnFlagsAndLength(packet, 16, packet.length - 16);
  writeU32BE(packet, 18, 0x00000004);
  packet.set((options.cid ?? defaultSacnCid(universe)).subarray(0, 16), 22);

  writeSacnFlagsAndLength(packet, 38, packet.length - 38);
  writeU32BE(packet, 40, 0x00000002);
  writeAscii(packet, 44, options.sourceName ?? 'HoloScript FilmVFX DMX', 64);
  packet[108] = 100;
  writeU16BE(packet, 109, 0);
  packet[111] = options.sequence ?? 0;
  packet[112] = 0;
  writeU16BE(packet, 113, universe);

  writeSacnFlagsAndLength(packet, 115, packet.length - 115);
  packet[117] = 0x02;
  packet[118] = 0xa1;
  writeU16BE(packet, 119, 0);
  writeU16BE(packet, 121, 1);
  writeU16BE(packet, 123, DMX_UNIVERSE_SIZE + 1);
  packet[125] = 0;
  packet.set(data, 126);
  return packet;
}

function channelsFor(config: DMXLightingConfig): number[] {
  return Array.from({ length: config.channelCount }, (_, i) => config.channel + i);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cuePatchFromPayload(payload: unknown): Partial<DMXLightingConfig> {
  const source =
    isRecord(payload) && isRecord(payload.config)
      ? payload.config
      : isRecord(payload) && isRecord(payload.cue)
        ? payload.cue
        : payload;
  if (!isRecord(source)) return {};

  const patch: Partial<DMXLightingConfig> = {};
  if (typeof source.intensity === 'number') patch.intensity = source.intensity;
  if (source.intensityUnit === 'dmx' || source.intensityUnit === 'percent') {
    patch.intensityUnit = source.intensityUnit;
  }
  if (Array.isArray(source.color) && source.color.length >= 3) {
    patch.color = [Number(source.color[0]), Number(source.color[1]), Number(source.color[2])];
  }
  if (typeof source.pan === 'number') patch.pan = source.pan;
  if (typeof source.tilt === 'number') patch.tilt = source.tilt;
  if (isRecord(source.gobo) && typeof source.gobo.slot === 'number') {
    patch.gobo = {
      slot: source.gobo.slot,
      rotation: typeof source.gobo.rotation === 'number' ? source.gobo.rotation : undefined,
      name: typeof source.gobo.name === 'string' ? source.gobo.name : undefined,
    };
  }
  return patch;
}

export function createDMXLightingHandler(): DMXLightingTraitHandler {
  const universes = new Map<number, UniverseRecord>();
  const entityToFixtureId = new Map<unknown, string>();
  const fixtures = new Map<string, FixtureRecord>();
  let nextFixtureNumber = 1;
  let sequence = 0;

  const defaultConfig: DMXLightingConfig = {
    universe: 1,
    channel: 1,
    channelCount: 6,
    fixtureType: 'led_panel',
    intensity: 255,
    intensityUnit: 'dmx',
    color: [255, 255, 255],
    dimmerCurve: 'linear',
    protocol: 'dmx512',
  };

  const nextSequence = () => {
    sequence = (sequence % 255) + 1;
    return sequence;
  };

  const getUniverse = (universe: number): UniverseRecord => {
    const u = assertIntegerRange('universe', universe, 1, 63_999);
    let record = universes.get(u);
    if (!record) {
      record = {
        universe: u,
        buffer: new Uint8Array(DMX_UNIVERSE_SIZE),
        allocations: new Map(),
        fixtures: new Map(),
        packetHistory: [],
      };
      universes.set(u, record);
    }
    return record;
  };

  const assertChannelsFree = (fixture: FixtureRecord, config: DMXLightingConfig): void => {
    const universe = getUniverse(config.universe);
    for (const channel of channelsFor(config)) {
      const owner = universe.allocations.get(channel);
      if (owner && owner !== fixture.id) {
        throw new Error(
          `DMXLightingTrait channel overlap in universe ${config.universe}: channel ${channel} already allocated to ${owner}`
        );
      }
    }
  };

  const allocateFixture = (fixture: FixtureRecord): void => {
    assertChannelsFree(fixture, fixture.config);
    const universe = getUniverse(fixture.config.universe);
    universe.fixtures.set(fixture.id, fixture);
    for (const channel of channelsFor(fixture.config)) {
      universe.allocations.set(channel, fixture.id);
    }
  };

  const releaseFixture = (fixture: FixtureRecord): void => {
    const universe = universes.get(fixture.config.universe);
    if (!universe) return;
    for (const channel of channelsFor(fixture.config)) {
      if (universe.allocations.get(channel) === fixture.id) {
        universe.allocations.delete(channel);
      }
    }
    universe.fixtures.delete(fixture.id);
  };

  const renderUniverse = (universeNumber: number): UniverseRecord => {
    const universe = getUniverse(universeNumber);
    universe.buffer.fill(0);
    const sortedFixtures = [...universe.fixtures.values()].sort(
      (a, b) => a.config.channel - b.config.channel
    );
    for (const fixture of sortedFixtures) {
      const values = fixtureDmxValues(fixture);
      const start = fixture.config.channel - 1;
      for (let i = 0; i < fixture.config.channelCount && i < values.length; i += 1) {
        universe.buffer[start + i] = values[i]!;
      }
    }
    return universe;
  };

  const rememberPacket = (fixture: FixtureRecord, packet: DMXOutputPacket): void => {
    const universe = getUniverse(fixture.config.universe);
    fixture.lastPacket = packet;
    universe.lastPacket = packet;
    universe.packetHistory.push(packet);
    if (universe.packetHistory.length > PACKET_HISTORY_LIMIT) {
      universe.packetHistory.shift();
    }
  };

  const buildPacket = (fixture: FixtureRecord, buffer: Uint8Array): DMXOutputPacket => {
    const data = dmxData(buffer);
    const seq = nextSequence();
    switch (fixture.config.protocol ?? 'dmx512') {
      case 'artnet':
        return {
          protocol: 'artnet',
          universe: fixture.config.universe,
          data,
          bytes: buildArtNetDmxPacket({
            data,
            universe: fixture.config.universe,
            subnet: fixture.config.artnetSubnet ?? 0,
            sequence: seq,
          }),
          sequence: seq,
          artnetSubnet: fixture.config.artnetSubnet ?? 0,
        };
      case 'sacn':
        return {
          protocol: 'sacn',
          universe: fixture.config.universe,
          data,
          bytes: buildSacnDmxPacket({ data, universe: fixture.config.universe, sequence: seq }),
          sequence: seq,
          sacnMulticastAddress: sacnMulticastAddress(fixture.config.universe),
        };
      case 'dmx512':
      default:
        return {
          protocol: 'dmx512',
          universe: fixture.config.universe,
          data,
          bytes: new Uint8Array(data),
          sequence: seq,
        };
    }
  };

  const dispatchFixture = (fixture: FixtureRecord): DMXOutputPacket => {
    const universe = renderUniverse(fixture.config.universe);
    const packet = buildPacket(fixture, universe.buffer);
    rememberPacket(fixture, packet);
    return packet;
  };

  const requireFixture = (entity: unknown): FixtureRecord => {
    const fixtureId = entityToFixtureId.get(entity);
    const fixture = fixtureId ? fixtures.get(fixtureId) : undefined;
    if (!fixture) {
      throw new Error('DMXLightingTrait fixture is not attached');
    }
    return fixture;
  };

  const replaceFixtureConfig = (
    fixture: FixtureRecord,
    patch: Partial<DMXLightingConfig>
  ): void => {
    const previous = fixture.config;
    const next = normalizeConfig({ ...previous, ...patch });
    releaseFixture(fixture);
    fixture.config = next;
    try {
      allocateFixture(fixture);
      renderUniverse(previous.universe);
      dispatchFixture(fixture);
    } catch (error) {
      fixture.config = previous;
      allocateFixture(fixture);
      renderUniverse(previous.universe);
      throw error;
    }
  };

  const fixtureSnapshot = (fixture: FixtureRecord): DMXFixtureSnapshot => ({
    id: fixture.id,
    label: fixture.config.label,
    group: fixture.config.group,
    fixtureType: fixture.config.fixtureType,
    universe: fixture.config.universe,
    channel: fixture.config.channel,
    channelCount: fixture.config.channelCount,
    channels: channelsFor(fixture.config),
    config: {
      ...fixture.config,
      color: [...fixture.config.color] as [number, number, number],
      gobo: fixture.config.gobo ? { ...fixture.config.gobo } : undefined,
    },
    lastPacket: fixture.lastPacket ? clonePacket(fixture.lastPacket) : undefined,
  });

  return {
    name: 'dmx_lighting',
    defaultConfig,
    onAttach(entity: unknown, config: DMXLightingConfig): void {
      if (entityToFixtureId.has(entity)) {
        throw new Error('DMXLightingTrait fixture is already attached');
      }
      const fixture: FixtureRecord = {
        id: `fixture_${nextFixtureNumber++}`,
        entity,
        config: normalizeConfig({ ...defaultConfig, ...config }),
        strobeValue: 0,
      };
      allocateFixture(fixture);
      fixtures.set(fixture.id, fixture);
      entityToFixtureId.set(entity, fixture.id);
      dispatchFixture(fixture);
    },
    onDetach(entity: unknown): void {
      const fixtureId = entityToFixtureId.get(entity);
      const fixture = fixtureId ? fixtures.get(fixtureId) : undefined;
      if (!fixture) return;
      releaseFixture(fixture);
      fixtures.delete(fixture.id);
      entityToFixtureId.delete(entity);
      const universe = renderUniverse(fixture.config.universe);
      rememberPacket(fixture, buildPacket(fixture, universe.buffer));
    },
    onUpdate(entity: unknown, config: Partial<DMXLightingConfig>): void {
      replaceFixtureConfig(requireFixture(entity), config);
    },
    onEvent(entity: unknown, event: string, payload: unknown): void {
      const fixture = requireFixture(entity);
      switch (event) {
        case 'blackout': {
          const universe = getUniverse(fixture.config.universe);
          universe.buffer.fill(0);
          rememberPacket(fixture, buildPacket(fixture, universe.buffer));
          break;
        }
        case 'full':
          replaceFixtureConfig(fixture, { intensity: 255, intensityUnit: 'dmx' });
          break;
        case 'cue_go':
          replaceFixtureConfig(fixture, cuePatchFromPayload(payload));
          break;
        case 'strobe_on': {
          const rate =
            isRecord(payload) && typeof payload.rate === 'number'
              ? payload.rate
              : isRecord(payload) && typeof payload.value === 'number'
                ? payload.value
                : 255;
          fixture.strobeValue = clampByte(rate);
          dispatchFixture(fixture);
          break;
        }
        case 'strobe_off':
          fixture.strobeValue = 0;
          dispatchFixture(fixture);
          break;
        case 'park':
          replaceFixtureConfig(fixture, { intensity: 0, intensityUnit: 'dmx', pan: 0, tilt: 0 });
          break;
        default:
          break;
      }
    },
    getFixtureSnapshot(entity: unknown): DMXFixtureSnapshot | undefined {
      const fixtureId = entityToFixtureId.get(entity);
      const fixture = fixtureId ? fixtures.get(fixtureId) : undefined;
      return fixture ? fixtureSnapshot(fixture) : undefined;
    },
    getUniverseSnapshot(universe: number): DMXUniverseSnapshot | undefined {
      const record = universes.get(universe);
      if (!record) return undefined;
      return {
        universe: record.universe,
        buffer: new Uint8Array(record.buffer),
        allocations: [...record.allocations.entries()]
          .map(([channel, fixtureId]) => ({ channel, fixtureId }))
          .sort((a, b) => a.channel - b.channel),
        fixtures: [...record.fixtures.values()]
          .sort((a, b) => a.config.channel - b.config.channel)
          .map(fixtureSnapshot),
        lastPacket: record.lastPacket ? clonePacket(record.lastPacket) : undefined,
        packetHistory: record.packetHistory.map(clonePacket),
      };
    },
    reset(): void {
      universes.clear();
      entityToFixtureId.clear();
      fixtures.clear();
      nextFixtureNumber = 1;
      sequence = 0;
    },
  };
}
