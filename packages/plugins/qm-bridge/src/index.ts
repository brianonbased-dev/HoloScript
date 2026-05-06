/**
 * @holoscript/qm-bridge — Quantum mechanics bridge plugin for HoloScript.
 *
 * Wraps Psi4 (CCSD molecular), Quantum ESPRESSO (DFT solid-state), and
 * TBLite (semi-empirical/large-system) under unified SimulationContract
 * scale-tag dispatch. The first stage of D.026 two-stage QM absorption.
 *
 * ## What this enables (GROW §7, EVOLVED §7.1)
 *
 * 1. Molecular geometry optimization (Psi4)
 * 2. Reaction barrier estimation (Psi4)
 * 3. Drug-protein binding energy (Psi4 QM/MM)
 * 4. Material property prediction / bandgap (Quantum ESPRESSO)
 * 5. Photonic gain calculation (Psi4 TD-DFT, stage 2)
 * 6. Battery electrolyte stability (DFT, stage 2)
 * 7. NMR / IR spectrum prediction (Psi4 GIAO)
 * 8. Catalyst screening surrogate (TBLite)
 * 9. Reaction mechanism inference (SESL, stage 2)
 * 10. Quantum-circuit chemistry (Qiskit, stage 2)
 *
 * ## Architecture
 *
 * Each backend implements QmSolver (which extends SimSolver), so QM
 * calculations participate in the same SimulationContract / CAEL
 * recording / Brittney dispatch pipeline as classical solvers.
 * The scale tag is always 'quantum'.
 *
 * ## CAEL discipline (G.QM.002)
 *
 * Every QM call logs `solverConfig: { backend, method, basis,
 * convergence_threshold, scf_iterations }` to the CAEL record. The
 * cael-mapping module converts between QmSolverConfig and the
 * CAEL-recordable format.
 *
 * Source: research/2026-04-28_qm-as-foundational-layer-EVOLVED.md §7.1
 *
 * @module @holoscript/qm-bridge
 */

// ── Core interface and types ───────────────────────────────────────────────────

export type {
  QmSolver,
  QmMethod,
  QmBasis,
  QmBackend,
  QmSolverConfig,
  MoleculeSpec,
  CrystalSpec,
  QmEnergyResult,
  QmGeometryResult,
  QmVibrationalResult,
  QmChargeDensityResult,
  QmBandStructureResult,
  QmNmrResult,
  QmTransitionStateResult,
  QmBackendCapabilities,
} from './QmSolver';

export {
  QM_BACKEND_CAPABILITIES,
  requireCapability,
} from './QmSolver';

// ── CAEL mapping ──────────────────────────────────────────────────────────────

export type {
  CaelQmSolverConfig,
  CaelQmResultSummary,
} from './cael-mapping';

export {
  qmConfigToCael,
  qmResultToCaelSummary,
  QM_ACCEPTANCE_CRITERIA,
  verifyQmAcceptance,
} from './cael-mapping';

// ── Backends ───────────────────────────────────────────────────────────────────

export { Psi4Backend } from './backends/psi4';
export type { Psi4Config } from './backends/psi4';

export { QuantumEspressoBackend } from './backends/quantum-espresso';
export type { QuantumEspressoConfig } from './backends/quantum-espresso';

export { TBLiteBackend } from './backends/tblite';
export type { TBLiteConfig } from './backends/tblite';

// ── Factory ────────────────────────────────────────────────────────────────────

import type { QmBackend, QmSolverConfig } from './QmSolver';
import type { Psi4Config } from './backends/psi4';
import type { QuantumEspressoConfig } from './backends/quantum-espresso';
import type { TBLiteConfig } from './backends/tblite';
import { Psi4Backend } from './backends/psi4';
import { QuantumEspressoBackend } from './backends/quantum-espresso';
import { TBLiteBackend } from './backends/tblite';
import type { QmSolver } from './QmSolver';

/**
 * Create a QmSolver for the specified backend.
 *
 * This is the primary entry point for creating QM solver instances.
 * The returned solver implements both QmSolver (for QM-specific methods)
 * and SimSolver (for SimulationContract integration).
 *
 * @example
 * ```typescript
 * import { createQmSolver } from '@holoscript/qm-bridge';
 *
 * const solver = createQmSolver({
 *   backend: 'psi4',
 *   method: 'b3lyp',
 *   basis: '6-31g*',
 *   convergenceThreshold: 1e-6,
 * });
 *
 * const result = await solver.computeEnergy({
 *   atoms: [
 *     { symbol: 'O', x: 0, y: 0, z: 0 },
 *     { symbol: 'H', x: 0.957, y: 0, z: 0 },
 *     { symbol: 'H', x: -0.24, y: 0.927, z: 0 },
 *   ],
 *   charge: 0,
 *   multiplicity: 1,
 * });
 * ```
 */
export function createQmSolver(config: QmSolverConfig): QmSolver {
  switch (config.backend) {
    case 'psi4':
      return new Psi4Backend(config as Psi4Config);
    case 'quantum-espresso':
      return new QuantumEspressoBackend(config as QuantumEspressoConfig);
    case 'tblite':
      return new TBLiteBackend(config as TBLiteConfig);
    default:
      throw new Error(
        `[qm-bridge] Unknown backend: '${config.backend}'. ` +
        `Supported: psi4, quantum-espresso, tblite`,
      );
  }
}

/**
 * Auto-select the best backend for a given computation type.
 *
 * Per W.QDA.001 (Query-Driven Abstraction): Brittney dispatches to the
 * appropriate QM tier based on the user's question. This function encodes
 * the routing logic:
 *
 * - Molecular energy/geometry/NMR -> Psi4
 * - Periodic/bandgap/materials -> Quantum ESPRESSO
 * - Screening/many molecules -> TBLite
 *
 * @param questionType - What the user is asking for
 * @returns The recommended backend
 */
export function selectQmBackend(questionType: string): QmBackend {
  const q = questionType.toLowerCase();

  // Periodic / materials questions
  if (
    q.includes('bandgap') ||
    q.includes('band gap') ||
    q.includes('band structure') ||
    q.includes('material') ||
    q.includes('perovskite') ||
    q.includes('crystal') ||
    q.includes('solid') ||
    q.includes('semiconductor') ||
    q.includes('conductor') ||
    q.includes('insulator')
  ) {
    return 'quantum-espresso';
  }

  // Fast screening questions
  if (
    q.includes('screen') ||
    q.includes('rank') ||
    q.includes('compare') ||
    q.includes('batch') ||
    q.includes('many') ||
    q.includes('quick') ||
    q.includes('approximate') ||
    q.includes('hundred')
  ) {
    return 'tblite';
  }

  // NMR questions
  if (q.includes('nmr') || q.includes('spectrum') || q.includes('chemical shift')) {
    return 'psi4';
  }

  // Default: Psi4 for molecular questions
  return 'psi4';
}

/**
 * Get the recommended method and basis for a backend + question type.
 *
 * Provides sensible defaults so users don't need to know DFT functionals
 * to ask Brittney a question. Brittney can always override these.
 */
export function getDefaultQmConfig(
  backend: QmBackend,
  questionType?: string,
): QmSolverConfig {
  const q = (questionType ?? '').toLowerCase();

  switch (backend) {
    case 'psi4': {
      // NMR needs GIAO-compatible functional
      if (q.includes('nmr')) {
        return { backend: 'psi4', method: 'b3lyp', basis: '6-311+g**' };
      }
      // High-accuracy single-point
      if (q.includes('accurate') || q.includes('ccsd')) {
        return { backend: 'psi4', method: 'ccsd(t)', basis: 'cc-pvtz' };
      }
      // Default: B3LYP/6-31G* — the workhorse
      return { backend: 'psi4', method: 'b3lyp', basis: '6-31g*' };
    }
    case 'quantum-espresso': {
      return { backend: 'quantum-espresso', method: 'pbe', basis: 'minimal' };
    }
    case 'tblite': {
      return { backend: 'tblite', method: 'gfN-xTB', basis: 'minimal' };
    }
    default:
      return { backend, method: 'dft', basis: '6-31g*' };
  }
}

// ── Version ────────────────────────────────────────────────────────────────────

export const VERSION = '0.1.0';
