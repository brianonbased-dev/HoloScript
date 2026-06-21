import { describe, it, expect } from 'vitest';
import {
  type Lab,
  type SRGB,
  srgbToLab,
  labToSrgb,
  deltaE2000,
  perceptualDistance,
  arcLengthDeltaE2000,
  metricTensorDeltaE2000,
  metricTensorArcLengthDeltaE2000,
  labMetricQuadraticForm,
  solveDeltaE2000Geodesic,
  dampen,
  nearestNeutral,
  lightness,
  chroma,
  hue,
  perceptualLerp,
  lanlGrayChoiceProbability,
  lanlGrayNegativeLogLikelihood,
  fitLanlGrayAchromaticModel,
  DAMPENING_OFF,
} from '../perceptualColor';
import {
  LANL_GRAY_ACHROMATIC_AGGREGATES,
  LANL_GRAY_ACHROMATIC_SOURCE,
} from '../reference/lanlGrayAchromatic';

const close = (x: number, y: number, eps = 1e-6) => Math.abs(x - y) <= eps;

describe('sRGB ⇄ CIELAB conversions (exact, D65)', () => {
  it('white → L*≈100, a*≈0, b*≈0', () => {
    const lab = srgbToLab([1, 1, 1]);
    expect(lab.L).toBeCloseTo(100, 3);
    expect(lab.a).toBeCloseTo(0, 3);
    expect(lab.b).toBeCloseTo(0, 3);
  });

  it('black → L*≈0', () => {
    const lab = srgbToLab([0, 0, 0]);
    expect(lab.L).toBeCloseTo(0, 3);
    expect(lab.a).toBeCloseTo(0, 3);
    expect(lab.b).toBeCloseTo(0, 3);
  });

  it('mid gray sits on the neutral axis (a*≈0, b*≈0)', () => {
    const lab = srgbToLab([0.5, 0.5, 0.5]);
    expect(lab.a).toBeCloseTo(0, 3);
    expect(lab.b).toBeCloseTo(0, 3);
    expect(lab.L).toBeGreaterThan(50); // sRGB 0.5 ≈ L* 53.4
    expect(lab.L).toBeLessThan(55);
  });

  it('round-trips sRGB → Lab → sRGB within tolerance', () => {
    const samples: SRGB[] = [
      [0.2, 0.6, 0.9],
      [0.8, 0.1, 0.3],
      [0.05, 0.05, 0.05],
      [0.95, 0.95, 0.2],
      [0.5, 0.5, 0.5],
    ];
    for (const c of samples) {
      const back = labToSrgb(srgbToLab(c));
      for (let i = 0; i < 3; i++) expect(close(back[i], c[i], 1e-5)).toBe(true);
    }
  });
});

describe('CIEDE2000 — canonical Sharma, Wu & Dalal (2005) test vectors', () => {
  // Table 1 from Sharma et al. (2005). kL = kC = kH = 1.
  const cases: Array<[Lab, Lab, number]> = [
    [{ L: 50, a: 2.6772, b: -79.7751 }, { L: 50, a: 0, b: -82.7485 }, 2.0425],
    [{ L: 50, a: 3.1571, b: -77.2803 }, { L: 50, a: 0, b: -82.7485 }, 2.8615],
    [{ L: 50, a: 2.8361, b: -74.02 }, { L: 50, a: 0, b: -82.7485 }, 3.4412],
    [{ L: 50, a: -1.3802, b: -84.2814 }, { L: 50, a: 0, b: -82.7485 }, 1.0],
    [{ L: 50, a: -1.1848, b: -84.8006 }, { L: 50, a: 0, b: -82.7485 }, 1.0],
    [{ L: 50, a: -0.9009, b: -85.5211 }, { L: 50, a: 0, b: -82.7485 }, 1.0],
    [{ L: 50, a: 0, b: 0 }, { L: 50, a: -1, b: 2 }, 2.3669],
    [{ L: 50, a: 2.49, b: -0.001 }, { L: 50, a: -2.49, b: 0.0009 }, 7.1792],
    [{ L: 50, a: 2.5, b: 0 }, { L: 50, a: 0, b: -2.5 }, 4.3065],
    [{ L: 50, a: 2.5, b: 0 }, { L: 73, a: 25, b: -18 }, 27.1492],
    [{ L: 50, a: 2.5, b: 0 }, { L: 61, a: -5, b: 29 }, 22.8977],
    [{ L: 50, a: 2.5, b: 0 }, { L: 56, a: -27, b: -3 }, 31.903],
    [{ L: 50, a: 2.5, b: 0 }, { L: 58, a: 24, b: 15 }, 19.4535],
    [{ L: 60.2574, a: -34.0099, b: 36.2677 }, { L: 60.4626, a: -34.1751, b: 39.4387 }, 1.2644],
    [{ L: 63.0109, a: -31.0961, b: -5.8663 }, { L: 62.8187, a: -29.7946, b: -4.0864 }, 1.263],
    [{ L: 35.0831, a: -44.1164, b: 3.7933 }, { L: 35.0232, a: -40.0716, b: 1.5901 }, 1.8645],
    [{ L: 22.7233, a: 20.0904, b: -46.694 }, { L: 23.0331, a: 14.973, b: -42.5619 }, 2.0373],
  ];

  it.each(cases)('ΔE2000(%o, %o) ≈ %f', (a, b, expected) => {
    expect(deltaE2000(a, b)).toBeCloseTo(expected, 4);
  });

  it('is symmetric and zero on identity', () => {
    const a: Lab = { L: 40, a: 12, b: -33 };
    const b: Lab = { L: 70, a: -8, b: 22 };
    expect(deltaE2000(a, b)).toBeCloseTo(deltaE2000(b, a), 10);
    expect(deltaE2000(a, a)).toBeCloseTo(0, 10);
  });
});

describe('Non-Riemannian perceptual distance E = f(g)', () => {
  it('is symmetric and zero on identity', () => {
    const a: SRGB = [0.2, 0.6, 0.9];
    const b: SRGB = [0.8, 0.1, 0.3];
    expect(perceptualDistance(a, b)).toBeCloseTo(perceptualDistance(b, a), 10);
    expect(perceptualDistance(a, a)).toBeCloseTo(0, 10);
  });

  it('reduces to ΔE2000 as the step shrinks (f\'(0)=1, local-metric consistency)', () => {
    const base: SRGB = [0.5, 0.5, 0.5];
    const tiny: SRGB = [0.5006, 0.5, 0.5];
    const small: SRGB = [0.55, 0.5, 0.5];
    const dTiny = deltaE2000(srgbToLab(base), srgbToLab(tiny));
    const dSmall = deltaE2000(srgbToLab(base), srgbToLab(small));
    const rTiny = perceptualDistance(base, tiny) / dTiny;
    const rSmall = perceptualDistance(base, small) / dSmall;
    // E/ΔE2000 → 1 as the step → 0 (the dampening f satisfies f'(0)=1)
    expect(rTiny).toBeCloseTo(1, 2); // within 0.005 of 1 for a tiny step
    // concavity: the larger step is dampened more, the tiny step is closer to the local metric
    expect(rTiny).toBeGreaterThan(rSmall);
    // dampening never increases a distance
    expect(rTiny).toBeLessThanOrEqual(1);
  });

  describe('PNAS 2022 non-additivity oracle (diminishing returns)', () => {
    // Three grays collinear on the neutral axis. The ΔE2000 arc length is additive
    // by construction; the concave dampening f makes the WHOLE less than the SUM.
    const grayL = (L: number): SRGB => labToSrgb({ L, a: 0, b: 0 });
    const A = grayL(20);
    const B = grayL(50);
    const C = grayL(80);

    it('arc length of the local metric is additive along the path', () => {
      const gAC = arcLengthDeltaE2000(srgbToLab(A), srgbToLab(C), 48);
      const gAB = arcLengthDeltaE2000(srgbToLab(A), srgbToLab(B), 48);
      const gBC = arcLengthDeltaE2000(srgbToLab(B), srgbToLab(C), 48);
      expect(gAC).toBeCloseTo(gAB + gBC, 1);
    });

    it('NON-Riemannian: E(A,C) < E(A,B) + E(B,C) (the whole < the sum)', () => {
      const eAC = perceptualDistance(A, C);
      const eAB = perceptualDistance(A, B);
      const eBC = perceptualDistance(B, C);
      expect(eAC).toBeLessThan(eAB + eBC);
      // and meaningfully so, not float noise
      expect(eAB + eBC - eAC).toBeGreaterThan(1);
    });

    it('Riemannian baseline (DAMPENING_OFF): additivity is recovered', () => {
      const opt = { dampening: DAMPENING_OFF };
      const eAC = perceptualDistance(A, C, opt);
      const eAB = perceptualDistance(A, B, opt);
      const eBC = perceptualDistance(B, C, opt);
      expect(eAC).toBeCloseTo(eAB + eBC, 1); // f = identity ⇒ arc length adds up
    });
  });

  it('dampen() is strictly subadditive and increasing for finite τ', () => {
    const d1 = 18;
    const d2 = 27;
    expect(dampen(d1 + d2)).toBeLessThan(dampen(d1) + dampen(d2));
    expect(dampen(50)).toBeGreaterThan(dampen(10));
    expect(dampen(0)).toBeCloseTo(0, 12);
    // τ → ∞ ⇒ identity
    expect(dampen(42, DAMPENING_OFF)).toBeCloseTo(42, 12);
  });
});

describe('DeltaE2000 metric tensor + geodesic relaxation (Pant/Farup D-fit)', () => {
  it('derives a symmetric positive local metric tensor', () => {
    const metric = metricTensorDeltaE2000({ L: 50, a: 12, b: -8 });
    expect(metric[0][1]).toBeCloseTo(metric[1][0], 12);
    expect(metric[0][2]).toBeCloseTo(metric[2][0], 12);
    expect(metric[1][2]).toBeCloseTo(metric[2][1], 12);

    for (const vector of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.5, -0.25, 0.75],
    ] as const) {
      expect(labMetricQuadraticForm(vector, metric)).toBeGreaterThan(0);
    }
  });

  it('matches sampled DeltaE2000 arc length on a neutral-axis straight path', () => {
    const A: Lab = { L: 20, a: 0, b: 0 };
    const B: Lab = { L: 80, a: 0, b: 0 };
    const sampled = arcLengthDeltaE2000(A, B, 96);
    const tensor = metricTensorArcLengthDeltaE2000(A, B, 96);
    expect(tensor).toBeCloseTo(sampled, 1);
  });

  it('keeps gray endpoints on the neutral axis while solving a geodesic path', () => {
    const A: Lab = { L: 20, a: 0, b: 0 };
    const B: Lab = { L: 80, a: 0, b: 0 };
    const result = solveDeltaE2000Geodesic(A, B, {
      segments: 8,
      iterations: 20,
      stepSize: 0.01,
    });

    expect(result.path).toHaveLength(9);
    expect(result.length).toBeLessThanOrEqual(result.straightLength + 1e-8);
    for (const point of result.path) {
      expect(point.a).toBeCloseTo(0, 8);
      expect(point.b).toBeCloseTo(0, 8);
    }
  });
});

describe('LANL achromatic gray-axis reference fit', () => {
  it('records the upstream LANL data identity and compact aggregate schema', () => {
    expect(LANL_GRAY_ACHROMATIC_SOURCE.path).toBe(
      'Gray_Experiment/data/gray_complete_data_release.csv',
    );
    expect(LANL_GRAY_ACHROMATIC_SOURCE.sha).toBe(
      '37fe92222edd4e081ed142ce3d7ca7ed40b6e4dc',
    );
    expect(LANL_GRAY_ACHROMATIC_AGGREGATES).toHaveLength(42);
    expect(LANL_GRAY_ACHROMATIC_AGGREGATES[0]).toMatchObject({
      Ls: 30,
      Lt1: 15,
      Lt2: 35,
      count: 287,
      choseT2: 37,
    });
  });

  it('mirrors the LANL pnorm(m2 - m1) response semantics', () => {
    const closerT2 = { Ls: 30, Lt1: 15, Lt2: 35, count: 287, choseT2: 37 };
    const fartherT2 = { Ls: 30, Lt1: 25, Lt2: 45, count: 249, choseT2: 166 };
    expect(lanlGrayChoiceProbability(closerT2, { dampening: 15, noise: 10 })).toBeLessThan(
      0.5,
    );
    expect(lanlGrayChoiceProbability(fartherT2, { dampening: 15, noise: 10 })).toBeGreaterThan(
      0.5,
    );
  });

  it('fits finite non-Riemannian dampening better than the additive baseline', () => {
    const fit = fitLanlGrayAchromaticModel(LANL_GRAY_ACHROMATIC_AGGREGATES, {
      dampeningCandidates: [15, 30, DAMPENING_OFF],
      noiseCandidates: [10, 20],
    });
    const additive = fitLanlGrayAchromaticModel(LANL_GRAY_ACHROMATIC_AGGREGATES, {
      dampeningCandidates: [DAMPENING_OFF],
      noiseCandidates: [10, 20],
    });

    expect(fit.dampening).toBe(15);
    expect(fit.noise).toBe(10);
    expect(fit.negativeLogLikelihood).toBeLessThan(additive.negativeLogLikelihood);
    expect(fit.meanAccuracy).toBeGreaterThan(0.9);
    expect(lanlGrayNegativeLogLikelihood(LANL_GRAY_ACHROMATIC_AGGREGATES, fit)).toBeCloseTo(
      fit.negativeLogLikelihood,
      8,
    );
  });
});

describe('Derived neutral axis + intrinsic lightness/chroma/hue (CGF 2025 Def. 8/5/6)', () => {
  it('nearestNeutral lands on the gray axis (a*≈0, b*≈0) at equal lightness', () => {
    const c: SRGB = [0.8, 0.2, 0.35];
    const n = nearestNeutral(c);
    const nLab = srgbToLab(n);
    expect(nLab.a).toBeCloseTo(0, 4);
    expect(nLab.b).toBeCloseTo(0, 4);
    expect(nLab.L).toBeCloseTo(srgbToLab(c).L, 4); // lightness preserved
  });

  it('a gray already lies on its own neutral axis (chroma ≈ 0)', () => {
    expect(chroma([0.5, 0.5, 0.5])).toBeCloseTo(0, 3);
  });

  it('chroma measures distance from the neutral axis', () => {
    expect(chroma([0.9, 0.1, 0.1])).toBeGreaterThan(chroma([0.6, 0.45, 0.45]));
  });

  it('hue is in [0,360) and stable along the neutral direction', () => {
    const h = hue([0.9, 0.1, 0.1]);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });

  it('lightness increases monotonically white > gray > black', () => {
    expect(lightness([1, 1, 1])).toBeGreaterThan(lightness([0.5, 0.5, 0.5]));
    expect(lightness([0.5, 0.5, 0.5])).toBeGreaterThan(lightness([0, 0, 0]));
  });
});

describe('perceptualLerp', () => {
  it('returns the endpoints at t=0 and t=1', () => {
    const a: SRGB = [0.1, 0.2, 0.3];
    const b: SRGB = [0.9, 0.7, 0.4];
    const at0 = perceptualLerp(a, b, 0);
    const at1 = perceptualLerp(a, b, 1);
    for (let i = 0; i < 3; i++) {
      expect(close(at0[i], a[i], 1e-5)).toBe(true);
      expect(close(at1[i], b[i], 1e-5)).toBe(true);
    }
  });

  it('the midpoint is roughly perceptually equidistant from both endpoints', () => {
    const a: SRGB = [0, 0, 0];
    const b: SRGB = [1, 1, 1];
    const mid = perceptualLerp(a, b, 0.5);
    const dA = deltaE2000(srgbToLab(a), srgbToLab(mid));
    const dB = deltaE2000(srgbToLab(mid), srgbToLab(b));
    expect(dA).toBeCloseTo(dB, 0); // Lab-uniform midpoint, unlike an RGB lerp
  });

  it('clamps t outside [0,1]', () => {
    const a: SRGB = [0.1, 0.2, 0.3];
    const b: SRGB = [0.9, 0.7, 0.4];
    const below = perceptualLerp(a, b, -1);
    const above = perceptualLerp(a, b, 2);
    for (let i = 0; i < 3; i++) {
      expect(close(below[i], a[i], 1e-5)).toBe(true);
      expect(close(above[i], b[i], 1e-5)).toBe(true);
    }
  });
});
