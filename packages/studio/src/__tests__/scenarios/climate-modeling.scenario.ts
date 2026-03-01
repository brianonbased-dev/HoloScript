/**
 * climate-modeling.scenario.ts — LIVING-SPEC: Climate Modeler
 *
 * Persona: Dr. Osei — climate scientist who models greenhouse gas effects,
 * projects temperatures, tracks ice sheets, and calculates carbon budgets.
 */

import { describe, it, expect } from 'vitest';
import {
  radiativeForcing, temperatureFromForcing, co2EquivalentPPM,
  seaLevelRiseFromIce, totalIceMassLoss, yearsToMeltCompletely,
  carbonBudgetYears, requiredReductionRate, scenarioWarming,
  oceanAcidificationPH, temperatureAnomalyByLatitude,
  GHG_DATA, ICE_SHEETS,
} from '@/lib/climateModeling';


describe('Scenario: Climate — Greenhouse Gases', () => {
  it('GHG_DATA has 4 gases', () => {
    expect(GHG_DATA).toHaveLength(4);
  });

  it('CO2 current = 421 ppm, pre-industrial = 280 ppm', () => {
    const co2 = GHG_DATA.find(g => g.gas === 'CO2')!;
    expect(co2.currentPPM).toBe(421);
    expect(co2.preindustrialPPM).toBe(280);
  });

  it('CH4 GWP100 = 28 (much stronger than CO2)', () => {
    const ch4 = GHG_DATA.find(g => g.gas === 'CH4')!;
    expect(ch4.gwp100).toBe(28);
  });

  it('radiativeForcing from doubled CO2 ≈ 3.7 W/m²', () => {
    const rf = radiativeForcing(560, 280);
    expect(rf).toBeCloseTo(3.7, 0);
  });

  it('temperatureFromForcing: 3.7 W/m² → 3°C (sensitivity=3)', () => {
    expect(temperatureFromForcing(3.7, 3)).toBeCloseTo(3.0, 0);
  });

  it('co2EquivalentPPM sums weighted GHGs', () => {
    const eq = co2EquivalentPPM(GHG_DATA);
    expect(eq).toBeGreaterThan(421); // CO2 alone is 421, others add more
  });
});

describe('Scenario: Climate — Ice & Sea Level', () => {
  it('ICE_SHEETS has 3 major sheets', () => {
    expect(ICE_SHEETS).toHaveLength(3);
  });

  it('Greenland loses 270 Gt/year', () => {
    const greenland = ICE_SHEETS.find(s => s.id === 'greenland')!;
    expect(greenland.massLossGtPerYear).toBe(270);
  });

  it('seaLevelRiseFromIce: 362 Gt ≈ 1 mm', () => {
    expect(seaLevelRiseFromIce(361.8)).toBeCloseTo(1, 1);
  });

  it('totalIceMassLoss = 425 Gt/year (all three)', () => {
    expect(totalIceMassLoss(ICE_SHEETS)).toBe(425);
  });

  it('yearsToMeltCompletely: Greenland would take thousands of years', () => {
    const years = yearsToMeltCompletely(ICE_SHEETS[0]);
    expect(years).toBeGreaterThan(5000);
  });
});

describe('Scenario: Climate — Carbon Budget', () => {
  it('carbonBudgetYears: 500 Gt at 40 Gt/yr = 12.5 years', () => {
    expect(carbonBudgetYears(500, 40)).toBeCloseTo(12.5, 1);
  });

  it('carbonBudgetYears: zero emissions = Infinity', () => {
    expect(carbonBudgetYears(500, 0)).toBe(Infinity);
  });

  it('requiredReductionRate increases with shorter budgets', () => {
    const r_long = requiredReductionRate(40, 20, 5);
    const r_short = requiredReductionRate(40, 10, 5);
    expect(r_short).toBeGreaterThan(r_long);
  });

  it('SSP5-8.5 projects worst-case 3.3-5.7°C warming', () => {
    const w = scenarioWarming('SSP5-8.5');
    expect(w.min).toBe(3.3);
    expect(w.max).toBe(5.7);
  });

  it('SSP1-1.9 is the 1.5°C target scenario', () => {
    const w = scenarioWarming('SSP1-1.9');
    expect(w.min).toBe(1.0);
    expect(w.label).toContain('1.5°C');
  });

  it('temperatureAnomalyByLatitude — Arctic amplification 2.5x at poles', () => {
    const equator = temperatureAnomalyByLatitude(2.0, 0);
    const pole = temperatureAnomalyByLatitude(2.0, 90);
    expect(equator).toBeCloseTo(2.0, 1);
    expect(pole).toBeCloseTo(5.0, 1);
    expect(pole / equator).toBeCloseTo(2.5, 1);
  });

  it('oceanAcidificationPH — current CO2 421 ppm → pH ~8.07', () => {
    const ph = oceanAcidificationPH(421);
    expect(ph).toBeCloseTo(8.07, 1);
    expect(ph).toBeLessThan(8.18);
    // Higher CO2 → lower pH
    const future = oceanAcidificationPH(600);
    expect(future).toBeLessThan(ph);
  });
});
