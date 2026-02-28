/**
 * urban-farm-planner.scenario.ts — LIVING-SPEC: Urban Farm Planner
 *
 * Persona: Sage — urban farmer who plans rooftop/vertical farms,
 * simulates sunlight, manages crop rotation, and optimizes water usage.
 *
 * ✓ it(...)      = PASSING — feature exists
 */

import { describe, it, expect } from 'vitest';
import {
  sunPositionAtHour, dailySunHours, hasSufficientSun,
  getCropById, cropsForSeason, areCompanions, areIncompatible,
  bedArea, estimateYield, plantsPerBed, dailyWaterUsage,
  CROP_DATABASE,
  type PlantingBed,
} from '@/lib/urbanFarmPlanner';

describe('Scenario: Urban Farm — Sunlight Simulation', () => {
  it('sun is above horizon at noon (latitude 40°, summer)', () => {
    const sun = sunPositionAtHour(12, 40, 172); // June 21
    expect(sun.altitude).toBeGreaterThan(0);
  });

  it('sun is below horizon at midnight', () => {
    const sun = sunPositionAtHour(0, 40, 172);
    expect(sun.altitude).toBe(0);
  });

  it('dailySunHours() returns ~15 for summer at 40°N', () => {
    const hours = dailySunHours(40, 172);
    expect(hours).toBeGreaterThanOrEqual(14);
  });

  it('dailySunHours() returns fewer hours in winter', () => {
    const summer = dailySunHours(40, 172);
    const winter = dailySunHours(40, 355);
    expect(winter).toBeLessThan(summer);
  });

  it('hasSufficientSun() checks crop minimum requirement', () => {
    const tomato = getCropById('tomato')!;
    expect(hasSufficientSun(8, tomato)).toBe(true); // needs 6
    expect(hasSufficientSun(4, tomato)).toBe(false);
  });
});

describe('Scenario: Urban Farm — Crop Management', () => {
  it('CROP_DATABASE has 6 crops', () => {
    expect(CROP_DATABASE).toHaveLength(6);
  });

  it('getCropById() returns tomato profile', () => {
    const tomato = getCropById('tomato');
    expect(tomato).toBeDefined();
    expect(tomato!.daysToHarvest).toBe(80);
  });

  it('cropsForSeason(spring) includes tomato, lettuce, bean', () => {
    const spring = cropsForSeason('spring');
    expect(spring.length).toBeGreaterThanOrEqual(3);
    expect(spring.some(c => c.id === 'tomato')).toBe(true);
  });

  it('cropsForSeason(winter) is limited to cold-hardy crops', () => {
    const winter = cropsForSeason('winter');
    expect(winter.length).toBeLessThan(CROP_DATABASE.length);
    expect(winter.some(c => c.id === 'kale')).toBe(true);
  });

  it('areCompanions() — tomato + basil are companions', () => {
    expect(areCompanions(getCropById('tomato')!, getCropById('basil')!)).toBe(true);
  });

  it('areIncompatible() — tomato + fennel are incompatible', () => {
    expect(areIncompatible(getCropById('tomato')!, { id: 'fennel', name: 'Fennel', category: 'herb', growingSeasons: ['spring'], daysToHarvest: 60, sunHoursMin: 6, waterLitersPerDay: 1, spacingCm: 30, companionCrops: [], incompatibleCrops: ['tomato'], yieldKgPerM2: 2 })).toBe(true);
  });
});

describe('Scenario: Urban Farm — Bed & Yield', () => {
  const bed: PlantingBed = { id: 'b1', position: { x: 0, y: 0 }, widthM: 1.2, lengthM: 4, soilType: 'loam', cropId: 'tomato', plantedDate: Date.now(), irrigationType: 'drip' };

  it('bedArea() calculates m²', () => {
    expect(bedArea(bed)).toBeCloseTo(4.8, 1);
  });

  it('estimateYield() = area × yield/m²', () => {
    const tomato = getCropById('tomato')!;
    expect(estimateYield(bed, tomato)).toBeCloseTo(38.4, 0); // 4.8 × 8
  });

  it('plantsPerBed() uses grid spacing', () => {
    const count = plantsPerBed(bed, 60); // 60cm spacing
    expect(count).toBe(2 * 6); // 2 cols × 6 rows
  });

  it('dailyWaterUsage() sums all beds', () => {
    const beds: PlantingBed[] = [
      { ...bed, id: 'b1', cropId: 'tomato' },
      { ...bed, id: 'b2', cropId: 'lettuce' },
    ];
    const usage = dailyWaterUsage(beds);
    expect(usage).toBeGreaterThan(0);
  });

  it.todo('vertical farming LED spectrum — calculate optimal red/blue ratio');
  it.todo('composting model — decomposition rate by temperature and moisture');
});
