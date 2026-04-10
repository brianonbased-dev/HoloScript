import { describe, it, expect } from 'vitest';
import {
  mapRadioToVolumetric,
  calculatePulsarBeats,
  filterRFI,
  type RadioSpectrumEvent,
} from '@/lib/astrophysicsScenario';

describe('Scenario: Astrophysics Radio Lab', () => {
  const dataset: RadioSpectrumEvent[] = [
    { eventId: '1', rightAscension: 0, declination: 0, frequencyMHz: 1420.4, fluxDensityJy: 1.0 }, // Neutral hydrogen
    { eventId: '2', rightAscension: 0, declination: 0, frequencyMHz: 1410.0, fluxDensityJy: 2.0 }, // Redshift (away)
    { eventId: '3', rightAscension: 0, declination: 0, frequencyMHz: 1430.0, fluxDensityJy: 3.0 }, // Blueshift (towards)
    { eventId: '4', rightAscension: 0, declination: 0, frequencyMHz: 1420.0, fluxDensityJy: 100.0 }, // Starlink interference
  ];

  it('maps shifting frequencies to doppler colors', () => {
    // 1420.4 is green/neutral
    expect(mapRadioToVolumetric(dataset[0]).colorHex).toBe('#10b981');
    // 1410.0 is redshifted -> red
    expect(mapRadioToVolumetric(dataset[1]).colorHex).toBe('#ef4444');
    // 1430.0 is blueshifted -> blue
    expect(mapRadioToVolumetric(dataset[2]).colorHex).toBe('#3b82f6');
  });

  it('maps flux density to spatial bloom intensity', () => {
    const map1 = mapRadioToVolumetric(dataset[0]);
    const map2 = mapRadioToVolumetric(dataset[2]); // 3.0 jy

    expect(map1.bloomIntensity).toBe(0.5); // 1.0 * 0.5
    expect(map2.bloomIntensity).toBe(1.5); // 3.0 * 0.5
  });

  it('generates pulsar strobe beats', () => {
    // A 1.5 second pulsar over 5 seconds
    const beats = calculatePulsarBeats(1.5, 5);
    expect(beats).toEqual([0, 1.5, 3.0, 4.5]);
  });

  it('SNN filters out RFI based on heuristic thresholds', () => {
    // Anything >= 50 Jy gets scrubbed
    const clean = filterRFI(dataset, 50);
    expect(clean.length).toBe(3);
    expect(clean.find((e: RadioSpectrumEvent) => e.eventId === '4')).toBeUndefined();
  });
});
