/**
 * QuantumCircuitTrait — @quantumCircuit / @quantum_circuit
 *
 * HoloScript trait that drives the QuantumCircuitCompiler.  Scene authors
 * attach this to any HoloScript object to declare a quantum computation:
 *
 * ```
 * object MoleculeSimulator {
 *   @quantumCircuit(
 *     molecule: [{symbol:"N",x:0,y:0,z:0},{symbol:"N",x:0,y:0,z:1.0975}],
 *     ansatzDepth: 3,
 *     backend: "aer",
 *     circuitType: "vqe"
 *   )
 * }
 * ```
 *
 * Events:
 *   qc:compile  — triggers a compilation pass; payload is the current config.
 *   qc:qasm     — emitted after successful compilation with a QASMOutput payload.
 *   qc:error    — emitted on failure with { code, message }.
 *
 * The trait itself is stateless across ticks; all computation is
 * event-driven and async so it never blocks the scene update loop.
 *
 * @module QuantumCircuitTrait
 * @version 1.0.0
 */

import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import type { QASMOutput, QuantumAtom } from '../compiler/QuantumCircuitCompiler';
import { QuantumCircuitCompiler } from '../compiler/QuantumCircuitCompiler';
import type { HoloComposition } from '../parser/HoloCompositionTypes';

// =============================================================================
// RE-EXPORT convenience types
// =============================================================================

export type { QASMOutput, QuantumAtom };

// =============================================================================
// CONFIG
// =============================================================================

/** Valid circuit types recognised by the HoloScript compiler. */
export type QuantumCircuitType = 'vqe' | 'qaoa' | 'grover';

/** Execution backend for the generated QASM. */
export type QuantumBackend = 'aer' | 'ibm-quantum';

/**
 * Configuration for the @quantumCircuit trait.
 *
 * At least one of `molecule` or `weightMatrix` is needed to generate a
 * non-stub circuit.  When neither is present the compiler emits a
 * 1-qubit stub with a warning (useful for scaffolding).
 */
export interface QuantumCircuitConfig {
  /**
   * Molecular geometry as an array of atoms (Jordan-Wigner / sto-3g mapping).
   * Required when `circuitType === 'vqe'`.
   *
   * Example: `[{symbol:"N",x:0,y:0,z:0},{symbol:"N",x:0,y:0,z:1.0975}]`
   */
  molecule?: QuantumAtom[];

  /**
   * Hardware-efficient ansatz depth (number of Ry+CNOT repetition layers).
   * Only used for VQE circuits.
   * Default: 2
   */
  ansatzDepth: number;

  /**
   * Execution backend recommendation.
   * - `'aer'` — local Qiskit Aer simulator (fast, no cloud spend)
   * - `'ibm-quantum'` — real IBM Quantum hardware (QPU minutes billed)
   * Default: `'aer'`
   */
  backend: QuantumBackend;

  /**
   * Circuit family to generate.
   * - `'vqe'` — hardware-efficient VQE ansatz for energy estimation
   * - `'qaoa'` — QAOA Max-Cut for combinatorial optimisation
   * - `'grover'` — reserved; currently falls back to stub with a warning
   * Default: `'vqe'`
   */
  circuitType: QuantumCircuitType;

  /**
   * Number of measurement shots (informational; stored as metadata).
   * Default: 1024
   */
  nShots: number;

  /**
   * Weight adjacency matrix for QAOA circuits.
   * Required when `circuitType === 'qaoa'`.
   *
   * Must be a square 2-D array of numbers (n × n).
   * Off-diagonal non-zero entries are graph edges.
   */
  weightMatrix?: number[][];
}

// =============================================================================
// INTERNAL STATE
// =============================================================================

interface QuantumCircuitState {
  /** Singleton compiler — created once, reused across qc:compile events. */
  compiler: QuantumCircuitCompiler;
  /** Total compilation calls since attach. */
  compileCount: number;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build a minimal HoloComposition AST from the trait config so we can drive
 * the existing QuantumCircuitCompiler without duplicating its logic here.
 */
function buildMinimalComposition(config: QuantumCircuitConfig): HoloComposition {
  // QuantumCircuitCompiler.compile(composition, agentToken?, outputPath?)
  // composition: HoloComposition = { objects: HoloObjectDecl[] }
  // trait.config: Record<string, { value?: unknown; type?: string }>
  const traitConfig: Record<string, { value?: unknown; type?: string }> = {
    circuitType: { value: config.circuitType, type: 'string' },
    ansatzLayers: { value: config.ansatzDepth, type: 'number' },
    nShots: { value: config.nShots, type: 'number' },
    backend: { value: config.backend, type: 'string' },
  };

  if (config.molecule && config.molecule.length > 0) {
    traitConfig['molecule'] = { value: config.molecule, type: 'array' };
  }

  if (config.weightMatrix && config.weightMatrix.length > 0) {
    traitConfig['weightMatrix'] = { value: config.weightMatrix, type: 'array' };
  }

  // QuantumCircuitCompiler.compile() only reads composition.objects — the rest of
  // the HoloComposition fields are unused by that code path. We cast through
  // unknown to avoid satisfying every required field of the full interface.
  return {
    objects: [
      {
        type: 'ObjectDecl',
        name: 'QuantumObject',
        traits: [
          {
            name: 'quantumCircuit',
            config: traitConfig,
          },
        ],
        children: [],
      },
    ],
  } as unknown as HoloComposition;
}

// =============================================================================
// HANDLER
// =============================================================================

/** @quantumCircuit trait handler. */
export const quantumCircuitHandler: TraitHandler<QuantumCircuitConfig> = {
  name: 'quantumCircuit',

  defaultConfig: {
    molecule: undefined,
    ansatzDepth: 2,
    backend: 'aer',
    circuitType: 'vqe',
    nShots: 1024,
    weightMatrix: undefined,
  } satisfies QuantumCircuitConfig,

  onAttach(node: HSPlusNode, _config: QuantumCircuitConfig, _context: TraitContext): void {
    const state: QuantumCircuitState = {
      compiler: new QuantumCircuitCompiler(),
      compileCount: 0,
    };
    node.__qcState = state;
  },

  onDetach(node: HSPlusNode, _config: QuantumCircuitConfig, _context: TraitContext): void {
    delete node.__qcState;
  },

  onUpdate(
    _node: HSPlusNode,
    _config: QuantumCircuitConfig,
    _context: TraitContext,
    _delta: number
  ): void {
    // Stateless per tick — driven by qc:compile event.
  },

  onEvent(
    node: HSPlusNode,
    config: QuantumCircuitConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__qcState as QuantumCircuitState | undefined;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;

    switch (eventType) {
      case 'qc:compile': {
        // Fire-and-forget async; result arrives as qc:qasm or qc:error.
        void _runCompile(state, config, context);
        break;
      }

      case 'qc:status': {
        context.emit?.('qc:status_result', {
          compileCount: state.compileCount,
          circuitType: config.circuitType,
          backend: config.backend,
          ansatzDepth: config.ansatzDepth,
          nShots: config.nShots,
          hasMolecule: Array.isArray(config.molecule) && config.molecule.length > 0,
          hasWeightMatrix: Array.isArray(config.weightMatrix) && config.weightMatrix.length > 0,
        });
        break;
      }
    }
  },
};

// =============================================================================
// ASYNC COMPILE HELPER
// =============================================================================

/**
 * Run QuantumCircuitCompiler synchronously (it is not async internally) and
 * emit qc:qasm on success or qc:error on failure.
 *
 * Defined outside the handler object so it can be async without infecting the
 * sync onEvent signature required by TraitHandler.
 */
async function _runCompile(
  state: QuantumCircuitState,
  config: QuantumCircuitConfig,
  context: TraitContext
): Promise<void> {
  try {
    const composition = buildMinimalComposition(config);
    const output: QASMOutput = state.compiler.compile(composition);
    state.compileCount++;

    context.emit?.('qc:qasm', output);
  } catch (err: unknown) {
    context.emit?.('qc:error', {
      code: 'COMPILE_FAILED',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// EXPORT
// =============================================================================

export default quantumCircuitHandler;
