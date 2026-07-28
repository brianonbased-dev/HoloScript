/**
 * HoloVM APPLY_TRAIT → NativeHoloRenderer — end-to-end trait dispatch test.
 *
 * DONE-WHEN validation (task_1780656313424_h762):
 *   "one trait (@rigid / @grabbable) drives a rendered entity purely via
 *    HoloVM → NativeHoloRenderer, no Three-side trait logic."
 *
 * This test file is the falsifier. It proves:
 *   1. APPLY_TRAIT opcode (via HoloBytecodeBuilder + HoloVM.load) stores the trait ID
 *      on the entity inside vm.world (the canonical ECSWorld).
 *   2. NativeHoloRenderer.render(vm.world, ...) reads entity.traits from that same world
 *      and reflects the trait state in RenderStats (rigidEntities, grabbableEntities,
 *      activeTraitIds) WITHOUT any Three.js TraitSystem involvement.
 *   3. The @grabbable visual effect (fill brightened by +40 RGB) is produced by the
 *      native renderer reading the VM world — no BrowserRuntime, no TraitSystem.
 *
 * Zero Three.js imports: holo-vm has no three.js dep; "native by construction."
 */
import { describe, it, expect } from 'vitest';
import { HoloBytecodeBuilder, type HoloBytecode } from '../bytecode';
import { HoloVM } from '../executor';
import { ComponentType, GeometryType, HoloTraitId } from '../opcodes';
import {
  NativeFramebuffer,
  SoftwareRasterBackend,
  NativeHoloRenderer,
  unpackColor,
  type OrthoCamera,
} from '../render/native-renderer';

const CAM: OrthoCamera = { pixelsPerUnit: 8, centerWorld: { x: 0, y: 0 } };
const CLEAR = { r: 18, g: 18, b: 22, a: 255 };

/** Build a HoloBytecode with one entity that has Transform + Geometry + Material + traits. */
function buildEntityBytecode(name: string, color: number, traitIds: HoloTraitId[]): HoloBytecode {
  const b = new HoloBytecodeBuilder();
  const idx = b.addEntity(name);

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
    color,
    metalness: 0,
    roughness: 1,
    emissive: 0,
    opacity: 1,
  } as unknown as Record<string, never>);

  // Store trait IDs directly on the entity definition via bytecode builder's trait list.
  // The HoloBytecodeBuilder exposes addTraitsToEntity (or we add them via the entity def).
  // Since HoloBytecodeBuilder.addEntity() returns an index and EntityDef carries a traits
  // array, we set them through the builder's raw entity accessor.
  for (const tid of traitIds) {
    b.addTraitToEntity(idx, tid);
  }

  return b.build();
}

describe('HoloVM APPLY_TRAIT → NativeHoloRenderer (D.083 native-first trait dispatch)', () => {
  it('APPLY_TRAIT opcode populates entity.traits inside vm.world', () => {
    // Build bytecode: one entity with @rigid and @grabbable traits set at init time.
    const bytecode = buildEntityBytecode('crate', 0xff0000, [
      HoloTraitId.Rigid,
      HoloTraitId.Grabbable,
    ]);

    const vm = new HoloVM();
    vm.load(bytecode);
    vm.tick(0); // run the init function

    // The entity is id=1 in the ECS world (first spawned).
    const entity = vm.world.getEntity(1);
    expect(entity).toBeDefined();
    expect(entity!.traits.has(HoloTraitId.Rigid)).toBe(true);
    expect(entity!.traits.has(HoloTraitId.Grabbable)).toBe(true);
  });

  it('NativeHoloRenderer reads @rigid trait from HoloVM world → rigidEntities in stats', () => {
    const bytecode = buildEntityBytecode('barrel', 0x00ff00, [HoloTraitId.Rigid]);

    const vm = new HoloVM();
    vm.load(bytecode);

    const fb = new NativeFramebuffer(64, 64);
    const stats = new NativeHoloRenderer(new SoftwareRasterBackend(fb)).render(
      vm.world,
      fb,
      CAM,
      CLEAR
    );

    // Entity is drawn.
    expect(stats.entitiesDrawn).toBe(1);
    // Renderer surfaces the rigid entity id from VM world state.
    expect(stats.rigidEntities).toHaveLength(1);
    expect(stats.rigidEntities[0]).toBe(1); // first entity = id 1
    // @rigid does NOT brighten the fill — color is unchanged green.
    expect(fb.pixel(32, 32)).toEqual({ r: 0, g: 255, b: 0, a: 255 });
    // activeTraitIds reflects the VM world state.
    expect(stats.activeTraitIds.has(HoloTraitId.Rigid)).toBe(true);
    expect(stats.activeTraitIds.has(HoloTraitId.Grabbable)).toBe(false);
  });

  it('NativeHoloRenderer reads @grabbable trait from HoloVM world → brightened fill + stat', () => {
    // Pure blue (0x0000ff = r:0, g:0, b:255). @grabbable adds +40 to each channel.
    // Expected pixel: r=40, g=40, b=255, a=255.
    const bytecode = buildEntityBytecode('orb', 0x0000ff, [HoloTraitId.Grabbable]);

    const vm = new HoloVM();
    vm.load(bytecode);

    const fb = new NativeFramebuffer(64, 64);
    const stats = new NativeHoloRenderer(new SoftwareRasterBackend(fb)).render(
      vm.world,
      fb,
      CAM,
      CLEAR
    );

    expect(stats.entitiesDrawn).toBe(1);
    expect(stats.grabbableEntities).toHaveLength(1);
    expect(stats.grabbableEntities[0]).toBe(1);
    expect(stats.activeTraitIds.has(HoloTraitId.Grabbable)).toBe(true);
    // Visual signal: fill is brightened by the renderer after reading entity.traits.
    // r=min(255,0+40)=40, g=min(255,0+40)=40, b=min(255,255+40)=255, a=255.
    expect(fb.pixel(32, 32)).toEqual({ r: 40, g: 40, b: 255, a: 255 });
    // Without trait, plain 0x0000ff would be r=0, g=0, b=255.
    // The difference proves the renderer is reading entity.traits, not guessing.
  });

  it('entity with both @rigid and @grabbable: stats + brightened fill', () => {
    const bytecode = buildEntityBytecode('crate-2', 0xff0000, [
      HoloTraitId.Rigid,
      HoloTraitId.Grabbable,
    ]);

    const vm = new HoloVM();
    vm.load(bytecode);

    const fb = new NativeFramebuffer(64, 64);
    const stats = new NativeHoloRenderer(new SoftwareRasterBackend(fb)).render(
      vm.world,
      fb,
      CAM,
      CLEAR
    );

    expect(stats.entitiesDrawn).toBe(1);
    expect(stats.rigidEntities).toContain(1);
    expect(stats.grabbableEntities).toContain(1);
    // @grabbable brightens: 0xff0000 → r=min(255,255+40)=255, g=40, b=40.
    expect(fb.pixel(32, 32)).toEqual({ r: 255, g: 40, b: 40, a: 255 });
  });

  it('NativeHoloRenderer reads @synced trait from HoloVM world as transport metadata', () => {
    const bytecode = buildEntityBytecode('replica', 0xff0000, [HoloTraitId.Synced]);

    const vm = new HoloVM();
    vm.load(bytecode);

    const fb = new NativeFramebuffer(64, 64);
    const stats = new NativeHoloRenderer(new SoftwareRasterBackend(fb)).render(
      vm.world,
      fb,
      CAM,
      CLEAR
    );

    expect(stats.entitiesDrawn).toBe(1);
    expect(stats.syncedEntities).toEqual([1]);
    expect(stats.activeTraitIds.has(HoloTraitId.Synced)).toBe(true);
    expect(fb.pixel(32, 32)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
  });

  it('NativeHoloRenderer reads @glowing trait from HoloVM world as emissive fill', () => {
    const bytecode = buildEntityBytecode('lamp', 0x000080, [HoloTraitId.Glowing]);

    const vm = new HoloVM();
    vm.load(bytecode);

    const fb = new NativeFramebuffer(64, 64);
    const stats = new NativeHoloRenderer(new SoftwareRasterBackend(fb)).render(
      vm.world,
      fb,
      CAM,
      CLEAR
    );

    expect(stats.entitiesDrawn).toBe(1);
    expect(stats.glowingEntities).toEqual([1]);
    expect(stats.activeTraitIds.has(HoloTraitId.Glowing)).toBe(true);
    expect(fb.pixel(32, 32)).toEqual({ r: 80, g: 80, b: 208, a: 255 });
  });

  it('NativeHoloRenderer reads @state_machine trait from HoloVM world as runtime metadata', () => {
    const bytecode = buildEntityBytecode('actor', 0xff0000, [HoloTraitId.StateMachine]);

    const vm = new HoloVM();
    vm.load(bytecode);

    const fb = new NativeFramebuffer(64, 64);
    const stats = new NativeHoloRenderer(new SoftwareRasterBackend(fb)).render(
      vm.world,
      fb,
      CAM,
      CLEAR
    );

    expect(stats.entitiesDrawn).toBe(1);
    expect(stats.stateMachineEntities).toEqual([1]);
    expect(stats.activeTraitIds.has(HoloTraitId.StateMachine)).toBe(true);
    expect(fb.pixel(32, 32)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
  });

  it('entity WITHOUT traits: stats show empty lists, no color change', () => {
    const bytecode = buildEntityBytecode('plain', 0xff0000, []);

    const vm = new HoloVM();
    vm.load(bytecode);

    const fb = new NativeFramebuffer(64, 64);
    const stats = new NativeHoloRenderer(new SoftwareRasterBackend(fb)).render(
      vm.world,
      fb,
      CAM,
      CLEAR
    );

    expect(stats.entitiesDrawn).toBe(1);
    expect(stats.rigidEntities).toHaveLength(0);
    expect(stats.grabbableEntities).toHaveLength(0);
    expect(stats.syncedEntities).toHaveLength(0);
    expect(stats.glowingEntities).toHaveLength(0);
    expect(stats.stateMachineEntities).toHaveLength(0);
    expect(stats.activeTraitIds.size).toBe(0);
    // Unmodified red fill.
    expect(fb.pixel(32, 32)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
  });

  it('unpackColor base case: @grabbable brightens via the renderer, not the material', () => {
    // Verify that a plain blue entity without the trait renders as pure blue.
    const bytecode = buildEntityBytecode('no-trait-blue', 0x0000ff, []);

    const vm = new HoloVM();
    vm.load(bytecode);

    const fb = new NativeFramebuffer(64, 64);
    new NativeHoloRenderer(new SoftwareRasterBackend(fb)).render(vm.world, fb, CAM, CLEAR);

    // Untouched: no @grabbable → no brightness boost.
    expect(fb.pixel(32, 32)).toEqual({ r: 0, g: 0, b: 255, a: 255 });
  });
});
