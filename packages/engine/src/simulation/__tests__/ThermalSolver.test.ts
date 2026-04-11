import { describe, it, expect } from 'vitest';
import { ThermalSolver } from '../ThermalSolver';

describe('ThermalSolver', () => {
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
