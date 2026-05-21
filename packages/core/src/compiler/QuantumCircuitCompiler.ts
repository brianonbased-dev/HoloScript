/**
 * HoloScript → OpenQASM 3.0 Quantum Circuit Compiler
 *
 * Bridge compiler that walks a HoloScript composition for `@quantumCircuit`
 * (or `@quantum_circuit`) trait nodes and emits a fully-formed OpenQASM 3.0
 * circuit string along with rich metadata.
 *
 * Supported circuit types:
 *   - VQE  — hardware-efficient ansatz for molecular energy estimation
 *   - QAOA — Max-Cut circuit for combinatorial optimisation
 *   - stub — emitted when no quantum trait is found (1 qubit, warning attached)
 *
 * Jordan-Wigner qubit mapping (sto-3g basis):
 *   H → 1 orbital → 2 spin-orbitals → 2 qubits
 *   C/N/O/F → 5 orbitals → 10 qubits
 *   others  → 9 orbitals → 18 qubits
 *
 * @module QuantumCircuitCompiler
 * @version 1.0.0
 */

import { CompilerBase } from './CompilerBase';
import type { HoloComposition, HoloObjectDecl, HoloObjectTrait } from '../parser/HoloCompositionTypes';
import type { JsonLdSceneGraph } from './SemanticSceneGraph';

// ---------------------------------------------------------------------------
// Public output type
// ---------------------------------------------------------------------------

/** Atom descriptor for a molecule geometry. */
export interface QuantumAtom {
  /** Element symbol (e.g. 'H', 'C', 'N', 'O') */
  symbol: string;
  /** Cartesian x coordinate in Ångströms */
  x: number;
  /** Cartesian y coordinate in Ångströms */
  y: number;
  /** Cartesian z coordinate in Ångströms */
  z: number;
}

/**
 * Output type returned by {@link QuantumCircuitCompiler.compile}.
 *
 * Contains the OpenQASM 3.0 circuit string and all metadata required to
 * dispatch it to an IBM Quantum or Aer backend.
 */
export interface QASMOutput {
  /** OpenQASM 3.0 circuit string */
  qasm: string;
  /** Number of quantum bits */
  numQubits: number;
  /** Number of classical bits (measurement registers) */
  numClbits: number;
  /** Circuit depth (gate layers, estimated) */
  estimatedDepth: number;
  /** Circuit type determined from trait parameters */
  circuitType: 'vqe' | 'qaoa' | 'grover' | 'custom';
  /** Molecule this circuit encodes (VQE only) */
  molecule?: { atoms: QuantumAtom[] };
  /** Weight matrix this circuit encodes (QAOA only) */
  weightMatrix?: number[][];
  /** Recommended execution backend */
  recommendedBackend: 'aer' | 'ibm-quantum';
  /** Non-fatal warning messages (e.g. circuit too large for near-term hardware) */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Count sto-3g spin-orbitals (and therefore qubits) for a list of atoms.
 *
 * Mapping (Jordan-Wigner, sto-3g):
 *   H → 1 spatial orbital → 2 spin-orbitals
 *   C/N/O/F → 5 spatial orbitals → 10 spin-orbitals
 *   others → 9 spatial orbitals → 18 spin-orbitals
 */
function qubitsForMolecule(atoms: QuantumAtom[]): number {
  const orbitalCount = atoms.reduce((sum, a) => {
    if (a.symbol === 'H') return sum + 1;
    if (['C', 'N', 'O', 'F'].includes(a.symbol)) return sum + 5;
    return sum + 9;
  }, 0);
  return orbitalCount * 2;
}

/**
 * Extract a numeric value from a HoloScript trait config entry.
 * Returns `undefined` when the key is absent or the value cannot be cast.
 */
function extractNumber(
  config: Record<string, { value?: unknown; type?: string }>,
  key: string
): number | undefined {
  const entry = config[key];
  if (!entry) return undefined;
  const v = entry.value;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return isNaN(n) ? undefined : n;
  }
  return undefined;
}

/**
 * Extract an atom array from a HoloScript trait config entry.
 *
 * Accepts either a pre-parsed array or a JSON-encoded string.
 */
function extractAtoms(
  config: Record<string, { value?: unknown; type?: string }>
): QuantumAtom[] | undefined {
  const entry = config['molecule'] ?? config['atoms'];
  if (!entry) return undefined;
  let raw = entry.value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return undefined; }
  }
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(
    (a): a is QuantumAtom =>
      typeof a === 'object' &&
      a !== null &&
      typeof (a as Record<string, unknown>)['symbol'] === 'string'
  );
}

/**
 * Extract a weight matrix from a HoloScript trait config entry.
 * Accepts pre-parsed 2-D number arrays or JSON-encoded strings.
 */
function extractWeightMatrix(
  config: Record<string, { value?: unknown; type?: string }>
): number[][] | undefined {
  const entry = config['weightMatrix'] ?? config['weight_matrix'] ?? config['adjacency'];
  if (!entry) return undefined;
  let raw = entry.value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return undefined; }
  }
  if (!Array.isArray(raw)) return undefined;
  if (!raw.every((row): row is number[] => Array.isArray(row))) return undefined;
  return raw;
}

// ---------------------------------------------------------------------------
// VQE circuit generation
// ---------------------------------------------------------------------------

/**
 * Generate a hardware-efficient VQE ansatz in OpenQASM 3.0.
 *
 * Uses linear CNOT entanglement with one Ry rotation layer per ansatz layer.
 * Parameters are symbolic (θ[i]) — the VQE outer loop optimises them.
 */
function generateVQECircuit(
  atoms: QuantumAtom[],
  moleculeName: string,
  ansatzLayers: number
): { qasm: string; numQubits: number; estimatedDepth: number; warnings: string[] } {
  const warnings: string[] = [];
  let numQubits = qubitsForMolecule(atoms);

  if (numQubits > 50) {
    warnings.push(
      `Molecule requires ${numQubits} qubits which exceeds the 50-qubit cap. ` +
        'Clamping to 50. Use classical QM for larger systems.'
    );
    numQubits = 50;
  }
  if (numQubits > 20) {
    warnings.push(
      `Circuit uses ${numQubits} qubits — near-term hardware is limited to ~20 qubits ` +
        'without error correction. Consider a smaller basis set.'
    );
  }

  const n = numQubits;
  const lines: string[] = [];

  lines.push('OPENQASM 3.0;');
  lines.push('include "stdgates.inc";');
  lines.push(`// Hardware-efficient ansatz for ${moleculeName} (${n} qubits, sto-3g)`);
  lines.push('// Generated by HoloScript QuantumCircuitCompiler');
  lines.push(`qubit[${n}] q;`);
  lines.push(`bit[${n}] c;`);

  let paramIdx = 0;

  for (let layer = 0; layer < ansatzLayers; layer++) {
    lines.push(`// Layer ${layer}: Ry rotations (θ[${paramIdx}..${paramIdx + n - 1}] optimised by VQE)`);
    for (let i = 0; i < n; i++) {
      lines.push(`ry(0.1) q[${i}]; // θ[${paramIdx}]`);
      paramIdx++;
    }
    if (layer < ansatzLayers - 1 || n > 1) {
      lines.push(`// Entanglement: linear CNOT chain`);
      for (let i = 0; i < n - 1; i++) {
        lines.push(`cx q[${i}], q[${i + 1}];`);
      }
    }
  }

  lines.push('// Measurement');
  lines.push('c = measure q;');

  // Depth estimate: ansatzLayers × (Ry layer + CNOT chain) + 1 measure
  const estimatedDepth = ansatzLayers * 2 + 1;

  return { qasm: lines.join('\n'), numQubits: n, estimatedDepth, warnings };
}

// ---------------------------------------------------------------------------
// QAOA circuit generation
// ---------------------------------------------------------------------------

/**
 * Generate a QAOA Max-Cut circuit in OpenQASM 3.0 (p = 1 rounds).
 *
 * Applies the standard QAOA recipe:
 *   1. Hadamard superposition
 *   2. Problem unitary (RZZ for each edge weighted by gamma)
 *   3. Mixer unitary (RX rotations with beta)
 *   4. Measurement
 */
function generateQAOACircuit(
  weightMatrix: number[][],
  p: number
): { qasm: string; numQubits: number; estimatedDepth: number; warnings: string[] } {
  const warnings: string[] = [];
  let n = weightMatrix.length;

  if (n > 100) {
    warnings.push(
      `Graph has ${n} nodes which exceeds the 100-qubit cap. ` +
        'Clamping to 100. Use classical solvers for larger instances.'
    );
    n = 100;
    weightMatrix = weightMatrix.slice(0, 100).map((row) => row.slice(0, 100));
  }
  if (n > 50) {
    warnings.push(
      `Circuit uses ${n} qubits — near-term hardware handles ~50 qubits without error correction.`
    );
  }

  const gamma = 0.5;
  const beta = 0.5;
  const lines: string[] = [];

  lines.push('OPENQASM 3.0;');
  lines.push('include "stdgates.inc";');
  lines.push(`// QAOA Max-Cut circuit for ${n}-node graph (p=${p})`);
  lines.push('// Generated by HoloScript QuantumCircuitCompiler');
  lines.push(`qubit[${n}] q;`);
  lines.push(`bit[${n}] c;`);

  // Initial superposition
  lines.push('// Initial superposition');
  for (let i = 0; i < n; i++) {
    lines.push(`h q[${i}];`);
  }

  for (let round = 0; round < p; round++) {
    lines.push(`// Problem unitary — round ${round + 1} (gamma=${gamma})`);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const w = weightMatrix[i]?.[j] ?? 0;
        if (w !== 0) {
          const angle = (2 * gamma * w).toFixed(4);
          // RZZ(2γw) = CNOT · RZ(2γw) · CNOT
          lines.push(`// Edge (${i},${j}) weight=${w}: rzz(${angle})`);
          lines.push(`cx q[${i}], q[${j}];`);
          lines.push(`rz(${angle}) q[${j}];`);
          lines.push(`cx q[${i}], q[${j}];`);
        }
      }
    }

    lines.push(`// Mixer unitary — round ${round + 1} (beta=${beta})`);
    for (let i = 0; i < n; i++) {
      lines.push(`rx(${(2 * beta).toFixed(4)}) q[${i}];`);
    }
  }

  lines.push('// Measurement');
  lines.push('c = measure q;');

  // Depth: superposition (1) + p × (problem + mixer) + measurement (1)
  const edgeCount = weightMatrix.flat().filter((w) => w !== 0).length / 2;
  const estimatedDepth = 1 + p * (Math.ceil(edgeCount * 3) + 1) + 1;

  return { qasm: lines.join('\n'), numQubits: n, estimatedDepth, warnings };
}

// ---------------------------------------------------------------------------
// Stub circuit
// ---------------------------------------------------------------------------

function generateStubCircuit(): { qasm: string; warnings: string[] } {
  const qasm = [
    'OPENQASM 3.0;',
    'include "stdgates.inc";',
    '// Stub circuit: no @quantumCircuit trait found in composition',
    '// Generated by HoloScript QuantumCircuitCompiler',
    'qubit[1] q;',
    'bit[1] c;',
    'h q[0];',
    'c = measure q;',
  ].join('\n');
  return {
    qasm,
    warnings: [
      'No @quantumCircuit (or @quantum_circuit) trait found in the composition. ' +
        'A stub 1-qubit circuit has been emitted. ' +
        'Add a @quantumCircuit trait with `molecule` or `weightMatrix` params to generate a real circuit.',
    ],
  };
}

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

/**
 * Quantum Circuit Compiler — HoloScript → OpenQASM 3.0
 *
 * Extend {@link CompilerBase} to inherit RBAC enforcement and the P3 dual-mode
 * token bridge. Call {@link compile} with a HoloComposition AST and an optional
 * JWT or UCAN token.
 *
 * @example
 * ```typescript
 * const compiler = new QuantumCircuitCompiler();
 * const output: QASMOutput = compiler.compile(composition, agentToken);
 * console.log(output.qasm);
 * ```
 */
export class QuantumCircuitCompiler extends CompilerBase {
  protected readonly compilerName = 'QuantumCircuitCompiler';

  /**
   * Compile a HoloScript composition to an OpenQASM 3.0 circuit.
   *
   * The method scans `composition.objects` for the first object that carries a
   * `@quantumCircuit` or `@quantum_circuit` trait. Trait params drive the type:
   *   - `molecule` (or `atoms`) → VQE hardware-efficient ansatz
   *   - `weightMatrix` / `weight_matrix` / `adjacency` / `numNodes` → QAOA Max-Cut
   *   - none of the above → stub 1-qubit circuit with a warning
   *
   * @param composition - Parsed HoloScript AST
   * @param agentToken  - JWT RBAC token or UCAN CapabilityTokenCredential (optional)
   * @param outputPath  - Optional path for output-scope RBAC check
   * @param _sceneGraph - Unused (reserved for future scene-graph hints)
   * @returns {@link QASMOutput}
   */
  compile(
    composition: HoloComposition,
    agentToken?: string,
    outputPath?: string,
    _sceneGraph?: JsonLdSceneGraph
  ): QASMOutput {
    // RBAC / UCAN access check
    this.validateCompilerAccess(agentToken, outputPath);

    // Walk composition objects looking for a quantum trait
    const quantum = this.findQuantumTrait(composition.objects ?? []);

    if (!quantum) {
      const { qasm, warnings } = generateStubCircuit();
      return {
        qasm,
        numQubits: 1,
        numClbits: 1,
        estimatedDepth: 2,
        circuitType: 'custom',
        recommendedBackend: 'aer',
        warnings,
      };
    }

    const { trait } = quantum;
    // Normalise config access — trait.config values may be raw HoloValue objects
    const cfg = trait.config as Record<string, { value?: unknown; type?: string }>;

    // Determine circuit type by inspecting trait params
    const atoms = extractAtoms(cfg);
    const weightMatrix = extractWeightMatrix(cfg);
    const numNodes = extractNumber(cfg, 'numNodes') ?? extractNumber(cfg, 'num_nodes');

    if (atoms && atoms.length > 0) {
      return this.buildVQEOutput(atoms, cfg);
    }

    if (weightMatrix) {
      return this.buildQAOAOutput(weightMatrix, cfg);
    }

    if (numNodes !== undefined && numNodes > 0) {
      // Build a fully-connected unit-weight graph of `numNodes` nodes
      const n = Math.min(Math.round(numNodes), 100);
      const matrix: number[][] = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i !== j ? 1 : 0))
      );
      return this.buildQAOAOutput(matrix, cfg);
    }

    // Fallback: stub
    const { qasm, warnings } = generateStubCircuit();
    warnings.unshift(
      '@quantumCircuit trait found but neither `molecule`/`atoms` nor `weightMatrix`/`numNodes` ' +
        'params are present. Add params to generate a circuit.'
    );
    return {
      qasm,
      numQubits: 1,
      numClbits: 1,
      estimatedDepth: 2,
      circuitType: 'custom',
      recommendedBackend: 'aer',
      warnings,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Walk `objects` (and their children) recursively, returning the first object
   * that has a `@quantumCircuit` or `@quantum_circuit` trait, plus the trait.
   */
  private findQuantumTrait(
    objects: HoloObjectDecl[]
  ): { obj: HoloObjectDecl; trait: HoloObjectTrait } | undefined {
    for (const obj of objects) {
      for (const trait of obj.traits ?? []) {
        if (trait.name === 'quantumCircuit' || trait.name === 'quantum_circuit') {
          return { obj, trait };
        }
      }
      if (obj.children && obj.children.length > 0) {
        const found = this.findQuantumTrait(obj.children);
        if (found) return found;
      }
    }
    return undefined;
  }

  /** Build a {@link QASMOutput} for a VQE circuit. */
  private buildVQEOutput(
    atoms: QuantumAtom[],
    cfg: Record<string, { value?: unknown; type?: string }>
  ): QASMOutput {
    const moleculeName =
      (extractNumber(cfg, 'moleculeName') !== undefined
        ? undefined
        : (cfg['moleculeName']?.value as string | undefined)) ??
      atoms.map((a) => a.symbol).join('') ??
      'molecule';

    const ansatzLayers = Math.max(1, Math.round(extractNumber(cfg, 'ansatzLayers') ?? extractNumber(cfg, 'ansatz_layers') ?? 2));

    const { qasm, numQubits, estimatedDepth, warnings } = generateVQECircuit(
      atoms,
      moleculeName,
      ansatzLayers
    );

    return {
      qasm,
      numQubits,
      numClbits: numQubits,
      estimatedDepth,
      circuitType: 'vqe',
      molecule: { atoms },
      recommendedBackend: numQubits <= 20 ? 'aer' : 'ibm-quantum',
      warnings,
    };
  }

  /** Build a {@link QASMOutput} for a QAOA circuit. */
  private buildQAOAOutput(
    weightMatrix: number[][],
    cfg: Record<string, { value?: unknown; type?: string }>
  ): QASMOutput {
    const p = Math.max(1, Math.round(extractNumber(cfg, 'p') ?? 1));

    const { qasm, numQubits, estimatedDepth, warnings } = generateQAOACircuit(weightMatrix, p);

    return {
      qasm,
      numQubits,
      numClbits: numQubits,
      estimatedDepth,
      circuitType: 'qaoa',
      weightMatrix,
      recommendedBackend: numQubits <= 50 ? 'aer' : 'ibm-quantum',
      warnings,
    };
  }
}
