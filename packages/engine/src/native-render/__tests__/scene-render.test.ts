/**
 * scene-render e2e (D.083, task 2h3s, Inc 2): a HoloScript VM scene → native verified pixels.
 *
 * Full native path, NO Three.js: build an engine/vm ECSWorld → extractDrawSpecs (pure data) →
 * renderDrawSpecs (WebGPU geometry upload + indexed draw) → offscreen texture → pixel readback.
 * Gated on GPU_LIVE so it skips (never false-greens) where Dawn/GPU is absent.
 */
import { describe, it, expect } from 'vitest';
import { testDevice, GPU_LIVE } from '../../physics/__tests__/gpu-setup';
import { ECSWorld } from '../../vm/executor';
import { ComponentType, GeometryType } from '../../vm/opcodes';
import { extractDrawSpecs } from '../draw-spec';
import { renderDrawSpecs } from '../scene-render';
import { pixelAt } from '../gpu-verify';

function addCube(w: ECSWorld, name: string, x: number, y: number, color: number, scale = 1) {
  const id = w.spawn(name);
  w.setComponent(id, ComponentType.Transform, { position: { x, y, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: scale, y: scale, z: scale } });
  w.setComponent(id, ComponentType.Geometry, { type: GeometryType.Cube, params: {} });
  w.setComponent(id, ComponentType.Material, { color, metalness: 0, roughness: 1, emissive: 0, opacity: 1 });
  return id;
}

const itGpu = GPU_LIVE ? it : it.skip;

describe('scene-render — HoloScript VM scene → native verified pixels', () => {
  itGpu('renders a single red cube from the VM world at the projected center (no Three.js)', async () => {
    const world = new ECSWorld();
    addCube(world, 'cube', 0, 0, 0xff0000); // origin

    const specs = extractDrawSpecs(world);
    expect(specs).toHaveLength(1);

    const grid = await renderDrawSpecs(testDevice!, specs, { size: 64 });
    expect(pixelAt(grid, 32, 32)).toEqual([255, 0, 0, 255]); // the cube
    // a corner well outside the cube is the clear color (dark), not red
    const corner = pixelAt(grid, 2, 2);
    expect(corner[0]).toBeLessThan(60);
    expect(corner).not.toEqual([255, 0, 0, 255]);
  });

  itGpu('places two cubes by their transforms — red left, blue right, gap between', async () => {
    const world = new ECSWorld();
    addCube(world, 'red', -1, 0, 0xff0000);
    addCube(world, 'blue', 1, 0, 0x0000ff);

    const grid = await renderDrawSpecs(testDevice!, extractDrawSpecs(world), { size: 64 });
    // ortho(2): worldX=-1 → screenX≈16, worldX=+1 → screenX≈48; origin gap clear.
    expect(pixelAt(grid, 16, 32)).toEqual([255, 0, 0, 255]); // red cube (left)
    expect(pixelAt(grid, 48, 32)).toEqual([0, 0, 255, 255]); // blue cube (right)
    expect(pixelAt(grid, 32, 32)[2]).toBeLessThan(120);      // gap at center is not the blue cube
  });

  it('GPU_LIVE gate is recorded (pixel tests skip, never false-pass, when no live GPU)', () => {
    expect(typeof GPU_LIVE).toBe('boolean');
  });
});
