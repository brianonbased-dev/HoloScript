/**
 * Tests for @holoscript/qm-bridge plugin.
 *
 * Stage 1 tests validate the TypeScript interface, factory routing,
 * CAEL mapping, acceptance envelope, and backend capability checks
 * without requiring actual Psi4/QE/TBLite installations.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import {
  createQmSolver,
  selectQmBackend,
  getDefaultQmConfig,
  QM_BACKEND_CAPABILITIES,
  requireCapability,
  qmConfigToCael,
  qmResultToCaelSummary,
  verifyQmAcceptance,
  QM_ACCEPTANCE_CRITERIA,
} from '../src/index';
import type { QmBackend, QmSolverConfig, MoleculeSpec } from '../src/index';

// ── Test fixtures ──────────────────────────────────────────────────────────────

const waterMolecule: MoleculeSpec = {
  atoms: [
    { symbol: 'O', x: 0, y: 0, z: 0.1173 },
    { symbol: 'H', x: 0, y: 0.7572, z: -0.4692 },
    { symbol: 'H', x: 0, y: -0.7572, z: -0.4692 },
  ],
  charge: 0,
  multiplicity: 1,
};

const psi4Config: QmSolverConfig = {
  backend: 'psi4',
  method: 'b3lyp',
  basis: '6-31g*',
  psi4Path: '__mock__',
} as QmSolverConfig;

const qeConfig: QmSolverConfig = {
  backend: 'quantum-espresso',
  method: 'pbe',
  basis: 'minimal',
  pwPath: '__mock__',
} as QmSolverConfig;

const tbliteConfig: QmSolverConfig = {
  backend: 'tblite',
  method: 'gfN-xTB',
  basis: 'minimal',
  xtbPath: '__mock__',
} as QmSolverConfig;

// ── Factory tests ──────────────────────────────────────────────────────────────

describe('createQmSolver', () => {
  it('creates a Psi4 backend', () => {
    const solver = createQmSolver(psi4Config);
    expect(solver.backend).toBe('psi4');
    expect(solver.scale).toBe('quantum');
    expect(solver.mode).toBe('steady-state');
  });

  it('creates a Quantum ESPRESSO backend', () => {
    const solver = createQmSolver(qeConfig);
    expect(solver.backend).toBe('quantum-espresso');
    expect(solver.scale).toBe('quantum');
  });

  it('creates a TBLite backend', () => {
    const solver = createQmSolver(tbliteConfig);
    expect(solver.backend).toBe('tblite');
    expect(solver.scale).toBe('quantum');
  });

  it('throws for unknown backend', () => {
    expect(() =>
      createQmSolver({ backend: 'unknown' as QmBackend, method: 'hf', basis: 'sto-3g' }),
    ).toThrow(/Unknown backend/);
  });
});

// ── Backend routing tests ──────────────────────────────────────────────────────

describe('selectQmBackend', () => {
  it('routes bandgap queries to Quantum ESPRESSO', () => {
    expect(selectQmBackend('What is the bandgap of this perovskite?')).toBe('quantum-espresso');
  });

  it('routes crystal/material queries to Quantum ESPRESSO', () => {
    expect(selectQmBackend('Calculate the material properties of silicon')).toBe('quantum-espresso');
    expect(selectQmBackend('What is the band structure of this crystal?')).toBe('quantum-espresso');
  });

  it('routes NMR queries to Psi4', () => {
    expect(selectQmBackend('Predict the 1H NMR spectrum')).toBe('psi4');
  });

  it('routes screening queries to TBLite', () => {
    expect(selectQmBackend('Screen these 100 candidates')).toBe('tblite');
    expect(selectQmBackend('Quick approximate energy calculation')).toBe('tblite');
  });

  it('routes molecular queries to Psi4 by default', () => {
    expect(selectQmBackend('Optimize this molecule')).toBe('psi4');
    expect(selectQmBackend('What is the energy?')).toBe('psi4');
  });
});

// ── Default config tests ───────────────────────────────────────────────────────

describe('getDefaultQmConfig', () => {
  it('returns B3LYP/6-31G* for Psi4 default', () => {
    const config = getDefaultQmConfig('psi4');
    expect(config.method).toBe('b3lyp');
    expect(config.basis).toBe('6-31g*');
  });

  it('returns 6-311+G** for NMR queries', () => {
    const config = getDefaultQmConfig('psi4', 'nmr spectrum prediction');
    expect(config.method).toBe('b3lyp');
    expect(config.basis).toBe('6-311+g**');
  });

  it('returns CCSD(T)/cc-pVTZ for high-accuracy queries', () => {
    const config = getDefaultQmConfig('psi4', 'accurate energy calculation');
    expect(config.method).toBe('ccsd(t)');
    expect(config.basis).toBe('cc-pvtz');
  });

  it('returns PBE for Quantum ESPRESSO', () => {
    const config = getDefaultQmConfig('quantum-espresso');
    expect(config.method).toBe('pbe');
  });

  it('returns GFN-xTB for TBLite', () => {
    const config = getDefaultQmConfig('tblite');
    expect(config.method).toBe('gfN-xTB');
  });
});

// ── Capability matrix tests ────────────────────────────────────────────────────

describe('QM_BACKEND_CAPABILITIES', () => {
  it('Psi4 supports molecular, NMR, post-HF, TS, QM/MM', () => {
    const caps = QM_BACKEND_CAPABILITIES.psi4;
    expect(caps.molecular).toBe(true);
    expect(caps.nmrGiao).toBe(true);
    expect(caps.postHf).toBe(true);
    expect(caps.transitionStates).toBe(true);
    expect(caps.qmMm).toBe(true);
    expect(caps.periodic).toBe(false);
    expect(caps.semiEmpirical).toBe(false);
  });

  it('QE supports periodic but not molecular', () => {
    const caps = QM_BACKEND_CAPABILITIES['quantum-espresso'];
    expect(caps.periodic).toBe(true);
    expect(caps.molecular).toBe(false);
    expect(caps.nmrGiao).toBe(false);
    expect(caps.postHf).toBe(false);
  });

  it('TBLite supports semi-empirical and large systems', () => {
    const caps = QM_BACKEND_CAPABILITIES.tblite;
    expect(caps.semiEmpirical).toBe(true);
    expect(caps.molecular).toBe(true);
    expect(caps.maxAtoms).toBeGreaterThan(QM_BACKEND_CAPABILITIES.psi4.maxAtoms);
  });
});

describe('requireCapability', () => {
  it('passes when backend supports the capability', () => {
    expect(() => requireCapability('psi4', 'molecular')).not.toThrow();
  });

  it('throws when backend lacks the capability', () => {
    expect(() => requireCapability('psi4', 'periodic')).toThrow(
      /does not support 'periodic'/,
    );
    expect(() => requireCapability('quantum-espresso', 'nmrGiao')).toThrow(
      /does not support 'nmrGiao'/,
    );
    expect(() => requireCapability('tblite', 'postHf')).toThrow(
      /does not support 'postHf'/,
    );
  });
});

// ── CAEL mapping tests ─────────────────────────────────────────────────────────

describe('qmConfigToCael', () => {
  it('maps a QmSolverConfig to CAEL-recordable format', () => {
    const config: QmSolverConfig = {
      backend: 'psi4',
      method: 'b3lyp',
      basis: '6-31g*',
      convergenceThreshold: 1e-8,
      maxScfIterations: 200,
      memoryMb: 8000,
      numThreads: 4,
    };

    const cael = qmConfigToCael(config);
    expect(cael.backend).toBe('psi4');
    expect(cael.method).toBe('b3lyp');
    expect(cael.basis).toBe('6-31g*');
    expect(cael.convergence_threshold).toBe(1e-8);
    expect(cael.max_scf_iterations).toBe(200);
    expect(cael.memory_mb).toBe(8000);
    expect(cael.num_threads).toBe(4);
    expect(cael.scale).toBe('quantum');
    expect(cael.solverType).toBe('qm-psi4');
  });

  it('applies defaults for missing optional fields', () => {
    const config: QmSolverConfig = {
      backend: 'tblite',
      method: 'gfN-xTB',
      basis: 'minimal',
    };

    const cael = qmConfigToCael(config);
    expect(cael.convergence_threshold).toBe(1e-6);
    expect(cael.max_scf_iterations).toBe(100);
    expect(cael.memory_mb).toBe(4000);
    expect(cael.num_threads).toBe(0);
  });
});

describe('qmResultToCaelSummary', () => {
  it('extracts a CAEL result summary', () => {
    const summary = qmResultToCaelSummary(
      {
        converged: true,
        totalEnergy: -76.0,
        scfIterations: 10,
        wallTimeSeconds: 5.3,
        solverConfig: {
          backend: 'psi4',
          method: 'b3lyp',
          basis: '6-31g*',
        },
      },
      3,
    );

    expect(summary.converged).toBe(true);
    expect(summary.total_energy_hartree).toBe(-76.0);
    expect(summary.scf_iterations).toBe(10);
    expect(summary.num_atoms).toBe(3);
    expect(summary.backend).toBe('psi4');
    expect(summary.method).toBe('b3lyp');
  });
});

// ── Acceptance envelope tests ──────────────────────────────────────────────────

describe('verifyQmAcceptance', () => {
  it('passes for a converged result without reference', () => {
    const violations = verifyQmAcceptance({
      converged: true,
      totalEnergy: -76.0,
      scfIterations: 10,
    });
    expect(violations).toHaveLength(0);
  });

  it('flags non-convergence', () => {
    const violations = verifyQmAcceptance({
      converged: false,
      totalEnergy: -76.0,
      scfIterations: 100,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].criterion).toBe('convergence');
  });

  it('passes when energy matches reference within tolerance', () => {
    const violations = verifyQmAcceptance(
      { converged: true, totalEnergy: -76.0, scfIterations: 10 },
      { totalEnergy: -76.0 },
    );
    expect(violations).toHaveLength(0);
  });

  it('flags energy difference exceeding tolerance', () => {
    const violations = verifyQmAcceptance(
      { converged: true, totalEnergy: -76.0, scfIterations: 10 },
      { totalEnergy: -75.9 },
    );
    expect(violations.some((v) => v.criterion === 'energy_tolerance')).toBe(true);
  });

  it('flags gradient norm exceeding tolerance', () => {
    const violations = verifyQmAcceptance({
      converged: true,
      totalEnergy: -76.0,
      scfIterations: 10,
      finalGradientNorm: 0.01,
    });
    expect(violations.some((v) => v.criterion === 'gradient_norm')).toBe(true);
  });
});

// ── Backend-specific method tests (mock) ────────────────────────────────────────

describe('Psi4Backend (mock)', () => {
  it('computes energy for a water molecule', async () => {
    const solver = createQmSolver(psi4Config);
    const result = await solver.computeEnergy(waterMolecule);

    expect(result.converged).toBe(true);
    expect(result.totalEnergy).toBeLessThan(0);  // Bound state is negative
    expect(result.solverConfig.backend).toBe('psi4');
    expect(result.wallTimeSeconds).toBeGreaterThanOrEqual(0);
    solver.dispose();
  });

  it('optimizes geometry for a water molecule', async () => {
    const solver = createQmSolver(psi4Config);
    const result = await solver.optimizeGeometry(waterMolecule);

    expect(result.converged).toBe(true);
    expect(result.totalEnergy).toBeLessThan(0);
    expect(result.optimizationSteps).toBeGreaterThan(0);
    solver.dispose();
  });

  it('computes NMR spectrum for a water molecule', async () => {
    const solver = createQmSolver(psi4Config);
    const result = await solver.computeNmrSpectrum(waterMolecule);

    expect(result.isotropicShieldings).toBeDefined();
    expect(result.nucleusLabels).toBeDefined();
    expect(result.chemicalShifts).toBeDefined();
    expect(result.referenceShielding).toBeDefined();
    solver.dispose();
  });

  it('throws for band structure on Psi4', async () => {
    const solver = createQmSolver(psi4Config);
    await expect(solver.computeBandStructure({
      atoms: [{ symbol: 'Si', fx: 0, fy: 0, fz: 0 }],
      latticeVectors: [[5.43, 0, 0], [0, 5.43, 0], [0, 0, 5.43]],
    })).rejects.toThrow(/does not support periodic/);
    solver.dispose();
  });

  it('implements SimSolver interface', () => {
    const solver = createQmSolver(psi4Config);
    expect(solver.mode).toBe('steady-state');
    expect(solver.fieldNames).toContain('total_energy');
    expect(typeof solver.step).toBe('function');
    expect(typeof solver.solve).toBe('function');
    expect(typeof solver.getField).toBe('function');
    expect(typeof solver.getStats).toBe('function');
    expect(typeof solver.dispose).toBe('function');
    solver.dispose();
  });
});

describe('QuantumEspressoBackend (mock)', () => {
  const crystal = {
    atoms: [
      { symbol: 'Sr', fx: 0, fy: 0, fz: 0 },
      { symbol: 'Ti', fx: 0.5, fy: 0.5, fz: 0.5 },
      { symbol: 'O', fx: 0.5, fy: 0.5, fz: 0 },
      { symbol: 'O', fx: 0.5, fy: 0, fz: 0.5 },
      { symbol: 'O', fx: 0, fy: 0.5, fz: 0.5 },
    ],
    latticeVectors: [[3.905, 0, 0], [0, 3.905, 0], [0, 0, 3.905]] as Array<[number, number, number]>,
  };

  it('computes band structure for SrTiO3', async () => {
    const solver = createQmSolver(qeConfig);
    const result = await solver.computeBandStructure(crystal);

    expect(result.bandGap).toBeGreaterThan(0);
    expect(result.fermiEnergy).toBeDefined();
    expect(result.isMetallic).toBe(false);
    solver.dispose();
  });

  it('computes DFT materials properties', async () => {
    const solver = createQmSolver(qeConfig);
    const result = await solver.computeDftMaterials(crystal);

    expect(result.energy).toBeDefined();
    expect(result.bandStructure).toBeDefined();
    expect(result.bandStructure.bandGap).toBeGreaterThan(0);
    solver.dispose();
  });

  it('throws for molecular calculations', async () => {
    const solver = createQmSolver(qeConfig);
    await expect(solver.computeEnergy(waterMolecule)).rejects.toThrow(/molecular/);
    solver.dispose();
  });
});

describe('TBLiteBackend (mock)', () => {
  it('computes semi-empirical energy', async () => {
    const solver = createQmSolver(tbliteConfig);
    const result = await solver.computeSemiEmpiricalEnergy(waterMolecule);

    expect(result.converged).toBe(true);
    expect(result.totalEnergy).toBeLessThan(0);
    expect(result.solverConfig.backend).toBe('tblite');
    solver.dispose();
  });

  it('computes energy (delegates to semi-empirical)', async () => {
    const solver = createQmSolver(tbliteConfig);
    const result = await solver.computeEnergy(waterMolecule);

    expect(result.converged).toBe(true);
    expect(result.solverConfig.backend).toBe('tblite');
    solver.dispose();
  });

  it('throws for band structure', async () => {
    const solver = createQmSolver(tbliteConfig);
    await expect(solver.computeBandStructure({
      atoms: [{ symbol: 'C', fx: 0, fy: 0, fz: 0 }],
      latticeVectors: [[2.46, 0, 0], [0, 2.46, 0], [0, 0, 10]] as Array<[number, number, number]>,
    })).rejects.toThrow(/band structure/);
    solver.dispose();
  });
});

// ── SimSolver integration tests ────────────────────────────────────────────────

describe('SimSolver integration', () => {
  it('QmSolver participates in SimulationContract scale routing', () => {
    const solver = createQmSolver(psi4Config);
    // The scale field is how SimulationContract routes acceptance envelopes
    expect(solver.scale).toBe('quantum');
  });

  it('getField returns null before computation', () => {
    const solver = createQmSolver(psi4Config);
    expect(solver.getField('total_energy')).toBeNull();
    solver.dispose();
  });

  it('getStats returns backend info', () => {
    const solver = createQmSolver(psi4Config);
    const stats = solver.getStats();
    expect(stats.backend).toBe('psi4');
    expect(stats.method).toBe('b3lyp');
    solver.dispose();
  });

  it('dispose clears internal state', async () => {
    const solver = createQmSolver(psi4Config);
    await solver.computeEnergy(waterMolecule);
    const energy = solver.getField('total_energy');
    expect(energy).not.toBeNull();

    solver.dispose();
    expect(solver.getField('total_energy')).toBeNull();
  });
});

// ── Acceptance criteria constants ───────────────────────────────────────────────

describe('QM_ACCEPTANCE_CRITERIA', () => {
  it('energy tolerance is 1e-6 Hartree', () => {
    expect(QM_ACCEPTANCE_CRITERIA.energyTolerance).toBe(1e-6);
  });

  it('convergence threshold is 1e-6 Hartree', () => {
    expect(QM_ACCEPTANCE_CRITERIA.convergenceThreshold).toBe(1e-6);
  });

  it('gradient norm tolerance matches typical SCF convergence', () => {
    expect(QM_ACCEPTANCE_CRITERIA.gradientNormTolerance).toBeLessThan(1e-3);
  });
});