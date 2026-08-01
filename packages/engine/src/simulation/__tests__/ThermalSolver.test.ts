import { afterEach, describe, it, expect, vi } from 'vitest';
import { RegularGridStencilSolver } from '../../gpu/RegularGridStencilSolver';
import { ThermalSolver } from '../ThermalSolver';

describe('ThermalSolver', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rejects a required-GPU policy when GPU execution is disabled', () => {
    expect(
      () =>
        new ThermalSolver({
          gridResolution: [3, 3, 3],
          domainSize: [3, 3, 3],
          timeStep: 0.1,
          materials: {},
          defaultMaterial: 'air',
          boundaryConditions: [],
          sources: [],
          useGPU: false,
          requireGPU: true,
        })
    ).toThrow('requireGPU=true requires useGPU=true');
  });

  it('does not permit the synchronous CPU path under a required-GPU policy', () => {
    const solver = new ThermalSolver({
      gridResolution: [3, 3, 3],
      domainSize: [3, 3, 3],
      timeStep: 0.1,
      materials: {},
      defaultMaterial: 'air',
      boundaryConditions: [],
      sources: [],
      useGPU: true,
      requireGPU: true,
    });

    expect(() => solver.step(0.1)).toThrow('requires GPU execution; use stepAsync()');
    expect(solver.getStats().stepCount).toBe(0);
    solver.dispose();
  });

  it('fails without mutating the field when a required GPU dispatch is unavailable', async () => {
    vi.spyOn(RegularGridStencilSolver.prototype, 'stepThermalExplicit').mockResolvedValue(null);
    const solver = new ThermalSolver({
      gridResolution: [3, 3, 3],
      domainSize: [3, 3, 3],
      timeStep: 0.01,
      materials: {},
      defaultMaterial: 'air',
      boundaryConditions: [{ type: 'dirichlet', faces: ['x-'], value: 100 }],
      sources: [],
      initialTemperature: 20,
      useGPU: true,
      requireGPU: true,
    });
    const before = solver.getTemperatureField();

    await expect(solver.stepAsync(0.01)).rejects.toThrow(
      'required GPU execution, but no GPU dispatch completed'
    );

    expect(solver.getTemperatureField()).toEqual(before);
    expect(solver.getStats()).toMatchObject({ stepCount: 0, usedGPU: false });
    solver.dispose();
  });

  it('clears prior GPU-success state when the next required dispatch fails', async () => {
    vi.spyOn(RegularGridStencilSolver.prototype, 'stepThermalExplicit')
      .mockResolvedValueOnce(new Float32Array(27).fill(20))
      .mockResolvedValueOnce(null);
    const solver = new ThermalSolver({
      gridResolution: [3, 3, 3],
      domainSize: [3, 3, 3],
      timeStep: 0.01,
      materials: {},
      defaultMaterial: 'air',
      boundaryConditions: [],
      sources: [],
      initialTemperature: 20,
      useGPU: true,
      requireGPU: true,
    });

    await solver.stepAsync(0.01);
    expect(solver.getStats()).toMatchObject({ stepCount: 1, usedGPU: true });
    await expect(solver.stepAsync(0.01)).rejects.toThrow('no GPU dispatch completed');
    expect(solver.getStats()).toMatchObject({ stepCount: 1, usedGPU: false });
    solver.dispose();
  });

  it('initializes with uniform temperature', () => {
    const solver = new ThermalSolver({
      gridResolution: [5, 5, 5],
      domainSize: [5, 5, 5],
      timeStep: 0.1,
      materials: {},
      defaultMaterial: 'air',
      boundaryConditions: [],
      sources: [],
      initialTemperature: 25,
    });

    const stats = solver.getStats();
    expect(stats.minTemperature).toBe(25);
    expect(stats.maxTemperature).toBe(25);
    expect(stats.avgTemperature).toBe(25);
    expect(stats.stepCount).toBe(0);
  });

  it('boundary conditions create temperature gradient', () => {
    const solver = new ThermalSolver({
      gridResolution: [10, 3, 3],
      domainSize: [10, 3, 3],
      timeStep: 0.01,
      materials: {},
      defaultMaterial: 'air',
      boundaryConditions: [
        { type: 'dirichlet', faces: ['x-'], value: 100 },
        { type: 'dirichlet', faces: ['x+'], value: 0 },
      ],
      sources: [],
      initialTemperature: 50,
    });

    // Step many times to approach steady state
    for (let i = 0; i < 500; i++) solver.step(0.01);

    const stats = solver.getStats();
    // Boundaries should be at 100 and 0
    expect(stats.minTemperature).toBeCloseTo(0, 0);
    expect(stats.maxTemperature).toBeCloseTo(100, 0);

    // Interior should show gradient
    const Tmid = solver.getTemperatureAt(5, 1.5, 1.5);
    expect(Tmid).toBeGreaterThan(20);
    expect(Tmid).toBeLessThan(80);
  });

  it('heat source creates temperature peak', () => {
    const solver = new ThermalSolver({
      gridResolution: [10, 10, 10],
      domainSize: [10, 10, 10],
      timeStep: 0.05,
      materials: {},
      defaultMaterial: 'air',
      boundaryConditions: [
        { type: 'dirichlet', faces: ['x-', 'x+', 'y-', 'y+', 'z-', 'z+'], value: 20 },
      ],
      sources: [{ id: 'heater', type: 'point', position: [5, 5, 5], heat_output: 1000 }],
      initialTemperature: 20,
    });

    for (let i = 0; i < 50; i++) solver.step(0.05);

    const Tcenter = solver.getTemperatureAt(5, 5, 5);
    const Tedge = solver.getTemperatureAt(0, 0, 0);
    expect(Tcenter).toBeGreaterThan(Tedge);
    expect(Tcenter).toBeGreaterThan(20);
  });

  it('getTemperatureField returns correct size', () => {
    const solver = new ThermalSolver({
      gridResolution: [8, 4, 6],
      domainSize: [8, 4, 6],
      timeStep: 0.1,
      materials: {},
      defaultMaterial: 'air',
      boundaryConditions: [],
      sources: [],
    });

    const field = solver.getTemperatureField();
    expect(field.length).toBe(8 * 4 * 6);
  });

  it('setSource updates heat output', () => {
    const solver = new ThermalSolver({
      gridResolution: [10, 10, 10],
      domainSize: [10, 10, 10],
      timeStep: 0.05,
      materials: {},
      defaultMaterial: 'air',
      boundaryConditions: [
        { type: 'dirichlet', faces: ['x-', 'x+', 'y-', 'y+', 'z-', 'z+'], value: 20 },
      ],
      sources: [{ id: 'h1', type: 'point', position: [5, 5, 5], heat_output: 5000 }],
      initialTemperature: 20,
    });

    for (let i = 0; i < 100; i++) solver.step(0.05);
    const T1 = solver.getTemperatureAt(5, 5, 5);
    expect(T1).toBeGreaterThan(20); // source heated it up

    solver.setSource('h1', 0);
    for (let i = 0; i < 200; i++) solver.step(0.05);
    const T2 = solver.getTemperatureAt(5, 5, 5);

    // After disabling source, temperature should drop toward boundary
    expect(T2).toBeLessThan(T1);
  });

  it('stats track simulation time and step count', () => {
    const solver = new ThermalSolver({
      gridResolution: [3, 3, 3],
      domainSize: [3, 3, 3],
      timeStep: 0.1,
      materials: {},
      defaultMaterial: 'air',
      boundaryConditions: [],
      sources: [],
    });

    solver.step(0.1);
    solver.step(0.1);
    solver.step(0.1);

    const stats = solver.getStats();
    expect(stats.stepCount).toBe(3);
    expect(stats.simulationTime).toBeCloseTo(0.3, 10);
  });
});
