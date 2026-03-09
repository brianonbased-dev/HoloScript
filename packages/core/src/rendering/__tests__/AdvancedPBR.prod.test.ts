import { describe, it, expect } from 'vitest';
import {
  AdvancedPBRMaterial,
  distributionGGX,
  geometrySmith,
  fresnelSchlick,
  fresnelRoughness,
  evaluateClearcoat,
  sheenDistribution,
  sheenVisibility,
  evaluateSheen,
  evaluateIridescence,
  distributionGGXAnisotropic,
  anisotropicRoughness,
  computeF0,
  computeDiffuseAlbedo,
  MATERIAL_PRESETS,
  type ClearcoatConfig,
  type SheenConfig,
  type IridescenceConfig,
  type AnisotropyConfig,
} from '../AdvancedPBR';

describe('AdvancedPBR — Production Tests', () => {
  // ---------------------------------------------------------------------------
  // GGX Normal Distribution Function
  // ---------------------------------------------------------------------------
  describe('distributionGGX', () => {
    it('peaks at NdotH = 1 (perfect mirror alignment)', () => {
      const D1 = distributionGGX(1, 0.1);
      const D2 = distributionGGX(0.9, 0.1);
      expect(D1).toBeGreaterThan(D2);
    });

    it('smooth surface produces sharp highlight (high D at NdotH=1)', () => {
      const Dsmooth = distributionGGX(1, 0.05);
      const Drough = distributionGGX(1, 0.9);
      expect(Dsmooth).toBeGreaterThan(Drough);
    });

    it('returns a positive finite value for all valid inputs', () => {
      for (const r of [0.1, 0.3, 0.5, 0.7, 1.0]) {
        for (const n of [0, 0.5, 1]) {
          const D = distributionGGX(n, r);
          expect(D).toBeGreaterThanOrEqual(0);
          expect(isFinite(D)).toBe(true);
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Smith Geometry Attenuation
  // ---------------------------------------------------------------------------
  describe('geometrySmith', () => {
    it('returns 1 at grazing angle (NdotV = 1, NdotL = 1)', () => {
      const G = geometrySmith(1, 1, 0.5);
      expect(G).toBeCloseTo(1, 1);
    });

    it('reduces with greater roughness', () => {
      const Gsmooth = geometrySmith(0.7, 0.7, 0.1);
      const Grough = geometrySmith(0.7, 0.7, 0.9);
      expect(Gsmooth).toBeGreaterThan(Grough);
    });

    it('is always between 0 and 1', () => {
      for (const v of [0.1, 0.5, 1.0]) {
        const G = geometrySmith(v, v, 0.4);
        expect(G).toBeGreaterThanOrEqual(0);
        expect(G).toBeLessThanOrEqual(1.01);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Fresnel
  // ---------------------------------------------------------------------------
  describe('fresnelSchlick', () => {
    it('returns F0 at cosTheta = 1 (head-on)', () => {
      const F0: [number, number, number] = [0.04, 0.04, 0.04];
      const F = fresnelSchlick(1, F0);
      expect(F[0]).toBeCloseTo(0.04, 4);
    });

    it('approaches 1 at cosTheta = 0 (grazing)', () => {
      const F = fresnelSchlick(0, [0.04, 0.04, 0.04]);
      for (const c of F) expect(c).toBeCloseTo(1, 4);
    });

    it('metals (high F0) stay bright across all angles', () => {
      const F0: [number, number, number] = [0.95, 0.93, 0.88];
      const F45 = fresnelSchlick(0.7071, F0);
      expect(F45[0]).toBeGreaterThan(0.93);
    });
  });

  describe('fresnelRoughness', () => {
    it('rough surface clamps Fresnel rise', () => {
      const F0: [number, number, number] = [0.04, 0.04, 0.04];
      const F_rough = fresnelRoughness(0.5, F0, 0.8);
      const F_smooth = fresnelRoughness(0.5, F0, 0.0);
      expect(F_rough[0]).toBeLessThan(F_smooth[0]);
    });
  });

  // ---------------------------------------------------------------------------
  // Clearcoat
  // ---------------------------------------------------------------------------
  describe('evaluateClearcoat', () => {
    const cc: ClearcoatConfig = { intensity: 1, roughness: 0.05, ior: 1.5 };

    it('returns a positive value for typical shading inputs', () => {
      const result = evaluateClearcoat(0.9, 0.8, 0.7, 0.85, cc);
      expect(result).toBeGreaterThan(0);
    });

    it('scales with intensity', () => {
      const cc1: ClearcoatConfig = { intensity: 1, roughness: 0.05, ior: 1.5 };
      const cc05: ClearcoatConfig = { intensity: 0.5, roughness: 0.05, ior: 1.5 };
      expect(evaluateClearcoat(0.9, 0.8, 0.7, 0.85, cc1)).toBeGreaterThan(
        evaluateClearcoat(0.9, 0.8, 0.7, 0.85, cc05)
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Sheen
  // ---------------------------------------------------------------------------
  describe('evaluateSheen', () => {
    const sheen: SheenConfig = { color: [0.6, 0.2, 0.5], roughness: 0.1 };

    it('returns non-negative RGB values', () => {
      const result = evaluateSheen(0.8, 0.7, 0.6, sheen);
      for (const c of result) expect(c).toBeGreaterThanOrEqual(0);
    });

    it('preserves colour tint proportionally', () => {
      const result = evaluateSheen(0.9, 0.8, 0.9, sheen);
      // R > G because sheen.color[0] > sheen.color[1]
      expect(result[0]).toBeGreaterThan(result[1]);
    });
  });

  describe('sheenDistribution', () => {
    it('returns a positive finite value for grazing-angle inputs (NdotH < 1)', () => {
      // Charlie NDF uses sin²h = 1 - NdotH²; at NdotH=1 sin²h=0 so D=0 (correct)
      // For NdotH < 1 the distribution should be positive and finite
      for (const n of [0.1, 0.5, 0.9]) {
        const D = sheenDistribution(n, 0.1);
        expect(D).toBeGreaterThan(0);
        expect(isFinite(D)).toBe(true);
      }
    });

    it('returns 0 at NdotH = 1 (no sheen at perfect alignment — by design)', () => {
      expect(sheenDistribution(1.0, 0.1)).toBe(0);
    });
  });

  describe('sheenVisibility', () => {
    it('returns positive value for valid NdotV / NdotL', () => {
      expect(sheenVisibility(0.7, 0.8)).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Iridescence
  // ---------------------------------------------------------------------------
  describe('evaluateIridescence', () => {
    const ir: IridescenceConfig = { intensity: 1, ior: 1.33, thicknessNm: 600 };

    it('returns RGB values between 0 and 1', () => {
      const result = evaluateIridescence(0.7, ir);
      for (const c of result) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1.01);
      }
    });

    it('zero intensity → all zeros', () => {
      const result = evaluateIridescence(0.7, { ...ir, intensity: 0 });
      for (const c of result) expect(c).toBeCloseTo(0, 5);
    });

    it('produces channel variation (not all same value)', () => {
      const result = evaluateIridescence(0.8, ir);
      const unique = new Set(result.map((v) => Math.round(v * 1000)));
      expect(unique.size).toBeGreaterThan(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Anisotropy
  // ---------------------------------------------------------------------------
  describe('anisotropicRoughness', () => {
    it('returns two different values for non-zero strength', () => {
      const [aT, aB] = anisotropicRoughness(0.5, 0.7);
      expect(aT).not.toBeCloseTo(aB, 3);
    });

    it('isotropic (strength=0) returns equal alpha values', () => {
      const [aT, aB] = anisotropicRoughness(0.5, 0);
      expect(aT).toBeCloseTo(aB, 3);
    });
  });

  describe('distributionGGXAnisotropic', () => {
    it('returns a positive finite value', () => {
      const D = distributionGGXAnisotropic(0.9, 0.3, 0.2, 0.3, 0.6);
      expect(D).toBeGreaterThan(0);
      expect(isFinite(D)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // F0 / Diffuse helpers
  // ---------------------------------------------------------------------------
  describe('computeF0', () => {
    it('dielectric (metallic=0) returns ~0.04 regardless of albedo', () => {
      const F0 = computeF0([0.8, 0.2, 0.1], 0);
      for (const c of F0) expect(c).toBeCloseTo(0.04, 3);
    });

    it('pure metal (metallic=1) returns albedo as F0', () => {
      const albedo: [number, number, number] = [0.9, 0.8, 0.7];
      const F0 = computeF0(albedo, 1);
      for (let i = 0; i < 3; i++) expect(F0[i]).toBeCloseTo(albedo[i], 5);
    });
  });

  describe('computeDiffuseAlbedo', () => {
    it('pure metal has zero diffuse', () => {
      const d = computeDiffuseAlbedo([0.8, 0.5, 0.3], 1);
      for (const c of d) expect(c).toBeCloseTo(0, 5);
    });

    it('dielectric retains full albedo', () => {
      const albedo: [number, number, number] = [0.7, 0.5, 0.3];
      const d = computeDiffuseAlbedo(albedo, 0);
      for (let i = 0; i < 3; i++) expect(d[i]).toBeCloseTo(albedo[i], 5);
    });
  });

  // ---------------------------------------------------------------------------
  // AdvancedPBRMaterial
  // ---------------------------------------------------------------------------
  describe('AdvancedPBRMaterial', () => {
    it('initialises with defaults', () => {
      const mat = new AdvancedPBRMaterial();
      const cfg = mat.getConfig();
      expect(cfg.metallic).toBe(0);
      expect(cfg.roughness).toBe(0.5);
    });

    it('setMetallic clamps to [0,1]', () => {
      const mat = new AdvancedPBRMaterial();
      mat.setMetallic(2);
      expect(mat.getConfig().metallic).toBe(1);
      mat.setMetallic(-1);
      expect(mat.getConfig().metallic).toBe(0);
    });

    it('setClearcoat is reflected in hasClearcoat()', () => {
      const mat = new AdvancedPBRMaterial();
      expect(mat.hasClearcoat()).toBe(false);
      mat.setClearcoat({ intensity: 1, roughness: 0.05, ior: 1.5 });
      expect(mat.hasClearcoat()).toBe(true);
    });

    it('evaluate() returns finite RGB values', () => {
      const mat = new AdvancedPBRMaterial({ metallic: 0.5, roughness: 0.3 });
      const result = mat.evaluate(0.8, 0.7, 0.9, 0.8);
      for (const c of result) {
        expect(isFinite(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
      }
    });

    it('evaluate() with all layers active returns higher output', () => {
      const mat = new AdvancedPBRMaterial({
        metallic: 0,
        roughness: 0.2,
        clearcoat: { intensity: 1, roughness: 0.05, ior: 1.5 },
        sheen: { color: [0.5, 0.3, 0.4], roughness: 0.1 },
        iridescence: { intensity: 0.5, ior: 1.33, thicknessNm: 500 },
      });
      const plain = new AdvancedPBRMaterial({ metallic: 0, roughness: 0.2 });
      const r1 = mat.evaluate(0.8, 0.7, 0.9, 0.8);
      const r2 = plain.evaluate(0.8, 0.7, 0.9, 0.8);
      // With clearcoat + sheen + iridescence, overall output should be >= plain
      const sum1 = r1.reduce((a, b) => a + b, 0);
      const sum2 = r2.reduce((a, b) => a + b, 0);
      expect(sum1).toBeGreaterThanOrEqual(sum2);
    });

    it('emissive is added regardless of light', () => {
      const mat = new AdvancedPBRMaterial({ emissive: [1, 0, 0] });
      const result = mat.evaluate(0, 0, 0, 0);
      expect(result[0]).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Material Presets
  // ---------------------------------------------------------------------------
  describe('MATERIAL_PRESETS', () => {
    it('carPaintRed has clearcoat', () => {
      const mat = MATERIAL_PRESETS.carPaintRed();
      expect(mat.hasClearcoat()).toBe(true);
    });

    it('brushedAluminium is metallic and anisotropic', () => {
      const mat = MATERIAL_PRESETS.brushedAluminium();
      expect(mat.getConfig().metallic).toBe(1);
      expect(mat.hasAnisotropy()).toBe(true);
    });

    it('velvet has sheen', () => {
      expect(MATERIAL_PRESETS.velvet().hasSheen()).toBe(true);
    });

    it('soapBubble has iridescence', () => {
      expect(MATERIAL_PRESETS.soapBubble().hasIridescence()).toBe(true);
    });
  });
});
