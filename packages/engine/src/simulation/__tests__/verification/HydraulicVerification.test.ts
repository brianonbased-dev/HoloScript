import { describe, it, expect } from 'vitest';
import { HydraulicSolver, HydraulicConfig } from '../../HydraulicSolver';
import { errorL2, errorLinf } from '../../verification/ConvergenceAnalysis';

// ── Hydraulic Verification & Validation ──────────────────────────────────────

describe('HydraulicVerification', () => {

  it('Benchmark 1: Laminar single-pipe: verify f=64/Re', () => {
    // Re < 2300 for laminar. Use high viscosity, low velocity.
    // L = 100m, D = 0.1m, Q = 0.001 m^3/s -> V = Q/A = 0.001 / (pi*(0.05)^2) = 0.127 m/s
    // v_kinematic = 1e-4 m^2/s
    // Re = V * D / v_kinematic = 0.127 * 0.1 / 1e-4 = 127.3 (Laminar)
    // hf = f * L/D * (V^2 / 2g) where f = 64/Re
    // f = 64/127.3 = 0.502
    // hf = 0.502 * (100/0.1) * (0.0162 / 19.62) = 0.502 * 1000 * 0.000825 = ~0.414 m

    const config: HydraulicConfig = {
      pipes: [{ id: 'pipe1', diameter: 0.1, length: 100, roughness: 0 }],
      nodes: [
        { id: 'res1', type: 'reservoir', head: 10 },
        { id: 'junc1', type: 'junction', demand: 0.001, elevation: 0 }
      ],
      connections: [['res1', 'pipe1', 'junc1']],
      valves: [],
      maxIterations: 100,
      convergence: 1e-7,
      viscosity: 1e-4, 
    };

    const solver = new HydraulicSolver(config);
    const result = solver.solve();
    expect(result.converged).toBe(true);

    const D = 0.1;
    const L = 100;
    const Q = 0.001;
    const A = Math.PI * Math.pow(D / 2, 2);
    const V = Q / A;
    const Re = (V * D) / 1e-4;
    const expected_f = 64 / Re;
    const g = 9.81;
    const expected_hf = expected_f * (L / D) * (V * V) / (2 * g);

    const pressureField = solver.getPressureField();
    // Assuming node 0 is res1, node 1 is junc1
    const res1Head = pressureField[0];
    const junc1Head = pressureField[1];
    const actual_hf = res1Head - junc1Head;

    const error = Math.abs(actual_hf - expected_hf) / Math.abs(expected_hf);
    expect(error).toBeLessThan(1e-4);
  });

  it('Benchmark 2: Single-pipe Darcy-Weisbach head loss vs turbulent Swamee-Jain', () => {
    // Water test: v_kinematic = 1e-6
    // L = 100m, D = 0.1m, Q = 0.1 m^3/s -> V = 0.1 / (pi*(0.05)^2) = 12.73 m/s
    // Re = 12.73 * 0.1 / 1e-6 = 1.27e6 (Turbulent)
    // roughness = 0.0001 m

    const config: HydraulicConfig = {
      pipes: [{ id: 'p1', diameter: 0.1, length: 100, roughness: 0.0001 }],
      nodes: [
        { id: 'n1', type: 'reservoir', head: 100 },
        { id: 'n2', type: 'junction', demand: 0.1, elevation: 0 }
      ],
      connections: [['n1', 'p1', 'n2']],
      valves: [],
      maxIterations: 100,
      convergence: 1e-7,
      viscosity: 1e-6,
    };

    const solver = new HydraulicSolver(config);
    solver.solve();
    
    // Evaluate theoretical expected headloss using exact same Swamee-Jain formula
    const D = 0.1; const L = 100; const Q = 0.1; const e = 0.0001;
    const A = Math.PI * 0.025; // wait D=0.1 means R=0.05; A = pi * 0.0025. Wait, pi*0.05^2
    const exactA = Math.PI * 0.0025;
    const V = Q / exactA;
    const Re = V * D / 1e-6;
    const eD = e / D;
    const logVal = Math.log10(eD / 3.7 + 5.74 / Math.pow(Re, 0.9));
    const expected_f = 0.25 / (logVal * logVal);
    const expected_hf = expected_f * (L / D) * (V * V) / (2 * 9.81);

    const actual_hf = solver.getPressureField()[0] - solver.getPressureField()[1];
    const err = Math.abs(actual_hf - expected_hf);
    expect(err).toBeLessThan(1e-4);
  });

  it('Benchmark 3: Two-loop Hardy-Cross network convergence', () => {
    // Simple 2-loop network
    // R1 (res, head=100) -- p1 --> J1 (demand 0.1) -- p2 --> J2 (demand 0.2)
    //   |                            |                           |
    //  p3                           p4                          p5
    //   |                            |                           |
    // J3 (demand 0.1) -- p6 -----> J4 (demand 0.1) -- p7 -----> J5 (demand 0.1)
    
    // Actually simpler 2 loop:
    // N1(res) --P1-- N2 --P2-- N3
    //  |              |         |
    // P3             P4        P5
    //  |              |         |
    // N4 -----P6---- N5 --P7-- N6
    // Demands: N2(0), N3(0.1), N4(0.1), N5(0.2), N6(0.1) => Total = 0.5. Needs to balance

    const config: HydraulicConfig = {
      nodes: [
        { id: 'N1', type: 'reservoir', head: 100 },
        { id: 'N2', type: 'junction', demand: 0.0 },
        { id: 'N3', type: 'junction', demand: 0.1 },
        { id: 'N4', type: 'junction', demand: 0.1 },
        { id: 'N5', type: 'junction', demand: 0.2 },
        { id: 'N6', type: 'junction', demand: 0.1 }
      ],
      pipes: [
        { id: 'P1', diameter: 0.2, length: 100, roughness: 0.01 },
        { id: 'P2', diameter: 0.15, length: 100, roughness: 0.01 },
        { id: 'P3', diameter: 0.2, length: 100, roughness: 0.01 },
        { id: 'P4', diameter: 0.15, length: 100, roughness: 0.01 },
        { id: 'P5', diameter: 0.15, length: 100, roughness: 0.01 },
        { id: 'P6', diameter: 0.2, length: 100, roughness: 0.01 },
        { id: 'P7', diameter: 0.15, length: 100, roughness: 0.01 },
      ],
      connections: [
        ['N1', 'P1', 'N2'],
        ['N2', 'P2', 'N3'],
        ['N1', 'P3', 'N4'],
        ['N2', 'P4', 'N5'],
        ['N3', 'P5', 'N6'],
        ['N4', 'P6', 'N5'],
        ['N5', 'P7', 'N6'],
      ],
      valves: [],
      maxIterations: 1000,
      convergence: 1e-6
    };

    const solver = new HydraulicSolver(config);
    const result = solver.solve();
    
    // Convergence check
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.residual).toBeLessThan(1e-5);
    
    // Total Mass Balance Check
    // flow P1 + flow P3 = Total Demand = 0.5
    const flows = solver.getFlowRates();
    const q1 = flows[0];
    const q3 = flows[2];
    expect(q1 + q3).toBeCloseTo(0.5, 3);
  });
});
