import { describe, it, expect } from 'vitest';
import { HydraulicSolver } from '../HydraulicSolver';

describe('HydraulicSolver', () => {
  it('solves a simple single-pipe network', () => {
    const solver = new HydraulicSolver({
      pipes: [{ id: 'p1', diameter: 0.2, length: 100, roughness: 0.015 }],
      nodes: [
        { id: 'reservoir', type: 'reservoir', head: 50, elevation: 0 },
        { id: 'j1', type: 'junction', demand: 0.005, elevation: 0 },
      ],
      connections: [['reservoir', 'p1', 'j1']],
      valves: [],
      maxIterations: 100,
      convergence: 0.001,
    });

    const result = solver.solve();
    // Should converge for a simple network
    expect(result.converged).toBe(true);

    const pressures = solver.getPressureField();
    // Reservoir has known head
    expect(pressures[0]).toBe(50);
    // Junction should have lower pressure due to head loss
    expect(pressures[1]).toBeLessThan(50);
    expect(pressures[1]).toBeGreaterThan(0);
  });

  it('valve closure reduces effective diameter', () => {
    // Full open valve
    const solverOpen = new HydraulicSolver({
      pipes: [{ id: 'p1', diameter: 0.2, length: 100, roughness: 0.015 }],
      nodes: [
        { id: 'res', type: 'reservoir', head: 40, elevation: 0 },
        { id: 'j1', type: 'junction', demand: 0.003, elevation: 0 },
      ],
      connections: [['res', 'p1', 'j1']],
      valves: [{ id: 'v1', pipe: 'p1', position: 0.5, opening: 1.0 }],
      maxIterations: 100,
      convergence: 0.001,
    });
    solverOpen.solve();
    const pressureOpen = solverOpen.getPressureField()[1]; // junction pressure

    // Partially closed valve — creates more resistance, lower junction pressure
    const solverPartial = new HydraulicSolver({
      pipes: [{ id: 'p1', diameter: 0.2, length: 100, roughness: 0.015 }],
      nodes: [
        { id: 'res', type: 'reservoir', head: 40, elevation: 0 },
        { id: 'j1', type: 'junction', demand: 0.003, elevation: 0 },
      ],
      connections: [['res', 'p1', 'j1']],
      valves: [{ id: 'v1', pipe: 'p1', position: 0.5, opening: 0.1 }],
      maxIterations: 100,
      convergence: 0.001,
    });
    solverPartial.solve();
    const pressurePartial = solverPartial.getPressureField()[1];

    // Closing valve increases head loss → lower junction pressure
    expect(pressurePartial).toBeLessThan(pressureOpen);
  });

  it('getStats returns correct counts', () => {
    const solver = new HydraulicSolver({
      pipes: [
        { id: 'p1', diameter: 0.2, length: 100, roughness: 0.015 },
        { id: 'p2', diameter: 0.15, length: 80, roughness: 0.015 },
      ],
      nodes: [
        { id: 'res', type: 'reservoir', head: 50, elevation: 0 },
        { id: 'j1', type: 'junction', demand: 0.002, elevation: 5 },
        { id: 'j2', type: 'junction', demand: 0.003, elevation: 3 },
      ],
      connections: [
        ['res', 'p1', 'j1'],
        ['j1', 'p2', 'j2'],
      ],
      valves: [],
      maxIterations: 100,
      convergence: 0.001,
    });

    solver.solve();
    const stats = solver.getStats();
    expect(stats.nodeCount).toBe(3);
    expect(stats.pipeCount).toBe(2);
  });
});
