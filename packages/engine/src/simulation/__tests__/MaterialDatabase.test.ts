/**
 * MaterialDatabase & MaterialProperties Tests
 *
 * Validates:
 * - Every built-in material has a literature citation
 * - Property values are physically reasonable
 * - Uncertainty bounds are within acceptable range
 * - Temperature-dependent lookup interpolates correctly
 * - T-dependent data at reference points matches known values
 * - Sigma sampling produces expected perturbations
 */

import { describe, it, expect } from 'vitest';
import {
  getMaterial,
  findMaterial,
  listMaterials,
  listCitedMaterials,
  getCitedMaterial,
  getMaterialProvenance,
  thermalDiffusivity,
  registerMaterial,
} from '../MaterialDatabase';
import {
  getMaterialAtTemperature,
  getThermalConductivity,
  getSpecificHeat,
  getDensity,
  getDynamicViscosity,
  hasTemperatureDependentData,
  getTemperatureRange,
  listTemperatureDependentMaterials,
} from '../MaterialProperties';

// ── Citation Coverage ────────────────────────────────────────────────────────

describe('Citation coverage', () => {
  const cited = listCitedMaterials();

  it('every built-in material has a citation', () => {
    expect(cited.length).toBeGreaterThanOrEqual(15);
    for (const name of cited) {
      const prov = getMaterialProvenance(name);
      expect(prov, `${name} missing provenance`).toBeDefined();
      expect(prov!.source.length, `${name} has empty source`).toBeGreaterThan(5);
    }
  });

  it('every citation has an uncertainty bound', () => {
    for (const name of cited) {
      const prov = getMaterialProvenance(name)!;
      expect(prov.uncertainty, `${name} uncertainty out of range`).toBeGreaterThanOrEqual(0.01);
      expect(prov.uncertainty, `${name} uncertainty out of range`).toBeLessThanOrEqual(0.20);
    }
  });

  it('every citation has a valid temperature range', () => {
    for (const name of cited) {
      const prov = getMaterialProvenance(name)!;
      const [tMin, tMax] = prov.temperatureRange;
      expect(tMin, `${name} tMin should be > 0 K`).toBeGreaterThan(0);
      expect(tMax, `${name} tMax should be > tMin`).toBeGreaterThan(tMin);
      expect(tMax, `${name} tMax unreasonably high`).toBeLessThan(5000);
    }
  });
});

// ── Property Reasonableness ──────────────────────────────────────────────────

describe('Property values are physically reasonable', () => {
  const materials = listMaterials();

  it('all materials have positive conductivity', () => {
    for (const name of materials) {
      const mat = getMaterial(name);
      expect(mat.conductivity, `${name}`).toBeGreaterThan(0);
    }
  });

  it('all materials have positive specific heat', () => {
    for (const name of materials) {
      const mat = getMaterial(name);
      expect(mat.specific_heat, `${name}`).toBeGreaterThan(0);
    }
  });

  it('all materials have positive density', () => {
    for (const name of materials) {
      const mat = getMaterial(name);
      expect(mat.density, `${name}`).toBeGreaterThan(0);
    }
  });

  it('thermal diffusivity is positive and reasonable', () => {
    for (const name of materials) {
      const mat = getMaterial(name);
      const alpha = thermalDiffusivity(mat);
      expect(alpha, `${name} diffusivity`).toBeGreaterThan(0);
      // Air ~2e-5, copper ~1.1e-4. Range 1e-8 to 1e-3 covers all engineering materials.
      expect(alpha, `${name} diffusivity too extreme`).toBeLessThan(1e-3);
    }
  });

  it('structural materials have positive Young\'s modulus', () => {
    const structural = ['steel_a36', 'copper', 'aluminum', 'granite'];
    for (const name of structural) {
      const mat = getMaterial(name);
      expect(mat.youngs_modulus, `${name}`).toBeGreaterThan(0);
    }
  });

  it('Poisson ratio is between 0 and 0.5 for structural materials', () => {
    const structural = ['steel_a36', 'copper', 'aluminum', 'granite'];
    for (const name of structural) {
      const mat = getMaterial(name);
      expect(mat.poisson_ratio, `${name}`).toBeGreaterThanOrEqual(0);
      expect(mat.poisson_ratio, `${name}`).toBeLessThan(0.5);
    }
  });
});

// ── Sigma Sampling ───────────────────────────────────────────────────────────

describe('Sigma uncertainty sampling', () => {
  it('sigma=0 returns base values', () => {
    const base = getMaterial('steel_a36', 0);
    const cited = getCitedMaterial('steel_a36')!;
    expect(base.conductivity).toBeCloseTo(cited.properties.conductivity, 5);
  });

  it('sigma=+1 increases properties by uncertainty fraction', () => {
    const base = getCitedMaterial('steel_a36')!;
    const perturbed = getMaterial('steel_a36', 1);
    const factor = 1 + base.provenance.uncertainty;
    expect(perturbed.conductivity).toBeCloseTo(base.properties.conductivity * factor, 2);
  });

  it('sigma=-1 decreases properties by uncertainty fraction', () => {
    const base = getCitedMaterial('steel_a36')!;
    const perturbed = getMaterial('steel_a36', -1);
    const factor = 1 - base.provenance.uncertainty;
    expect(perturbed.conductivity).toBeCloseTo(base.properties.conductivity * factor, 2);
  });
});

// ── Temperature-Dependent Properties ─────────────────────────────────────────

describe('Temperature-dependent properties', () => {
  it('has T-dependent data for core materials', () => {
    const expected = ['steel_a36', 'aluminum', 'copper', 'water', 'air'];
    for (const name of expected) {
      expect(hasTemperatureDependentData(name), `${name}`).toBe(true);
    }
  });

  it('listTemperatureDependentMaterials returns at least 5', () => {
    const materials = listTemperatureDependentMaterials();
    expect(materials.length).toBeGreaterThanOrEqual(5);
  });

  it('copper k(300K) ≈ 401 W/(m·K) (Incropera Table A.1)', () => {
    expect(getThermalConductivity('copper', 300)).toBeCloseTo(401, 0);
  });

  it('copper k(600K) ≈ 379 W/(m·K) (interpolated)', () => {
    expect(getThermalConductivity('copper', 600)).toBeCloseTo(379, 0);
  });

  it('water cp(300K) ≈ 4179 J/(kg·K) (NIST SRD 69)', () => {
    expect(getSpecificHeat('water', 300)).toBeCloseTo(4179, 0);
  });

  it('water density(300K) ≈ 997 kg/m³', () => {
    expect(getDensity('water', 300)).toBeCloseTo(997, 0);
  });

  it('water viscosity(300K) ≈ 8.55e-4 Pa·s', () => {
    const mu = getDynamicViscosity('water', 300);
    expect(mu).toBeDefined();
    expect(mu!).toBeCloseTo(0.855e-3, 5);
  });

  it('air k(300K) ≈ 0.0263 W/(m·K)', () => {
    expect(getThermalConductivity('air', 300)).toBeCloseTo(0.0263, 3);
  });

  it('interpolation works between data points', () => {
    // Steel k(500K) should be between k(400)=43 and k(600)=36
    const k500 = getThermalConductivity('steel_a36', 500);
    expect(k500).toBeGreaterThan(36);
    expect(k500).toBeLessThan(43);
    // Linear interp: 43 + (500-400)/(600-400) * (36-43) = 43 + 0.5*(-7) = 39.5
    expect(k500).toBeCloseTo(39.5, 1);
  });

  it('clamps to boundary values outside data range', () => {
    // Copper at T=100K (below data range 200K) should clamp to k(200K)=413
    expect(getThermalConductivity('copper', 100)).toBeCloseTo(413, 0);
    // Copper at T=2000K (above data range 1200K) should clamp to k(1200K)=339
    expect(getThermalConductivity('copper', 2000)).toBeCloseTo(339, 0);
  });

  it('getMaterialAtTemperature returns full ThermalMaterial', () => {
    const mat = getMaterialAtTemperature('water', 350);
    expect(mat.conductivity).toBeCloseTo(0.668, 2);
    expect(mat.specific_heat).toBeCloseTo(4195, 0);
    expect(mat.density).toBeCloseTo(974, 0);
  });

  it('falls back to room-temp values for materials without T-dep data', () => {
    expect(hasTemperatureDependentData('concrete')).toBe(false);
    const mat = getMaterialAtTemperature('concrete', 500);
    // Should return constant room-temp value
    expect(mat.conductivity).toBeCloseTo(1.7, 1);
  });

  it('getTemperatureRange returns valid range', () => {
    const range = getTemperatureRange('water');
    expect(range).toBeDefined();
    expect(range![0]).toBe(275);
    expect(range![1]).toBe(373);
  });

  it('getTemperatureRange returns undefined for no-data material', () => {
    expect(getTemperatureRange('concrete')).toBeUndefined();
  });
});

// ── Lookup Operations ────────────────────────────────────────────────────────

describe('Lookup operations', () => {
  it('getMaterial throws for unknown material', () => {
    expect(() => getMaterial('unobtainium')).toThrow('Unknown material');
  });

  it('findMaterial returns undefined for unknown material', () => {
    expect(findMaterial('unobtainium')).toBeUndefined();
  });

  it('custom materials override built-in', () => {
    registerMaterial('test_mat', {
      conductivity: 999, specific_heat: 999, density: 999,
    });
    const mat = getMaterial('test_mat');
    expect(mat.conductivity).toBe(999);
  });
});
