/**
 * NativeHoloRenderer slice proof (D.083): HoloVM world state → native pixels, ZERO foreign engine.
 * holo-vm depends only on @holoscript/core (no three/react/cannon), so the render path is
 * Three-free by construction — these tests assert the path actually produces correct pixels.
 */
import { describe, it, expect } from 'vitest';
import { ECSWorld } from '../executor';
import { ComponentType, GeometryType } from '../opcodes';
import {
  NativeFramebuffer,
  SoftwareRasterBackend,
  NativeHoloRenderer,
  unpackColor,
  type OrthoCamera,
} from '../render/native-renderer';

const CAM: OrthoCamera = { pixelsPerUnit: 8, centerWorld: { x: 0, y: 0 } };
const CLEAR = { r: 18, g: 18, b: 22, a: 255 };

function renderable(
  world: ECSWorld,
  name: string,
  pos: { x: number; y: number; z: number },
  scale: number,
  color: number
) {
  const id = world.spawn(name);
  world.setComponent(id, ComponentType.Transform, {
    position: pos,
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: scale, y: scale, z: scale },
  });
  world.setComponent(id, ComponentType.Geometry, { type: GeometryType.Cube, params: {} });
  world.setComponent(id, ComponentType.Material, {
    color,
    metalness: 0,
    roughness: 1,
    emissive: 0,
    opacity: 1,
  });
  return id;
}

describe('NativeHoloRenderer — native pixel path from HoloVM state', () => {
  it('unpackColor decodes packed 0xRRGGBB', () => {
    expect(unpackColor(0xff0000)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    expect(unpackColor(0x00ff00)).toEqual({ r: 0, g: 255, b: 0, a: 255 });
    expect(unpackColor(0x0000ff, 0.5)).toEqual({ r: 0, g: 0, b: 255, a: 128 });
  });

  it('draws ONE entity from VM world state at the projected center (THE first native pixel)', () => {
    const world = new ECSWorld();
    renderable(world, 'cube', { x: 0, y: 0, z: 0 }, 2, 0xff0000); // origin → screen center

    const fb = new NativeFramebuffer(64, 64);
    const stats = new NativeHoloRenderer(new SoftwareRasterBackend(fb)).render(
      world,
      fb,
      CAM,
      CLEAR
    );

    expect(stats.entitiesDrawn).toBe(1);
    // origin projects to (32,32); scale 2 → 8px half-extent → 16x16 red square.
    expect(fb.pixel(32, 32)).toEqual({ r: 255, g: 0, b: 0, a: 255 }); // center is the cube
    expect(fb.pixel(2, 2)).toEqual(CLEAR); // far corner is background
    // edge of the quad (within ±8px of center) is red, just outside is background:
    expect(fb.pixel(32, 25).r).toBe(255); // y=25 is within 8px of 32
    expect(fb.pixel(32, 10)).toEqual(CLEAR); // y=10 is well outside
  });

  it('projects world position to the correct screen quadrant', () => {
    const world = new ECSWorld();
    renderable(world, 'right-up', { x: 2, y: 2, z: 0 }, 1, 0x00ff00); // +X,+Y → right & up (screen up = smaller y)
    const fb = new NativeFramebuffer(64, 64);
    new NativeHoloRenderer(new SoftwareRasterBackend(fb)).render(world, fb, CAM, CLEAR);
    // world (2,2) → screen (32 + 16, 32 - 16) = (48, 16)
    expect(fb.pixel(48, 16)).toEqual({ r: 0, g: 255, b: 0, a: 255 });
    expect(fb.pixel(32, 32)).toEqual(CLEAR); // origin is now background
  });

  it('skips non-renderable entities (missing Material)', () => {
    const world = new ECSWorld();
    const id = world.spawn('no-material');
    world.setComponent(id, ComponentType.Transform, {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    });
    world.setComponent(id, ComponentType.Geometry, { type: GeometryType.Cube, params: {} });
    const fb = new NativeFramebuffer(64, 64);
    const stats = new NativeHoloRenderer(new SoftwareRasterBackend(fb)).render(
      world,
      fb,
      CAM,
      CLEAR
    );
    expect(stats.entitiesConsidered).toBe(1);
    expect(stats.entitiesDrawn).toBe(0);
    expect(fb.pixel(32, 32)).toEqual(CLEAR);
  });

  it('renders multiple entities deterministically by id (painter order)', () => {
    const world = new ECSWorld();
    renderable(world, 'a', { x: -2, y: 0, z: 0 }, 1, 0xff0000);
    renderable(world, 'b', { x: 2, y: 0, z: 0 }, 1, 0x0000ff);
    const fb = new NativeFramebuffer(64, 64);
    const stats = new NativeHoloRenderer(new SoftwareRasterBackend(fb)).render(
      world,
      fb,
      CAM,
      CLEAR
    );
    expect(stats.entitiesDrawn).toBe(2);
    expect(fb.pixel(16, 32)).toEqual({ r: 255, g: 0, b: 0, a: 255 }); // left = red
    expect(fb.pixel(48, 32)).toEqual({ r: 0, g: 0, b: 255, a: 255 }); // right = blue
  });
});
