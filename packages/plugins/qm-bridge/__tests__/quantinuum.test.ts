/**
 * Quantinuum logical-qubit backend tests.
 *
 * Mirrors ibm-quantum.test.ts: the Python bridge is mocked via node:child_process,
 * so these tests run with no Python, no SDK, and no spend. They cover secret
 * discipline (token via env, never argv), the QEC bookkeeping mapping, the
 * cael-quantum-v1.qec receipt, capability gating, and factory/router wiring.
 *
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuantinuumBackend } from '../src/backends/quantinuum';
import { createQmSolver, selectQmBackend } from '../src';
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

/** A representative sim-mode bridge response (post-selected carbon code). */
const carbonResponse = {
  ground_state_energy: -1.1,
  energy_is_surrogate: true,
  converged: true,
  optimizer_iterations: 100,
  final_cost: -1.1,
  num_qubits: 36,
  logical_qubits: 2,
  physical_qubits: 36,
  code_family: 'carbon',
  code_distance: 3,
  rounds: 2,
  physical_error_rate: 0.001,
  logical_error_rate: 1.5e-6,
  post_selection_used: true,
  acceptance_fraction: 0.83,
  circuit_depth: 6,
  execution_backend: 'quantinuum-sim',
  wall_time_seconds: 0.01,
};

describe('QuantinuumBackend secret handling', () => {
  beforeEach(() => execFileMock.mockReset());

  it('passes the Quantinuum token through child env, not the JSON argv payload', async () => {
    execFileMock.mockResolvedValue({
      stdout: JSON.stringify({ ...carbonResponse, execution_backend: 'quantinuum' }),
      stderr: '',
    });

    const solver = new QuantinuumBackend({
      backend: 'quantinuum',
      method: 'vqe',
      basis: 'sto-3g',
      executionMode: 'quantinuum',
      apiToken: 'secret-token',
    });

    await solver.runLogicalVQE(h2);

    const call = execFileMock.mock.calls[0];
    expect(call).toBeDefined();
    const args = call![1] as string[];
    const options = call![2] as { env?: Record<string, string | undefined> };
    const payload = JSON.parse(args[1] ?? '{}') as Record<string, unknown>;

    expect(payload).not.toHaveProperty('api_token');
    expect(payload).not.toHaveProperty('apiToken');
    expect(JSON.stringify(payload)).not.toContain('secret-token');
    expect(options.env?.['QUANTINUUM_API_KEY']).toBe('secret-token');
  });
});

describe('QuantinuumBackend logical-VQE + QEC bookkeeping', () => {
  beforeEach(() => execFileMock.mockReset());

  it('defaults to sim mode and surfaces logical-vs-physical + acceptance fraction', async () => {
    execFileMock.mockResolvedValue({ stdout: JSON.stringify(carbonResponse), stderr: '' });

    const solver = new QuantinuumBackend({ backend: 'quantinuum', method: 'vqe', basis: 'sto-3g' });
    const res = await solver.runLogicalVQE(h2);

    // execution_mode defaulted to 'sim' in the argv payload
    const payload = JSON.parse(execFileMock.mock.calls[0]![1][1]) as Record<string, unknown>;
    expect(payload['execution_mode']).toBe('sim');
    expect(payload['task']).toBe('logical_vqe');

    expect(res.executionBackend).toBe('quantinuum-sim');
    expect(res.logicalQubits).toBe(2);
    expect(res.physicalQubits).toBe(36);
    expect(res.codeFamily).toBe('carbon');
    expect(res.logicalErrorRate).toBeLessThan(res.physicalErrorRate);
    expect(res.postSelection.used).toBe(true);
    expect(res.postSelection.acceptanceFraction).toBe(0.83);
  });

  it('emits a cael-quantum-v1.qec receipt with the post-selection disclosure', async () => {
    execFileMock.mockResolvedValue({ stdout: JSON.stringify(carbonResponse), stderr: '' });

    const solver = new QuantinuumBackend({ backend: 'quantinuum', method: 'vqe', basis: 'sto-3g' });
    const res = await solver.runLogicalVQE(h2);
    const receipt = await solver.toQecReceipt(res);

    expect(receipt.schema).toBe('cael-quantum-v1.qec');
    expect(receipt.tier).toBe('simulate');
    expect(receipt.code.family).toBe('carbon');
    expect(receipt.code.distance).toBe(3);
    expect(receipt.post_selection.used).toBe(true);
    expect(receipt.post_selection.acceptance_fraction).toBe(0.83);
    // suppression = physical / logical, and it is recorded alongside the discard rate
    expect(receipt.measurement.suppression_factor_physical_over_logical).toBeCloseTo(
      0.001 / 1.5e-6,
      0
    );
    expect(receipt.payload_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.receipt_id).toBe(`qec-${receipt.payload_hash.slice(0, 16)}`);
  });

  it('throws for unsupported classical QM methods', async () => {
    const solver = new QuantinuumBackend({ backend: 'quantinuum', method: 'vqe', basis: 'sto-3g' });
    await expect(solver.computeBandStructure()).rejects.toThrow(/not supported/);
    await expect(solver.optimizeGeometry(h2)).rejects.toThrow(/does not support geometry/);
  });
});

describe('Quantinuum factory + router wiring', () => {
  it('createQmSolver builds a QuantinuumBackend', () => {
    const solver = createQmSolver({ backend: 'quantinuum', method: 'vqe', basis: 'sto-3g' });
    expect(solver.backend).toBe('quantinuum');
    expect(solver.scale).toBe('quantum');
  });

  it('routes error-corrected / logical-qubit questions to quantinuum', () => {
    expect(selectQmBackend('run a logical qubit VQE')).toBe('quantinuum');
    expect(selectQmBackend('error-corrected ground state with QEC')).toBe('quantinuum');
    expect(selectQmBackend('use the Quantinuum carbon code')).toBe('quantinuum');
    // bare NISQ quantum hardware still routes to ibm-quantum
    expect(selectQmBackend('run VQE on quantum hardware')).toBe('ibm-quantum');
  });
});
