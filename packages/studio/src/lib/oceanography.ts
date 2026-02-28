/**
 * oceanography.ts — Oceanography Simulation Engine
 *
 * Ocean current modeling, tidal prediction, marine ecosystem simulation,
 * water property profiling, and underwater acoustics.
 */

export interface GeoPoint { lat: number; lon: number }
export interface Vec3 { x: number; y: number; z: number }

export type CurrentType = 'surface' | 'deep' | 'thermohaline' | 'tidal' | 'wind-driven';
export type MarineZone = 'epipelagic' | 'mesopelagic' | 'bathypelagic' | 'abyssopelagic' | 'hadopelagic';
export type TidePhase = 'high' | 'low' | 'rising' | 'falling';

export interface OceanCurrent {
  id: string;
  name: string;
  type: CurrentType;
  velocityMs: number;
  direction: number;          // degrees, 0 = north
  temperature: number;        // °C
  depth: number;              // meters
}

export interface WaterColumn {
  depth: number;
  temperatureC: number;
  salinityPSU: number;        // Practical Salinity Units
  dissolvedO2: number;        // mg/L
  pressure: number;           // bar
  lightPercent: number;       // % of surface light remaining
}

export interface MarineSpecies {
  id: string;
  name: string;
  zone: MarineZone;
  depthRange: { min: number; max: number };
  optimalTempC: { min: number; max: number };
  population: number;
  endangered: boolean;
}

export interface TideData {
  time: number;
  heightM: number;
  phase: TidePhase;
}

// ═══════════════════════════════════════════════════════════════════
// Ocean Physics
// ═══════════════════════════════════════════════════════════════════

export function pressureAtDepth(depthM: number): number {
  // Approximate: 1 atm per 10m + 1 atm surface
  return 1 + depthM / 10;
}

export function lightAtDepth(depthM: number, extinctionCoeff: number = 0.04): number {
  // Beer-Lambert: I = I₀ × e^(-kd)
  return Math.exp(-extinctionCoeff * depthM) * 100;
}

export function depthZone(depthM: number): MarineZone {
  if (depthM < 200) return 'epipelagic';
  if (depthM < 1000) return 'mesopelagic';
  if (depthM < 4000) return 'bathypelagic';
  if (depthM < 6000) return 'abyssopelagic';
  return 'hadopelagic';
}

export function soundSpeedMs(temperatureC: number, salinityPSU: number, depthM: number): number {
  // Simplified Mackenzie equation
  return 1448.96 + 4.591 * temperatureC - 0.05304 * temperatureC ** 2
    + 1.340 * (salinityPSU - 35) + 0.01630 * depthM;
}

export function waterDensity(temperatureC: number, salinityPSU: number): number {
  // Simplified: ρ ≈ 1000 + 0.8 × S - 0.003 × (T-4)²
  return 1000 + 0.8 * salinityPSU - 0.003 * (temperatureC - 4) ** 2;
}

// ═══════════════════════════════════════════════════════════════════
// Tidal Prediction
// ═══════════════════════════════════════════════════════════════════

export function simpleTide(hoursSinceHighTide: number, amplitude: number, period: number = 12.42): number {
  return amplitude * Math.cos((2 * Math.PI * hoursSinceHighTide) / period);
}

export function tidePhase(hoursSinceHighTide: number, period: number = 12.42): TidePhase {
  const phase = (hoursSinceHighTide % period) / period;
  if (phase < 0.05 || phase > 0.95) return 'high';
  if (phase > 0.45 && phase < 0.55) return 'low';
  if (phase < 0.5) return 'falling';
  return 'rising';
}

// ═══════════════════════════════════════════════════════════════════
// Marine Ecology
// ═══════════════════════════════════════════════════════════════════

export function speciesInZone(species: MarineSpecies[], zone: MarineZone): MarineSpecies[] {
  return species.filter(s => s.zone === zone);
}

export function canSurviveAtDepth(species: MarineSpecies, depth: number): boolean {
  return depth >= species.depthRange.min && depth <= species.depthRange.max;
}

export function canSurviveTemperature(species: MarineSpecies, tempC: number): boolean {
  return tempC >= species.optimalTempC.min && tempC <= species.optimalTempC.max;
}

export function endangeredSpecies(species: MarineSpecies[]): MarineSpecies[] {
  return species.filter(s => s.endangered);
}

export function totalPopulation(species: MarineSpecies[]): number {
  return species.reduce((sum, s) => sum + s.population, 0);
}

// ═══════════════════════════════════════════════════════════════════
// ADCP — Acoustic Doppler Current Profiler
// ═══════════════════════════════════════════════════════════════════

export interface ADCPBin {
  depthM: number;
  currentSpeedMs: number;
  directionDeg: number;
  backscatterDb: number;
}

/**
 * Simulates an ADCP profile — velocity typically decreases
 * logarithmically with depth and backscatter increases.
 */
export function adcpCurrentProfile(
  surfaceSpeedMs: number,
  surfaceDirectionDeg: number,
  maxDepthM: number,
  binSizeM: number = 4
): ADCPBin[] {
  const bins: ADCPBin[] = [];
  for (let d = binSizeM; d <= maxDepthM; d += binSizeM) {
    const fraction = d / maxDepthM;
    // Log profile: speed decreases with depth
    const speed = surfaceSpeedMs * Math.max(0, 1 - Math.log(1 + 2 * fraction));
    // Ekman spiral: direction rotates ~45° over depth
    const dir = (surfaceDirectionDeg + 45 * fraction) % 360;
    // Backscatter increases then drops
    const bs = 40 + 20 * Math.exp(-fraction * 3) + 5 * Math.random();
    bins.push({ depthM: d, currentSpeedMs: Math.max(0, speed), directionDeg: dir, backscatterDb: bs });
  }
  return bins;
}

// ═══════════════════════════════════════════════════════════════════
// Coral Bleaching Model
// ═══════════════════════════════════════════════════════════════════

export interface BleachingAssessment {
  degreeHeatingWeeks: number;   // DHW — accumulated thermal stress
  bleachingRisk: 'none' | 'watch' | 'warning' | 'alert-1' | 'alert-2';
  recoveryTimeDays: number;
}

/**
 * Calculates coral bleaching risk based on Degree Heating Weeks (DHW).
 * DHW = sum of weekly temps above bleaching threshold (typically 1°C above max monthly mean)
 */
export function coralBleachingRisk(
  weeklyTemps: number[],
  bleachingThresholdC: number = 29.0
): BleachingAssessment {
  let dhw = 0;
  for (const t of weeklyTemps) {
    const hotspot = t - bleachingThresholdC;
    if (hotspot > 0) dhw += hotspot;
  }

  let risk: BleachingAssessment['bleachingRisk'];
  if (dhw < 1) risk = 'none';
  else if (dhw < 4) risk = 'watch';
  else if (dhw < 8) risk = 'warning';
  else if (dhw < 12) risk = 'alert-1';
  else risk = 'alert-2';

  // Recovery time: ~6 months per DHW above 4, minimum 30 days
  const recoveryTimeDays = dhw > 4 ? Math.round((dhw - 4) * 180 + 30) : dhw > 1 ? 30 : 0;

  return { degreeHeatingWeeks: dhw, bleachingRisk: risk, recoveryTimeDays };
}
