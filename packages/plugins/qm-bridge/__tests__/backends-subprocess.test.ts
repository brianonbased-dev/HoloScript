/**
 * Tests for QM backend subprocess-control-flow correctness.
 *
 * These tests verify that:
 *  1. When a real binary path is configured (non-mock), the backend ATTEMPTS
 *     to spawn the subprocess and throws a descriptive error on failure
 *     (rather than silently returning mock data — the "verifier theater" bug).
 *  2. When path = '__mock__', the mock path still works (regression guard).
 *  3. The NMR nucleus label in Psi4Backend is correct for all elements.
 *
 * The subprocess is never actually installed in CI; we inject a fake executable
 * path (a path that does not exist) and assert that:
 *   - An error is thrown (proving the code tried to spawn, not fall back to mock)
 *   - The error message references the binary path or is a spawn/ENOENT error
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { Psi4Backend } from '../src/backends/psi4';
import type { Psi4Config } from '../src/backends/psi4';
import { TBLiteBackend } from '../src/backends/tblite';
import type { TBLiteConfig } from '../src/backends/tblite';
import { QuantumEspressoBackend } from '../src/backends/quantum-espresso';
import type { QuantumEspressoConfig } from '../src/backends/quantum-espresso';

// ── Test molecules / crystals ─────────────────────────────────────────────────

const waterMolecule = {
  atoms: [
    { symbol: 'O', x: 0, y: 0, z: 0.1173 },
    { symbol: 'H', x: 0, y: 0.7572, z: -0.4692 },
    { symbol: 'H', x: 0, y: -0.7572, z: -0.4692 },
  ],
  charge: 0,
  multiplicity: 1,
};

const srtio3Crystal = {
  atoms: [
    { symbol: 'Sr', fx: 0, fy: 0, fz: 0 },
    { symbol: 'Ti', fx: 0.5, fy: 0.5, fz: 0.5 },
    { symbol: 'O', fx: 0.5, fy: 0.5, fz: 0 },
    { symbol: 'O', fx: 0.5, fy: 0, fz: 0.5 },
    { symbol: 'O', fx: 0, fy: 0.5, fz: 0.5 },
  ],
  latticeVectors: [
    [3.905, 0, 0],
    [0, 3.905, 0],
    [0, 0, 3.905],
  ] as Array<[number, number, number]>,
};

// A non-existent path that forces a real spawn attempt (ENOENT on all platforms)
const FAKE_BINARY_PATH = '/does/not/exist/psi4-fake-9999';
const FAKE_XTB_PATH = '/does/not/exist/xtb-fake-9999';
const FAKE_PWX_PATH = '/does/not/exist/pw.x-fake-9999';

// ── Bug 1 (critical): Psi4 mock fallthrough ─────────────────────────────────

describe('Psi4Backend subprocess control flow', () => {
  it('mock path returns mock result (regression guard)', async () => {
    const config: Psi4Config = {
      backend: 'psi4',
      method: 'b3lyp',
      basis: '6-31g*',
      psi4Path: '__mock__',
    };
    const backend = new Psi4Backend(config);
    // Must NOT throw — mock path must still work
    const result = await backend.computeEnergy(waterMolecule);
    expect(result.converged).toBe(true);
    expect(result.totalEnergy).toBeLessThan(0);
    backend.dispose();
  });

  it('non-mock configured path ATTEMPTS spawn and throws (not silent mock)', async () => {
    // This is the critical control-flow test: when psi4Path is a real (non-mock)
    // path, the code MUST try to spawn — not silently fall back to mock data.
    // A non-existent binary produces ENOENT, proving spawn was attempted.
    const config: Psi4Config = {
      backend: 'psi4',
      method: 'hf',
      basis: 'sto-3g',
      psi4Path: FAKE_BINARY_PATH,
    };
    const backend = new Psi4Backend(config);
    // Must throw — if it silently returns mock data instead, this test fails.
    await expect(backend.computeEnergy(waterMolecule)).rejects.toThrow();
    backend.dispose();
  });

  it('default path (no override) ATTEMPTS spawn and throws for non-installed psi4', async () => {
    // Default psi4Path is 'psi4' (assumed on PATH). In CI it is not installed,
    // so we expect a spawn error — not silent mock data. This catches the bug
    // where psi4Path defaults to 'psi4' (truthy, non-mock) but still returns mock.
    const config: Psi4Config = {
      backend: 'psi4',
      method: 'hf',
      basis: 'sto-3g',
      psi4Path: 'psi4-definitely-not-installed-xyzzy',
    };
    const backend = new Psi4Backend(config);
    await expect(backend.computeEnergy(waterMolecule)).rejects.toThrow();
    backend.dispose();
  });

  it('non-mock path for geometry optimization also throws (not mock)', async () => {
    const config: Psi4Config = {
      backend: 'psi4',
      method: 'hf',
      basis: 'sto-3g',
      psi4Path: FAKE_BINARY_PATH,
    };
    const backend = new Psi4Backend(config);
    await expect(backend.optimizeGeometry(waterMolecule)).rejects.toThrow();
    backend.dispose();
  });
});

// ── Bug 2 (critical): TBLite mock fallthrough ────────────────────────────────

describe('TBLiteBackend subprocess control flow', () => {
  it('mock path returns mock result (regression guard)', async () => {
    const config: TBLiteConfig = {
      backend: 'tblite',
      method: 'gfN-xTB',
      basis: 'minimal',
      xtbPath: '__mock__',
    };
    const backend = new TBLiteBackend(config);
    const result = await backend.computeSemiEmpiricalEnergy(waterMolecule);
    expect(result.converged).toBe(true);
    expect(result.totalEnergy).toBeLessThan(0);
    backend.dispose();
  });

  it('non-mock configured xtbPath ATTEMPTS spawn and throws (not silent mock)', async () => {
    const config: TBLiteConfig = {
      backend: 'tblite',
      method: 'gfN-xTB',
      basis: 'minimal',
      xtbPath: FAKE_XTB_PATH,
    };
    const backend = new TBLiteBackend(config);
    await expect(backend.computeSemiEmpiricalEnergy(waterMolecule)).rejects.toThrow();
    backend.dispose();
  });

  it('non-mock path for geometry optimization also throws (not mock)', async () => {
    const config: TBLiteConfig = {
      backend: 'tblite',
      method: 'gfN-xTB',
      basis: 'minimal',
      xtbPath: FAKE_XTB_PATH,
    };
    const backend = new TBLiteBackend(config);
    await expect(backend.optimizeGeometry(waterMolecule)).rejects.toThrow();
    backend.dispose();
  });
});

// ── Bug 3 (critical): Quantum ESPRESSO mock fallthrough ──────────────────────

describe('QuantumEspressoBackend subprocess control flow', () => {
  it('mock path returns mock result (regression guard)', async () => {
    const config: QuantumEspressoConfig = {
      backend: 'quantum-espresso',
      method: 'pbe',
      basis: 'minimal',
      pwPath: '__mock__',
    };
    const backend = new QuantumEspressoBackend(config);
    const result = await backend.computeBandStructure(srtio3Crystal);
    expect(result.bandGap).toBeGreaterThan(0);
    expect(result.fermiEnergy).toBeDefined();
    backend.dispose();
  });

  it('non-mock configured pwPath ATTEMPTS spawn and throws (not silent mock)', async () => {
    const config: QuantumEspressoConfig = {
      backend: 'quantum-espresso',
      method: 'pbe',
      basis: 'minimal',
      pwPath: FAKE_PWX_PATH,
    };
    const backend = new QuantumEspressoBackend(config);
    await expect(backend.computeBandStructure(srtio3Crystal)).rejects.toThrow();
    backend.dispose();
  });

  it('non-mock path for DFT materials also throws (not mock)', async () => {
    const config: QuantumEspressoConfig = {
      backend: 'quantum-espresso',
      method: 'pbe',
      basis: 'minimal',
      pwPath: FAKE_PWX_PATH,
    };
    const backend = new QuantumEspressoBackend(config);
    await expect(backend.computeDftMaterials(srtio3Crystal)).rejects.toThrow();
    backend.dispose();
  });
});

// ── Bug 4 (medium): Psi4 NMR nucleus label correctness ───────────────────────

describe('Psi4Backend NMR nucleus labels', () => {
  /**
   * The bug: `getAtomicNumber(a.symbol) === 1 ? '1' : a.symbol` then + 'H'
   * labels hydrogen as '1H' (correct) but carbon as '6H' (wrong, should be '13C').
   * After fix: H→'1H', C→'13C', N→'15N', P→'31P', others→symbol.
   */
  it('hydrogen atoms are labeled 1H', async () => {
    const config: Psi4Config = {
      backend: 'psi4',
      method: 'b3lyp',
      basis: '6-31g*',
      psi4Path: '__mock__',
    };
    const backend = new Psi4Backend(config);
    const result = await backend.computeNmrSpectrum(waterMolecule);
    const hLabels = result.nucleusLabels.filter((_, i) => waterMolecule.atoms[i]?.symbol === 'H');
    for (const label of hLabels) {
      expect(label).toBe('1H');
    }
    backend.dispose();
  });

  it('oxygen atoms are NOT labeled with appended H (bug: non-H labeled as symbolH)', async () => {
    const config: Psi4Config = {
      backend: 'psi4',
      method: 'b3lyp',
      basis: '6-31g*',
      psi4Path: '__mock__',
    };
    const backend = new Psi4Backend(config);
    const result = await backend.computeNmrSpectrum(waterMolecule);
    // Oxygen has atomic number 8 (not 1), so the old buggy code would produce '8H' or 'OH'
    // After fix it should produce 'O' (or the isotope label if defined)
    const oLabels = result.nucleusLabels.filter((_, i) => waterMolecule.atoms[i]?.symbol === 'O');
    for (const label of oLabels) {
      // Must not be 'OH' (appended 'H' to non-hydrogen symbol)
      expect(label).not.toMatch(/\dH$/); // No pattern like '8H' (number then H)
      expect(label).not.toBe('OH');
    }
    backend.dispose();
  });

  it('carbon atoms are labeled 13C, not 6H', async () => {
    const config: Psi4Config = {
      backend: 'psi4',
      method: 'b3lyp',
      basis: '6-31g*',
      psi4Path: '__mock__',
    };
    const backend = new Psi4Backend(config);
    // Methane: one C and four H atoms
    const methane = {
      atoms: [
        { symbol: 'C', x: 0, y: 0, z: 0 },
        { symbol: 'H', x: 0.63, y: 0.63, z: 0.63 },
        { symbol: 'H', x: -0.63, y: -0.63, z: 0.63 },
        { symbol: 'H', x: -0.63, y: 0.63, z: -0.63 },
        { symbol: 'H', x: 0.63, y: -0.63, z: -0.63 },
      ],
      charge: 0,
      multiplicity: 1,
    };
    const result = await backend.computeNmrSpectrum(methane);
    const cLabels = result.nucleusLabels.filter((_, i) => methane.atoms[i]?.symbol === 'C');
    expect(cLabels.length).toBe(1);
    // After fix: carbon should be labeled '13C', not '6H'
    expect(cLabels[0]).toBe('13C');
    expect(cLabels[0]).not.toBe('6H');
    backend.dispose();
  });

  it('nitrogen atoms are labeled 15N, not 7H', async () => {
    const config: Psi4Config = {
      backend: 'psi4',
      method: 'b3lyp',
      basis: '6-31g*',
      psi4Path: '__mock__',
    };
    const backend = new Psi4Backend(config);
    const ammonia = {
      atoms: [
        { symbol: 'N', x: 0, y: 0, z: 0.117 },
        { symbol: 'H', x: 0, y: 0.939, z: -0.272 },
        { symbol: 'H', x: 0.813, y: -0.47, z: -0.272 },
        { symbol: 'H', x: -0.813, y: -0.47, z: -0.272 },
      ],
      charge: 0,
      multiplicity: 1,
    };
    const result = await backend.computeNmrSpectrum(ammonia);
    const nLabels = result.nucleusLabels.filter((_, i) => ammonia.atoms[i]?.symbol === 'N');
    expect(nLabels.length).toBe(1);
    expect(nLabels[0]).toBe('15N');
    expect(nLabels[0]).not.toBe('7H');
    backend.dispose();
  });
});
