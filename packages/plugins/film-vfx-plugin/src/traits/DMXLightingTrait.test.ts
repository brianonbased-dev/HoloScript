import { describe, expect, it } from 'vitest';
import {
  buildArtNetDmxPacket,
  buildSacnDmxPacket,
  createDMXLightingHandler,
  sacnMulticastAddress,
  type DMXLightingConfig,
} from './DMXLightingTrait';

function config(overrides: Partial<DMXLightingConfig> = {}): DMXLightingConfig {
  return {
    universe: 1,
    channel: 1,
    channelCount: 8,
    fixtureType: 'moving_head',
    intensity: 50,
    intensityUnit: 'percent',
    color: [10, 20, 30],
    pan: 180,
    tilt: 135,
    gobo: { slot: 7, rotation: 12 },
    dimmerCurve: 'linear',
    protocol: 'dmx512',
    label: 'key',
    ...overrides,
  };
}

describe('DMXLightingTrait handler', () => {
  it('allocates fixture channels and renders DMX512 bytes', () => {
    const handler = createDMXLightingHandler();
    const entity = { id: 'key' };

    handler.onAttach(entity, config({ channel: 10 }));

    const universe = handler.getUniverseSnapshot(1)!;
    expect(universe.allocations.map((a) => a.channel)).toEqual([10, 11, 12, 13, 14, 15, 16, 17]);
    expect(universe.fixtures[0]!.label).toBe('key');
    expect(Array.from(universe.buffer.slice(9, 17))).toEqual([128, 10, 20, 30, 128, 128, 7, 12]);
    expect(universe.lastPacket?.protocol).toBe('dmx512');
    expect(Array.from(universe.lastPacket!.bytes.slice(9, 17))).toEqual([
      128, 10, 20, 30, 128, 128, 7, 12,
    ]);
  });

  it('rejects out-of-range and overlapping channel allocations', () => {
    const handler = createDMXLightingHandler();

    handler.onAttach({ id: 'a' }, config({ channel: 1, channelCount: 4 }));
    expect(() => handler.onAttach({ id: 'b' }, config({ channel: 4, channelCount: 2 }))).toThrow(
      /overlap/
    );
    expect(() =>
      handler.onAttach({ id: 'bad' }, config({ channel: 510, channelCount: 4 }))
    ).toThrow(/exceeds 512/);
  });

  it('builds Art-Net ArtDMX packets for the rendered universe', () => {
    const handler = createDMXLightingHandler();
    const entity = { id: 'artnet' };

    handler.onAttach(
      entity,
      config({ universe: 3, channel: 1, protocol: 'artnet', artnetSubnet: 2 })
    );

    const packet = handler.getUniverseSnapshot(3)!.lastPacket!;
    expect(packet.protocol).toBe('artnet');
    expect(packet.artnetSubnet).toBe(2);
    expect(String.fromCharCode(...packet.bytes.slice(0, 8))).toBe('Art-Net\0');
    expect(packet.bytes[8]).toBe(0x00);
    expect(packet.bytes[9]).toBe(0x50);
    expect(packet.bytes[14]).toBe(0x22); // subnet 2, universe 3 -> port-address 0x22
    expect(packet.bytes[16]).toBe(0x02);
    expect(packet.bytes[17]).toBe(0x00);
    expect(packet.bytes[18]).toBe(128);
  });

  it('builds sACN E1.31 packets and multicast addresses', () => {
    const handler = createDMXLightingHandler();
    const entity = { id: 'sacn' };

    handler.onAttach(entity, config({ universe: 42, channel: 1, protocol: 'sacn' }));

    const packet = handler.getUniverseSnapshot(42)!.lastPacket!;
    expect(packet.protocol).toBe('sacn');
    expect(packet.sacnMulticastAddress).toBe('239.255.0.42');
    expect(packet.bytes).toHaveLength(638);
    expect(packet.bytes[0]).toBe(0x00);
    expect(packet.bytes[1]).toBe(0x10);
    expect(String.fromCharCode(...packet.bytes.slice(4, 13))).toBe('ASC-E1.17');
    expect(packet.bytes[113]).toBe(0x00);
    expect(packet.bytes[114]).toBe(42);
    expect(packet.bytes[125]).toBe(0);
    expect(packet.bytes[126]).toBe(128);
  });

  it('handles blackout, full, cue_go, strobe, and park events', () => {
    const handler = createDMXLightingHandler();
    const entity = { id: 'events' };

    handler.onAttach(entity, config({ channel: 1, channelCount: 9 }));
    handler.onEvent(entity, 'strobe_on', { rate: 200 });
    expect(handler.getUniverseSnapshot(1)!.buffer[8]).toBe(200);

    handler.onEvent(entity, 'strobe_off', {});
    expect(handler.getUniverseSnapshot(1)!.buffer[8]).toBe(0);

    handler.onEvent(entity, 'blackout', {});
    expect(Array.from(handler.getUniverseSnapshot(1)!.buffer.slice(0, 9))).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);

    handler.onEvent(entity, 'full', {});
    expect(handler.getUniverseSnapshot(1)!.buffer[0]).toBe(255);

    handler.onEvent(entity, 'cue_go', { config: { intensity: 25, intensityUnit: 'percent' } });
    expect(handler.getUniverseSnapshot(1)!.buffer[0]).toBe(64);

    handler.onEvent(entity, 'park', {});
    const parked = handler.getUniverseSnapshot(1)!.buffer;
    expect(parked[0]).toBe(0);
    expect(parked[4]).toBe(0);
    expect(parked[5]).toBe(0);
  });
});

describe('DMX packet builders', () => {
  it('pads Art-Net and sACN packet payloads to a full universe', () => {
    const data = new Uint8Array([1, 2, 3]);
    const artnet = buildArtNetDmxPacket({ data, universe: 1 });
    const sacn = buildSacnDmxPacket({ data, universe: 1 });

    expect(artnet).toHaveLength(530);
    expect(Array.from(artnet.slice(18, 21))).toEqual([1, 2, 3]);
    expect(artnet[529]).toBe(0);
    expect(sacn).toHaveLength(638);
    expect(Array.from(sacn.slice(126, 129))).toEqual([1, 2, 3]);
    expect(sacn[637]).toBe(0);
    expect(sacnMulticastAddress(513)).toBe('239.255.2.1');
  });
});
