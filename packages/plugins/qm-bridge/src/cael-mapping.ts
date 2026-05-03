/**
 * CAEL mapping for QM solver configurations.
 *
 * Every QM call logs `solverConfig: { backend, method, basis,
 * convergence_threshold, scf_iterations }` to satisfy G.QM.002 discipline:
 * "DFT-as-ground-truth violates acceptance-envelope discipline. Functional +
 * basis + convergence in CaelAuditRecord.solverConfig."
 *
 * This module provides the mapping from QmSolverConfig / QmSolver result
 * types into the CAEL-recordable format that the engine's provenance system
 * consumes.
 *
 * Source: research/2026-04-28_qm-as-foundational-layer-EVOLVED.md §7.1
 */

import type { QmSolverConfig, QmBackend, QmMethod, QmBasis } from './QmSolver';

// ── CAEL-recordable solver config ─────────────────────────────────────────────

/** CAEL-recordable solver configuration for QM calculations. */
export interface CaelQmSolverConfig {
  /** Backend identifier. */
  backend: QmBackend;
  /** Calculation method. */
  method: QmMethod;
  /** Basis set. */
  basis: QmBasis;
  /** SCF convergence threshold in Hartree. */
  convergence_threshold: number;
  /** Maximum SCF iterations. */
  max_scf_iterations: number;
  /** Memory limit in MB. */
  memory_mb: number;
  /** Number of compute threads. */
  num_threads: number;
  /** Scale tag — always 'quantum' for QM solvers. */
  scale: 'quantum';
  /** Solver type label for SimulationContract. */
  solverType: string;
  /** Extra backend-specific keywords. */
  extra_keywords: Record<string, unknown>;
}

/**
 * Map a QmSolverConfig to a CAEL-recordable format.
 *
 * This is the function that gets called by the provenance tracker when
 * recording a QM solver invocation. The output is a plain object that
 * can be serialized to JSON and stored in the CAEL record.
 */
export function qmConfigToCael(config: QmSolverConfig): CaelQmSolverConfig {
  return {
    backend: config.backend,
    method: config.method,
    basis: config.basis,
    convergence_threshold: config.convergenceThreshold ?? 1e-6,
    max_scf_iterations: config.maxScfIterations ?? 100,
    memory_mb: config.memoryMb ?? 4000,
    num_threads: config.numThreads ?? 0,  // 0 = auto
    scale: 'quantum',
    solverType: `qm-${config.backend}`,
    extra_keywords: config.extraKeywords ?? {},
  };
}

// ── CAEL-recordable result summary ────────────────────────────────────────────

/** CAEL-recordable summary of a QM calculation result. */
export interface CaelQmResultSummary {
  /** Whether the calculation converged. */
  converged: boolean;
  /** Total energy in Hartree. */
  total_energy_hartree: number;
  /** SCF iterations used. */
  scf_iterations: number;
  /** Wall time in seconds. */
  wall_time_seconds: number;
  /** Number of atoms in the system. */
  num_atoms: number;
  /** Backend that produced this result. */
  backend: QmBackend;
  /** Method used. */
  method: QmMethod;
  /** Basis set used. */
  basis: QmBasis;
}

/**
 * Extract a CAEL-recordable result summary from a QM energy result.
 *
 * This is the format stored in the CAEL audit record for provenance
 * tracking and cross-check verification (G.QM.002).
 */
export function qmResultToCaelSummary(
  result: {
    converged: boolean;
    totalEnergy: number;
    scfIterations: number;
    wallTimeSeconds: number;
    solverConfig: QmSolverConfig;
  },
  numAtoms: number,
): CaelQmResultSummary {
  return {
    converged: result.converged,
    total_energy_hartree: result.totalEnergy,
    scf_iterations: result.scfIterations,
    wall_time_seconds: result.wallTimeSeconds,
    num_atoms: numAtoms,
    backend: result.solverConfig.backend,
    method: result.solverConfig.method,
    basis: result.solverConfig.basis,
  };
}

// ── Acceptance envelope for QM scale ──────────────────────────────────────────

/**
 * Default QM acceptance criteria for CAEL verification.
 *
 * Per DEFAULT_SCALE_ENVELOPES.quantum (SimulationContract.ts):
 *   tolerance: 1e-6 (Hartree)
 *   convergence: 1e-6 (SCF convergence threshold)
 *   energy_drift: 1e-8 (Max total energy drift per step)
 *
 * These are used by the SimulationContract's accepts() check when
 * comparing a QM result against a reference.
 */
export const QM_ACCEPTANCE_CRITERIA = {
  /** Maximum acceptable energy difference in Hartree. */
  energyTolerance: 1e-6,
  /** Minimum SCF convergence threshold in Hartree. */
  convergenceThreshold: 1e-6,
  /** Maximum acceptable energy drift per step in Hartree. */
  energyDrift: 1e-8,
  /** Maximum acceptable gradient norm for geometry convergence in Hartree/Bohr. */
  gradientNormTolerance: 4.5e-4,
  /** Maximum acceptable frequency deviation in cm^-1. */
  frequencyTolerance: 10,  // cm^-1 — generous for harmonic vs anharmonic
} as const;

/**
 * Verify a QM result meets acceptance criteria.
 *
 * Returns violations for any criterion that is not met. Used by
 * SimulationContract's acceptance envelope at the quantum scale.
 */
export function verifyQmAcceptance(
  result: {
    converged: boolean;
    totalEnergy: number;
    scfIterations: number;
    finalGradientNorm?: number;
  },
  reference?: {
    totalEnergy: number;
  },
): Array<{ criterion: string; message: string }> {
  const violations: Array<{ criterion: string; message: string }> = [];

  if (!result.converged) {
    violations.push({
      criterion: 'convergence',
      message: 'SCF did not converge',
    });
  }

  if (reference !== undefined) {
    const energyDiff = Math.abs(result.totalEnergy - reference.totalEnergy);
    if (energyDiff > QM_ACCEPTANCE_CRITERIA.energyTolerance) {
      violations.push({
        criterion: 'energy_tolerance',
        message: `Energy difference ${energyDiff.toExponential(3)} Hartree exceeds tolerance ${QM_ACCEPTANCE_CRITERIA.energyTolerance.toExponential(1)} Hartree`,
      });
    }
  }

  if (result.finalGradientNorm !== undefined) {
    if (result.finalGradientNorm > QM_ACCEPTANCE_CRITERIA.gradientNormTolerance) {
      violations.push({
        criterion: 'gradient_norm',
        message: `Gradient norm ${result.finalGradientNorm.toExponential(3)} Hartree/Bohr exceeds tolerance ${QM_ACCEPTANCE_CRITERIA.gradientNormTolerance.toExponential(1)} Hartree/Bohr`,
      });
    }
  }

  return violations;
}