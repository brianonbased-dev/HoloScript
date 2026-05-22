/**
 * IBM Quantum bridge security tests.
 *
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IBMQuantumBackend } from '../src/backends/ibm-quantum';
import type { MoleculeSpec } from '../src';

const execFileMock = vi.hoisted(() => {
  const mock = vi.fn();
  Object.defineProperty(mock, Symbol.for('nodejs.util.promisify.custom'), {
    value: (...args: unknown[]) => mock(...args),
  });
  return mock;
});

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

const h2: MoleculeSpec = {
  atoms: [
    { symbol: 'H', x: 0, y: 0, z: 0 },
    { symbol: 'H', x: 0, y: 0, z: 0.735 },
  ],
};

describe('IBMQuantumBackend secret handling', () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it('passes the IBM token through child env, not the JSON argv payload for VQE', async () => {
    execFileMock.mockResolvedValue({
      stdout: JSON.stringify({
        ground_state_energy: -1.0,
        converged: true,
        optimizer_iterations: 1,
        final_cost: -1.0,
        num_qubits: 2,
        circuit_depth: 4,
        execution_backend: 'ibm-quantum',
        job_id: 'job-vqe',
      }),
      stderr: '',
    });

    const solver = new IBMQuantumBackend({
      backend: 'ibm-quantum',
      method: 'vqe',
      basis: 'sto-3g',
      executionMode: 'ibm-quantum',
      apiToken: 'secret-token',
    });

    await solver.runVQE(h2);

    const call = execFileMock.mock.calls[0];
    expect(call).toBeDefined();
    const args = call[1] as string[];
    const options = call[2] as { env?: Record<string, string | undefined> };
    const payload = JSON.parse(args[1] ?? '{}') as Record<string, unknown>;

    expect(payload).not.toHaveProperty('api_token');
    expect(payload).not.toHaveProperty('apiToken');
    expect(JSON.stringify(payload)).not.toContain('secret-token');
    expect(options.env?.['IBM_QUANTUM_API_KEY']).toBe('secret-token');
  });

  it('passes the IBM token through child env, not the JSON argv payload for QAOA', async () => {
    execFileMock.mockResolvedValue({
      stdout: JSON.stringify({
        optimal_bitstring: '01',
        optimal_value: 1,
        approximation_ratio: 1,
        circuit_depth_p: 1,
        num_qubits: 2,
        execution_backend: 'ibm-quantum',
        job_id: 'job-qaoa',
      }),
      stderr: '',
    });

    const solver = new IBMQuantumBackend({
      backend: 'ibm-quantum',
      method: 'qaoa',
      basis: 'sto-3g',
      executionMode: 'ibm-quantum',
      apiToken: 'secret-token',
    });

    await solver.runQAOA([
      [0, 1],
      [1, 0],
    ]);

    const call = execFileMock.mock.calls[0];
    expect(call).toBeDefined();
    const args = call[1] as string[];
    const options = call[2] as { env?: Record<string, string | undefined> };
    const payload = JSON.parse(args[1] ?? '{}') as Record<string, unknown>;

    expect(payload).not.toHaveProperty('api_token');
    expect(payload).not.toHaveProperty('apiToken');
    expect(JSON.stringify(payload)).not.toContain('secret-token');
    expect(options.env?.['IBM_QUANTUM_API_KEY']).toBe('secret-token');
  });
});
