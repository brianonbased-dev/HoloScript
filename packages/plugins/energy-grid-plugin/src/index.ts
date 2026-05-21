/**
 * @holoscript/energy-grid-plugin
 *
 * First deep slice for energy-grid simulation: typed topology, deterministic
 * DC power-flow solving, solar and battery primitives, QUBO hooks for DER
 * dispatch, and CAEL-ready receipt summaries.
 */

import type { FieldData, SimSolver, SolverMode } from '@holoscript/engine/simulation';
import {
  DOMAIN_SIMULATION_RECEIPT_SCHEMA,
  buildDomainSimulationReceipt,
  type DomainSimulationReceipt,
} from '@holoscript/core';

export const ENERGY_GRID_PLUGIN_ID = 'energy-grid' as const;
export const ENERGY_GRID_RECEIPT_SCHEMA = DOMAIN_SIMULATION_RECEIPT_SCHEMA;

export const ENERGY_GRID_OBJECT_TYPES = [
  'grid_bus',
  'grid_line',
  'solar_asset',
  'battery_asset',
  'der_dispatch_plan',
] as const;
export type EnergyGridObjectType = (typeof ENERGY_GRID_OBJECT_TYPES)[number];

export const ENERGY_GRID_TRAITS = [
  'power_flow',
  'solar_irradiance',
  'battery_degradation',
  'der_qubo',
  'grid_topology',
] as const;
export type EnergyGridTraitName = (typeof ENERGY_GRID_TRAITS)[number];

export interface EnergyGridPluginDescriptor {
  id: typeof ENERGY_GRID_PLUGIN_ID;
  version: string;
  objectTypes: readonly EnergyGridObjectType[];
  traits: readonly EnergyGridTraitName[];
  solverTypes: readonly ['dc-power-flow'];
  receiptSchema: typeof ENERGY_GRID_RECEIPT_SCHEMA;
}

export const PLUGIN_DESCRIPTOR: EnergyGridPluginDescriptor = {
  id: ENERGY_GRID_PLUGIN_ID,
  version: '0.1.0',
  objectTypes: ENERGY_GRID_OBJECT_TYPES,
  traits: ENERGY_GRID_TRAITS,
  solverTypes: ['dc-power-flow'],
  receiptSchema: ENERGY_GRID_RECEIPT_SCHEMA,
};

export interface PluginHostRegistry {
  registerObjectType(name: string, descriptor: { plugin: string }): void;
  registerTrait(name: string, descriptor: { plugin: string }): void;
}

export function register(host: PluginHostRegistry): EnergyGridPluginDescriptor {
  for (const name of ENERGY_GRID_OBJECT_TYPES) {
    host.registerObjectType(name, { plugin: PLUGIN_DESCRIPTOR.id });
  }
  for (const name of ENERGY_GRID_TRAITS) {
    host.registerTrait(name, { plugin: PLUGIN_DESCRIPTOR.id });
  }
  return PLUGIN_DESCRIPTOR;
}

export type BusKind = 'slack' | 'load' | 'generator' | 'storage' | 'interconnect';
export type LineStatus = 'closed' | 'open';

export interface EnergyBus {
  id: string;
  kind: BusKind;
  nominalKv: number;
  demandMw?: number;
  generationMw?: number;
  batteryDispatchMw?: number;
  zone?: string;
}

export interface EnergyLine {
  id: string;
  fromBusId: string;
  toBusId: string;
  reactancePu: number;
  capacityMw: number;
  resistancePu?: number;
  status?: LineStatus;
}

export interface SolarAsset {
  id: string;
  busId: string;
  areaM2: number;
  moduleEfficiency: number;
  derate?: number;
  inverterLimitMw?: number;
}

export interface BatteryAsset {
  id: string;
  busId: string;
  capacityMwh: number;
  stateOfChargeMwh: number;
  maxChargeMw: number;
  maxDischargeMw: number;
  cycleCount?: number;
  temperatureC?: number;
}

export interface EnergyGridModel {
  id: string;
  baseMva: number;
  buses: EnergyBus[];
  lines: EnergyLine[];
  solarAssets?: SolarAsset[];
  batteries?: BatteryAsset[];
}

export interface SolarIrradianceSample {
  globalHorizontalIrradianceWm2: number;
  cloudCoverFraction?: number;
  ambientTemperatureC?: number;
}

export interface SolarOutputEstimate {
  assetId: string;
  busId: string;
  rawMw: number;
  deliveredMw: number;
  clippedMw: number;
  derate: number;
}

export interface BatteryDegradationInput {
  battery: BatteryAsset;
  throughputMwh: number;
  averageStateOfChargeFraction?: number;
  ambientTemperatureC?: number;
}

export interface BatteryDegradationEstimate {
  batteryId: string;
  equivalentFullCycles: number;
  cycleFadePercent: number;
  temperatureFactor: number;
  cRateFactor: number;
  projectedCycleCount: number;
}

export interface DCPowerFlowResult {
  solverType: 'dc-power-flow';
  converged: boolean;
  slackBusId: string;
  busVoltageAnglesRad: Record<string, number>;
  busNetInjectionMw: Record<string, number>;
  lineFlowsMw: Record<string, number>;
  lineLoadingRatio: Record<string, number>;
  overloadedLineIds: string[];
  estimatedLossMw: number;
}

export interface DerDispatchQuboVariable {
  name: string;
  assetId: string;
  busId: string;
  dischargeMw: number;
}

export interface DerDispatchQubo {
  objective: 'minimize_squared_dispatch_gap';
  targetMw: number;
  variables: DerDispatchQuboVariable[];
  linear: Record<string, number>;
  quadratic: Record<string, number>;
  constant: number;
  qaoaEligible: true;
}

export interface EnergyGridReceipt {
  schema: DomainSimulationReceipt['schema'];
  plugin: DomainSimulationReceipt['plugin'];
  pluginVersion: DomainSimulationReceipt['pluginVersion'];
  runId: DomainSimulationReceipt['runId'];
  createdAt: DomainSimulationReceipt['createdAt'];
  modelId: NonNullable<DomainSimulationReceipt['modelId']>;
  solverConfig: {
    solverType: 'dc-power-flow';
    baseMva: number;
    busCount: number;
    lineCount: number;
    slackBusId: string;
    scale: 'grid';
  };
  resultSummary: {
    converged: boolean;
    maxLineLoadingRatio: number;
    overloadedLineIds: string[];
    estimatedLossMw: number;
    totalDemandMw: number;
    totalGenerationMw: number;
  };
  cael: {
    version: 'cael.v1';
    event: 'energy_grid.power_flow';
    solverType: 'energy-grid.dc-power-flow';
  };
  acceptance: DomainSimulationReceipt['acceptance'];
  payloadHash: DomainSimulationReceipt['payloadHash'];
  hashAlgorithm: DomainSimulationReceipt['hashAlgorithm'];
}

export interface EnergyGridReceiptOptions {
  runId?: string;
  createdAt?: string;
}

export interface EnergyGridValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  connectedComponents: string[][];
}

export interface DCPowerFlowSolveOptions {
  overloadToleranceRatio?: number;
}

export class EnergyGridDCSolver implements SimSolver {
  readonly mode: SolverMode = 'steady-state';
  readonly fieldNames = [
    'bus_voltage_angle_rad',
    'bus_net_injection_mw',
    'line_flow_mw',
    'line_loading_ratio',
  ] as const;

  private result: DCPowerFlowResult | null = null;
  private readonly orderedBusIds: string[];
  private readonly orderedLineIds: string[];

  constructor(private readonly model: EnergyGridModel) {
    this.orderedBusIds = model.buses.map((bus) => bus.id);
    this.orderedLineIds = model.lines.map((line) => line.id);
  }

  step(): void {}

  solve(): void {
    this.result = solveDCPowerFlow(this.model);
  }

  getField(name: string): FieldData | null {
    const result = this.result ?? solveDCPowerFlow(this.model);
    this.result = result;

    if (name === 'bus_voltage_angle_rad') {
      return new Float64Array(this.orderedBusIds.map((id) => result.busVoltageAnglesRad[id] ?? 0));
    }
    if (name === 'bus_net_injection_mw') {
      return new Float64Array(this.orderedBusIds.map((id) => result.busNetInjectionMw[id] ?? 0));
    }
    if (name === 'line_flow_mw') {
      return new Float64Array(this.orderedLineIds.map((id) => result.lineFlowsMw[id] ?? 0));
    }
    if (name === 'line_loading_ratio') {
      return new Float64Array(this.orderedLineIds.map((id) => result.lineLoadingRatio[id] ?? 0));
    }
    return null;
  }

  getStats(): Record<string, unknown> {
    const result = this.result ?? solveDCPowerFlow(this.model);
    this.result = result;
    return {
      solverType: result.solverType,
      converged: result.converged,
      busCount: this.model.buses.length,
      lineCount: this.model.lines.length,
      slackBusId: result.slackBusId,
      totalDemandMw: totalDemandMw(this.model),
      totalGenerationMw: totalGenerationMw(this.model),
      maxLineLoadingRatio: maxLineLoadingRatio(result),
      overloadCount: result.overloadedLineIds.length,
      estimatedLossMw: result.estimatedLossMw,
    };
  }

  dispose(): void {
    this.result = null;
  }
}

export function createEnergyGridDCSolver(model: EnergyGridModel): EnergyGridDCSolver {
  return new EnergyGridDCSolver(model);
}

export function validateEnergyGridModel(model: EnergyGridModel): EnergyGridValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Number.isFinite(model.baseMva) || model.baseMva <= 0) {
    errors.push('baseMva must be a positive finite number');
  }

  const busIds = new Set<string>();
  for (const bus of model.buses) {
    if (busIds.has(bus.id)) {
      errors.push(`duplicate bus id: ${bus.id}`);
    }
    busIds.add(bus.id);
    if (!Number.isFinite(bus.nominalKv) || bus.nominalKv <= 0) {
      errors.push(`bus ${bus.id} nominalKv must be positive`);
    }
  }

  const slackBuses = model.buses.filter((bus) => bus.kind === 'slack');
  if (slackBuses.length !== 1) {
    errors.push(`expected exactly one slack bus, found ${slackBuses.length}`);
  }

  const lineIds = new Set<string>();
  for (const line of model.lines) {
    if (lineIds.has(line.id)) {
      errors.push(`duplicate line id: ${line.id}`);
    }
    lineIds.add(line.id);
    if (!busIds.has(line.fromBusId)) {
      errors.push(`line ${line.id} references missing fromBusId ${line.fromBusId}`);
    }
    if (!busIds.has(line.toBusId)) {
      errors.push(`line ${line.id} references missing toBusId ${line.toBusId}`);
    }
    if (!Number.isFinite(line.reactancePu) || line.reactancePu <= 0) {
      errors.push(`line ${line.id} reactancePu must be positive`);
    }
    if (!Number.isFinite(line.capacityMw) || line.capacityMw <= 0) {
      errors.push(`line ${line.id} capacityMw must be positive`);
    }
    if (line.resistancePu !== undefined && (!Number.isFinite(line.resistancePu) || line.resistancePu < 0)) {
      errors.push(`line ${line.id} resistancePu must be non-negative when provided`);
    }
  }

  for (const solar of model.solarAssets ?? []) {
    if (!busIds.has(solar.busId)) {
      errors.push(`solar asset ${solar.id} references missing bus ${solar.busId}`);
    }
    if (!Number.isFinite(solar.areaM2) || solar.areaM2 <= 0) {
      errors.push(`solar asset ${solar.id} areaM2 must be positive`);
    }
    if (!Number.isFinite(solar.moduleEfficiency) || solar.moduleEfficiency <= 0 || solar.moduleEfficiency > 1) {
      errors.push(`solar asset ${solar.id} moduleEfficiency must be in (0, 1]`);
    }
  }

  for (const battery of model.batteries ?? []) {
    if (!busIds.has(battery.busId)) {
      errors.push(`battery ${battery.id} references missing bus ${battery.busId}`);
    }
    if (!Number.isFinite(battery.capacityMwh) || battery.capacityMwh <= 0) {
      errors.push(`battery ${battery.id} capacityMwh must be positive`);
    }
    if (battery.stateOfChargeMwh < 0 || battery.stateOfChargeMwh > battery.capacityMwh) {
      errors.push(`battery ${battery.id} stateOfChargeMwh must be within capacity`);
    }
  }

  const components = connectedComponents(model);
  if (components.length > 1) {
    warnings.push(`grid topology has ${components.length} connected islands`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    connectedComponents: components,
  };
}

export function connectedComponents(model: EnergyGridModel): string[][] {
  const adjacency = new Map<string, Set<string>>();
  for (const bus of model.buses) {
    adjacency.set(bus.id, new Set<string>());
  }

  for (const line of activeLines(model)) {
    adjacency.get(line.fromBusId)?.add(line.toBusId);
    adjacency.get(line.toBusId)?.add(line.fromBusId);
  }

  const seen = new Set<string>();
  const components: string[][] = [];
  for (const bus of model.buses) {
    if (seen.has(bus.id)) continue;
    const queue = [bus.id];
    const component: string[] = [];
    seen.add(bus.id);
    while (queue.length > 0) {
      const next = queue.shift();
      if (next === undefined) continue;
      component.push(next);
      for (const neighbor of adjacency.get(next) ?? []) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }
  return components;
}

export function solveDCPowerFlow(
  model: EnergyGridModel,
  options: DCPowerFlowSolveOptions = {},
): DCPowerFlowResult {
  const validation = validateEnergyGridModel(model);
  if (!validation.valid) {
    throw new Error(`[energy-grid] invalid model: ${validation.errors.join('; ')}`);
  }
  if (validation.connectedComponents.length !== 1) {
    throw new Error('[energy-grid] DC power flow requires one connected island for this first solver slice');
  }

  const slackBus = model.buses.find((bus) => bus.kind === 'slack');
  if (slackBus === undefined) {
    throw new Error('[energy-grid] slack bus missing after validation');
  }

  const busIndex = new Map<string, number>();
  model.buses.forEach((bus, index) => busIndex.set(bus.id, index));
  const slackIndex = indexOfRequiredBus(busIndex, slackBus.id);
  const susceptance = buildSusceptanceMatrix(model, busIndex);
  const injectionsPu = model.buses.map((bus) => netInjectionMw(bus) / model.baseMva);

  const reducedMatrix: number[][] = [];
  const reducedRhs: number[] = [];
  for (let row = 0; row < model.buses.length; row++) {
    if (row === slackIndex) continue;
    const reducedRow: number[] = [];
    for (let col = 0; col < model.buses.length; col++) {
      if (col === slackIndex) continue;
      reducedRow.push(susceptance[row][col]);
    }
    reducedMatrix.push(reducedRow);
    reducedRhs.push(injectionsPu[row]);
  }

  const solvedAngles = solveLinearSystem(reducedMatrix, reducedRhs);
  const angles = new Array<number>(model.buses.length).fill(0);
  let cursor = 0;
  for (let index = 0; index < angles.length; index++) {
    if (index === slackIndex) continue;
    angles[index] = solvedAngles[cursor] ?? 0;
    cursor += 1;
  }

  const busVoltageAnglesRad: Record<string, number> = {};
  const busNetInjectionMw: Record<string, number> = {};
  for (let index = 0; index < model.buses.length; index++) {
    const bus = model.buses[index];
    busVoltageAnglesRad[bus.id] = angles[index];
    busNetInjectionMw[bus.id] = netInjectionMw(bus);
  }

  const lineFlowsMw: Record<string, number> = {};
  const lineLoadingRatio: Record<string, number> = {};
  const overloadedLineIds: string[] = [];
  let estimatedLossMw = 0;
  const overloadToleranceRatio = options.overloadToleranceRatio ?? 1;

  for (const line of model.lines) {
    if (line.status === 'open') {
      lineFlowsMw[line.id] = 0;
      lineLoadingRatio[line.id] = 0;
      continue;
    }
    const fromIndex = indexOfRequiredBus(busIndex, line.fromBusId);
    const toIndex = indexOfRequiredBus(busIndex, line.toBusId);
    const flowMw = ((angles[fromIndex] - angles[toIndex]) / line.reactancePu) * model.baseMva;
    const loading = Math.abs(flowMw) / line.capacityMw;
    lineFlowsMw[line.id] = flowMw;
    lineLoadingRatio[line.id] = loading;
    if (loading > overloadToleranceRatio) {
      overloadedLineIds.push(line.id);
    }
    if (line.resistancePu !== undefined) {
      const currentPu = flowMw / model.baseMva;
      estimatedLossMw += currentPu * currentPu * line.resistancePu * model.baseMva;
    }
  }

  return {
    solverType: 'dc-power-flow',
    converged: true,
    slackBusId: slackBus.id,
    busVoltageAnglesRad,
    busNetInjectionMw,
    lineFlowsMw,
    lineLoadingRatio,
    overloadedLineIds,
    estimatedLossMw,
  };
}

export function estimateSolarOutput(
  asset: SolarAsset,
  sample: SolarIrradianceSample,
): SolarOutputEstimate {
  const cloudFactor = 1 - clamp(sample.cloudCoverFraction ?? 0, 0, 1) * 0.75;
  const temperatureC = sample.ambientTemperatureC ?? 25;
  const temperatureDerate = 1 - Math.max(0, temperatureC - 25) * 0.004;
  const derate = clamp((asset.derate ?? 0.86) * cloudFactor * temperatureDerate, 0, 1);
  const rawMw = (sample.globalHorizontalIrradianceWm2 * asset.areaM2 * asset.moduleEfficiency) / 1_000_000;
  const deliveredBeforeClip = rawMw * derate;
  const deliveredMw = Math.min(deliveredBeforeClip, asset.inverterLimitMw ?? deliveredBeforeClip);
  return {
    assetId: asset.id,
    busId: asset.busId,
    rawMw,
    deliveredMw,
    clippedMw: Math.max(0, deliveredBeforeClip - deliveredMw),
    derate,
  };
}

export function estimateBatteryDegradation(input: BatteryDegradationInput): BatteryDegradationEstimate {
  const { battery } = input;
  const equivalentFullCycles = input.throughputMwh / (2 * battery.capacityMwh);
  const soc = clamp(input.averageStateOfChargeFraction ?? battery.stateOfChargeMwh / battery.capacityMwh, 0, 1);
  const temperatureC = input.ambientTemperatureC ?? battery.temperatureC ?? 25;
  const temperatureFactor = 1 + Math.max(0, temperatureC - 25) * 0.035;
  const cRate = Math.max(battery.maxChargeMw, battery.maxDischargeMw) / battery.capacityMwh;
  const cRateFactor = 1 + Math.max(0, cRate - 0.5) * 0.3;
  const socStress = 1 + Math.abs(soc - 0.5) * 0.4;
  const baseCycleFadePercent = 0.018;
  const cycleFadePercent =
    equivalentFullCycles * baseCycleFadePercent * temperatureFactor * cRateFactor * socStress;

  return {
    batteryId: battery.id,
    equivalentFullCycles,
    cycleFadePercent,
    temperatureFactor,
    cRateFactor,
    projectedCycleCount: (battery.cycleCount ?? 0) + equivalentFullCycles,
  };
}

export function buildDerDispatchQubo(
  model: EnergyGridModel,
  targetMw: number,
): DerDispatchQubo {
  if (!Number.isFinite(targetMw) || targetMw < 0) {
    throw new Error('[energy-grid] targetMw must be a non-negative finite number');
  }

  const variables: DerDispatchQuboVariable[] = (model.batteries ?? []).map((battery) => ({
    name: `x_${sanitizeQuboName(battery.id)}`,
    assetId: battery.id,
    busId: battery.busId,
    dischargeMw: Math.min(battery.maxDischargeMw, battery.stateOfChargeMwh),
  }));

  const linear: Record<string, number> = {};
  const quadratic: Record<string, number> = {};

  for (let i = 0; i < variables.length; i++) {
    const vi = variables[i];
    linear[vi.name] = vi.dischargeMw * vi.dischargeMw - 2 * targetMw * vi.dischargeMw;
    for (let j = i + 1; j < variables.length; j++) {
      const vj = variables[j];
      quadratic[quboPairKey(vi.name, vj.name)] = 2 * vi.dischargeMw * vj.dischargeMw;
    }
  }

  return {
    objective: 'minimize_squared_dispatch_gap',
    targetMw,
    variables,
    linear,
    quadratic,
    constant: targetMw * targetMw,
    qaoaEligible: true,
  };
}

export function buildEnergyGridReceipt(
  model: EnergyGridModel,
  result: DCPowerFlowResult,
  options: string | EnergyGridReceiptOptions = {},
): EnergyGridReceipt {
  const normalizedOptions = typeof options === 'string' ? { runId: options } : options;
  const acceptance = verifyPowerFlowAcceptance(model, result);
  const receipt = buildDomainSimulationReceipt({
    plugin: ENERGY_GRID_PLUGIN_ID,
    pluginVersion: PLUGIN_DESCRIPTOR.version,
    runId: normalizedOptions.runId ?? `energy-grid-${Date.now().toString(36)}`,
    createdAt: normalizedOptions.createdAt,
    modelId: model.id,
    solverConfig: {
      solverType: 'dc-power-flow',
      baseMva: model.baseMva,
      busCount: model.buses.length,
      lineCount: model.lines.length,
      slackBusId: result.slackBusId,
      scale: 'grid',
    },
    resultSummary: {
      converged: result.converged,
      maxLineLoadingRatio: maxLineLoadingRatio(result),
      overloadedLineIds: [...result.overloadedLineIds],
      estimatedLossMw: result.estimatedLossMw,
      totalDemandMw: totalDemandMw(model),
      totalGenerationMw: totalGenerationMw(model),
    },
    cael: {
      version: 'cael.v1',
      event: 'energy_grid.power_flow',
      solverType: 'energy-grid.dc-power-flow',
    },
    acceptance,
  });

  return receipt as EnergyGridReceipt;
}

export function verifyPowerFlowAcceptance(
  model: EnergyGridModel,
  result: DCPowerFlowResult,
): EnergyGridReceipt['acceptance'] {
  const violations: Array<{ criterion: string; message: string }> = [];

  if (!result.converged) {
    violations.push({ criterion: 'convergence', message: 'DC power flow did not converge' });
  }

  const netInjection = Object.values(result.busNetInjectionMw).reduce((sum, value) => sum + value, 0);
  if (Math.abs(netInjection) > Math.max(1e-6, model.baseMva * 1e-9)) {
    violations.push({
      criterion: 'power_balance',
      message: `net injection ${netInjection.toFixed(9)} MW is not balanced`,
    });
  }

  if (result.overloadedLineIds.length > 0) {
    violations.push({
      criterion: 'line_capacity',
      message: `overloaded lines: ${result.overloadedLineIds.join(', ')}`,
    });
  }

  return { accepted: violations.length === 0, violations };
}

export const pluginMeta = {
  name: '@holoscript/energy-grid-plugin',
  version: PLUGIN_DESCRIPTOR.version,
  traits: ENERGY_GRID_TRAITS,
  objectTypes: ENERGY_GRID_OBJECT_TYPES,
};

function activeLines(model: EnergyGridModel): EnergyLine[] {
  return model.lines.filter((line) => line.status !== 'open');
}

function buildSusceptanceMatrix(model: EnergyGridModel, busIndex: Map<string, number>): number[][] {
  const n = model.buses.length;
  const matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const line of activeLines(model)) {
    const from = indexOfRequiredBus(busIndex, line.fromBusId);
    const to = indexOfRequiredBus(busIndex, line.toBusId);
    const b = 1 / line.reactancePu;
    matrix[from][from] += b;
    matrix[to][to] += b;
    matrix[from][to] -= b;
    matrix[to][from] -= b;
  }
  return matrix;
}

function solveLinearSystem(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  if (n === 0) return [];
  const a = matrix.map((row, rowIndex) => {
    if (row.length !== n) {
      throw new Error(`[energy-grid] reduced matrix row ${rowIndex} has length ${row.length}, expected ${n}`);
    }
    return [...row];
  });
  const b = [...rhs];

  for (let pivot = 0; pivot < n; pivot++) {
    let bestRow = pivot;
    let bestAbs = Math.abs(a[pivot][pivot]);
    for (let row = pivot + 1; row < n; row++) {
      const value = Math.abs(a[row][pivot]);
      if (value > bestAbs) {
        bestAbs = value;
        bestRow = row;
      }
    }
    if (bestAbs < 1e-12) {
      throw new Error('[energy-grid] singular admittance matrix; check topology and slack bus');
    }
    if (bestRow !== pivot) {
      [a[pivot], a[bestRow]] = [a[bestRow], a[pivot]];
      [b[pivot], b[bestRow]] = [b[bestRow], b[pivot]];
    }

    const pivotValue = a[pivot][pivot];
    for (let col = pivot; col < n; col++) {
      a[pivot][col] /= pivotValue;
    }
    b[pivot] /= pivotValue;

    for (let row = 0; row < n; row++) {
      if (row === pivot) continue;
      const factor = a[row][pivot];
      if (factor === 0) continue;
      for (let col = pivot; col < n; col++) {
        a[row][col] -= factor * a[pivot][col];
      }
      b[row] -= factor * b[pivot];
    }
  }

  return b;
}

function indexOfRequiredBus(busIndex: Map<string, number>, busId: string): number {
  const index = busIndex.get(busId);
  if (index === undefined) {
    throw new Error(`[energy-grid] missing bus id: ${busId}`);
  }
  return index;
}

function netInjectionMw(bus: EnergyBus): number {
  return (bus.generationMw ?? 0) + (bus.batteryDispatchMw ?? 0) - (bus.demandMw ?? 0);
}

function totalDemandMw(model: EnergyGridModel): number {
  return model.buses.reduce((sum, bus) => sum + (bus.demandMw ?? 0), 0);
}

function totalGenerationMw(model: EnergyGridModel): number {
  return model.buses.reduce((sum, bus) => sum + (bus.generationMw ?? 0) + (bus.batteryDispatchMw ?? 0), 0);
}

function maxLineLoadingRatio(result: DCPowerFlowResult): number {
  return Math.max(0, ...Object.values(result.lineLoadingRatio));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeQuboName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '_');
}

function quboPairKey(left: string, right: string): string {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}
