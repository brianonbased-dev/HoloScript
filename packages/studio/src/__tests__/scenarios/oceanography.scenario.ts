/**
 * oceanography.scenario.ts — LIVING-SPEC: Oceanography Simulator
 *
 * Persona: Dr. Marín — marine scientist who models ocean currents,
 * predicts tides, profiles water columns, and tracks marine species.
 */

import { describe, it, expect } from 'vitest';
import {
  pressureAtDepth, lightAtDepth, depthZone, soundSpeedMs,
  waterDensity, simpleTide, tidePhase,
  speciesInZone, canSurviveAtDepth, canSurviveTemperature,
  endangeredSpecies, totalPopulation,
  adcpCurrentProfile, coralBleachingRisk,
  type MarineSpecies,
} from '@/lib/oceanography';

describe('Scenario: Oceanography — Ocean Physics', () => {
  it('pressure at surface = 1 atm', () => {
    expect(pressureAtDepth(0)).toBe(1);
  });

  it('pressure at 100m ≈ 11 atm', () => {
    expect(pressureAtDepth(100)).toBeCloseTo(11, 0);
  });

  it('light at depth 0 = 100%', () => {
    expect(lightAtDepth(0)).toBeCloseTo(100, 0);
  });

  it('light at 100m ≈ 1.8% (extinction 0.04)', () => {
    expect(lightAtDepth(100, 0.04)).toBeCloseTo(1.83, 0);
  });

  it('depthZone(50) = epipelagic', () => {
    expect(depthZone(50)).toBe('epipelagic');
  });

  it('depthZone(500) = mesopelagic', () => {
    expect(depthZone(500)).toBe('mesopelagic');
  });

  it('depthZone(3000) = bathypelagic', () => {
    expect(depthZone(3000)).toBe('bathypelagic');
  });

  it('depthZone(7000) = hadopelagic (deepest trenches)', () => {
    expect(depthZone(7000)).toBe('hadopelagic');
  });

  it('sound speed ≈ 1500 m/s at surface (15°C, 35 PSU)', () => {
    const speed = soundSpeedMs(15, 35, 0);
    expect(speed).toBeGreaterThan(1480);
    expect(speed).toBeLessThan(1530);
  });

  it('water density increases with salinity', () => {
    const fresh = waterDensity(15, 0);
    const salty = waterDensity(15, 35);
    expect(salty).toBeGreaterThan(fresh);
  });
});

describe('Scenario: Oceanography — Tides', () => {
  it('simpleTide at 0 hours = max height (high tide)', () => {
    expect(simpleTide(0, 2)).toBeCloseTo(2, 1);
  });

  it('simpleTide at half period ≈ -amplitude (low tide)', () => {
    expect(simpleTide(6.21, 2)).toBeCloseTo(-2, 0);
  });

  it('tidePhase(0) = high', () => {
    expect(tidePhase(0)).toBe('high');
  });

  it('tidePhase(3) = falling', () => {
    expect(tidePhase(3)).toBe('falling');
  });
});

describe('Scenario: Oceanography — Marine Ecology', () => {
  const species: MarineSpecies[] = [
    { id: 'whale', name: 'Blue Whale', zone: 'epipelagic', depthRange: { min: 0, max: 500 }, optimalTempC: { min: 5, max: 20 }, population: 10000, endangered: true },
    { id: 'anglerfish', name: 'Anglerfish', zone: 'bathypelagic', depthRange: { min: 1000, max: 4000 }, optimalTempC: { min: 1, max: 4 }, population: 100000, endangered: false },
    { id: 'coral', name: 'Staghorn Coral', zone: 'epipelagic', depthRange: { min: 0, max: 60 }, optimalTempC: { min: 23, max: 29 }, population: 50000, endangered: true },
  ];

  it('speciesInZone(epipelagic) returns 2 species', () => {
    expect(speciesInZone(species, 'epipelagic')).toHaveLength(2);
  });

  it('Blue Whale can survive at 200m', () => {
    expect(canSurviveAtDepth(species[0], 200)).toBe(true);
  });

  it('Blue Whale cannot survive at 1000m', () => {
    expect(canSurviveAtDepth(species[0], 1000)).toBe(false);
  });

  it('coral needs warm water (23-29°C)', () => {
    expect(canSurviveTemperature(species[2], 25)).toBe(true);
    expect(canSurviveTemperature(species[2], 15)).toBe(false);
  });

  it('endangeredSpecies() returns 2 (whale + coral)', () => {
    expect(endangeredSpecies(species)).toHaveLength(2);
  });

  it('totalPopulation() sums all', () => {
    expect(totalPopulation(species)).toBe(160000);
  });

  it('ADCP profiling — acoustic Doppler current profiler', () => {
    const profile = adcpCurrentProfile(1.5, 180, 40, 8);
    expect(profile.length).toBeGreaterThan(0);
    // Speed decreases with depth
    expect(profile[0].currentSpeedMs).toBeGreaterThanOrEqual(profile[profile.length - 1].currentSpeedMs);
    // Ekman spiral rotates direction
    expect(profile[profile.length - 1].directionDeg).not.toBe(180);
  });

  it('coral bleaching model — temperature stress and recovery', () => {
    // Normal temps — no bleaching
    const safe = coralBleachingRisk([28, 28.5, 28, 27.5]);
    expect(safe.bleachingRisk).toBe('none');

    // Sustained high temps — alert
    const danger = coralBleachingRisk([30, 31, 31.5, 32, 31, 30.5, 31, 32, 30, 31, 31, 30]);
    expect(danger.degreeHeatingWeeks).toBeGreaterThan(4);
    expect(['warning', 'alert-1', 'alert-2']).toContain(danger.bleachingRisk);
    expect(danger.recoveryTimeDays).toBeGreaterThan(0);
  });
});
