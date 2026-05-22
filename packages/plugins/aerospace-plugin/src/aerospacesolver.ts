/**
 * Aerospace engineering solvers — aerospace-plugin
 *
 * Implements:
 *  - Tsiolkovsky rocket equation (ΔV budget)
 *  - Keplerian orbital mechanics (period, velocity, apoapsis/periapsis)
 *  - Aerodynamic drag (standard atmosphere model)
 *  - Mach number + flight regime classification
 *  - Thrust-to-weight ratio analysis
 *  - Structural stress/strain (axial members)
 *  - CAEL-ready receipt builder
 *
 * References:
 *  - Tsiolkovsky K (1903) Исследование мировых пространств реактивными приборами
 *  - Bate R, Mueller D, White J (1971) Fundamentals of Astrodynamics. Dover.
 *  - Anderson J (2011) Introduction to Flight, 7th ed. McGraw-Hill.
 */

import { buildDomainSimulationReceipt, type DomainSimulationReceipt } from '@holoscript/core';

const G0 = 9.80665; // standard gravity m/s²
const MU_EARTH = 3.986004418e14; // Earth gravitational parameter m³/s²
const R_EARTH = 6_371_000; // Earth mean radius m

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RocketStage {
  /** Wet mass (kg) — propellant + structure */
  wetMassKg: number;
  /** Dry mass (kg) — structure only */
  dryMassKg: number;
  /** Specific impulse (s) */
  isp: number;
}

export interface DeltaVResult {
  /** Ideal ΔV (m/s) for each stage */
  stagesDeltaV: number[];
  /** Total ΔV (m/s) summed across stages */
  totalDeltaV: number;
  /** Mass ratio per stage (m0/mf) */
  massRatios: number[];
}

export interface OrbitalElements {
  /** Semi-major axis (m) */
  semiMajorAxisM: number;
  /** Eccentricity (0 = circular, <1 = elliptical) */
  eccentricity: number;
  /** Inclination (degrees) */
  inclinationDeg: number;
}

export interface OrbitResult {
  /** Orbital period (s) */
  periodS: number;
  /** Apoapsis altitude above Earth surface (m) */
  apoapsisAltM: number;
  /** Periapsis altitude above Earth surface (m) */
  periapsisAltM: number;
  /** Mean orbital velocity (m/s) */
  meanVelocityMs: number;
  /** Specific orbital energy (J/kg) */
  specificEnergyJkg: number;
}

export interface DragInput {
  /** Drag coefficient (dimensionless) */
  cd: number;
  /** Reference area (m²) */
  referenceAreaM2: number;
  /** Air density (kg/m³) — 1.225 at sea level ISA */
  airDensityKgM3: number;
  /** Velocity (m/s) */
  velocityMs: number;
}

export interface DragResult {
  /** Drag force (N) */
  dragForceN: number;
  /** Dynamic pressure q = 0.5ρv² (Pa) */
  dynamicPressurePa: number;
}

export type FlightRegime = 'subsonic' | 'transonic' | 'supersonic' | 'hypersonic';

export interface MachResult {
  /** Mach number M = v / a */
  mach: number;
  /** Flight regime classification */
  regime: FlightRegime;
  /** Stagnation temperature rise (K) for adiabatic flow: T0/T = 1 + (γ-1)/2 × M² */
  stagnationTempRiseK: number;
}

export interface StressResult {
  /** Axial stress σ = F/A (Pa) */
  stressPa: number;
  /** Axial strain ε = σ/E */
  strain: number;
  /** Axial deformation δ = FL/AE (m) */
  deformationM: number;
  /** Safety factor = ultimateStressPa / stressPa */
  safetyFactor: number;
}

export interface AerospaceReceiptOptions {
  runId?: string;
}

export interface AerospaceAnalysisResult {
  deltaV?: DeltaVResult;
  orbit?: OrbitResult;
  drag?: DragResult;
  mach?: MachResult;
  stress?: StressResult;
  converged: true;
}

// ─── Tsiolkovsky Rocket Equation ──────────────────────────────────────────────

/**
 * Computes ΔV budget for a multi-stage rocket.
 * ΔV_stage = Isp × g₀ × ln(m0 / mf)
 */
export function tsiolkovskyDeltaV(stages: RocketStage[]): DeltaVResult {
  if (stages.length === 0) throw new Error('At least one stage required');
  for (const s of stages) {
    if (s.isp <= 0) throw new Error('Isp must be positive');
    if (s.dryMassKg <= 0 || s.wetMassKg <= s.dryMassKg)
      throw new Error('wetMassKg must be > dryMassKg > 0');
  }

  const stagesDeltaV: number[] = [];
  const massRatios: number[] = [];

  for (const stage of stages) {
    const ratio = stage.wetMassKg / stage.dryMassKg;
    massRatios.push(ratio);
    stagesDeltaV.push(stage.isp * G0 * Math.log(ratio));
  }

  return {
    stagesDeltaV,
    massRatios,
    totalDeltaV: stagesDeltaV.reduce((s, v) => s + v, 0),
  };
}

// ─── Keplerian Orbit ──────────────────────────────────────────────────────────

/**
 * Computes orbital mechanics from Keplerian elements.
 * T = 2π√(a³/μ), v_mean = 2πa/T, r_a = a(1+e), r_p = a(1-e)
 */
export function keplerOrbit(elements: OrbitalElements): OrbitResult {
  const { semiMajorAxisM: a, eccentricity: e } = elements;
  if (a <= 0) throw new Error('Semi-major axis must be positive');
  if (e < 0 || e >= 1) throw new Error('Eccentricity must be in [0, 1) for elliptical orbit');

  const periodS = 2 * Math.PI * Math.sqrt(a ** 3 / MU_EARTH);
  const apoapsisM  = a * (1 + e) - R_EARTH;
  const periapsisM = a * (1 - e) - R_EARTH;
  const meanVelocityMs = (2 * Math.PI * a) / periodS;
  const specificEnergyJkg = -MU_EARTH / (2 * a);

  return {
    periodS,
    apoapsisAltM:  Math.max(0, apoapsisM),
    periapsisAltM: Math.max(0, periapsisM),
    meanVelocityMs,
    specificEnergyJkg,
  };
}

// ─── Aerodynamic Drag ─────────────────────────────────────────────────────────

/**
 * F_drag = 0.5 × Cd × A × ρ × v²
 * q      = 0.5 × ρ × v²
 */
export function aerodynamicDrag(input: DragInput): DragResult {
  if (input.cd < 0) throw new Error('Drag coefficient must be ≥ 0');
  if (input.referenceAreaM2 <= 0) throw new Error('Reference area must be positive');
  if (input.airDensityKgM3 < 0) throw new Error('Air density must be ≥ 0');
  if (input.velocityMs < 0) throw new Error('Velocity must be ≥ 0');

  const q = 0.5 * input.airDensityKgM3 * input.velocityMs ** 2;
  return {
    dragForceN: input.cd * input.referenceAreaM2 * q,
    dynamicPressurePa: q,
  };
}

// ─── Mach Number ─────────────────────────────────────────────────────────────

/**
 * Mach = v / speedOfSound
 * T0/T = 1 + (γ-1)/2 × M²  (γ = 1.4 for diatomic ideal gas)
 */
export function machNumber(velocityMs: number, speedOfSoundMs: number): MachResult {
  if (velocityMs < 0) throw new Error('Velocity must be ≥ 0');
  if (speedOfSoundMs <= 0) throw new Error('Speed of sound must be positive');

  const mach = velocityMs / speedOfSoundMs;
  const gamma = 1.4;
  const stagnationTempRiseK = ((gamma - 1) / 2) * mach ** 2; // as ratio T0/T - 1

  let regime: FlightRegime;
  if (mach < 0.8)       regime = 'subsonic';
  else if (mach < 1.2)  regime = 'transonic';
  else if (mach < 5.0)  regime = 'supersonic';
  else                  regime = 'hypersonic';

  return { mach, regime, stagnationTempRiseK };
}

// ─── Thrust-to-Weight Ratio ───────────────────────────────────────────────────

/**
 * TWR = thrustN / (massKg × g₀)
 * TWR > 1 → vehicle can lift off
 */
export function thrustToWeightRatio(thrustN: number, massKg: number): {
  twr: number;
  canLiftOff: boolean;
} {
  if (thrustN < 0) throw new Error('Thrust must be ≥ 0');
  if (massKg <= 0) throw new Error('Mass must be positive');
  const twr = thrustN / (massKg * G0);
  return { twr, canLiftOff: twr > 1.0 };
}

// ─── Axial Stress / Strain ────────────────────────────────────────────────────

/**
 * σ = F/A, ε = σ/E, δ = FL/(AE), SF = σ_ult / σ
 */
export function axialStress(
  forceN: number,
  areaM2: number,
  elasticModulusPa: number,
  lengthM: number,
  ultimateStressPa: number,
): StressResult {
  if (areaM2 <= 0) throw new Error('Area must be positive');
  if (elasticModulusPa <= 0) throw new Error('Elastic modulus must be positive');
  if (lengthM <= 0) throw new Error('Length must be positive');
  if (ultimateStressPa <= 0) throw new Error('Ultimate stress must be positive');

  const stressPa = forceN / areaM2;
  const strain = stressPa / elasticModulusPa;
  const deformationM = (forceN * lengthM) / (areaM2 * elasticModulusPa);
  const safetyFactor = Math.abs(stressPa) > 0 ? ultimateStressPa / Math.abs(stressPa) : Infinity;

  return { stressPa, strain, deformationM, safetyFactor };
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export function buildAerospaceReceipt(
  result: AerospaceAnalysisResult,
  options?: AerospaceReceiptOptions,
): DomainSimulationReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];

  if (result.deltaV && result.deltaV.totalDeltaV < 9_400) {
    violations.push({ criterion: 'delta_v', message: `ΔV ${result.deltaV.totalDeltaV.toFixed(0)} m/s insufficient for LEO (≥9400 m/s required)` });
  }
  if (result.orbit && result.orbit.periapsisAltM < 200_000) {
    violations.push({ criterion: 'periapsis', message: `Periapsis altitude ${(result.orbit.periapsisAltM / 1000).toFixed(0)} km below 200 km minimum` });
  }
  if (result.stress && result.stress.safetyFactor < 1.5) {
    violations.push({ criterion: 'structural_margin', message: `Safety factor ${result.stress.safetyFactor.toFixed(2)} below 1.5 minimum` });
  }
  if (result.mach && result.mach.regime === 'hypersonic' && result.mach.stagnationTempRiseK > 10) {
    violations.push({ criterion: 'thermal_barrier', message: `Hypersonic stagnation heating significant — thermal protection required` });
  }

  return buildDomainSimulationReceipt({
    plugin: 'aerospace',
    pluginVersion: '1.0.0',
    runId: options?.runId ?? `aero-${Date.now().toString(36)}`,
    solverConfig: { solverType: 'aerospace.trajectory-analysis', scale: 'mission' },
    resultSummary: {
      totalDeltaV: result.deltaV?.totalDeltaV,
      orbitalPeriodS: result.orbit?.periodS,
      dragForceN: result.drag?.dragForceN,
      machNumber: result.mach?.mach,
      safetyFactor: result.stress?.safetyFactor,
    },
    cael: { version: 'cael.v1', event: 'aerospace.trajectory_analysis', solverType: 'aerospace.tsiolkovsky' },
    acceptance: { accepted: violations.length === 0, violations },
  });
}
