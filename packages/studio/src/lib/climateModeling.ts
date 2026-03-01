/**
 * climateModeling.ts — Climate Modeling Engine
 *
 * Greenhouse gas concentrations, temperature projections,
 * ice cap modeling, sea level rise, and carbon budget tracking.
 */

export type GreenhouseGas = 'CO2' | 'CH4' | 'N2O' | 'F-gases';
export type EmissionScenario = 'SSP1-1.9' | 'SSP1-2.6' | 'SSP2-4.5' | 'SSP3-7.0' | 'SSP5-8.5';
export type ClimateZone = 'tropical' | 'arid' | 'temperate' | 'continental' | 'polar';

export interface GHGConcentration {
  gas: GreenhouseGas;
  currentPPM: number;
  preindustrialPPM: number;
  gwp100: number;            // Global Warming Potential (100yr, CO2=1)
  atmosphericLifetimeYears: number;
}

export interface TemperatureProjection {
  year: number;
  scenario: EmissionScenario;
  anomalyC: number;          // °C above pre-industrial
  uncertainty: number;       // ± °C
}

export interface IceSheet {
  id: string;
  name: string;
  areaSqKm: number;
  volumeKm3: number;
  massLossGtPerYear: number;
  seaLevelContributionMm: number; // if fully melted
  temperatureSensitivity: number; // mm/yr per °C
}

export interface CarbonBudget {
  targetC: number;            // target warming (e.g. 1.5)
  remainingGt: number;        // remaining CO2 budget (Gt)
  annualEmissionsGt: number;
  yearsRemaining: number;
}

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

export const GHG_DATA: GHGConcentration[] = [
  { gas: 'CO2',    currentPPM: 421,    preindustrialPPM: 280, gwp100: 1,    atmosphericLifetimeYears: 300 },
  { gas: 'CH4',    currentPPM: 1.92,   preindustrialPPM: 0.72, gwp100: 28,  atmosphericLifetimeYears: 12 },
  { gas: 'N2O',    currentPPM: 0.336,  preindustrialPPM: 0.270, gwp100: 265, atmosphericLifetimeYears: 121 },
  { gas: 'F-gases', currentPPM: 0.001, preindustrialPPM: 0,   gwp100: 23500, atmosphericLifetimeYears: 50000 },
];

export const ICE_SHEETS: IceSheet[] = [
  { id: 'greenland', name: 'Greenland Ice Sheet', areaSqKm: 1710000, volumeKm3: 2850000, massLossGtPerYear: 270, seaLevelContributionMm: 7200, temperatureSensitivity: 3.3 },
  { id: 'antarctica-west', name: 'West Antarctic Ice Sheet', areaSqKm: 1970000, volumeKm3: 3262000, massLossGtPerYear: 150, seaLevelContributionMm: 3300, temperatureSensitivity: 1.5 },
  { id: 'antarctica-east', name: 'East Antarctic Ice Sheet', areaSqKm: 10200000, volumeKm3: 21745000, massLossGtPerYear: 5, seaLevelContributionMm: 53300, temperatureSensitivity: 0.1 },
];

// ═══════════════════════════════════════════════════════════════════
// Temperature & Radiative Forcing
// ═══════════════════════════════════════════════════════════════════

export function radiativeForcing(currentPPM: number, preindustrialPPM: number): number {
  // Simplified: ΔF = 5.35 × ln(C/C₀)  W/m²
  return 5.35 * Math.log(currentPPM / preindustrialPPM);
}

export function temperatureFromForcing(forcingWm2: number, climateSensitivity: number = 3.0): number {
  // ΔT = λ × ΔF, where λ = sensitivity / (F_2xCO2 ≈ 3.7)
  return (climateSensitivity / 3.7) * forcingWm2;
}

export function co2EquivalentPPM(gases: GHGConcentration[]): number {
  // Sum weighted by GWP
  return gases.reduce((sum, g) => sum + g.currentPPM * g.gwp100, 0);
}

// ═══════════════════════════════════════════════════════════════════
// Sea Level & Ice
// ═══════════════════════════════════════════════════════════════════

export function seaLevelRiseFromIce(massLossGt: number): number {
  // 361.8 Gt = 1mm sea level rise
  return massLossGt / 361.8;
}

export function totalIceMassLoss(sheets: IceSheet[]): number {
  return sheets.reduce((sum, s) => sum + s.massLossGtPerYear, 0);
}

export function yearsToMeltCompletely(sheet: IceSheet): number {
  // Simplified: volume / annual loss rate
  const gtPerKm3 = 0.917; // ice density
  const totalMass = sheet.volumeKm3 * gtPerKm3;
  return totalMass / sheet.massLossGtPerYear;
}

// ═══════════════════════════════════════════════════════════════════
// Carbon Budget
// ═══════════════════════════════════════════════════════════════════

export function carbonBudgetYears(remainingGt: number, annualGt: number): number {
  if (annualGt <= 0) return Infinity;
  return remainingGt / annualGt;
}

export function requiredReductionRate(currentGt: number, budgetYears: number, targetGt: number): number {
  // % per year reduction needed
  if (budgetYears <= 0) return 100;
  const ratio = targetGt / currentGt;
  return (1 - Math.pow(ratio, 1 / budgetYears)) * 100;
}

export function scenarioWarming(scenario: EmissionScenario): { min: number; max: number; label: string } {
  const data: Record<EmissionScenario, { min: number; max: number; label: string }> = {
    'SSP1-1.9': { min: 1.0, max: 1.8, label: 'Very low emissions — 1.5°C target' },
    'SSP1-2.6': { min: 1.3, max: 2.4, label: 'Low emissions — 2°C target' },
    'SSP2-4.5': { min: 2.1, max: 3.5, label: 'Intermediate — current policies' },
    'SSP3-7.0': { min: 2.8, max: 4.6, label: 'High emissions — minimal mitigation' },
    'SSP5-8.5': { min: 3.3, max: 5.7, label: 'Very high emissions — fossil fuel intensive' },
  };
  return data[scenario];
}

// ═══════════════════════════════════════════════════════════════════
// Ocean Acidification
// ═══════════════════════════════════════════════════════════════════

/**
 * Estimates ocean pH based on dissolved CO₂ concentration.
 * Pre-industrial ocean pH ≈ 8.18; current ≈ 8.07.
 * Relationship: pH drops ~0.002 per 1 ppm CO₂ increase.
 */
export function oceanAcidificationPH(co2PPM: number, baselinePH: number = 8.18, baselineCO2: number = 280): number {
  const deltaCO2 = co2PPM - baselineCO2;
  const deltaPH = deltaCO2 * 0.0008; // empirical fit
  return Math.max(7.0, baselinePH - deltaPH);
}

// ═══════════════════════════════════════════════════════════════════
// Regional Temperature Anomaly
// ═══════════════════════════════════════════════════════════════════

/**
 * Computes latitude-weighted temperature anomaly.
 * Polar amplification: Arctic warms 2-3x faster than equator.
 */
export function temperatureAnomalyByLatitude(
  globalAnomalyC: number,
  latitudeDeg: number
): number {
  const absLat = Math.abs(latitudeDeg);
  // Amplification factor: 1.0 at equator → 2.5 at poles
  const amplification = 1.0 + (absLat / 90) * 1.5;
  return globalAnomalyC * amplification;
}

