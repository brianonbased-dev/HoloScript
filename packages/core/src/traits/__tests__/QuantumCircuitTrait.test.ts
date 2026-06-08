/**
 * Adversarial tests for QuantumCircuitTrait (@quantumCircuit).
 *
 * GUARD1 — trait initialises without throwing
 * GUARD2 — qc:compile on N2 molecule emits qc:qasm with numQubits=12
 * GUARD3 — unknown circuitType defaults gracefully (no throw, emits qc:qasm or qc:error)
 */

import { describe, it, expect } from 'vitest';
import quantumCircuitHandler from '../QuantumCircuitTrait';
import type { QuantumCircuitConfig } from '../QuantumCircuitTrait';
import type { TraitContext, TraitEvent } from '../TraitTypes';
import type { HSPlusNode } from '../../types/HoloScriptPlus';

// =============================================================================
// HELPERS
// =============================================================================

/** Build a minimal HSPlusNode that satisfies the trait's state storage. */
function makeNode(): HSPlusNode {
  return {} as HSPlusNode;
}

/** Build a minimal TraitContext with an observable emit. */
function makeContext(): {
  context: TraitContext;
  emissions: Array<{ event: string; payload: unknown }>;
} {
  const emissions: Array<{ event: string; payload: unknown }> = [];

  const context = {
    vr: {} as TraitContext['vr'],
    physics: {} as TraitContext['physics'],
    audio: {} as TraitContext['audio'],
    haptics: {} as TraitContext['haptics'],
    emit: (event: string, payload?: unknown) => {
      emissions.push({ event, payload });
    },
    getState: () => ({}),
    setState: (_updates: Record<string, unknown>) => {
      /* no-op */
    },
    getScaleMultiplier: () => 1,
    setScaleContext: (_magnitude: string) => {
      /* no-op */
    },
  } as TraitContext;

  return { context, emissions };
}

/** Default config that satisfies QuantumCircuitConfig. */
function defaultConfig(overrides: Partial<QuantumCircuitConfig> = {}): QuantumCircuitConfig {
  return {
    ansatzDepth: 2,
    backend: 'aer',
    circuitType: 'vqe',
    nShots: 1024,
    ...overrides,
  };
}

/** Wait for a qc:qasm or qc:error emission (async fire-and-forget pattern). */
async function waitForQcEmission(
  emissions: Array<{ event: string; payload: unknown }>,
  timeoutMs = 2000
): Promise<{ event: string; payload: unknown }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = emissions.find((e) => e.event === 'qc:qasm' || e.event === 'qc:error');
    if (found) return found;
    await new Promise<void>((r) => setTimeout(r, 10));
  }
  throw new Error(
    `Timed out waiting for qc:qasm / qc:error. Emissions: ${JSON.stringify(emissions)}`
  );
}

// =============================================================================
// GUARD1 — trait initialises without throwing
// =============================================================================

describe('GUARD1 — QuantumCircuitTrait: initialises without throwing', () => {
  it('onAttach does not throw with default config', () => {
    const node = makeNode();
    const { context } = makeContext();
    const config = defaultConfig();

    expect(() => {
      quantumCircuitHandler.onAttach!(node, config, context);
    }).not.toThrow();

    // State is stored on node — compiler should be present
    expect((node as Record<string, unknown>).__qcState).toBeDefined();
  });

  it('onDetach does not throw after attach', () => {
    const node = makeNode();
    const { context } = makeContext();
    const config = defaultConfig();

    quantumCircuitHandler.onAttach!(node, config, context);

    expect(() => {
      quantumCircuitHandler.onDetach!(node, config, context);
    }).not.toThrow();

    // State should be cleaned up
    expect((node as Record<string, unknown>).__qcState).toBeUndefined();
  });

  it('defaultConfig is defined and has correct defaults', () => {
    const def = quantumCircuitHandler.defaultConfig as QuantumCircuitConfig;
    expect(def).toBeDefined();
    expect(def.ansatzDepth).toBe(2);
    expect(def.backend).toBe('aer');
    expect(def.circuitType).toBe('vqe');
    expect(def.nShots).toBe(1024);
    expect(def.molecule).toBeUndefined();
    expect(def.weightMatrix).toBeUndefined();
  });

  it('handler name matches expected trait name', () => {
    expect(quantumCircuitHandler.name).toBe('quantumCircuit');
  });
});

// =============================================================================
// GUARD2 — N2 molecule emits qc:qasm with numQubits=12
// =============================================================================

describe('GUARD2 — QuantumCircuitTrait: N2 molecule emits qc:qasm with numQubits=12', () => {
  it('N2 VQE compile emits qc:qasm with numQubits=12', async () => {
    const node = makeNode();
    const { context, emissions } = makeContext();

    // N2 molecule: 2 nitrogen atoms, Jordan-Wigner sto-3g mapping
    // N → 5 spatial orbitals → 10 spin-orbitals (qubits) per atom
    // 2 × N = 2 × 10 = 20 qubits total
    // (QuantumCircuitCompiler: qubitsForMolecule groups N/C/O/F → +5 orbitals each)
    const config = defaultConfig({
      molecule: [
        { symbol: 'N', x: 0, y: 0, z: 0 },
        { symbol: 'N', x: 0, y: 0, z: 1.0975 },
      ],
      circuitType: 'vqe',
      ansatzDepth: 2,
    });

    quantumCircuitHandler.onAttach!(node, config, context);

    // Trigger compilation
    const event: TraitEvent = { type: 'qc:compile', payload: {} };
    quantumCircuitHandler.onEvent!(node, config, context, event);

    // Wait for async result
    const emission = await waitForQcEmission(emissions);

    expect(emission.event).toBe('qc:qasm');
    const payload = emission.payload as { numQubits: number; qasm: string; circuitType: string };
    expect(payload.numQubits).toBe(20);
    expect(payload.circuitType).toBe('vqe');
    expect(typeof payload.qasm).toBe('string');
    expect(payload.qasm).toContain('OPENQASM 3.0');
    expect(payload.qasm).toContain('qubit[20]');
  });

  it('emitted payload contains expected QASMOutput fields', async () => {
    const node = makeNode();
    const { context, emissions } = makeContext();

    const config = defaultConfig({
      molecule: [
        { symbol: 'N', x: 0, y: 0, z: 0 },
        { symbol: 'N', x: 0, y: 0, z: 1.0975 },
      ],
    });

    quantumCircuitHandler.onAttach!(node, config, context);
    quantumCircuitHandler.onEvent!(node, config, context, { type: 'qc:compile', payload: {} });

    const emission = await waitForQcEmission(emissions);
    const payload = emission.payload as Record<string, unknown>;

    // All required QASMOutput fields must be present
    expect(payload).toHaveProperty('qasm');
    expect(payload).toHaveProperty('numQubits');
    expect(payload).toHaveProperty('numClbits');
    expect(payload).toHaveProperty('estimatedDepth');
    expect(payload).toHaveProperty('circuitType');
    expect(payload).toHaveProperty('recommendedBackend');
    expect(payload).toHaveProperty('warnings');
    expect(Array.isArray(payload['warnings'])).toBe(true);
  });
});

// =============================================================================
// GUARD3 — unknown circuitType defaults gracefully
// =============================================================================

describe('GUARD3 — QuantumCircuitTrait: unknown circuitType defaults gracefully', () => {
  it('circuitType="grover" without molecule emits either qc:qasm (stub) or qc:error — never throws', async () => {
    const node = makeNode();
    const { context, emissions } = makeContext();

    // grover without molecule → compiler falls back to stub
    const config = defaultConfig({
      circuitType: 'grover',
      molecule: undefined,
      weightMatrix: undefined,
    });

    expect(() => {
      quantumCircuitHandler.onAttach!(node, config, context);
    }).not.toThrow();

    expect(() => {
      quantumCircuitHandler.onEvent!(node, config, context, { type: 'qc:compile', payload: {} });
    }).not.toThrow();

    // Must eventually emit qc:qasm (stub) or qc:error — never silently hang
    const emission = await waitForQcEmission(emissions);
    expect(['qc:qasm', 'qc:error']).toContain(emission.event);
  });

  it('completely empty config with an unknown circuitType does not crash onAttach', () => {
    const node = makeNode();
    const { context } = makeContext();

    // Cast through unknown to simulate a .hs author passing a bad value
    const badConfig = {
      ansatzDepth: 2,
      backend: 'aer',
      circuitType: 'unknown_type',
      nShots: 1024,
    } as unknown as QuantumCircuitConfig;

    expect(() => {
      quantumCircuitHandler.onAttach!(node, badConfig, context);
      quantumCircuitHandler.onDetach!(node, badConfig, context);
    }).not.toThrow();
  });

  it('qc:status event does not crash and emits qc:status_result', async () => {
    const node = makeNode();
    const { context, emissions } = makeContext();
    const config = defaultConfig();

    quantumCircuitHandler.onAttach!(node, config, context);
    quantumCircuitHandler.onEvent!(node, config, context, { type: 'qc:status', payload: {} });

    // qc:status is synchronous — no waiting needed
    const statusEmission = emissions.find((e) => e.event === 'qc:status_result');
    expect(statusEmission).toBeDefined();

    const statusPayload = statusEmission!.payload as Record<string, unknown>;
    expect(statusPayload['compileCount']).toBe(0);
    expect(statusPayload['circuitType']).toBe('vqe');
  });
});
