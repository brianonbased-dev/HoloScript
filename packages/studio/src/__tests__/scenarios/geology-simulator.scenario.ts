/**
 * geology-simulator.scenario.ts — LIVING-SPEC: Geology Simulator
 *
 * Persona: Dr. Torres — geologist who classifies rocks, identifies
 * minerals by Mohs test, models seismic waves, and maps tectonic activity.
 */

import { describe, it, expect } from 'vitest';
import {
  getMineralByHardness, canScratch, classifyRock, rocksByType,
  pWaveSpeed, sWaveSpeed, seismicArrivalTime,
  plateDisplacementOverTime, earthquakeMagnitudeEnergy,
  periodByAge, periodsByEra, layerAtDepth,
  MOHS_SCALE, GEOLOGICAL_TIMELINE, EARTH_LAYERS,
  type RockSample,
} from '@/lib/geologySimulator';

describe('Scenario: Geology — Mohs Scale', () => {
  it('MOHS_SCALE has 10 reference minerals', () => {
    expect(MOHS_SCALE).toHaveLength(10);
  });

  it('hardness 10 = Diamond', () => {
    expect(getMineralByHardness(10)!.name).toBe('Diamond');
  });

  it('hardness 1 = Talc', () => {
    expect(getMineralByHardness(1)!.name).toBe('Talc');
  });

  it('quartz (7) can scratch fluorite (4)', () => {
    const quartz = getMineralByHardness(7)!;
    const fluorite = getMineralByHardness(4)!;
    expect(canScratch(quartz, fluorite)).toBe(true);
  });

  it('gypsum (2) cannot scratch calcite (3)', () => {
    const gypsum = getMineralByHardness(2)!;
    const calcite = getMineralByHardness(3)!;
    expect(canScratch(gypsum, calcite)).toBe(false);
  });
});

describe('Scenario: Geology — Rock Classification', () => {
  it('intrusive → igneous', () => {
    expect(classifyRock('intrusive')).toBe('igneous');
  });

  it('clastic → sedimentary', () => {
    expect(classifyRock('clastic')).toBe('sedimentary');
  });

  it('foliated → metamorphic', () => {
    expect(classifyRock('foliated')).toBe('metamorphic');
  });

  it('rocksByType filters correctly', () => {
    const samples: RockSample[] = [
      { id: 'r1', name: 'Granite', type: 'igneous', formation: 'intrusive', minerals: [], grainSize: 'coarse', texture: 'phaneritic', age: 300, location: '' },
      { id: 'r2', name: 'Sandstone', type: 'sedimentary', formation: 'clastic', minerals: [], grainSize: 'medium', texture: 'clastic', age: 100, location: '' },
      { id: 'r3', name: 'Marble', type: 'metamorphic', formation: 'non-foliated', minerals: [], grainSize: 'medium', texture: 'crystalline', age: 500, location: '' },
    ];
    expect(rocksByType(samples, 'igneous')).toHaveLength(1);
    expect(rocksByType(samples, 'sedimentary')[0].name).toBe('Sandstone');
  });
});

describe('Scenario: Geology — Seismic Waves', () => {
  it('P-wave speed in crust = 6.5 km/s', () => {
    expect(pWaveSpeed(20)).toBe(6.5);
  });

  it('S-wave speed in crust = 3.6 km/s', () => {
    expect(sWaveSpeed(20)).toBe(3.6);
  });

  it('S-waves cannot pass through outer core (speed = 0)', () => {
    expect(sWaveSpeed(3000)).toBe(0);
  });

  it('P-waves are faster than S-waves', () => {
    expect(pWaveSpeed(100)).toBeGreaterThan(sWaveSpeed(100));
  });

  it('seismicArrivalTime: 650km at 6.5 km/s = 100s', () => {
    expect(seismicArrivalTime(650, 6.5)).toBe(100);
  });

  it('plate displacement: 5 cm/yr × 1M years = 50 km', () => {
    expect(plateDisplacementOverTime(5, 1000000)).toBe(50000);
  });

  it('M7 releases far more energy than M5', () => {
    const e5 = earthquakeMagnitudeEnergy(5);
    const e7 = earthquakeMagnitudeEnergy(7);
    expect(e7 / e5).toBeGreaterThan(900); // ~1000× per 2 magnitudes
  });

  it('cross-section — Earth layer at depth', () => {
    expect(EARTH_LAYERS).toHaveLength(5);
    const crust = layerAtDepth(20);
    expect(crust!.name).toBe('Crust');
    expect(crust!.state).toBe('solid');

    const outerCore = layerAtDepth(3500);
    expect(outerCore!.name).toBe('Outer Core');
    expect(outerCore!.state).toBe('liquid'); // S-waves can't pass

    const innerCore = layerAtDepth(5500);
    expect(innerCore!.name).toBe('Inner Core');
    expect(innerCore!.temperatureC).toBe(5500);
  });

  it('geological time scale — era/period/epoch timeline with fossils', () => {
    expect(GEOLOGICAL_TIMELINE.length).toBeGreaterThanOrEqual(9);

    // Dinosaurs died in Cretaceous (~66 Mya)
    const cretaceous = periodByAge(80);
    expect(cretaceous!.name).toBe('Cretaceous');
    expect(cretaceous!.era).toBe('Mesozoic');
    expect(cretaceous!.fossilMarkers).toContain('T. rex');

    // Mesozoic has 3 periods
    const mesozoic = periodsByEra('Mesozoic');
    expect(mesozoic).toHaveLength(3);
  });
});
