/**
 * GaussianCaptureLoader — depthprobe RGBD capture ingestion (the real-data #1b path).
 *
 * The verification-critical part is the ARCore(camera-to-world, OpenGL) → CV(world-to-camera, +Z fwd)
 * convention. We prove it with a ROUND-TRIP: back-project a depth pixel to a world point, then project
 * that world point through the derived SplatCamera (the exact forward3D projection) — it must land
 * back on the source image pixel, with camera-space depth == the input depth. If the convention were
 * wrong (a flipped axis), the reprojection would miss. This is the unit-test form of the geom_check.
 */
import { describe, it, expect } from 'vitest';
import {
  cameraFromArcorePose,
  backprojectDepth,
  captureToGaussianInit,
  captureToViews,
  type CaptureIntrinsics,
  type CaptureFrame,
  type CaptureManifest,
} from '../GaussianCaptureLoader';

const INTR: CaptureIntrinsics = {
  fx: 1247.77,
  fy: 1244.69,
  cx: 968.61,
  cy: 547.37,
  imageWidth: 1920,
  imageHeight: 1080,
};
const DW = 160,
  DH = 90;

/** Column-major 4×4 ARCore pose from a camera-to-world rotation (row-major 3×3) + translation. */
function makePose(Rcw: number[], t: [number, number, number]): number[] {
  return [
    Rcw[0],
    Rcw[3],
    Rcw[6],
    0,
    Rcw[1],
    Rcw[4],
    Rcw[7],
    0,
    Rcw[2],
    Rcw[5],
    Rcw[8],
    0,
    t[0],
    t[1],
    t[2],
    1,
  ];
}
function rotY(a: number): number[] {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}
/** Project a world point through a SplatCamera (the forward3D pinhole). */
function project(cam: ReturnType<typeof cameraFromArcorePose>, p: [number, number, number]) {
  const V = cam.Vrow,
    t = cam.t;
  const cx = V[0] * p[0] + V[1] * p[1] + V[2] * p[2] + t[0];
  const cy = V[3] * p[0] + V[4] * p[1] + V[5] * p[2] + t[1];
  const cz = V[6] * p[0] + V[7] * p[1] + V[8] * p[2] + t[2];
  return { u: (cam.fx * cx) / cz + (cam.cx ?? 0), v: (cam.fy * cy) / cz + (cam.cy ?? 0), z: cz };
}

/** A depth frame with a single valid depth at (du,dv); everything else zero. */
function depthFrameWith(pose: number[], du: number, dv: number, depthMm: number): CaptureFrame {
  const depth = new Array(DW * DH).fill(0);
  depth[dv * DW + du] = depthMm;
  return {
    index: 0,
    cameraTransformColumnMajor4x4: pose,
    depthWidth: DW,
    depthHeight: DH,
    depthMillimeters: depth,
  };
}

describe('GaussianCaptureLoader — ARCore→CV convention (back-project ∘ project round-trip)', () => {
  for (const [name, Rcw, t] of [
    ['identity + translation', [1, 0, 0, 0, 1, 0, 0, 0, 1], [0.5, -0.3, 1.0]],
    ['rotated 0.4rad about y', rotY(0.4), [-0.2, 0.1, 0.8]],
  ] as Array<[string, number[], [number, number, number]]>) {
    it(`reprojects a depth pixel to itself (${name})`, () => {
      const du = 40,
        dv = 30,
        depthMm = 2500;
      const pose = makePose(Rcw, t);
      const frame = depthFrameWith(pose, du, dv, depthMm);
      const pts = backprojectDepth(frame, INTR, { step: 1, minM: 0.1, maxM: 6 });
      const p = pts.find((q) => q.du === du && q.dv === dv)!;
      expect(p).toBeDefined();

      const cam = cameraFromArcorePose(pose, INTR, INTR.imageWidth); // scale = 1 (render at full res)
      const proj = project(cam, [p.x, p.y, p.z]);

      // the source image pixel the depth pixel maps to (depth res → image res)
      const uImg = (du + 0.5) * (INTR.imageWidth / DW),
        vImg = (dv + 0.5) * (INTR.imageHeight / DH);
      expect(proj.u).toBeCloseTo(uImg, 2);
      expect(proj.v).toBeCloseTo(vImg, 2);
      expect(proj.z).toBeCloseTo(depthMm / 1000, 4); // in front, camera-space depth == input depth
    });
  }

  it('camera intrinsics scale with render resolution (centre-principal stays centred)', () => {
    const cam = cameraFromArcorePose(makePose([1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0]), INTR, 192);
    expect(cam.fx).toBeCloseTo(INTR.fx * (192 / 1920), 4);
    expect(cam.cx).toBeCloseTo(INTR.cx * (192 / 1920), 4);
  });
});

describe('GaussianCaptureLoader — init + views assembly', () => {
  const manifest: CaptureManifest = {
    intrinsics: INTR,
    frames: [0, 1].map((i) => {
      const depth = new Array(DW * DH).fill(2000); // uniform 2m wall
      return {
        index: i,
        cameraTransformColumnMajor4x4: makePose(rotY(i * 0.2), [i * 0.1, 0, 0]),
        depthWidth: DW,
        depthHeight: DH,
        depthMillimeters: depth,
      };
    }),
  };
  const decode = (_i: number, w: number, h: number) =>
    Float64Array.from({ length: w * h * 3 }, (_, k) => (k % 3) / 3);

  it('captureToGaussianInit produces a depth-fused Gaussian3D with finite positions and valid params', () => {
    const g = captureToGaussianInit(manifest, decode, { step: 8 });
    expect(g.N).toBeGreaterThan(0);
    for (let i = 0; i < g.N; i++) {
      expect(Number.isFinite(g.x[i])).toBe(true);
      expect(g.sx[i]).toBeGreaterThan(0);
    }
    expect(g.op[0]).toBeGreaterThan(0);
  });

  it('captureToViews yields posed TrainViews at the render resolution', () => {
    const views = captureToViews(manifest, decode, 64, 36, 1);
    expect(views).toHaveLength(2);
    expect(views[0].W).toBe(64);
    expect(views[0].target.length).toBe(64 * 36 * 3);
    expect(views[0].cam.fx).toBeCloseTo(INTR.fx * (64 / 1920), 3);
  });
});
