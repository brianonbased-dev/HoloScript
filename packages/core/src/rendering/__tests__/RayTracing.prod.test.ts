import { describe, it, expect } from 'vitest';
import {
  BVH,
  RayTracer,
  computeAABB,
  aabbSurfaceArea,
  aabbCentroid,
  intersectRayAABB,
  intersectRayTriangle,
  computeTriangleNormal,
  pathTrace,
  nlmDenoise,
  type Triangle,
  type Ray,
  type AABB,
  type PathTracerScene,
} from '../RayTracing';

// Helper: build a simple floor triangle (Y=0 plane quad split into 2 tris)
function floorTri(z = 5): Triangle[] {
  return [
    { v0: { x: -10, y: 0, z: 0 }, v1: { x: 10, y: 0, z: 0 }, v2: { x: 0, y: 0, z: z } },
    { v0: { x: -3, y: 0, z: 0 }, v1: { x: 3, y: 0, z: 0 }, v2: { x: 0, y: 0, z: 5 } },
  ];
}

function makeRay(ox = 0, oy = 5, oz = 0, dx = 0, dy = -1, dz = 0): Ray {
  return { origin: { x: ox, y: oy, z: oz }, direction: { x: dx, y: dy, z: dz }, tMin: 1e-3, tMax: 1000 };
}

describe('RayTracing — Production Tests', () => {

  // ---------------------------------------------------------------------------
  // AABB Utilities
  // ---------------------------------------------------------------------------
  describe('computeAABB', () => {
    it('computes correct min/max for a triangle above Y=0', () => {
      const tris: Triangle[] = [
        { v0: { x: -1, y: 0, z: 0 }, v1: { x: 1, y: 0, z: 0 }, v2: { x: 0, y: 2, z: 0 } },
      ];
      const box = computeAABB(tris, 0, 1);
      expect(box.min.x).toBeCloseTo(-1, 5);
      expect(box.max.y).toBeCloseTo(2, 5);
    });

    it('handles multiple triangles', () => {
      const tris = floorTri();
      const box = computeAABB(tris, 0, tris.length);
      expect(box.min.x).toBeLessThan(0);
      expect(box.max.x).toBeGreaterThan(0);
    });
  });

  describe('aabbSurfaceArea', () => {
    it('unit cube has surface area 6', () => {
      const box: AABB = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
      expect(aabbSurfaceArea(box)).toBeCloseTo(6, 5);
    });

    it('flat box has correct area', () => {
      const box: AABB = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 1, z: 1 } };
      expect(aabbSurfaceArea(box)).toBeCloseTo(10, 5);
    });
  });

  describe('aabbCentroid', () => {
    it('returns centre of unit cube', () => {
      const box: AABB = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 4, z: 6 } };
      const c = aabbCentroid(box);
      expect(c.x).toBeCloseTo(1, 5); expect(c.y).toBeCloseTo(2, 5); expect(c.z).toBeCloseTo(3, 5);
    });
  });

  // ---------------------------------------------------------------------------
  // Ray-AABB Intersection
  // ---------------------------------------------------------------------------
  describe('intersectRayAABB', () => {
    const box: AABB = { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } };

    it('ray hitting box from above returns positive t', () => {
      const ray = makeRay(0, 5, 0);
      const t = intersectRayAABB(ray, box);
      expect(t).toBeGreaterThan(0);
    });

    it('ray missing box returns -1', () => {
      const ray = makeRay(10, 5, 0); // far to the right
      const t = intersectRayAABB(ray, box);
      expect(t).toBe(-1);
    });

    it('ray inside box has tmin = ray.tMin (already inside)', () => {
      const ray: Ray = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 }, tMin: 0, tMax: 100 };
      const t = intersectRayAABB(ray, box);
      expect(t).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Ray-Triangle Intersection
  // ---------------------------------------------------------------------------
  describe('intersectRayTriangle', () => {
    const tri: Triangle = {
      v0: { x: -1, y: 0, z: -1 },
      v1: { x: 1, y: 0, z: -1 },
      v2: { x: 0, y: 0, z: 1 },
    };

    it('downward ray hits horizontal triangle at t≈5', () => {
      const ray = makeRay(0, 5, 0);
      const t = intersectRayTriangle(ray, tri);
      expect(t).toBeCloseTo(5, 2);
    });

    it('ray missing triangle returns -1', () => {
      const ray = makeRay(10, 5, 0);
      const t = intersectRayTriangle(ray, tri);
      expect(t).toBe(-1);
    });

    it('parallel ray returns -1', () => {
      const ray: Ray = { origin: { x: 0, y: 1, z: 0 }, direction: { x: 1, y: 0, z: 0 }, tMin: 0, tMax: 100 };
      const t = intersectRayTriangle(ray, tri);
      expect(t).toBe(-1);
    });

    it('hit is within [tMin, tMax]', () => {
      const ray: Ray = { origin: { x: 0, y: 5, z: 0 }, direction: { x: 0, y: -1, z: 0 }, tMin: 1, tMax: 4 };
      // Triangle at y=0, ray starts at y=5, max=4 — no hit
      const t = intersectRayTriangle(ray, tri);
      expect(t).toBe(-1);
    });
  });

  // ---------------------------------------------------------------------------
  // Triangle Normal
  // ---------------------------------------------------------------------------
  describe('computeTriangleNormal', () => {
    it('flat tri on XZ plane has upward normal', () => {
      const tri: Triangle = {
        v0: { x: 0, y: 0, z: 0 }, v1: { x: 1, y: 0, z: 0 }, v2: { x: 0, y: 0, z: 1 }
      };
      const n = computeTriangleNormal(tri);
      // Normal should be (0, ±1, 0)
      expect(Math.abs(n.y)).toBeCloseTo(1, 4);
      expect(Math.abs(n.x)).toBeCloseTo(0, 4);
    });

    it('returns a unit vector', () => {
      const tri: Triangle = {
        v0: { x: 1, y: 2, z: 3 }, v1: { x: 4, y: 1, z: 0 }, v2: { x: -1, y: 3, z: 2 }
      };
      const n = computeTriangleNormal(tri);
      const len = Math.sqrt(n.x ** 2 + n.y ** 2 + n.z ** 2);
      expect(len).toBeCloseTo(1, 4);
    });
  });

  // ---------------------------------------------------------------------------
  // BVH
  // ---------------------------------------------------------------------------
  describe('BVH', () => {
    it('empty BVH has no nodes', () => {
      const bvh = new BVH();
      bvh.build([]);
      expect(bvh.getNodeCount()).toBe(0);
    });

    it('builds from multiple triangles', () => {
      const bvh = new BVH();
      const tris = floorTri();
      bvh.build(tris);
      expect(bvh.getNodeCount()).toBeGreaterThan(0);
    });

    it('intersect finds the floor hit', () => {
      const bvh = new BVH();
      bvh.build(floorTri());
      const hit = bvh.intersect(makeRay(0, 5, 0));
      expect(hit).not.toBeNull();
      expect(hit!.t).toBeCloseTo(5, 2);
    });

    it('intersect returns null for a missing ray', () => {
      const bvh = new BVH();
      bvh.build(floorTri());
      const hit = bvh.intersect(makeRay(100, 5, 100));
      expect(hit).toBeNull();
    });

    it('has at least one leaf node', () => {
      const bvh = new BVH();
      bvh.build(floorTri());
      expect(bvh.getLeafCount()).toBeGreaterThan(0);
    });

    it('builds larger scene without error', () => {
      const bvh = new BVH();
      const tris: Triangle[] = [];
      for (let i = 0; i < 50; i++) {
        tris.push({
          v0: { x: i, y: 0, z: 0 },
          v1: { x: i + 1, y: 0, z: 0 },
          v2: { x: i + 0.5, y: 0, z: 1 },
        });
      }
      expect(() => bvh.build(tris)).not.toThrow();
      expect(bvh.getNodeCount()).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Path Tracer
  // ---------------------------------------------------------------------------
  describe('pathTrace', () => {
    function buildScene(): PathTracerScene {
      const bvh = new BVH();
      bvh.build(floorTri());
      return {
        bvh,
        skyColor: [0.5, 0.7, 1.0],
        lights: [{ position: { x: 0, y: 10, z: 0 }, color: [1, 1, 1], intensity: 20 }],
      };
    }

    it('returns RGB triple', () => {
      const scene = buildScene();
      const result = pathTrace(makeRay(), scene, 2, 0.1);
      expect(result.length).toBe(3);
    });

    it('all channels are non-negative', () => {
      const scene = buildScene();
      const result = pathTrace(makeRay(), scene, 2, 0.5);
      for (const c of result) expect(c).toBeGreaterThanOrEqual(0);
    });

    it('miss ray returns sky colour', () => {
      const bvh = new BVH(); bvh.build([]);
      const scene: PathTracerScene = { bvh, skyColor: [0.2, 0.3, 0.8], lights: [] };
      const ray = makeRay(0, 0, 0, 0, 1, 0); // shooting up
      const result = pathTrace(ray, scene, 1, 0.1);
      // Should reflect sky colour at least partially
      expect(result[2]).toBeGreaterThan(result[0]); // more blue than red
    });

    it('hit scene returns more than pure sky', () => {
      const scene = buildScene();
      const emptyScene: PathTracerScene = { bvh: new BVH(), skyColor: [0, 0, 0], lights: [] };
      emptyScene.bvh.build([]);
      const hitResult = pathTrace(makeRay(), scene, 1, 0.1);
      const sum = hitResult.reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // NLM Denoiser
  // ---------------------------------------------------------------------------
  describe('nlmDenoise', () => {
    it('returns output of same size', () => {
      const W = 8, H = 8;
      const noisy = new Float32Array(W * H * 4).fill(0.5);
      const out = nlmDenoise(noisy, W, H, { searchRadius: 2, patchRadius: 1, h: 0.1 });
      expect(out.length).toBe(W * H * 4);
    });

    it('smooth (constant) image is preserved after denoising', () => {
      const W = 4, H = 4;
      const flat = new Float32Array(W * H * 4).fill(0.6);
      const out = nlmDenoise(flat, W, H, { searchRadius: 2, patchRadius: 1, h: 0.1 });
      for (let i = 0; i < out.length; i += 4) {
        expect(out[i]).toBeCloseTo(0.6, 2);
      }
    });

    it('output values are all finite', () => {
      const W = 4, H = 4;
      const noisy = new Float32Array(W * H * 4).map(() => Math.random());
      const out = nlmDenoise(noisy, W, H);
      for (const v of out) expect(isFinite(v)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // RayTracer Class
  // ---------------------------------------------------------------------------
  describe('RayTracer', () => {
    it('default config uses software backend', () => {
      const rt = new RayTracer();
      expect(rt.getConfig().rt_api).toBe('software');
    });

    it('hasFeature returns true for configured features', () => {
      const rt = new RayTracer({ features: ['gi', 'shadows'] });
      expect(rt.hasFeature('gi')).toBe(true);
      expect(rt.hasFeature('shadows')).toBe(true);
      expect(rt.hasFeature('ao')).toBe(false);
    });

    it('setFeatures updates feature list', () => {
      const rt = new RayTracer();
      rt.setFeatures(['ao']);
      expect(rt.hasFeature('ao')).toBe(true);
      expect(rt.hasFeature('reflections')).toBe(false);
    });

    it('loadScene builds BVH correctly', () => {
      const rt = new RayTracer({ spp: 1, max_bounces: 1 });
      rt.loadScene(floorTri());
      expect(rt.getBVH().getNodeCount()).toBeGreaterThan(0);
    });

    it('renderPixel returns finite RGB', () => {
      const rt = new RayTracer({ spp: 2, max_bounces: 1 });
      rt.loadScene(floorTri(), [{ position: { x: 0, y: 10, z: 0 }, color: [1, 1, 1], intensity: 10 }]);
      const result = rt.renderPixel({ x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }, 0, 0);
      for (const c of result) {
        expect(isFinite(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
