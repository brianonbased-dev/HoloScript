/**
 * @holoscript/aerospace-plugin
 *
 * First aerospace depth slice: orbital trajectory propagation, propulsion
 * budget hooks, re-entry heating estimates, and solver-backed thermal and
 * structural harnesses with shared CAEL-ready SimulationContract receipts.
 */

import type { FieldData, SimSolver, SolverMode } from '@holoscript/engine/simulation/SimSolver';
import {
  type ThermalConfig,
  type ThermalStats,
  ThermalSolver,
} from '@holoscript/engine/simulation/ThermalSolver';
import {
  StructuralSolver,
  type StructuralConfig,
  type StructuralStats,
} from '@holoscript/engine/simulation/StructuralSolver';
import { force } from '@holoscript/engine/simulation/units/PhysicalQuantity';
import {
  DOMAIN_SIMULATION_RECEIPT_SCHEMA,
  buildDomainSimulationReceipt,
  type DomainSimulationReceipt,
} from '@holoscript/core';

export const AEROSPACE_PLUGIN_ID = 'aerospace' as const;
export const AEROSPACE_RECEIPT_SCHEMA = DOMAIN_SIMULATION_RECEIPT_SCHEMA;

const G0 = 9.80665;
const DEFAULT_EARTH_SCALE_HEIGHT_M = 8500;
const DEFAULT_EARTH_SEA_LEVEL_DENSITY_KG_M3 = 1.225;

export const AEROSPACE_OBJECT_TYPES = [
  'aerospace_vehicle',
  'orbit_trajectory',
  'propulsion_burn',
  'reentry_profile',
  'aerospace_structure',
] as const;
export type AerospaceObjectType = (typeof AEROSPACE_OBJECT_TYPES)[number];

export const AEROSPACE_TRAITS = [
  'orbital_trajectory',
  'propulsion_delta_v',
  'reentry_thermal',
  'aero_structural_load',
  'aerospace_receipt',
] as const;
export type AerospaceTraitName = (typeof AEROSPACE_TRAITS)[number];

export interface AerospacePluginDescriptor {
  id: typeof AEROSPACE_PLUGIN_ID;
  version: string;
  objectTypes: readonly AerospaceObjectType[];
  traits: readonly AerospaceTraitName[];
  solverTypes: readonly ['two-body-trajectory', 'reentry-thermal', 'aero-structural-load'];
  receiptSchema: typeof AEROSPACE_RECEIPT_SCHEMA;
}

export const PLUGIN_DESCRIPTOR: AerospacePluginDescriptor = {
  id: AEROSPACE_PLUGIN_ID,
  version: '0.1.0',
  objectTypes: AEROSPACE_OBJECT_TYPES,
  traits: AEROSPACE_TRAITS,
  solverTypes: ['two-body-trajectory', 'reentry-thermal', 'aero-structural-load'],
  receiptSchema: AEROSPACE_RECEIPT_SCHEMA,
};

export interface PluginHostRegistry {
  registerObjectType(name: string, descriptor: { plugin: string }): void;
  registerTrait(name: string, descriptor: { plugin: string }): void;
}

export function register(host: PluginHostRegistry): AerospacePluginDescriptor {
  for (const name of AEROSPACE_OBJECT_TYPES) {
    host.registerObjectType(name, { plugin: PLUGIN_DESCRIPTOR.id });
  }
  for (const name of AEROSPACE_TRAITS) {
    host.registerTrait(name, { plugin: PLUGIN_DESCRIPTOR.id });
  }
  return PLUGIN_DESCRIPTOR;
}

export type Vector3 = [number, number, number];

export interface CentralBody {
  id: string;
  gravitationalParameterM3S2: number;
  radiusM: number;
  atmosphereScaleHeightM?: number;
  seaLevelDensityKgM3?: number;
}

export interface AerospaceVehicle {
  id: string;
  dryMassKg: number;
  propellantMassKg: number;
  specificImpulseSeconds: number;
  dragCoefficient: number;
  referenceAreaM2: number;
  noseRadiusM?: number;
}

export interface OrbitalState {
  epochSeconds: number;
  positionM: Vector3;
  velocityMps: Vector3;
  massKg?: number;
}

export interface PropulsionBurn {
  id: string;
  startSeconds: number;
  durationSeconds: number;
  thrustN: number;
  direction: Vector3;
  massFlowKgps?: number;
}

export interface TrajectorySolveConfig {
  horizonSeconds: number;
  timeStepSeconds: number;
}

export interface ReentryProfileConfig {
  startAltitudeM: number;
  endAltitudeM: number;
  initialVelocityMps: number;
  flightPathAngleDeg: number;
  sampleCount: number;
  durationSeconds?: number;
}

export interface ReentryThermalHarnessConfig {
  material?: string;
  gridResolution?: [number, number, number];
  domainSizeM?: [number, number, number];
  initialTemperatureC?: number;
  heatedAreaM2?: number;
  absorptionFraction?: number;
  timeStepSeconds?: number;
  steps?: number;
}

export interface AerospaceStructuralHarnessConfig {
  vertices: Float32Array;
  tetrahedra: Uint32Array;
  material?: StructuralConfig['material'];
  fixedNodeIds: number[];
  loadNodeId: number;
  loadDirection?: Vector3;
  loadScale?: number;
}

export interface AerospaceAcceptanceConfig {
  maxPeakTemperatureC?: number;
  minStructuralSafetyFactor?: number;
  maxDynamicPressurePa?: number;
}

export interface AerospaceMissionModel {
  id: string;
  centralBody: CentralBody;
  vehicle: AerospaceVehicle;
  initialState: OrbitalState;
  trajectory: TrajectorySolveConfig;
  burns?: PropulsionBurn[];
  reentry?: ReentryProfileConfig;
  thermalHarness?: ReentryThermalHarnessConfig;
  structuralHarness?: AerospaceStructuralHarnessConfig;
  acceptance?: AerospaceAcceptanceConfig;
}

export interface AerospaceValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface TrajectorySample {
  timeSeconds: number;
  positionM: Vector3;
  velocityMps: Vector3;
  altitudeM: number;
  massKg: number;
}

export interface PropulsionSummary {
  burnCount: number;
  totalImpulseNs: number;
  propellantUsedKg: number;
  idealDeltaVMps: number;
}

export interface ReentrySample {
  timeSeconds: number;
  altitudeM: number;
  velocityMps: number;
  densityKgM3: number;
  dynamicPressurePa: number;
  heatFluxWm2: number;
}

export interface ReentryProfile {
  samples: ReentrySample[];
  peakHeatFluxWm2: number;
  peakDynamicPressurePa: number;
}

export interface ThermalHarnessResult {
  solverType: 'thermal';
  peakHeatFluxWm2: number;
  absorbedPowerW: number;
  stats: ThermalStats;
}

export interface StructuralHarnessResult {
  solverType: 'structural';
  appliedLoadN: number;
  stats: StructuralStats;
}

export interface AerospaceMissionResult {
  solverType: 'aerospace-coupled';
  converged: boolean;
  trajectory: TrajectorySample[];
  propulsion: PropulsionSummary;
  reentry?: ReentryProfile;
  thermal?: ThermalHarnessResult;
  structural?: StructuralHarnessResult;
}

export interface AerospaceReceipt {
  schema: DomainSimulationReceipt['schema'];
  plugin: DomainSimulationReceipt['plugin'];
  pluginVersion: DomainSimulationReceipt['pluginVersion'];
  runId: DomainSimulationReceipt['runId'];
  createdAt: DomainSimulationReceipt['createdAt'];
  modelId: NonNullable<DomainSimulationReceipt['modelId']>;
  solverConfig: {
    solverType: 'aerospace-coupled';
    centralBodyId: string;
    trajectory: TrajectorySolveConfig;
    thermalHarness: boolean;
    structuralHarness: boolean;
    scale: 'vehicle' | 'mission';
  };
  resultSummary: {
    converged: boolean;
    sampleCount: number;
    minAltitudeM: number;
    maxAltitudeM: number;
    propellantUsedKg: number;
    idealDeltaVMps: number;
    peakHeatFluxWm2: number;
    peakDynamicPressurePa: number;
    peakTemperatureC: number | null;
    minStructuralSafetyFactor: number | null;
  };
  cael: {
    version: 'cael.v1';
    event: 'aerospace.mission_simulation';
    solverType: 'aerospace.coupled';
  };
  acceptance: DomainSimulationReceipt['acceptance'];
  payloadHash: DomainSimulationReceipt['payloadHash'];
  hashAlgorithm: DomainSimulationReceipt['hashAlgorithm'];
}

export interface AerospaceReceiptOptions {
  runId?: string;
  createdAt?: string;
}

interface MutableTrajectoryState {
  timeSeconds: number;
  positionM: Vector3;
  velocityMps: Vector3;
  massKg: number;
}

export class AerospaceTrajectorySolver implements SimSolver {
  readonly mode: SolverMode = 'transient';
  readonly fieldNames = ['position_m', 'velocity_mps', 'altitude_m', 'mass_kg'] as const;

  private state: MutableTrajectoryState;
  private samples: TrajectorySample[] = [];

  constructor(private readonly model: AerospaceMissionModel) {
    const massKg =
      model.initialState.massKg ??
      model.vehicle.dryMassKg + model.vehicle.propellantMassKg;
    this.state = {
      timeSeconds: model.initialState.epochSeconds,
      positionM: [...model.initialState.positionM],
      velocityMps: [...model.initialState.velocityMps],
      massKg,
    };
    this.recordSample();
  }

  step(dt: number = this.model.trajectory.timeStepSeconds): void {
    if (!Number.isFinite(dt) || dt <= 0) {
      throw new Error('[aerospace] trajectory step dt must be positive');
    }
    const next = integrateRK4(this.model, this.state, dt);
    next.massKg = Math.max(this.model.vehicle.dryMassKg, next.massKg - propellantUseDuring(this.model, this.state.timeSeconds, dt));
    this.state = next;
    this.recordSample();
  }

  solve(): void {
    const { horizonSeconds, timeStepSeconds } = this.model.trajectory;
    const target = this.model.initialState.epochSeconds + horizonSeconds;
    while (this.state.timeSeconds < target - 1e-9) {
      this.step(Math.min(timeStepSeconds, target - this.state.timeSeconds));
    }
  }

  getField(name: string): FieldData | null {
    if (name === 'position_m') {
      return new Float64Array(this.samples.flatMap((sample) => sample.positionM));
    }
    if (name === 'velocity_mps') {
      return new Float64Array(this.samples.flatMap((sample) => sample.velocityMps));
    }
    if (name === 'altitude_m') {
      return new Float64Array(this.samples.map((sample) => sample.altitudeM));
    }
    if (name === 'mass_kg') {
      return new Float64Array(this.samples.map((sample) => sample.massKg));
    }
    return null;
  }

  getStats(): Record<string, unknown> {
    return {
      solverType: 'two-body-trajectory',
      sampleCount: this.samples.length,
      minAltitudeM: minAltitude(this.samples),
      maxAltitudeM: maxAltitude(this.samples),
      finalMassKg: this.state.massKg,
      propulsion: estimatePropulsionSummary(this.model),
    };
  }

  getSamples(): TrajectorySample[] {
    return this.samples.map((sample) => ({
      ...sample,
      positionM: [...sample.positionM],
      velocityMps: [...sample.velocityMps],
    }));
  }

  dispose(): void {
    this.samples = [];
  }

  private recordSample(): void {
    this.samples.push({
      timeSeconds: this.state.timeSeconds,
      positionM: [...this.state.positionM],
      velocityMps: [...this.state.velocityMps],
      altitudeM: magnitude(this.state.positionM) - this.model.centralBody.radiusM,
      massKg: this.state.massKg,
    });
  }
}

export function createAerospaceTrajectorySolver(model: AerospaceMissionModel): AerospaceTrajectorySolver {
  return new AerospaceTrajectorySolver(model);
}

export function validateAerospaceMissionModel(model: AerospaceMissionModel): AerospaceValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!model.id) errors.push('model id is required');
  if (!Number.isFinite(model.centralBody.gravitationalParameterM3S2) || model.centralBody.gravitationalParameterM3S2 <= 0) {
    errors.push('centralBody.gravitationalParameterM3S2 must be positive');
  }
  if (!Number.isFinite(model.centralBody.radiusM) || model.centralBody.radiusM <= 0) {
    errors.push('centralBody.radiusM must be positive');
  }
  if (!Number.isFinite(model.vehicle.dryMassKg) || model.vehicle.dryMassKg <= 0) {
    errors.push('vehicle.dryMassKg must be positive');
  }
  if (!Number.isFinite(model.vehicle.propellantMassKg) || model.vehicle.propellantMassKg < 0) {
    errors.push('vehicle.propellantMassKg must be non-negative');
  }
  if (!Number.isFinite(model.vehicle.specificImpulseSeconds) || model.vehicle.specificImpulseSeconds <= 0) {
    errors.push('vehicle.specificImpulseSeconds must be positive');
  }
  if (!Number.isFinite(model.vehicle.referenceAreaM2) || model.vehicle.referenceAreaM2 <= 0) {
    errors.push('vehicle.referenceAreaM2 must be positive');
  }
  if (!isFiniteVector(model.initialState.positionM)) errors.push('initialState.positionM must contain finite values');
  if (!isFiniteVector(model.initialState.velocityMps)) errors.push('initialState.velocityMps must contain finite values');
  if (magnitude(model.initialState.positionM) <= model.centralBody.radiusM) {
    errors.push('initialState.positionM must start above the central-body surface');
  }
  if (!Number.isFinite(model.trajectory.horizonSeconds) || model.trajectory.horizonSeconds <= 0) {
    errors.push('trajectory.horizonSeconds must be positive');
  }
  if (!Number.isFinite(model.trajectory.timeStepSeconds) || model.trajectory.timeStepSeconds <= 0) {
    errors.push('trajectory.timeStepSeconds must be positive');
  }
  if (model.trajectory.timeStepSeconds > model.trajectory.horizonSeconds) {
    warnings.push('trajectory time step exceeds horizon; solver will emit only the terminal step');
  }

  for (const burn of model.burns ?? []) {
    if (!Number.isFinite(burn.thrustN) || burn.thrustN < 0) errors.push(`burn ${burn.id} thrustN must be non-negative`);
    if (!Number.isFinite(burn.durationSeconds) || burn.durationSeconds < 0) errors.push(`burn ${burn.id} durationSeconds must be non-negative`);
    if (!isFiniteVector(burn.direction) || magnitude(burn.direction) === 0) errors.push(`burn ${burn.id} direction must be a finite non-zero vector`);
  }

  if (model.reentry !== undefined) {
    if (model.reentry.startAltitudeM <= model.reentry.endAltitudeM) {
      errors.push('reentry.startAltitudeM must be greater than endAltitudeM');
    }
    if (model.reentry.sampleCount < 2) errors.push('reentry.sampleCount must be at least 2');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function solveAerospaceMission(model: AerospaceMissionModel): AerospaceMissionResult {
  const validation = validateAerospaceMissionModel(model);
  if (!validation.valid) {
    throw new Error(`[aerospace] invalid mission model: ${validation.errors.join('; ')}`);
  }

  const trajectorySolver = createAerospaceTrajectorySolver(model);
  trajectorySolver.solve();
  const trajectory = trajectorySolver.getSamples();
  const propulsion = estimatePropulsionSummary(model);
  const reentry = model.reentry ? generateReentryProfile(model.centralBody, model.vehicle, model.reentry) : undefined;
  const thermal = reentry && model.thermalHarness
    ? runReentryThermalHarness(reentry, model.thermalHarness)
    : undefined;
  const structural = reentry && model.structuralHarness
    ? runAerospaceStructuralHarness(reentry, model.vehicle, model.structuralHarness)
    : undefined;

  return {
    solverType: 'aerospace-coupled',
    converged: trajectory.every((sample) => isFiniteVector(sample.positionM) && isFiniteVector(sample.velocityMps)),
    trajectory,
    propulsion,
    reentry,
    thermal,
    structural,
  };
}

export function estimatePropulsionSummary(model: AerospaceMissionModel): PropulsionSummary {
  let totalImpulseNs = 0;
  let propellantUsedKg = 0;
  let idealDeltaVMps = 0;
  let massKg = model.initialState.massKg ?? model.vehicle.dryMassKg + model.vehicle.propellantMassKg;
  const minMassKg = model.vehicle.dryMassKg;

  for (const burn of model.burns ?? []) {
    const duration = Math.max(0, burn.durationSeconds);
    const impulse = burn.thrustN * duration;
    const massFlow = burn.massFlowKgps ?? burn.thrustN / (model.vehicle.specificImpulseSeconds * G0);
    const requestedPropellant = massFlow * duration;
    const used = Math.min(Math.max(0, requestedPropellant), Math.max(0, massKg - minMassKg));
    const nextMassKg = massKg - used;
    if (massKg > 0 && nextMassKg > 0 && nextMassKg < massKg) {
      idealDeltaVMps += model.vehicle.specificImpulseSeconds * G0 * Math.log(massKg / nextMassKg);
    }
    totalImpulseNs += impulse;
    propellantUsedKg += used;
    massKg = nextMassKg;
  }

  return {
    burnCount: model.burns?.length ?? 0,
    totalImpulseNs,
    propellantUsedKg,
    idealDeltaVMps,
  };
}

export function generateReentryProfile(
  centralBody: CentralBody,
  vehicle: AerospaceVehicle,
  config: ReentryProfileConfig,
): ReentryProfile {
  const scaleHeight = centralBody.atmosphereScaleHeightM ?? DEFAULT_EARTH_SCALE_HEIGHT_M;
  const seaLevelDensity = centralBody.seaLevelDensityKgM3 ?? DEFAULT_EARTH_SEA_LEVEL_DENSITY_KG_M3;
  const samples: ReentrySample[] = [];
  const count = Math.max(2, Math.floor(config.sampleCount));
  const flightPath = Math.abs(config.flightPathAngleDeg) * Math.PI / 180;
  const descentRate = Math.max(1, config.initialVelocityMps * Math.sin(flightPath));
  const duration = config.durationSeconds ?? (config.startAltitudeM - config.endAltitudeM) / descentRate;
  const noseRadiusM = vehicle.noseRadiusM ?? 0.5;

  for (let index = 0; index < count; index++) {
    const u = index / (count - 1);
    const altitudeM = lerp(config.startAltitudeM, config.endAltitudeM, u);
    const timeSeconds = duration * u;
    const densityKgM3 = seaLevelDensity * Math.exp(-Math.max(0, altitudeM) / scaleHeight);
    const dragSlowdown = 1 - 0.18 * u * u;
    const velocityMps = Math.max(0, config.initialVelocityMps * dragSlowdown);
    const dynamicPressurePa = 0.5 * densityKgM3 * velocityMps * velocityMps;
    const heatFluxWm2 = 1.83e-4 * Math.sqrt(densityKgM3 / noseRadiusM) * velocityMps ** 3;
    samples.push({ timeSeconds, altitudeM, velocityMps, densityKgM3, dynamicPressurePa, heatFluxWm2 });
  }

  return {
    samples,
    peakHeatFluxWm2: Math.max(0, ...samples.map((sample) => sample.heatFluxWm2)),
    peakDynamicPressurePa: Math.max(0, ...samples.map((sample) => sample.dynamicPressurePa)),
  };
}

export function runReentryThermalHarness(
  profile: ReentryProfile,
  config: ReentryThermalHarnessConfig = {},
): ThermalHarnessResult {
  const gridResolution = config.gridResolution ?? [5, 5, 3];
  const domainSizeM = config.domainSizeM ?? [1, 1, 0.25];
  const heatedAreaM2 = config.heatedAreaM2 ?? 1;
  const absorptionFraction = clamp(config.absorptionFraction ?? 0.35, 0, 1);
  const absorbedPowerW = profile.peakHeatFluxWm2 * heatedAreaM2 * absorptionFraction;
  const thermalConfig: ThermalConfig = {
    gridResolution,
    domainSize: domainSizeM,
    timeStep: config.timeStepSeconds ?? 0.02,
    materials: {},
    defaultMaterial: config.material ?? 'aluminum',
    boundaryConditions: [
      {
        type: 'convection',
        faces: ['x-', 'x+', 'y-', 'y+', 'z-', 'z+'],
        value: config.initialTemperatureC ?? 20,
        ambient: config.initialTemperatureC ?? 20,
        coefficient: 25,
      },
    ],
    sources: [
      {
        id: 'reentry-stagnation-heat',
        type: 'volume',
        position: [domainSizeM[0] / 2, domainSizeM[1] / 2, domainSizeM[2] / 2],
        heat_output: absorbedPowerW,
        radius: 1,
      },
    ],
    initialTemperature: config.initialTemperatureC ?? 20,
  };

  const solver = new ThermalSolver(thermalConfig);
  for (let step = 0; step < (config.steps ?? 8); step++) {
    solver.step(thermalConfig.timeStep);
  }
  const stats = solver.getStats();
  solver.dispose();

  return {
    solverType: 'thermal',
    peakHeatFluxWm2: profile.peakHeatFluxWm2,
    absorbedPowerW,
    stats,
  };
}

export function runAerospaceStructuralHarness(
  profile: ReentryProfile,
  vehicle: AerospaceVehicle,
  config: AerospaceStructuralHarnessConfig,
): StructuralHarnessResult {
  const loadDirection = normalize(config.loadDirection ?? [1, 0, 0]);
  const appliedLoadN = profile.peakDynamicPressurePa * vehicle.referenceAreaM2 * (config.loadScale ?? 1);
  const structuralConfig: StructuralConfig = {
    vertices: config.vertices,
    tetrahedra: config.tetrahedra,
    material: config.material ?? 'aluminum',
    constraints: [
      {
        id: 'aerospace-fixture',
        type: 'fixed',
        nodes: config.fixedNodeIds,
      },
    ],
    loads: [
      {
        id: 'peak-dynamic-pressure',
        type: 'point',
        nodeIndex: config.loadNodeId,
        force: [
          force(appliedLoadN * loadDirection[0]),
          force(appliedLoadN * loadDirection[1]),
          force(appliedLoadN * loadDirection[2]),
        ],
      },
    ],
    maxIterations: 250,
    tolerance: 1e-8,
  };

  const solver = new StructuralSolver(structuralConfig);
  solver.solve();
  const stats = solver.getStats();
  solver.dispose();

  return {
    solverType: 'structural',
    appliedLoadN,
    stats,
  };
}

export function buildAerospaceReceipt(
  model: AerospaceMissionModel,
  result: AerospaceMissionResult,
  options: string | AerospaceReceiptOptions = {},
): AerospaceReceipt {
  const normalizedOptions = typeof options === 'string' ? { runId: options } : options;
  const summary = aerospaceResultSummary(result);
  const receipt = buildDomainSimulationReceipt({
    plugin: AEROSPACE_PLUGIN_ID,
    pluginVersion: PLUGIN_DESCRIPTOR.version,
    runId: normalizedOptions.runId ?? `aerospace-${Date.now().toString(36)}`,
    createdAt: normalizedOptions.createdAt,
    modelId: model.id,
    solverConfig: {
      solverType: 'aerospace-coupled',
      centralBodyId: model.centralBody.id,
      trajectory: {
        horizonSeconds: model.trajectory.horizonSeconds,
        timeStepSeconds: model.trajectory.timeStepSeconds,
      },
      thermalHarness: result.thermal !== undefined,
      structuralHarness: result.structural !== undefined,
      scale: result.structural !== undefined || result.thermal !== undefined ? 'vehicle' : 'mission',
    },
    resultSummary: summary,
    cael: {
      version: 'cael.v1',
      event: 'aerospace.mission_simulation',
      solverType: 'aerospace.coupled',
    },
    acceptance: verifyAerospaceAcceptance(model, result),
  });

  return receipt as unknown as AerospaceReceipt;
}

export function verifyAerospaceAcceptance(
  model: AerospaceMissionModel,
  result: AerospaceMissionResult,
): AerospaceReceipt['acceptance'] {
  const violations: Array<{ criterion: string; message: string }> = [];
  const summary = aerospaceResultSummary(result);

  if (!result.converged) {
    violations.push({ criterion: 'trajectory_convergence', message: 'trajectory contains non-finite state samples' });
  }
  if (summary.minAltitudeM <= -1e-6) {
    violations.push({ criterion: 'surface_intersection', message: `minimum altitude ${summary.minAltitudeM} m intersects the central body` });
  }
  if (result.propulsion.propellantUsedKg - model.vehicle.propellantMassKg > 1e-9) {
    violations.push({ criterion: 'propellant_budget', message: 'propulsion summary exceeds onboard propellant' });
  }
  if (
    model.acceptance?.maxPeakTemperatureC !== undefined &&
    summary.peakTemperatureC !== null &&
    summary.peakTemperatureC > model.acceptance.maxPeakTemperatureC
  ) {
    violations.push({
      criterion: 'thermal_limit',
      message: `peak temperature ${summary.peakTemperatureC} C exceeds ${model.acceptance.maxPeakTemperatureC} C`,
    });
  }
  if (
    model.acceptance?.minStructuralSafetyFactor !== undefined &&
    summary.minStructuralSafetyFactor !== null &&
    summary.minStructuralSafetyFactor < model.acceptance.minStructuralSafetyFactor
  ) {
    violations.push({
      criterion: 'structural_safety_factor',
      message: `minimum safety factor ${summary.minStructuralSafetyFactor} is below ${model.acceptance.minStructuralSafetyFactor}`,
    });
  }
  if (
    model.acceptance?.maxDynamicPressurePa !== undefined &&
    summary.peakDynamicPressurePa > model.acceptance.maxDynamicPressurePa
  ) {
    violations.push({
      criterion: 'dynamic_pressure',
      message: `peak dynamic pressure ${summary.peakDynamicPressurePa} Pa exceeds ${model.acceptance.maxDynamicPressurePa} Pa`,
    });
  }

  return { accepted: violations.length === 0, violations };
}

export const pluginMeta = {
  name: '@holoscript/aerospace-plugin',
  version: PLUGIN_DESCRIPTOR.version,
  traits: AEROSPACE_TRAITS,
  objectTypes: AEROSPACE_OBJECT_TYPES,
};

function aerospaceResultSummary(result: AerospaceMissionResult): AerospaceReceipt['resultSummary'] {
  return {
    converged: result.converged,
    sampleCount: result.trajectory.length,
    minAltitudeM: minAltitude(result.trajectory),
    maxAltitudeM: maxAltitude(result.trajectory),
    propellantUsedKg: result.propulsion.propellantUsedKg,
    idealDeltaVMps: result.propulsion.idealDeltaVMps,
    peakHeatFluxWm2: result.reentry?.peakHeatFluxWm2 ?? 0,
    peakDynamicPressurePa: result.reentry?.peakDynamicPressurePa ?? 0,
    peakTemperatureC: result.thermal?.stats.maxTemperature ?? null,
    minStructuralSafetyFactor: finiteOrNull(result.structural?.stats.minSafetyFactor),
  };
}

function integrateRK4(
  model: AerospaceMissionModel,
  state: MutableTrajectoryState,
  dt: number,
): MutableTrajectoryState {
  const deriv = (input: MutableTrajectoryState): [Vector3, Vector3] => [
    input.velocityMps,
    accelerationAt(model, input),
  ];

  const [k1r, k1v] = deriv(state);
  const [k2r, k2v] = deriv(offsetState(state, k1r, k1v, dt / 2));
  const [k3r, k3v] = deriv(offsetState(state, k2r, k2v, dt / 2));
  const [k4r, k4v] = deriv(offsetState(state, k3r, k3v, dt));

  return {
    timeSeconds: state.timeSeconds + dt,
    positionM: addVectors(state.positionM, scaleVector(addVectors(addVectors(k1r, scaleVector(k2r, 2)), addVectors(scaleVector(k3r, 2), k4r)), dt / 6)),
    velocityMps: addVectors(state.velocityMps, scaleVector(addVectors(addVectors(k1v, scaleVector(k2v, 2)), addVectors(scaleVector(k3v, 2), k4v)), dt / 6)),
    massKg: state.massKg,
  };
}

function offsetState(state: MutableTrajectoryState, dr: Vector3, dv: Vector3, dt: number): MutableTrajectoryState {
  return {
    timeSeconds: state.timeSeconds + dt,
    positionM: addVectors(state.positionM, scaleVector(dr, dt)),
    velocityMps: addVectors(state.velocityMps, scaleVector(dv, dt)),
    massKg: state.massKg,
  };
}

function accelerationAt(model: AerospaceMissionModel, state: MutableTrajectoryState): Vector3 {
  const r = state.positionM;
  const radius = magnitude(r);
  const gravity = scaleVector(r, -model.centralBody.gravitationalParameterM3S2 / (radius ** 3));
  const thrust = activeThrustAcceleration(model, state);
  return addVectors(gravity, thrust);
}

function activeThrustAcceleration(model: AerospaceMissionModel, state: MutableTrajectoryState): Vector3 {
  let acceleration: Vector3 = [0, 0, 0];
  for (const burn of model.burns ?? []) {
    if (state.timeSeconds < burn.startSeconds || state.timeSeconds > burn.startSeconds + burn.durationSeconds) {
      continue;
    }
    acceleration = addVectors(acceleration, scaleVector(normalize(burn.direction), burn.thrustN / state.massKg));
  }
  return acceleration;
}

function propellantUseDuring(model: AerospaceMissionModel, startSeconds: number, dt: number): number {
  let used = 0;
  const endSeconds = startSeconds + dt;
  for (const burn of model.burns ?? []) {
    const burnStart = burn.startSeconds;
    const burnEnd = burn.startSeconds + burn.durationSeconds;
    const overlap = Math.max(0, Math.min(endSeconds, burnEnd) - Math.max(startSeconds, burnStart));
    if (overlap <= 0) continue;
    const massFlow = burn.massFlowKgps ?? burn.thrustN / (model.vehicle.specificImpulseSeconds * G0);
    used += massFlow * overlap;
  }
  return used;
}

function minAltitude(samples: TrajectorySample[]): number {
  return Math.min(...samples.map((sample) => sample.altitudeM));
}

function maxAltitude(samples: TrajectorySample[]): number {
  return Math.max(...samples.map((sample) => sample.altitudeM));
}

function finiteOrNull(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) ? value : null;
}

function isFiniteVector(vector: Vector3): boolean {
  return vector.every((value) => Number.isFinite(value));
}

function magnitude(vector: Vector3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalize(vector: Vector3): Vector3 {
  const length = magnitude(vector);
  if (length === 0) return [0, 0, 0];
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function addVectors(left: Vector3, right: Vector3): Vector3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function scaleVector(vector: Vector3, scale: number): Vector3 {
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale];
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
