import { describe, it, expect } from 'vitest';
import { QuantumCircuitCompiler } from '../QuantumCircuitCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import { parseHolo } from '../../parser/HoloCompositionParser';

describe('QuantumCircuitCompiler', () => {
  const compiler = new QuantumCircuitCompiler();

  it('emits symbolic VQE parameters instead of hardcoded ry(0.1)', () => {
    const composition: HoloComposition = {
      objects: [
        {
          name: 'H2',
          traits: [
            {
              name: 'quantumCircuit',
              config: {
                molecule: {
                  value: [
                    { symbol: 'H', x: 0, y: 0, z: 0 },
                    { symbol: 'H', x: 0, y: 0, z: 0.74 },
                  ],
                  type: 'array',
                },
                ansatzLayers: { value: 1, type: 'number' },
              },
            },
          ],
        },
      ],
    };

    const out = compiler.compile(composition);
    expect(out.circuitType).toBe('vqe');
    expect(out.qasm).toContain('ry(theta_0)');
    expect(out.qasm).toContain('ry(theta_1)');
    expect(out.qasm).not.toMatch(/ry\(0\.1\)/);
    // H2 = 2 H atoms = 2 orbitals * 2 spin-orbitals = 4 qubits, 1 layer = 4 params
    expect(out.paramNames).toEqual(['theta_0', 'theta_1', 'theta_2', 'theta_3']);
  });

  it('emits symbolic QAOA parameters instead of hardcoded gamma/beta', () => {
    const composition: HoloComposition = {
      objects: [
        {
          name: 'Graph',
          traits: [
            {
              name: 'quantumCircuit',
              config: {
                weightMatrix: {
                  value: [
                    [0, 1],
                    [1, 0],
                  ],
                  type: 'array',
                },
                p: { value: 1, type: 'number' },
              },
            },
          ],
        },
      ],
    };

    const out = compiler.compile(composition);
    expect(out.circuitType).toBe('qaoa');
    expect(out.qasm).toContain('input float gamma_0;');
    expect(out.qasm).toContain('input float beta_0;');
    expect(out.qasm).toContain('rz(2.0 * gamma_0 * 1.0000)');
    expect(out.qasm).toContain('rx(2.0 * beta_0)');
    expect(out.qasm).not.toContain('gamma=0.5');
    expect(out.qasm).not.toContain('beta=0.5');
    expect(out.paramNames).toEqual(['gamma_0', 'beta_0']);
    expect(out.optimizationProblem).toBe('maxcut');
  });

  it('emits diagonal and pairwise phase terms for an upper-triangular QUBO', () => {
    const composition: HoloComposition = {
      objects: [
        {
          name: 'NoveltyPortfolio',
          traits: [
            {
              name: 'quantumCircuit',
              config: {
                problemType: { value: 'qubo', type: 'string' },
                quboMatrix: {
                  value: [
                    [-1, 2],
                    [0, -3],
                  ],
                  type: 'array',
                },
                p: { value: 1, type: 'number' },
              },
            },
          ],
        },
      ],
    };

    const out = compiler.compile(composition);
    expect(out.circuitType).toBe('qaoa');
    expect(out.optimizationProblem).toBe('qubo');
    expect(out.qasm).toContain('QAOA upper-triangular QUBO');
    expect(out.qasm).toContain('QUBO linear x_0 coefficient=-1');
    expect(out.qasm).toContain('QUBO linear x_1 coefficient=-3');
    expect(out.qasm).toContain('QUBO pair x_0*x_1 coefficient=2');
    expect(out.qasm).toContain('rz(-0.5 * gamma_0 * 2.0000) q[0]');
    expect(out.qasm).toContain('rz(0.5 * gamma_0 * 2.0000) q[1]');
  });

  it('compiles raw trait config emitted by the real .holo parser', () => {
    const parsed = parseHolo(`
      composition "Quantum Novelty Scout" {
        object "Portfolio" {
          @quantumCircuit(
            problemType: "qubo",
            quboMatrix: "[[-1,2],[0,-3]]",
            p: 1
          )
        }
      }
    `);
    expect(parsed.success).toBe(true);

    const out = compiler.compile(parsed.ast!);
    expect(out.circuitType).toBe('qaoa');
    expect(out.optimizationProblem).toBe('qubo');
    expect(out.numQubits).toBe(2);
    expect(out.weightMatrix).toEqual([
      [-1, 2],
      [0, -3],
    ]);
  });

  it('warns on stub when no quantum trait is found', () => {
    const composition: HoloComposition = { objects: [] };
    const out = compiler.compile(composition);
    expect(out.circuitType).toBe('custom');
    expect(out.warnings.length).toBeGreaterThan(0);
    expect(out.warnings[0].toLowerCase()).toContain('no @quantumcircuit');
  });
});
