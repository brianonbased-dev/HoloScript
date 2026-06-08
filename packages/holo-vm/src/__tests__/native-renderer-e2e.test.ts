/**
 * e2e (increment 1, D.083): real HoloBytecode → HoloVM.load() → NativeHoloRenderer → pixels.
 *
 * Unlike the slice (which hand-built an ECSWorld), this drives the VM's REAL bytecode +
 * load path: a HoloBytecode module is assembled with HoloBytecodeBuilder, loaded through
 * HoloVM (initializeEntities populates vm.world), then rendered natively. Proves the
 * bytecode→VM→native-pixel chain. The .holo-TEXT front (parseHolo → HolobCompiler →
 * HoloBytecode) is the existing, separately-tested compiler pipeline that produces exactly
 * this HoloBytecode shape.
 */
import { describe, it, expect } from 'vitest';
import { HoloBytecodeBuilder, type HoloBytecode } from '../bytecode';
import { HoloVM } from '../executor';
import { ComponentType, GeometryType } from '../opcodes';
import {
  NativeFramebuffer,
  SoftwareRasterBackend,
  NativeHoloRenderer,
  type OrthoCamera,
} from '../render/native-renderer';

const CAM: OrthoCamera = { pixelsPerUnit: 8, centerWorld: { x: 0, y: 0 } };
const CLEAR = { r: 18, g: 18, b: 22, a: 255 };

describe('e2e: HoloBytecode → HoloVM.load → NativeHoloRenderer', () => {
  it('loads a bytecode module through the VM and renders its world natively', () => {
    const b = new HoloBytecodeBuilder();
    const idx = b.addEntity('cube'); // entity index 0 → world id 1 after load
    // Component values in the canonical TransformComponent/Geometry/Material shapes the
    // VM's opcode handlers also use — initializeEntities stores them as-is on vm.world.
    b.addComponentToEntity(idx, ComponentType.Transform, {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 2, y: 2, z: 2 },
    } as unknown as Record<string, never>);
    b.addComponentToEntity(idx, ComponentType.Geometry, {
      type: GeometryType.Cube,
      params: {},
    } as unknown as Record<string, never>);
    b.addComponentToEntity(idx, ComponentType.Material, {
      color: 0xff0000,
      metalness: 0,
      roughness: 1,
      emissive: 0,
      opacity: 1,
    } as unknown as Record<string, never>);

    const bytecode: HoloBytecode = b.build();

    const vm = new HoloVM();
    vm.load(bytecode); // VM's real load path populates vm.world from the bytecode entities
    expect(vm.world.entityCount).toBe(1);

    const fb = new NativeFramebuffer(64, 64);
    const stats = new NativeHoloRenderer(new SoftwareRasterBackend(fb)).render(
      vm.world,
      fb,
      CAM,
      CLEAR
    );

    expect(stats.entitiesDrawn).toBe(1);
    expect(fb.pixel(32, 32)).toEqual({ r: 255, g: 0, b: 0, a: 255 }); // the loaded cube
    expect(fb.pixel(2, 2)).toEqual(CLEAR);
  });

  it('renders a two-entity bytecode module composited by id', () => {
    const b = new HoloBytecodeBuilder();
    const mk = (name: string, x: number, color: number) => {
      const i = b.addEntity(name);
      b.addComponentToEntity(i, ComponentType.Transform, {
        position: { x, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      } as unknown as Record<string, never>);
      b.addComponentToEntity(i, ComponentType.Geometry, {
        type: GeometryType.Cube,
        params: {},
      } as unknown as Record<string, never>);
      b.addComponentToEntity(i, ComponentType.Material, {
        color,
        metalness: 0,
        roughness: 1,
        emissive: 0,
        opacity: 1,
      } as unknown as Record<string, never>);
    };
    mk('a', -2, 0xff0000);
    mk('b', 2, 0x0000ff);

    const vm = new HoloVM();
    vm.load(b.build());
    expect(vm.world.entityCount).toBe(2);

    const fb = new NativeFramebuffer(64, 64);
    const stats = new NativeHoloRenderer(new SoftwareRasterBackend(fb)).render(
      vm.world,
      fb,
      CAM,
      CLEAR
    );
    expect(stats.entitiesDrawn).toBe(2);
    expect(fb.pixel(16, 32)).toEqual({ r: 255, g: 0, b: 0, a: 255 }); // left cube
    expect(fb.pixel(48, 32)).toEqual({ r: 0, g: 0, b: 255, a: 255 }); // right cube
  });
});
