/**
 * epidemicHeatmap.ts — Epidemic Heatmap & Quarantine Engine
 *
 * Population density modeling, infection radius propagation,
 * quarantine zone management, R0 estimation, and intervention planning.
 */

export interface GeoPoint { lat: number; lon: number }

export type InfectionStatus = 'susceptible' | 'exposed' | 'infected' | 'recovered' | 'deceased';
export type InterventionType = 'quarantine' | 'vaccination' | 'testing' | 'contact-trace' | 'lockdown';
export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';

export interface PopulationZone {
  id: string;
  name: string;
  center: GeoPoint;
  radiusKm: number;
  population: number;
  density: number;           // people per km²
  infected: number;
  recovered: number;
  deceased: number;
  vaccinated: number;
}

export interface InfectionEvent {
  id: string;
  patientId: string;
  location: GeoPoint;
  timestamp: number;
  status: InfectionStatus;
  contactCount: number;
  isolated: boolean;
}

export interface QuarantineZone {
  id: string;
  boundary: GeoPoint[];
  restrictionLevel: 'advisory' | 'mandatory' | 'enforced';
  startDate: number;
  endDate: number | null;
  population: number;
  complianceRate: number;    // 0-1
}

export interface Intervention {
  id: string;
  type: InterventionType;
  targetZoneId: string;
  startDate: number;
  effectiveness: number;     // 0-1
  costPerDay: number;
  capacityPerDay: number;
}

export interface SEIRState {
  susceptible: number;
  exposed: number;
  infected: number;
  recovered: number;
  total: number;
}

// ═══════════════════════════════════════════════════════════════════
// Epidemiology Core
// ═══════════════════════════════════════════════════════════════════

export function basicReproductionNumber(
  newInfections: number,
  infectiousDays: number,
  currentInfected: number
): number {
  if (currentInfected === 0) return 0;
  return (newInfections * infectiousDays) / currentInfected;
}

export function effectiveR(r0: number, immuneFraction: number): number {
  return r0 * (1 - immuneFraction);
}

export function herdImmunityThreshold(r0: number): number {
  if (r0 <= 1) return 0;
  return 1 - (1 / r0);
}

export function infectionRate(zone: PopulationZone): number {
  if (zone.population === 0) return 0;
  return zone.infected / zone.population;
}

export function caseRiskLevel(rate: number): RiskLevel {
  if (rate < 0.01) return 'low';
  if (rate < 0.05) return 'moderate';
  if (rate < 0.15) return 'high';
  return 'critical';
}

export function caseFatalityRate(deceased: number, totalCases: number): number {
  if (totalCases === 0) return 0;
  return deceased / totalCases;
}

// ═══════════════════════════════════════════════════════════════════
// SEIR Model (Susceptible-Exposed-Infected-Recovered)
// ═══════════════════════════════════════════════════════════════════

export function stepSEIR(
  state: SEIRState,
  beta: number,              // transmission rate
  sigma: number,             // incubation rate (1/latent period)
  gamma: number,             // recovery rate (1/infectious period)
): SEIRState {
  const N = state.total;
  const dS = -beta * state.susceptible * state.infected / N;
  const dE = beta * state.susceptible * state.infected / N - sigma * state.exposed;
  const dI = sigma * state.exposed - gamma * state.infected;
  const dR = gamma * state.infected;
  return {
    susceptible: Math.max(0, state.susceptible + dS),
    exposed: Math.max(0, state.exposed + dE),
    infected: Math.max(0, state.infected + dI),
    recovered: Math.max(0, state.recovered + dR),
    total: N,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Quarantine & Intervention
// ═══════════════════════════════════════════════════════════════════

export function quarantineEffectiveness(zone: QuarantineZone): number {
  const durationDays = zone.endDate
    ? (zone.endDate - zone.startDate) / (1000 * 60 * 60 * 24)
    : 14; // Default 14 days
  const levelMultiplier = zone.restrictionLevel === 'enforced' ? 1.0
    : zone.restrictionLevel === 'mandatory' ? 0.8
    : 0.5;
  return Math.min(1, zone.complianceRate * levelMultiplier * Math.min(1, durationDays / 14));
}

export function vaccinationCoverage(vaccinated: number, population: number): number {
  if (population === 0) return 0;
  return vaccinated / population;
}

export function daysToHerdImmunity(
  population: number,
  currentImmune: number,
  vaccinationsPerDay: number,
  r0: number
): number {
  const threshold = herdImmunityThreshold(r0);
  const needed = Math.ceil(population * threshold) - currentImmune;
  if (needed <= 0) return 0;
  if (vaccinationsPerDay <= 0) return Infinity;
  return Math.ceil(needed / vaccinationsPerDay);
}
