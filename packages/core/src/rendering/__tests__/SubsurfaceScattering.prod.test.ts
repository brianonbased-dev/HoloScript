import { describe, it, expect } from 'vitest';
import {
  burleyProfile,
  burleyProfileRGB,
  christensenProfile,
  buildSeparableSSSKernel,
  evalSeparableKernel,
  thinSlabTransmission,
  SSSMaterial,
  SSS_PRESETS,
  type SSSConfig,
  type SSSLayer,
} from '../SubsurfaceScattering';

describe('SubsurfaceScattering — Production Tests', () => {

  // ---------------------------------------------------------------------------
  // Burley Profile
  // ---------------------------------------------------------------------------
  describe('burleyProfile', () => {
    it('returns maximum at r=0', () => {
      const v0 = burleyProfile(0, 1);
      const v1 = burleyProfile(0.5, 1);
      expect(v0).toBeGreaterThanOrEqual(v1);
    });

    it('decays with increasing r', () => {
      const v1 = burleyProfile(1, 1);
      const v2 = burleyProfile(3, 1);
      expect(v1).toBeGreaterThan(v2);
    });

    it('returns positive values for all valid inputs', () => {
      for (const r of [0, 0.1, 0.5, 1, 2, 5]) {
        expect(burleyProfile(r, 1)).toBeGreaterThanOrEqual(0);
      }
    });

    it('for a given d, profile decays from small r to large r', () => {
      // At r=0.5 (close to surface) profile > r=3 (far)
      // This is the correct invariant: same d, larger r = less weight
      const close = burleyProfile(0.5, 1.0);
      const far = burleyProfile(3.0, 1.0);
      expect(close).toBeGreaterThan(far);
    });
  });

  describe('burleyProfileRGB', () => {
    it('returns a triple of non-negative values', () => {
      const result = burleyProfileRGB(1.0, [2.5, 0.8, 0.15]);
      for (const c of result) expect(c).toBeGreaterThanOrEqual(0);
    });

    it('R channel decays slowest for skin scatter radii', () => {
      const skin: [number, number, number] = [2.5, 0.8, 0.15];
      const result = burleyProfileRGB(1.5, skin);
      expect(result[0]).toBeGreaterThan(result[2]);
    });
  });

  // ---------------------------------------------------------------------------
  // Christensen Profile
  // ---------------------------------------------------------------------------
  describe('christensenProfile', () => {
    it('decays monotonically with r', () => {
      const values = [0.1, 0.5, 1, 2, 5].map(r => christensenProfile(r, 1));
      for (let i = 0; i < values.length - 1; i++) {
        expect(values[i]).toBeGreaterThanOrEqual(values[i + 1]);
      }
    });

    it('d=0 returns 0', () => {
      expect(christensenProfile(1, 0)).toBe(0);
    });

    it('positive value for normal inputs', () => {
      expect(christensenProfile(0.5, 1.0)).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Separable SSS Kernel
  // ---------------------------------------------------------------------------
  describe('buildSeparableSSSKernel', () => {
    it('builds N Gaussian entries', () => {
      const kernel = buildSeparableSSSKernel([1, 0.4, 0.1], 6);
      expect(kernel.length).toBe(6);
    });

    it('all weights are positive', () => {
      const kernel = buildSeparableSSSKernel([2.5, 0.8, 0.15]);
      for (const { weight } of kernel) expect(weight).toBeGreaterThan(0);
    });

    it('stddev increases across kernel (wider Gaussians later)', () => {
      const kernel = buildSeparableSSSKernel([1, 1, 1], 4);
      expect(kernel[3].stddev[0]).toBeGreaterThan(kernel[0].stddev[0]);
    });
  });

  describe('evalSeparableKernel', () => {
    it('returns positive RGB at x=0', () => {
      const kernel = buildSeparableSSSKernel([1, 0.5, 0.2]);
      const result = evalSeparableKernel(kernel, 0);
      for (const c of result) expect(c).toBeGreaterThan(0);
    });

    it('value decreases as |x| increases', () => {
      const kernel = buildSeparableSSSKernel([1, 0.5, 0.2]);
      const v0 = evalSeparableKernel(kernel, 0)[0];
      const v3 = evalSeparableKernel(kernel, 3)[0];
      expect(v0).toBeGreaterThan(v3);
    });
  });

  // ---------------------------------------------------------------------------
  // Transmission
  // ---------------------------------------------------------------------------
  describe('thinSlabTransmission', () => {
    it('thin slab (thickness=0) transmits more than thick', () => {
      const config = {
        transmission: 0.5,
        layers: [{ weight: 1, scatterRadius: [1, 0.5, 0.2] as [number,number,number], color: [1, 1, 1] as [number,number,number] }],
      };
      const thin = thinSlabTransmission(0, config);
      const thick = thinSlabTransmission(1, config);
      const sumThin = thin.reduce((a, b) => a + b, 0);
      const sumThick = thick.reduce((a, b) => a + b, 0);
      expect(sumThin).toBeGreaterThan(sumThick);
    });

    it('returns RGB of correct length', () => {
      const config = {
        transmission: 0.3,
        layers: [{ weight: 1, scatterRadius: [1, 1, 1] as [number,number,number], color: [0.9, 0.5, 0.3] as [number,number,number] }],
      };
      const result = thinSlabTransmission(0.5, config);
      expect(result.length).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // SSSMaterial
  // ---------------------------------------------------------------------------
  describe('SSSMaterial', () => {
    it('constructs with defaults', () => {
      const mat = new SSSMaterial();
      expect(mat.getLayerCount()).toBeGreaterThan(0);
    });

    it('setTransmission clamps to [0, 1]', () => {
      const mat = new SSSMaterial();
      mat.setTransmission(5);
      expect(mat.getConfig().transmission).toBe(1);
      mat.setTransmission(-1);
      expect(mat.getConfig().transmission).toBe(0);
    });

    it('setThickness clamps to [0, 1]', () => {
      const mat = new SSSMaterial();
      mat.setThickness(10); expect(mat.getConfig().thickness).toBe(1);
      mat.setThickness(-2); expect(mat.getConfig().thickness).toBe(0);
    });

    it('addLayer increases layer count', () => {
      const mat = new SSSMaterial();
      const before = mat.getLayerCount();
      mat.addLayer({ weight: 0.3, scatterRadius: [0.5, 0.3, 0.1], color: [1, 0.8, 0.6] });
      expect(mat.getLayerCount()).toBe(before + 1);
    });

    it('setModel changes model', () => {
      const mat = new SSSMaterial();
      mat.setModel('christensen');
      expect(mat.getConfig().model).toBe('christensen');
    });

    describe('evaluate()', () => {
      it('returns RGB triple', () => {
        const mat = new SSSMaterial();
        const result = mat.evaluate(0.5);
        expect(result.length).toBe(3);
      });

      it('all channels non-negative', () => {
        const mat = new SSSMaterial();
        for (const r of [0, 0.2, 1, 3]) {
          const result = mat.evaluate(r);
          for (const c of result) expect(c).toBeGreaterThanOrEqual(0);
        }
      });

      it('Burley model returns higher value at r=0 than r=5', () => {
        const mat = new SSSMaterial({ model: 'burley' });
        const v0 = mat.evaluate(0).reduce((a, b) => a + b, 0);
        const v5 = mat.evaluate(5).reduce((a, b) => a + b, 0);
        expect(v0).toBeGreaterThan(v5);
      });

      it('Christensen model also decays', () => {
        const mat = new SSSMaterial({ model: 'christensen' });
        const v1 = mat.evaluate(0.1).reduce((a, b) => a + b, 0);
        const v5 = mat.evaluate(5).reduce((a, b) => a + b, 0);
        expect(v1).toBeGreaterThan(v5);
      });
    });

    describe('getTransmission()', () => {
      it('returns non-negative RGB', () => {
        const mat = new SSSMaterial({ transmission: 0.3, thickness: 0.4 });
        const result = mat.getTransmission();
        for (const c of result) expect(c).toBeGreaterThanOrEqual(0);
      });

      it('thicknessOverride affects result', () => {
        const mat = new SSSMaterial({ transmission: 0.5 });
        const thin = mat.getTransmission(0).reduce((a, b) => a + b, 0);
        const thick = mat.getTransmission(1).reduce((a, b) => a + b, 0);
        expect(thin).toBeGreaterThan(thick);
      });
    });

    describe('getKernel()', () => {
      it('returns array of Gaussian entries', () => {
        const mat = new SSSMaterial();
        const kernel = mat.getKernel(4);
        expect(kernel.length).toBe(4);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // SSS Presets
  // ---------------------------------------------------------------------------
  describe('SSS_PRESETS', () => {
    it('humanSkin has 2 layers', () => {
      const mat = SSS_PRESETS.humanSkin();
      expect(mat.getLayerCount()).toBe(2);
    });

    it('humanSkin evaluate at small r returns R > B (skin is warm)', () => {
      const mat = SSS_PRESETS.humanSkin();
      const result = mat.evaluate(0.3);
      expect(result[0]).toBeGreaterThan(result[2]);
    });

    it('wax has high transmission', () => {
      const mat = SSS_PRESETS.wax();
      expect(mat.getConfig().transmission).toBeGreaterThan(0.3);
    });

    it('jade uses christensen model', () => {
      const mat = SSS_PRESETS.jade();
      expect(mat.getConfig().model).toBe('christensen');
    });

    it('marble has balanced scatter radii (RGB approx equal)', () => {
      const mat = SSS_PRESETS.marble();
      const layer0 = mat.getConfig().layers[0];
      const [r, g, b] = layer0.scatterRadius;
      expect(Math.abs(r - b)).toBeLessThan(0.2);
    });

    it('leaf has high transmission', () => {
      const mat = SSS_PRESETS.leaf();
      expect(mat.getConfig().transmission).toBeGreaterThan(0.4);
    });
  });
});
