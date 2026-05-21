import { describe, expect, it } from 'vitest';
import {
  AEROSPACE_OBJECT_TYPES,
  AEROSPACE_RECEIPT_SCHEMA,
  AEROSPACE_TRAITS,
  buildAerospaceReceipt,
  createAerospaceTrajectorySolver,
  estimatePropulsionSummary,
  generateReentryProfile,
  register,
  runAerospaceStructuralHarness,
  runReentryThermalHarness,
  solveAerospaceMission,
  validateAerospaceMissionModel,
  type AerospaceMissionModel,
  type PluginHostRegistry,
} from '../index';

const EARTH_RADIUS_M = 6_371_000;
const EARTH_MU = 3.986004418e14;

function sampleMission(): AerospaceMissionModel {
  const orbitRadius = EARTH_RADIUS_M + 400_000;
  return {
    id: 'leo-reentry-demo',
    centralBody: {
      id: 'earth',
      gravitationalParameterM3S2: EARTH_MU,
      radiusM: EARTH_RADIUS_M,
    },
    vehicle: {
      id: 'capsule-1',
      dryMassKg: 900,
      propellantMassKg: 100,
      specificImpulseSeconds: 310,
      dragCoefficient: 1.15,
      referenceAreaM2: 2,
      noseRadiusM: 0.5,
    },
    initialState: {
      epochSeconds: 0,
      positionM: [orbitRadius, 0, 0],
      velocityMps: [0, Math.sqrt(EARTH_MU / orbitRadius), 0],
    },
    trajectory: {
      horizonSeconds: 120,
      timeStepSeconds: 30,
    },
    burns: [
      {
        id: 'trim-burn',
        startSeconds: 30,
        durationSeconds: 10,
        thrustN: 200,
        direction: [0, 1, 0],
      },
    ],
    reentry: {
      startAltitudeM: 80_000,
      endAltitudeM: 25_000,
      initialVelocityMps: 7_600,
      flightPathAngleDeg: -5,
      sampleCount: 16,
    },
    thermalHarness: {
      initialTemperatureC: 20,
      steps: 6,
      timeStepSeconds: 0.01,
      heatedAreaM2: 0.5,
    },
    structuralHarness: {
      vertices: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
      ]),
      tetrahedra: new Uint32Array([0, 1, 2, 3]),
      fixedNodeIds: [0, 1, 2],
      loadNodeId: 3,
      loadDirection: [1, 0, 0],
      loadScale: 0.01,
    },
    acceptance: {
      maxPeakTemperatureC: 20_000,
      minStructuralSafetyFactor: 0.01,
      maxDynamicPressurePa: 2_000_000,
    },
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

describe('@holoscript/aerospace-plugin', () => {
  it('registers aerospace object types and traits', () => {
    const { host, objectTypes, traits } = fakeHost();
    const descriptor = register(host);

    expect(descriptor.id).toBe('aerospace');
    expect(objectTypes).toEqual([...AEROSPACE_OBJECT_TYPES]);
    expect(traits).toEqual([...AEROSPACE_TRAITS]);
    expect(descriptor.receiptSchema).toBe(AEROSPACE_RECEIPT_SCHEMA);
  });

  it('validates orbital mission inputs', () => {
    const valid = validateAerospaceMissionModel(sampleMission());
    expect(valid.valid).toBe(true);

    const invalid = validateAerospaceMissionModel({
      ...sampleMission(),
      centralBody: { ...sampleMission().centralBody, gravitationalParameterM3S2: 0 },
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.join('\n')).toContain('gravitationalParameterM3S2');
  });

  it('implements SimSolver fields for two-body trajectory propagation', () => {
    const solver = createAerospaceTrajectorySolver(sampleMission());
    solver.solve();

    expect(solver.mode).toBe('transient');
    expect([...solver.fieldNames]).toContain('altitude_m');
    expect(Array.from(solver.getField('altitude_m') as Float64Array)).toHaveLength(5);
    expect(solver.getStats().solverType).toBe('two-body-trajectory');
    expect(solver.getSamples()[0].altitudeM).toBeCloseTo(400_000, 0);
    expect(solver.getSamples()[4].altitudeM).toBeGreaterThan(399_000);
  });

  it('estimates propulsion impulse and ideal delta-v', () => {
    const summary = estimatePropulsionSummary(sampleMission());

    expect(summary.burnCount).toBe(1);
    expect(summary.totalImpulseNs).toBe(2_000);
    expect(summary.propellantUsedKg).toBeGreaterThan(0);
    expect(summary.idealDeltaVMps).toBeGreaterThan(1);
  });

  it('generates re-entry heat and dynamic-pressure profile samples', () => {
    const mission = sampleMission();
    const profile = generateReentryProfile(mission.centralBody, mission.vehicle, mission.reentry!);

    expect(profile.samples).toHaveLength(16);
    expect(profile.peakHeatFluxWm2).toBeGreaterThan(0);
    expect(profile.peakDynamicPressurePa).toBeGreaterThan(0);
  });

  it('runs the re-entry thermal harness through ThermalSolver', () => {
    const mission = sampleMission();
    const profile = generateReentryProfile(mission.centralBody, mission.vehicle, mission.reentry!);
    const thermal = runReentryThermalHarness(profile, mission.thermalHarness);

    expect(thermal.solverType).toBe('thermal');
    expect(thermal.absorbedPowerW).toBeGreaterThan(0);
    expect(thermal.stats.stepCount).toBe(6);
    expect(thermal.stats.maxTemperature).toBeGreaterThan(20);
  });

  it('runs the structural harness through StructuralSolver', () => {
    const mission = sampleMission();
    const profile = generateReentryProfile(mission.centralBody, mission.vehicle, mission.reentry!);
    const structural = runAerospaceStructuralHarness(profile, mission.vehicle, mission.structuralHarness!);

    expect(structural.solverType).toBe('structural');
    expect(structural.appliedLoadN).toBeGreaterThan(0);
    expect(structural.stats.elementCount).toBe(1);
    expect(structural.stats.minSafetyFactor).toBeGreaterThan(0);
  });

  it('solves a coupled mission and emits a domain SimulationContract receipt', () => {
    const mission = sampleMission();
    const result = solveAerospaceMission(mission);
    const receipt = buildAerospaceReceipt(mission, result, {
      runId: 'aerospace-reentry-demo-001',
      createdAt: '2026-05-21T00:00:00.000Z',
    });

    expect(result.converged).toBe(true);
    expect(result.thermal?.solverType).toBe('thermal');
    expect(result.structural?.solverType).toBe('structural');
    expect(receipt.schema).toBe(AEROSPACE_RECEIPT_SCHEMA);
    expect(receipt.cael.solverType).toBe('aerospace.coupled');
    expect(receipt.acceptance.accepted).toBe(true);
    expect(receipt.payloadHash).toMatch(/^fnv1a32:/);
  });
});
