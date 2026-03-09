/**
 * constellation-storyteller.scenario.ts — LIVING-SPEC: Constellation Storyteller
 *
 * Persona: Noor — planetarium guide who overlays mythological stories
 * on real star data, animating constellations and navigating the night sky.
 */

import { describe, it, expect } from 'vitest';
import {
  getStarById,
  starsByConstellation,
  brightestStar,
  magnitudeToRadius,
  isVisibleToNakedEye,
  angularDistance,
  spectralClassToTemperature,
  isCircumpolar,
  planetariumPath,
  mythologyOverlays,
  STAR_DATABASE,
  type ConstellationDef,
} from '@/lib/constellationStory';

describe('Scenario: Constellation Storyteller — Star Data', () => {
  it('STAR_DATABASE has 8 famous stars', () => {
    expect(STAR_DATABASE).toHaveLength(8);
  });

  it('getStarById(sirius) returns Sirius', () => {
    const sirius = getStarById('sirius');
    expect(sirius).toBeDefined();
    expect(sirius!.name).toBe('Sirius');
    expect(sirius!.magnitude).toBe(-1.46); // brightest
  });

  it('Betelgeuse is a red supergiant (M class)', () => {
    const betelgeuse = getStarById('betelgeuse')!;
    expect(betelgeuse.spectralClass).toMatch(/^M/);
    expect(betelgeuse.color).toBe('#ff6644');
  });

  it('Polaris is near the celestial north pole (dec ≈ 89°)', () => {
    const polaris = getStarById('polaris')!;
    expect(polaris.coord.dec).toBeGreaterThan(89);
  });

  it('starsByConstellation(orion) returns Betelgeuse and Rigel', () => {
    const orion = starsByConstellation('orion');
    expect(orion).toHaveLength(2);
    expect(orion.map((s) => s.name).sort()).toEqual(['Betelgeuse', 'Rigel']);
  });
});

describe('Scenario: Constellation Storyteller — Brightness & Visibility', () => {
  it('brightestStar() returns the lowest magnitude star', () => {
    const brightest = brightestStar(STAR_DATABASE);
    expect(brightest!.name).toBe('Sirius'); // magnitude -1.46
  });

  it('magnitudeToRadius() — brighter stars get bigger dots', () => {
    const siriusR = magnitudeToRadius(-1.46);
    const polarisR = magnitudeToRadius(1.98);
    expect(siriusR).toBeGreaterThan(polarisR);
  });

  it('all database stars are visible to naked eye (mag ≤ 6.5)', () => {
    for (const star of STAR_DATABASE) {
      expect(isVisibleToNakedEye(star.magnitude)).toBe(true);
    }
  });

  it('magnitude 7.0 is NOT visible to naked eye', () => {
    expect(isVisibleToNakedEye(7.0)).toBe(false);
  });
});

describe('Scenario: Constellation Storyteller — Sky Navigation', () => {
  it('angularDistance() between Betelgeuse and Rigel', () => {
    const betelgeuse = getStarById('betelgeuse')!;
    const rigel = getStarById('rigel')!;
    const dist = angularDistance(betelgeuse.coord, rigel.coord);
    expect(dist).toBeGreaterThan(10);
    expect(dist).toBeLessThan(25);
  });

  it('spectralClassToTemperature() — M class ≈ 3000K, O class ≈ 40000K', () => {
    expect(spectralClassToTemperature('M1Ia')).toBe(3000);
    expect(spectralClassToTemperature('O9V')).toBe(40000);
    expect(spectralClassToTemperature('G2V')).toBe(5500);
  });

  it('Polaris is circumpolar at latitude 40°N', () => {
    expect(isCircumpolar(89.26, 40)).toBe(true);
  });

  it('Sirius is NOT circumpolar at latitude 40°N', () => {
    expect(isCircumpolar(-16.72, 40)).toBe(false);
  });

  it('planetarium animation — smooth RA/Dec path following Earth rotation', () => {
    const polaris = getStarById('polaris')!;
    const path = planetariumPath(polaris, 6, 2, 40); // 6 hours, 2 samples/hr, lat 40
    expect(path.length).toBeGreaterThan(10);
    // Path starts at the star's actual RA
    expect(path[0].ra).toBeCloseTo(polaris.coord.ra, 1);
    // RA should change over time (Earth rotation)
    expect(path[path.length - 1].ra).not.toBeCloseTo(path[0].ra, 0);
  });

  it('mythology overlay — show Greek/Chinese/Aboriginal constellation art', () => {
    const orionDef: ConstellationDef = {
      id: 'orion',
      name: 'Orion',
      abbreviation: 'Ori',
      mythology: 'The Hunter',
      culture: 'greek',
      stars: ['betelgeuse', 'rigel'],
      lines: [['betelgeuse', 'rigel']],
      bestMonth: 1,
    };
    const overlays = mythologyOverlays(orionDef);
    expect(overlays.length).toBe(5); // 5 cultures
    // Greek should have full opacity (matching culture)
    const greek = overlays.find((o) => o.culture === 'greek')!;
    expect(greek.opacity).toBe(1.0);
    // Others should have 0.5 opacity
    const chinese = overlays.find((o) => o.culture === 'chinese')!;
    expect(chinese.opacity).toBe(0.5);
    expect(greek.artUrl).toContain('orion_greek');
  });
});
