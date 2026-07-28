/**
 * GaussianTrainDataset — posed-view adapter + the trainer's MULTI-VIEW path.
 *
 * Two things proven here:
 *  1. cameraFromViewMatrix correctly maps the capture's column-major world→camera view matrix
 *     (the cam.json / WebGPU-renderer format) onto the trainer's SplatCamera — verified by a
 *     round-trip AND by projection consistency (a point lands in the same camera-space via both).
 *  2. The sovereign trainer fits a scene from MULTIPLE distinct viewpoints (real captures are
 *     many views; GaussianTrainRunner.test only covered a single view). Summed loss across 3
 *     different cameras collapses, and every individual view is reproduced — you cannot do that by
 *     overfitting one viewpoint, so this genuinely exercises the multi-view gradient accumulation.
 */
import { describe, it, expect } from 'vitest';
import { forward2D } from '../GaussianTrainer2D';
import { forward3D, type Gaussian3D } from '../GaussianTrainer3D';
import {
  runGaussianTrainJob,
  type GaussianTrainJobSpec,
  type TrainView,
} from '../GaussianTrainRunner';
import { cameraFromViewMatrix, cameraScaled, viewsFromFrames } from '../GaussianTrainDataset';

function seeded(s: number): () => number {
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}
function makeScene(seed: number, N: number): Gaussian3D {
  const R = seeded(seed);
  return {
    N,
    x: Float64Array.from({ length: N }, () => (R() - 0.5) * 1.6),
    y: Float64Array.from({ length: N }, () => (R() - 0.5) * 1.2),
    z: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.8),
    sx: Float64Array.from({ length: N }, () => 0.06 + R() * 0.12),
    sy: Float64Array.from({ length: N }, () => 0.06 + R() * 0.12),
    sz: Float64Array.from({ length: N }, () => 0.06 + R() * 0.12),
    qr: Float64Array.from({ length: N }, () => 1.0),
    qx: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.3),
    qy: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.3),
    qz: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.3),
    op: Float64Array.from({ length: N }, () => 0.4 + R() * 0.5),
    r: Float64Array.from({ length: N }, () => R()),
    gr: Float64Array.from({ length: N }, () => R()),
    bl: Float64Array.from({ length: N }, () => R()),
  };
}
function rotY(t: number): number[] {
  const c = Math.cos(t),
    s = Math.sin(t);
  return [c, 0, s, 0, 1, 0, -s, 0, c]; // row-major world→camera rotation
}
/** Column-major 4x4 view matrix from a row-major 3x3 rotation + translation (the cam.json format). */
function buildViewMatrix(Rr: number[], t: [number, number, number]): number[] {
  return [
    Rr[0],
    Rr[3],
    Rr[6],
    0,
    Rr[1],
    Rr[4],
    Rr[7],
    0,
    Rr[2],
    Rr[5],
    Rr[8],
    0,
    t[0],
    t[1],
    t[2],
    1,
  ];
}

describe('cameraFromViewMatrix — capture pose adapter', () => {
  it('round-trips a column-major view matrix into SplatCamera (Vrow + t)', () => {
    const Rr = rotY(0.37);
    const t: [number, number, number] = [0.5, -0.25, 6];
    const vm = buildViewMatrix(Rr, t);
    const cam = cameraFromViewMatrix(vm, 600, 610);
    for (let i = 0; i < 9; i++) expect(cam.Vrow[i]).toBeCloseTo(Rr[i], 12);
    expect([...cam.t]).toEqual(t);
    expect(cam.fx).toBe(600);
    expect(cam.fy).toBe(610);
  });

  it('projection is consistent: a point maps to the same camera-space via matrix and via SplatCamera', () => {
    const Rr = rotY(-0.21);
    const t: [number, number, number] = [0.1, 0.2, 5];
    const vm = buildViewMatrix(Rr, t);
    const cam = cameraFromViewMatrix(vm, 500, 500);
    const p = [0.3, -0.4, 0.2];
    // column-major matrix application: camPos.row = Σ_col vm[col*4+row]*p[col] (+ translation col)
    const camMat = [
      vm[0] * p[0] + vm[4] * p[1] + vm[8] * p[2] + vm[12],
      vm[1] * p[0] + vm[5] * p[1] + vm[9] * p[2] + vm[13],
      vm[2] * p[0] + vm[6] * p[1] + vm[10] * p[2] + vm[14],
    ];
    const camSplat = [
      cam.Vrow[0] * p[0] + cam.Vrow[1] * p[1] + cam.Vrow[2] * p[2] + cam.t[0],
      cam.Vrow[3] * p[0] + cam.Vrow[4] * p[1] + cam.Vrow[5] * p[2] + cam.t[1],
      cam.Vrow[6] * p[0] + cam.Vrow[7] * p[1] + cam.Vrow[8] * p[2] + cam.t[2],
    ];
    for (let i = 0; i < 3; i++) expect(camSplat[i]).toBeCloseTo(camMat[i], 12);
  });

  it('cameraScaled scales focals (centre-principal stays consistent at the new resolution)', () => {
    const cam = cameraFromViewMatrix(buildViewMatrix(rotY(0), [0, 0, 5]), 600, 600);
    const half = cameraScaled(cam, 0.5);
    expect(half.fx).toBe(300);
    expect(half.fy).toBe(300);
    expect(half.cx).toBeUndefined(); // centre-principal → forward3D uses (W*0.5)/2, still the centre
  });
});

describe('sovereign trainer — multi-view fit (the real-capture path)', () => {
  it('fits a scene from 3 distinct viewpoints; summed loss collapses and every view is reproduced', () => {
    const W = 48,
      H = 36,
      fx = 60;
    const truth = makeScene(99, 90);
    // 3 cameras around the scene, built through the capture-pose adapter.
    const angles = [-0.3, 0, 0.3];
    const frames = angles.map((a) => {
      const cam = cameraFromViewMatrix(buildViewMatrix(rotY(a), [0, 0, 6]), fx, fx);
      const target = forward2D(forward3D(truth, cam, W, H).g2, W, H).img;
      return { cam, target };
    });
    const views: TrainView[] = frames.map((f) => ({ cam: f.cam, W, H, target: f.target }));

    const job: GaussianTrainJobSpec = {
      hyperparams: {
        iterations: 250,
        learningRates: { position: 0.02, scale: 0.004, rotation: 0.01, opacity: 0.01, color: 0.01 },
        dilation: 0.3,
      },
    };
    const result = runGaussianTrainJob(job, makeScene(3, 90), views);

    // summed loss across all 3 views collapses
    expect(result.finalLoss).toBeLessThan(result.initialLoss / 10);

    // AND every individual view is reproduced (can't fake this by overfitting one viewpoint)
    for (const f of frames) {
      const { img } = forward2D(forward3D(result.gaussians, f.cam, W, H).g2, W, H);
      let L0 = 0,
        L1 = 0;
      const init = forward2D(forward3D(makeScene(3, 90), f.cam, W, H).g2, W, H).img;
      for (let k = 0; k < img.length; k++) {
        L1 += (img[k] - f.target[k]) ** 2;
        L0 += (init[k] - f.target[k]) ** 2;
      }
      expect(L1).toBeLessThan(L0 / 5); // each view markedly improved from the random init
    }
  });

  it('viewsFromFrames assembles TrainViews from decoded posed frames (with optional downsample)', () => {
    const W = 16,
      H = 12;
    const target = new Float64Array(W * H * 3);
    const views = viewsFromFrames(
      [
        {
          viewMatrix: buildViewMatrix(rotY(0), [0, 0, 5]),
          focalX: 100,
          focalY: 100,
          target,
          width: W,
          height: H,
        },
      ],
      1
    );
    expect(views).toHaveLength(1);
    expect(views[0].W).toBe(W);
    expect(views[0].cam.fx).toBe(100);
  });
});
