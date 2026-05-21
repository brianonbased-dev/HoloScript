import { describe, expect, it } from 'vitest';
import {
  ENERGY_GRID_OBJECT_TYPES,
  ENERGY_GRID_RECEIPT_SCHEMA,
  ENERGY_GRID_TRAITS,
  buildDerDispatchQubo,
  buildEnergyGridReceipt,
  connectedComponents,
  createEnergyGridDCSolver,
  estimateBatteryDegradation,
  estimateSolarOutput,
  register,
  solveDCPowerFlow,
  validateEnergyGridModel,
  type EnergyGridModel,
  type PluginHostRegistry,
} from '../index';

function sampleGrid(): EnergyGridModel {
  return {
    id: 'microgrid-three-bus',
    baseMva: 100,
    buses: [
      { id: 'A', kind: 'slack', nominalKv: 13.8, generationMw: 90 },
      { id: 'B', kind: 'load', nominalKv: 13.8, demandMw: 50 },
      { id: 'C', kind: 'load', nominalKv: 13.8, demandMw: 40 },
    ],
    lines: [
      { id: 'AB', fromBusId: 'A', toBusId: 'B', reactancePu: 0.1, capacityMw: 100, resistancePu: 0.01 },
      { id: 'AC', fromBusId: 'A', toBusId: 'C', reactancePu: 0.2, capacityMw: 100, resistancePu: 0.01 },
      { id: 'BC', fromBusId: 'B', toBusId: 'C', reactancePu: 0.25, capacityMw: 40, resistancePu: 0.01 },
    ],
    batteries: [
      {
        id: 'battery-north',
        busId: 'B',
        capacityMwh: 40,
        stateOfChargeMwh: 20,
        maxChargeMw: 10,
        maxDischargeMw: 12,
      },
      {
        id: 'battery-south',
        busId: 'C',
        capacityMwh: 30,
        stateOfChargeMwh: 18,
        maxChargeMw: 8,
        maxDischargeMw: 9,
      },
    ],
    solarAssets: [
      {
        id: 'solar-yard',
        busId: 'C',
        areaM2: 12_000,
        moduleEfficiency: 0.21,
        derate: 0.88,
        inverterLimitMw: 2.1,
      },
    ],
  };
}

function fakeHost() {
  const objectTypes: string[] = [];
  const traits: string[] = [];
  const host: PluginHostRegistry = {
    registerObjectType(name) {
      objectTypes.push(name);
    },
    registerTrait(name) {
      traits.push(name);
    },
  };
  return { host, objectTypes, traits };
}

describe('@holoscript/energy-grid-plugin', () => {
  it('registers energy-grid object types and traits', () => {
    const { host, objectTypes, traits } = fakeHost();
    const descriptor = register(host);

    expect(descriptor.id).toBe('energy-grid');
    expect(objectTypes).toEqual([...ENERGY_GRID_OBJECT_TYPES]);
    expect(traits).toEqual([...ENERGY_GRID_TRAITS]);
    expect(descriptor.receiptSchema).toBe(ENERGY_GRID_RECEIPT_SCHEMA);
  });

  it('validates topology and reports connected islands', () => {
    const grid = sampleGrid();
    expect(validateEnergyGridModel(grid).valid).toBe(true);
    expect(connectedComponents(grid)).toEqual([['A', 'B', 'C']]);

    const broken: EnergyGridModel = {
      ...grid,
      lines: [{ ...grid.lines[0], toBusId: 'missing' }],
    };
    const validation = validateEnergyGridModel(broken);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join('\n')).toContain('missing toBusId');
  });

  it('solves deterministic three-bus DC power flow', () => {
    const result = solveDCPowerFlow(sampleGrid());

    expect(result.converged).toBe(true);
    expect(result.slackBusId).toBe('A');
    expect(result.busVoltageAnglesRad.A).toBeCloseTo(0, 12);
    expect(result.busVoltageAnglesRad.B).toBeCloseTo(-0.0554545, 5);
    expect(result.busVoltageAnglesRad.C).toBeCloseTo(-0.0690909, 5);
    expect(result.lineFlowsMw.AB).toBeCloseTo(55.4545, 4);
    expect(result.lineFlowsMw.AC).toBeCloseTo(34.54545, 4);
    expect(result.lineFlowsMw.BC).toBeCloseTo(5.4545, 4);
    expect(result.overloadedLineIds).toEqual([]);
  });

  it('implements the generic SimSolver field contract', () => {
    const solver = createEnergyGridDCSolver(sampleGrid());
    solver.solve();

    expect(solver.mode).toBe('steady-state');
    expect([...solver.fieldNames]).toContain('line_flow_mw');
    expect(Array.from(solver.getField('line_flow_mw') as Float64Array)).toHaveLength(3);
    expect(solver.getStats().solverType).toBe('dc-power-flow');
  });

  it('flags overloaded lines in receipts', () => {
    const grid = sampleGrid();
    grid.lines[0] = { ...grid.lines[0], capacityMw: 40 };
    const result = solveDCPowerFlow(grid);
    const receipt = buildEnergyGridReceipt(grid, result, 'receipt-test');

    expect(result.overloadedLineIds).toEqual(['AB']);
    expect(receipt.schema).toBe(ENERGY_GRID_RECEIPT_SCHEMA);
    expect(receipt.cael.solverType).toBe('energy-grid.dc-power-flow');
    expect(receipt.acceptance.accepted).toBe(false);
    expect(receipt.acceptance.violations.map((v) => v.criterion)).toContain('line_capacity');
  });

  it('estimates solar output with clipping and weather derate', () => {
    const asset = sampleGrid().solarAssets?.[0];
    expect(asset).toBeDefined();

    const estimate = estimateSolarOutput(asset!, {
      globalHorizontalIrradianceWm2: 950,
      cloudCoverFraction: 0,
      ambientTemperatureC: 25,
    });

    expect(estimate.rawMw).toBeCloseTo(2.394, 3);
    expect(estimate.deliveredMw).toBeLessThanOrEqual(2.1);
    expect(estimate.clippedMw).toBeGreaterThan(0);
  });

  it('estimates battery degradation from throughput, temperature, and C-rate', () => {
    const battery = sampleGrid().batteries?.[0];
    expect(battery).toBeDefined();

    const degradation = estimateBatteryDegradation({
      battery: battery!,
      throughputMwh: 20,
      ambientTemperatureC: 35,
      averageStateOfChargeFraction: 0.8,
    });

    expect(degradation.batteryId).toBe('battery-north');
    expect(degradation.equivalentFullCycles).toBeCloseTo(0.25, 6);
    expect(degradation.temperatureFactor).toBeGreaterThan(1);
    expect(degradation.cycleFadePercent).toBeGreaterThan(0);
  });

  it('builds a QAOA-eligible QUBO for DER dispatch', () => {
    const qubo = buildDerDispatchQubo(sampleGrid(), 18);

    expect(qubo.qaoaEligible).toBe(true);
    expect(qubo.variables.map((v) => v.name)).toEqual(['x_battery_north', 'x_battery_south']);
    expect(qubo.linear.x_battery_north).toBeCloseTo(12 * 12 - 2 * 18 * 12, 6);
    expect(qubo.quadratic['x_battery_north:x_battery_south']).toBeCloseTo(2 * 12 * 9, 6);
    expect(qubo.constant).toBe(18 * 18);
  });
});
