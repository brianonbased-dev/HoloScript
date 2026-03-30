/**
 * SpatialIoT.test.ts — Tests for the Spatial IoT Bridge module
 *
 * Covers: zone volume calculation, floor area, effective air volume,
 * window area, R-value averaging, thermal load estimation,
 * HVAC command generation, and digital twin building.
 */

import { describe, it, expect } from 'vitest';
import {
  zoneVolume,
  zoneFloorArea,
  effectiveAirVolume,
  windowArea,
  averageRValue,
  estimateLoad,
  generateHVACCommands,
  buildZoneFromEntity,
  type ThermalZone,
  type ThermalBoundary,
} from '../../iot/SpatialIoT';
import { BoundingBox } from '../../spatial/BoundingBox';
import { SpatialEntity } from '../../spatial/SpatialEntity';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeZone(overrides: Partial<ThermalZone> = {}): ThermalZone {
  return {
    id: 'living_room',
    name: 'Living Room',
    bounds: BoundingBox.fromMinMax({ x: 0, y: 0, z: 0 }, { x: 5, y: 3, z: 4 }),
    currentTemp: 25,
    targetTemp: 22,
    boundaries: [],
    devices: ['thermostat-1'],
    ...overrides,
  };
}

function makeWindow(id = 'window-1'): ThermalBoundary {
  return {
    id,
    type: 'window',
    entity: SpatialEntity.fromMinMax(id, [0, 0.5, 0], [0, 2.5, 1.5]),
    rValue: 0.5,
    isOpen: false,
  };
}

function makeVent(id = 'vent-1', isOpen = false): ThermalBoundary {
  return {
    id,
    type: 'vent',
    entity: SpatialEntity.fromMinMax(id, [2, 2.8, 2], [3, 3, 3]),
    rValue: 0.3,
    isOpen,
  };
}

function makeDoor(id = 'door-1', isOpen = false): ThermalBoundary {
  return {
    id,
    type: 'door',
    entity: SpatialEntity.fromMinMax(id, [5, 0, 1], [5, 2.1, 1.8]),
    rValue: 1.5,
    isOpen,
  };
}

// ── Volume calculations ─────────────────────────────────────────────────────

describe('SpatialIoT — volume calculations', () => {
  it('zoneVolume returns correct m³', () => {
    const zone = makeZone();
    expect(zoneVolume(zone)).toBe(5 * 3 * 4); // 60 m³
  });

  it('zoneFloorArea returns width × depth', () => {
    const zone = makeZone();
    expect(zoneFloorArea(zone)).toBe(5 * 4); // 20 m²
  });

  it('effectiveAirVolume returns base volume when no open boundaries', () => {
    const zone = makeZone();
    expect(effectiveAirVolume(zone, [])).toBe(zoneVolume(zone));
  });
});

// ── Window area ──────────────────────────────────────────────────────────────

describe('SpatialIoT — window area', () => {
  it('returns 0 when no windows', () => {
    expect(windowArea(makeZone())).toBe(0);
  });

  it('sums window surface areas', () => {
    const zone = makeZone({ boundaries: [makeWindow('w1'), makeWindow('w2')] });
    const area = windowArea(zone);
    expect(area).toBeGreaterThan(0);
  });
});

// ── R-value ──────────────────────────────────────────────────────────────────

describe('SpatialIoT — R-value', () => {
  it('returns 0 for no boundaries', () => {
    expect(averageRValue(makeZone())).toBe(0);
  });

  it('averages R-values across boundaries', () => {
    const boundaries: ThermalBoundary[] = [
      {
        id: 'w1',
        type: 'wall',
        entity: SpatialEntity.fromMinMax('w', [0, 0, 0], [1, 1, 1]),
        rValue: 2.0,
        isOpen: false,
      },
      {
        id: 'w2',
        type: 'wall',
        entity: SpatialEntity.fromMinMax('w', [0, 0, 0], [1, 1, 1]),
        rValue: 4.0,
        isOpen: false,
      },
    ];
    expect(averageRValue(makeZone({ boundaries }))).toBe(3.0);
  });
});

// ── Load estimation ──────────────────────────────────────────────────────────

describe('SpatialIoT — load estimation', () => {
  it('returns higher load when outside is hotter', () => {
    const zone = makeZone({ targetTemp: 22, boundaries: [makeWindow()] });
    const coolLoad = estimateLoad(zone, 35); // 35°C outside
    const warmLoad = estimateLoad(zone, 25); // 25°C outside
    expect(coolLoad).toBeGreaterThan(warmLoad);
  });

  it('returns higher load with more windows (solar gain)', () => {
    const fewWindows = makeZone({ boundaries: [makeWindow('w1')] });
    const manyWindows = makeZone({
      boundaries: [makeWindow('w1'), makeWindow('w2'), makeWindow('w3')],
    });
    expect(estimateLoad(manyWindows, 30)).toBeGreaterThan(estimateLoad(fewWindows, 30));
  });

  it('returns non-negative load', () => {
    const zone = makeZone();
    expect(estimateLoad(zone, 20)).toBeGreaterThanOrEqual(0);
  });
});

// ── HVAC command generation ──────────────────────────────────────────────────

describe('SpatialIoT — HVAC commands', () => {
  it('generates no commands when at target temperature', () => {
    const zone = makeZone({ currentTemp: 22, targetTemp: 22 });
    expect(generateHVACCommands([zone], 30)).toHaveLength(0);
  });

  it('generates set_temperature and set_fan_speed for each device', () => {
    const zone = makeZone({ currentTemp: 28, targetTemp: 22, devices: ['thermo-1'] });
    const cmds = generateHVACCommands([zone], 35);
    expect(cmds.some((c) => c.action === 'set_temperature')).toBe(true);
    expect(cmds.some((c) => c.action === 'set_fan_speed')).toBe(true);
  });

  it('set_temperature uses target temp', () => {
    const zone = makeZone({ currentTemp: 28, targetTemp: 22, devices: ['t1'] });
    const cmds = generateHVACCommands([zone], 35);
    const setTemp = cmds.find((c) => c.action === 'set_temperature')!;
    expect(setTemp.value).toBe(22);
    expect(setTemp.zoneId).toBe(zone.id);
  });

  it('opens vents when zone is far from target', () => {
    const vent = makeVent('vent-1', false);
    const zone = makeZone({
      currentTemp: 30,
      targetTemp: 22,
      boundaries: [vent],
      devices: ['t1'],
    });
    const cmds = generateHVACCommands([zone], 35);
    const openCmd = cmds.find((c) => c.action === 'open_vent');
    expect(openCmd).toBeDefined();
    expect(openCmd!.deviceId).toBe('vent-1');
  });

  it('includes spatial reasoning in command reason', () => {
    const zone = makeZone({ currentTemp: 28, targetTemp: 22, devices: ['t1'] });
    const cmds = generateHVACCommands([zone], 35);
    const first = cmds[0];
    expect(first.reason).toContain('m³');
    expect(first.reason).toContain('BTU/h');
    expect(first.reason).toContain(zone.name);
  });

  it('commands include zoneId', () => {
    const zone = makeZone({ currentTemp: 28, targetTemp: 22, devices: ['t1'] });
    const cmds = generateHVACCommands([zone], 35);
    expect(cmds.every((c) => c.zoneId === 'living_room')).toBe(true);
  });
});

// ── Digital twin builder ─────────────────────────────────────────────────────

describe('SpatialIoT — buildZoneFromEntity', () => {
  it('creates a ThermalZone from SpatialEntity', () => {
    const room = SpatialEntity.at('bedroom', { position: [0, 0, 0], size: [4, 2.7, 3.5] });
    const zone = buildZoneFromEntity(room, {
      name: 'Master Bedroom',
      currentTemp: 24,
      targetTemp: 21,
      devices: ['ac-unit-2'],
    });
    expect(zone.id).toBe('bedroom');
    expect(zone.name).toBe('Master Bedroom');
    expect(zone.bounds).toBe(room.bounds);
    expect(zone.devices).toEqual(['ac-unit-2']);
  });

  it('accepts optional boundaries', () => {
    const room = SpatialEntity.at('kitchen', { position: [0, 0, 0], size: [5, 3, 4] });
    const zone = buildZoneFromEntity(room, {
      name: 'Kitchen',
      currentTemp: 26,
      targetTemp: 22,
      devices: [],
      boundaries: [makeWindow()],
    });
    expect(zone.boundaries).toHaveLength(1);
  });
});
