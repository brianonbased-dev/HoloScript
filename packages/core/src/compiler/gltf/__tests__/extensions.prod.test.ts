/**
 * glTF Extensions Production Tests
 *
 * Tests all KHR/EXT extension factory functions, IOR constants,
 * light creation helpers, and extension declaration utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_EXTENSIONS,
  IOR_VALUES,
  createUnlitExtension,
  createEmissiveStrengthExtension,
  createClearcoatExtension,
  createTransmissionExtension,
  createIORExtension,
  createLight,
  createDirectionalLight,
  createPointLight,
  createSpotLight,
  createSheenExtension,
  createAnisotropyExtension,
  createVolumeExtension,
  createIridescenceExtension,
  createInstancedMeshExtension,
  collectUsedExtensions,
  isExtensionRequired,
  declareExtensions,
} from '../extensions';

describe('glTF Extensions — Production', () => {
  // ─── Constants ─────────────────────────────────────────────────────────────

  it('SUPPORTED_EXTENSIONS has 16 entries', () => {
    expect(SUPPORTED_EXTENSIONS.length).toBe(16);
  });

  it('IOR_VALUES contains common materials', () => {
    expect(IOR_VALUES.water).toBe(1.33);
    expect(IOR_VALUES.diamond).toBe(2.417);
    expect(IOR_VALUES.glass).toBe(1.5);
  });

  // ─── Material Extensions ──────────────────────────────────────────────────

  it('createUnlitExtension', () => {
    const ext = createUnlitExtension();
    expect(ext.KHR_materials_unlit).toEqual({});
  });

  it('createEmissiveStrengthExtension', () => {
    const ext = createEmissiveStrengthExtension(5);
    expect(ext.KHR_materials_emissive_strength.emissiveStrength).toBe(5);
  });

  it('createEmissiveStrengthExtension clamps negative', () => {
    const ext = createEmissiveStrengthExtension(-1);
    expect(ext.KHR_materials_emissive_strength.emissiveStrength).toBe(0);
  });

  it('createClearcoatExtension defaults', () => {
    const ext = createClearcoatExtension({});
    expect(ext.KHR_materials_clearcoat.clearcoatFactor).toBe(1);
    expect(ext.KHR_materials_clearcoat.clearcoatRoughnessFactor).toBe(0);
  });

  it('createClearcoatExtension custom', () => {
    const ext = createClearcoatExtension({ factor: 0.5, roughness: 0.3 });
    expect(ext.KHR_materials_clearcoat.clearcoatFactor).toBe(0.5);
  });

  it('createTransmissionExtension clamps 0-1', () => {
    expect(createTransmissionExtension(0.5).KHR_materials_transmission.transmissionFactor).toBe(0.5);
    expect(createTransmissionExtension(2).KHR_materials_transmission.transmissionFactor).toBe(1);
    expect(createTransmissionExtension(-1).KHR_materials_transmission.transmissionFactor).toBe(0);
  });

  it('createIORExtension clamps minimum 1', () => {
    expect(createIORExtension(1.5).KHR_materials_ior.ior).toBe(1.5);
    expect(createIORExtension(0.5).KHR_materials_ior.ior).toBe(1);
  });

  it('createSheenExtension defaults', () => {
    const ext = createSheenExtension({});
    expect(ext.KHR_materials_sheen.sheenColorFactor).toEqual([1, 1, 1]);
    expect(ext.KHR_materials_sheen.sheenRoughnessFactor).toBe(0.5);
  });

  it('createAnisotropyExtension clamps strength', () => {
    const ext = createAnisotropyExtension({ strength: 2 });
    expect(ext.KHR_materials_anisotropy.anisotropyStrength).toBe(1);
  });

  it('createVolumeExtension defaults', () => {
    const ext = createVolumeExtension({});
    expect(ext.KHR_materials_volume.thicknessFactor).toBe(1);
    expect(ext.KHR_materials_volume.attenuationColor).toEqual([1, 1, 1]);
  });

  it('createIridescenceExtension defaults', () => {
    const ext = createIridescenceExtension({});
    expect(ext.KHR_materials_iridescence.iridescenceFactor).toBe(1);
    expect(ext.KHR_materials_iridescence.iridescenceIor).toBe(1.3);
    expect(ext.KHR_materials_iridescence.iridescenceThicknessMinimum).toBe(100);
  });

  // ─── Lights ───────────────────────────────────────────────────────────────

  it('createDirectionalLight defaults', () => {
    const light = createDirectionalLight();
    expect(light.type).toBe('directional');
    expect(light.color).toEqual([1, 1, 1]);
    expect(light.intensity).toBe(1);
  });

  it('createPointLight with range', () => {
    const light = createPointLight([1, 0, 0], 2, 50);
    expect(light.type).toBe('point');
    expect(light.range).toBe(50);
  });

  it('createSpotLight includes spot data', () => {
    const light = createSpotLight([1, 1, 1], 1, 0.1, 0.5);
    expect(light.type).toBe('spot');
    expect(light.spot).toBeDefined();
    expect(light.spot!.innerConeAngle).toBe(0.1);
    expect(light.spot!.outerConeAngle).toBe(0.5);
  });

  it('createLight with name', () => {
    const light = createLight({ name: 'Sun', type: 'directional', intensity: 3 });
    expect(light.name).toBe('Sun');
  });

  // ─── GPU Instancing ───────────────────────────────────────────────────────

  it('createInstancedMeshExtension', () => {
    const ext = createInstancedMeshExtension({ translationAccessor: 0, scaleAccessor: 2 });
    expect(ext.EXT_mesh_gpu_instancing.attributes.TRANSLATION).toBe(0);
    expect(ext.EXT_mesh_gpu_instancing.attributes.SCALE).toBe(2);
    expect(ext.EXT_mesh_gpu_instancing.attributes.ROTATION).toBeUndefined();
  });

  // ─── Extension Helpers ────────────────────────────────────────────────────

  it('collectUsedExtensions from materials', () => {
    const gltf = {
      materials: [
        { extensions: { KHR_materials_unlit: {} } },
        { extensions: { KHR_materials_clearcoat: { clearcoatFactor: 1 } } },
      ],
    };
    const used = collectUsedExtensions(gltf);
    expect(used).toContain('KHR_materials_unlit');
    expect(used).toContain('KHR_materials_clearcoat');
  });

  it('collectUsedExtensions empty returns empty', () => {
    expect(collectUsedExtensions({})).toEqual([]);
  });

  it('isExtensionRequired for draco', () => {
    expect(isExtensionRequired('KHR_draco_mesh_compression')).toBe(true);
    expect(isExtensionRequired('KHR_materials_unlit')).toBe(false);
  });

  it('declareExtensions populates extensionsUsed', () => {
    const gltf: Record<string, unknown> = {
      materials: [{ extensions: { KHR_draco_mesh_compression: {} } }],
    };
    declareExtensions(gltf);
    expect((gltf.extensionsUsed as string[])).toContain('KHR_draco_mesh_compression');
    expect((gltf.extensionsRequired as string[])).toContain('KHR_draco_mesh_compression');
  });

  it('declareExtensions skips if no extensions', () => {
    const gltf: Record<string, unknown> = {};
    declareExtensions(gltf);
    expect(gltf.extensionsUsed).toBeUndefined();
  });
});
