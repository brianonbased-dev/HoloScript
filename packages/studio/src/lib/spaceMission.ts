/**
 * spaceMission.ts — Space Mission Planning Engine
 *
 * Orbital mechanics, delta-v budgets, launch window calculation,
 * Hohmann transfers, gravity assists, and mission timeline management.
 */

export interface Vec3 { x: number; y: number; z: number }

export type CelestialBody = 'earth' | 'moon' | 'mars' | 'venus' | 'jupiter' | 'saturn' | 'mercury' | 'sun';
export type MissionPhase = 'pre-launch' | 'launch' | 'orbit-insertion' | 'transfer' | 'arrival' | 'landing' | 'surface-ops' | 'return';
export type PropulsionType = 'chemical' | 'ion' | 'nuclear-thermal' | 'solar-sail';

export interface OrbitalElements {
  semiMajorAxisKm: number;
  eccentricity: number;
  inclinationDeg: number;
  periapsisKm: number;
  apoapsisKm: number;
  periodSeconds: number;
}

export interface Spacecraft {
  id: string;
  name: string;
  dryMassKg: number;
  fuelMassKg: number;
  propulsion: PropulsionType;
  specificImpulseSec: number;   // Isp
  thrustKN: number;
}

export interface MissionEvent {
  id: string;
  phase: MissionPhase;
  name: string;
  description: string;
  deltaVMs: number;
  timestamp: number;
  completed: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

export const G = 6.674e-11;  // gravitational constant (m³/kg/s²)

export const BODY_DATA: Record<CelestialBody, { massKg: number; radiusKm: number; muKm3s2: number; orbitRadiusKm: number }> = {
  sun:     { massKg: 1.989e30, radiusKm: 695700,  muKm3s2: 1.327e11, orbitRadiusKm: 0 },
  mercury: { massKg: 3.301e23, radiusKm: 2439.7,  muKm3s2: 22032,    orbitRadiusKm: 57.91e6 },
  venus:   { massKg: 4.867e24, radiusKm: 6051.8,  muKm3s2: 324859,   orbitRadiusKm: 108.2e6 },
  earth:   { massKg: 5.972e24, radiusKm: 6371,    muKm3s2: 398600,   orbitRadiusKm: 149.6e6 },
  moon:    { massKg: 7.342e22, radiusKm: 1737.4,  muKm3s2: 4905,     orbitRadiusKm: 0.3844e6 },
  mars:    { massKg: 6.417e23, radiusKm: 3389.5,  muKm3s2: 42828,    orbitRadiusKm: 227.9e6 },
  jupiter: { massKg: 1.898e27, radiusKm: 69911,   muKm3s2: 1.267e8,  orbitRadiusKm: 778.6e6 },
  saturn:  { massKg: 5.683e26, radiusKm: 58232,   muKm3s2: 3.793e7,  orbitRadiusKm: 1433.5e6 },
};

// ═══════════════════════════════════════════════════════════════════
// Orbital Mechanics
// ═══════════════════════════════════════════════════════════════════

export function orbitalPeriod(semiMajorAxisKm: number, muKm3s2: number): number {
  return 2 * Math.PI * Math.sqrt(semiMajorAxisKm ** 3 / muKm3s2);
}

export function orbitalVelocity(radiusKm: number, muKm3s2: number): number {
  return Math.sqrt(muKm3s2 / radiusKm); // km/s
}

export function escapeVelocity(radiusKm: number, muKm3s2: number): number {
  return Math.sqrt(2 * muKm3s2 / radiusKm); // km/s
}

export function hohmannDeltaV(r1Km: number, r2Km: number, muKm3s2: number): { dv1: number; dv2: number; total: number } {
  const v1 = orbitalVelocity(r1Km, muKm3s2);
  const vt1 = Math.sqrt(muKm3s2 * (2 / r1Km - 2 / (r1Km + r2Km)));
  const vt2 = Math.sqrt(muKm3s2 * (2 / r2Km - 2 / (r1Km + r2Km)));
  const v2 = orbitalVelocity(r2Km, muKm3s2);
  const dv1 = Math.abs(vt1 - v1);
  const dv2 = Math.abs(v2 - vt2);
  return { dv1, dv2, total: dv1 + dv2 };
}

export function hohmannTransferTime(r1Km: number, r2Km: number, muKm3s2: number): number {
  const a = (r1Km + r2Km) / 2;
  return Math.PI * Math.sqrt(a ** 3 / muKm3s2); // seconds
}

// ═══════════════════════════════════════════════════════════════════
// Spacecraft
// ═══════════════════════════════════════════════════════════════════

export function tsiolkovskyDeltaV(isp: number, wetMassKg: number, dryMassKg: number): number {
  // Δv = Isp × g₀ × ln(m_wet / m_dry)  →  km/s
  const g0 = 9.80665;
  return (isp * g0 * Math.log(wetMassKg / dryMassKg)) / 1000;
}

export function fuelRequired(deltaVKms: number, isp: number, dryMassKg: number): number {
  const g0 = 9.80665;
  const massRatio = Math.exp((deltaVKms * 1000) / (isp * g0));
  return dryMassKg * (massRatio - 1);
}

export function totalMissionDeltaV(events: MissionEvent[]): number {
  return events.reduce((sum, e) => sum + e.deltaVMs, 0) / 1000; // km/s
}

export function missionProgress(events: MissionEvent[]): number {
  if (events.length === 0) return 0;
  return events.filter(e => e.completed).length / events.length;
}
