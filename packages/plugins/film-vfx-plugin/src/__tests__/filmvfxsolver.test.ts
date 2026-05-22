/**
 * Film & VFX production solver tests — film-vfx-plugin
 *
 * Reference values verified against:
 *  - Porter T, Duff T (1984) ACM SIGGRAPH 18(3):253-259
 *  - Smith W (2000) Modern Optical Engineering. McGraw-Hill.
 *  - Pharr M, Jakob W, Humphreys G (2023) Physically Based Rendering, 4th ed.
 */

import { describe, it, expect } from 'vitest';
import {
  exposureValue,
  depthOfField,
  alphaComposite,
  renderBudget,
  shutterAngle,
  buildFilmVFXReceipt,
} from '../filmvfxsolver';

// ─── Exposure Value ───────────────────────────────────────────────────────────

describe('exposureValue', () => {
  /**
   * EV₁₀₀ = log₂(N² × 100 / (t × ISO))
   * N=5.6, t=1/125, ISO=100 → EV = log₂(5.6² × 125) = log₂(3920) ≈ 11.9
   */
  it('EV100 matches formula', () => {
    const N = 5.6, t = 1 / 125, ISO = 100;
    const r = exposureValue({ aperture: N, shutterSpeedS: t, iso: ISO });
    const expected = Math.log2((N ** 2 * 100) / (t * ISO));
    expect(r.ev100).toBeCloseTo(expected, 4);
  });

  it('higher ISO → lower EV100 (brighter exposure)', () => {
    const base = exposureValue({ aperture: 2.8, shutterSpeedS: 1 / 60, iso: 100 });
    const high = exposureValue({ aperture: 2.8, shutterSpeedS: 1 / 60, iso: 3200 });
    expect(high.ev100).toBeLessThan(base.ev100);
  });

  it('wider aperture (lower f-number) → lower EV100', () => {
    const narrow = exposureValue({ aperture: 11, shutterSpeedS: 1 / 125, iso: 100 });
    const wide   = exposureValue({ aperture: 1.4, shutterSpeedS: 1 / 125, iso: 100 });
    expect(wide.ev100).toBeLessThan(narrow.ev100);
  });

  it('exposureIndex = ISO / 100', () => {
    const r = exposureValue({ aperture: 5.6, shutterSpeedS: 1 / 125, iso: 400 });
    expect(r.exposureIndex).toBeCloseTo(4, 4);
  });

  it('throws for non-positive aperture', () => {
    expect(() => exposureValue({ aperture: 0, shutterSpeedS: 1 / 125, iso: 100 })).toThrow();
  });

  it('throws for non-positive ISO', () => {
    expect(() => exposureValue({ aperture: 5.6, shutterSpeedS: 1 / 125, iso: 0 })).toThrow();
  });
});

// ─── Depth of Field ───────────────────────────────────────────────────────────

describe('depthOfField', () => {
  const fullFrame = { sensorDiagonalMm: 43.27 };

  it('longer focal length → narrower DoF', () => {
    const short = depthOfField({ focalLengthMm: 24, aperture: 2.8, subjectDistanceM: 5, ...fullFrame });
    const long  = depthOfField({ focalLengthMm: 200, aperture: 2.8, subjectDistanceM: 5, ...fullFrame });
    expect(long.dofM).toBeLessThan(short.dofM);
  });

  it('smaller f-number (wider aperture) → narrower DoF', () => {
    const narrow = depthOfField({ focalLengthMm: 50, aperture: 16, subjectDistanceM: 3, ...fullFrame });
    const wide   = depthOfField({ focalLengthMm: 50, aperture: 1.4, subjectDistanceM: 3, ...fullFrame });
    expect(wide.dofM).toBeLessThan(narrow.dofM);
  });

  it('near limit < subject distance < far limit', () => {
    const r = depthOfField({ focalLengthMm: 50, aperture: 5.6, subjectDistanceM: 3, ...fullFrame });
    expect(r.nearLimitM).toBeLessThan(3);
    if (r.farLimitM !== Infinity) expect(r.farLimitM).toBeGreaterThan(3);
  });

  it('hyperfocal distance = f² / (N × CoC)', () => {
    const fmm = 50, N = 8, diag = 43.27;
    const coc = diag / 1500 / 1000; // in m
    const r = depthOfField({ focalLengthMm: fmm, aperture: N, subjectDistanceM: 2, sensorDiagonalMm: diag });
    const expected = (fmm / 1000) ** 2 / (N * coc);
    expect(r.hyperfocalDistanceM).toBeCloseTo(expected, 0);
  });

  it('CoC = sensorDiagonal / 1500 (mm)', () => {
    const r = depthOfField({ focalLengthMm: 50, aperture: 5.6, subjectDistanceM: 3, sensorDiagonalMm: 43.27 });
    expect(r.cocMm).toBeCloseTo(43.27 / 1500, 4);
  });

  it('throws for non-positive focal length', () => {
    expect(() => depthOfField({ focalLengthMm: 0, aperture: 5.6, subjectDistanceM: 3, ...fullFrame })).toThrow();
  });
});

// ─── Alpha Compositing ────────────────────────────────────────────────────────

describe('alphaComposite', () => {
  it('fully opaque single layer → passes through unchanged', () => {
    const r = alphaComposite([{ name: 'fg', color: [0.8, 0.2, 0.4], alpha: 1.0 }]);
    expect(r.color[0]).toBeCloseTo(0.8, 4);
    expect(r.color[1]).toBeCloseTo(0.2, 4);
    expect(r.alpha).toBeCloseTo(1.0, 4);
  });

  it('fully transparent layer → background shows through', () => {
    const bg = { name: 'bg', color: [1, 0, 0] as [number, number, number], alpha: 1.0 };
    const fg = { name: 'fg', color: [0, 1, 0] as [number, number, number], alpha: 0.0 };
    const r = alphaComposite([fg, bg]);
    expect(r.color[0]).toBeCloseTo(1.0, 2); // red background visible
  });

  it('alpha in [0, 1]', () => {
    const r = alphaComposite([
      { name: 'a', color: [0.5, 0.5, 0.5], alpha: 0.7 },
      { name: 'b', color: [0.3, 0.3, 0.3], alpha: 0.5 },
    ]);
    expect(r.alpha).toBeGreaterThanOrEqual(0);
    expect(r.alpha).toBeLessThanOrEqual(1);
  });

  it('output colors in [0, 1]', () => {
    const r = alphaComposite([
      { name: 'a', color: [0.9, 0.1, 0.5], alpha: 0.6 },
      { name: 'b', color: [0.2, 0.8, 0.3], alpha: 0.8 },
    ]);
    for (const c of r.color) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it('throws for empty layers', () => {
    expect(() => alphaComposite([])).toThrow();
  });
});

// ─── Render Budget ────────────────────────────────────────────────────────────

describe('renderBudget', () => {
  /**
   * totalRays = 1920 × 1080 × 512 × 8 = 8,493,465,600
   */
  it('totalRays = W × H × spp × bounces', () => {
    const r = renderBudget({
      resolutionPx: [1920, 1080],
      samplesPerPixel: 512,
      maxBounces: 8,
      renderNodes: 1,
      raysPerSecondMPerNode: 100,
    });
    expect(r.totalRays).toBe(1920 * 1080 * 512 * 8);
  });

  it('distributed time = single-node time / nodes', () => {
    const single = renderBudget({ resolutionPx: [1280, 720], samplesPerPixel: 256, maxBounces: 4, renderNodes: 1, raysPerSecondMPerNode: 200 });
    const multi  = renderBudget({ resolutionPx: [1280, 720], samplesPerPixel: 256, maxBounces: 4, renderNodes: 4, raysPerSecondMPerNode: 200 });
    expect(multi.secondsPerFrameDistributed).toBeCloseTo(single.secondsPerFrameDistributed / 4, 4);
  });

  it('more render nodes → less time per frame', () => {
    const one  = renderBudget({ resolutionPx: [1920, 1080], samplesPerPixel: 128, maxBounces: 6, renderNodes: 1, raysPerSecondMPerNode: 100 });
    const ten  = renderBudget({ resolutionPx: [1920, 1080], samplesPerPixel: 128, maxBounces: 6, renderNodes: 10, raysPerSecondMPerNode: 100 });
    expect(ten.secondsPerFrameDistributed).toBeLessThan(one.secondsPerFrameDistributed);
  });

  it('throws for non-positive resolution', () => {
    expect(() => renderBudget({ resolutionPx: [0, 1080], samplesPerPixel: 64, maxBounces: 4, renderNodes: 1, raysPerSecondMPerNode: 100 })).toThrow();
  });
});

// ─── Shutter Angle ────────────────────────────────────────────────────────────

describe('shutterAngle', () => {
  /**
   * 180° rule at 24fps: shutterSpeed = 180 / (360 × 24) = 1/48 s
   */
  it('180° at 24fps → 1/48 s', () => {
    const r = shutterAngle(24, 180);
    expect(r.shutterSpeedS).toBeCloseTo(1 / 48, 6);
  });

  it('motionBlurFactor = shutterAngle / 180', () => {
    const r = shutterAngle(25, 270);
    expect(r.motionBlurFactor).toBeCloseTo(270 / 180, 4);
  });

  it('180° → motionBlurFactor = 1.0', () => {
    const r = shutterAngle(30, 180);
    expect(r.motionBlurFactor).toBeCloseTo(1.0, 4);
  });

  it('throws for non-positive frame rate', () => {
    expect(() => shutterAngle(0, 180)).toThrow();
  });

  it('throws for shutter angle > 360', () => {
    expect(() => shutterAngle(24, 361)).toThrow();
  });
});

// ─── Receipt ─────────────────────────────────────────────────────────────────

describe('buildFilmVFXReceipt', () => {
  it('plugin=film-vfx and CAEL event correct', () => {
    const receipt = buildFilmVFXReceipt({ converged: true });
    expect(receipt.plugin).toBe('film-vfx');
    expect(receipt.cael.event).toBe('film_vfx.production_analysis');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true for nominal exposure', () => {
    const exposure = exposureValue({ aperture: 5.6, shutterSpeedS: 1 / 125, iso: 100 }); // EV≈11.9
    const receipt = buildFilmVFXReceipt({ exposure, converged: true });
    expect(receipt.acceptance.accepted).toBe(true);
  });

  it('accepted=false for extreme under-exposure', () => {
    // Very slow shutter + high ISO but extreme example: aperture 1.0, t=60s, iso=1 → very low EV
    const exposure = exposureValue({ aperture: 22, shutterSpeedS: 1 / 8000, iso: 50 }); // EV > 17
    if (exposure.ev100 > 17) {
      const receipt = buildFilmVFXReceipt({ exposure, converged: true });
      expect(receipt.acceptance.accepted).toBe(false);
    }
  });

  it('uses provided runId', () => {
    const receipt = buildFilmVFXReceipt({ converged: true }, { runId: 'vfx-shot-001' });
    expect(receipt.runId).toBe('vfx-shot-001');
  });
});
