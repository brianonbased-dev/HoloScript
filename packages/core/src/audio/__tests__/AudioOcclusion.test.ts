import { describe, it, expect, beforeEach } from 'vitest';
import { AudioOcclusionSystem, OCCLUSION_MATERIALS } from '../AudioOcclusion';
import type { OcclusionHit, RaycastProvider } from '../AudioOcclusion';

describe('AudioOcclusionSystem', () => {
  let system: AudioOcclusionSystem;
  beforeEach(() => { system = new AudioOcclusionSystem(); });

  // --- Default materials ---
  it('loads default material presets', () => {
    expect(system.getMaterial('glass')).toBeDefined();
    expect(system.getMaterial('concrete')).toBeDefined();
    expect(system.getMaterial('wood')).toBeDefined();
    expect(system.getMaterial('metal')).toBeDefined();
  });

  it('OCCLUSION_MATERIALS has expected presets', () => {
    expect(Object.keys(OCCLUSION_MATERIALS).length).toBeGreaterThanOrEqual(6);
    expect(OCCLUSION_MATERIALS.glass.transmissionLoss).toBe(6);
    expect(OCCLUSION_MATERIALS.concrete.transmissionLoss).toBe(30);
  });

  // --- Custom materials ---
  it('registerMaterial adds custom material', () => {
    system.registerMaterial({ id: 'custom', name: 'Custom', absorptionCoefficient: 0.5, transmissionLoss: 15 });
    expect(system.getMaterial('custom')!.transmissionLoss).toBe(15);
  });

  it('getMaterial returns undefined for unknown', () => {
    expect(system.getMaterial('nonexistent')).toBeUndefined();
  });

  // --- Occlusion without raycast provider ---
  it('computeOcclusion returns unoccluded when no provider', () => {
    const result = system.computeOcclusion({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');
    expect(result.occluded).toBe(false);
    expect(result.occlusionFactor).toBe(0);
  });

  // --- Occlusion with raycast provider ---
  it('computeOcclusion detects wall occlusion', () => {
    const provider: RaycastProvider = () => [
      { distance: 5, materialId: 'concrete', thickness: 0.3 },
    ];
    system.setRaycastProvider(provider);
    const result = system.computeOcclusion({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');
    expect(result.occluded).toBe(true);
    expect(result.hitCount).toBe(1);
    expect(result.totalTransmissionLoss).toBe(30);
    expect(result.materials).toContain('concrete');
  });

  it('computeOcclusion accumulates multiple walls', () => {
    const provider: RaycastProvider = () => [
      { distance: 3, materialId: 'glass', thickness: 0.1 },
      { distance: 7, materialId: 'wood', thickness: 0.2 },
    ];
    system.setRaycastProvider(provider);
    const result = system.computeOcclusion({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');
    expect(result.hitCount).toBe(2);
    expect(result.totalTransmissionLoss).toBe(6 + 12); // glass + wood
  });

  it('computeOcclusion caps at maxTransmissionLoss', () => {
    system.setMaxTransmissionLoss(20);
    const provider: RaycastProvider = () => [
      { distance: 5, materialId: 'concrete', thickness: 0.5 }, // 30 dB > 20 cap
    ];
    system.setRaycastProvider(provider);
    const result = system.computeOcclusion({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');
    expect(result.totalTransmissionLoss).toBe(20);
    expect(result.occlusionFactor).toBe(1); // capped at max
  });

  it('computeOcclusion same-position returns unoccluded', () => {
    system.setRaycastProvider(() => []);
    const result = system.computeOcclusion({ x: 5, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, 'src1');
    expect(result.occluded).toBe(false);
  });

  // --- computeFromHits ---
  it('computeFromHits works without raycast provider', () => {
    const hits: OcclusionHit[] = [
      { distance: 5, materialId: 'glass', thickness: 0.1 },
    ];
    const result = system.computeFromHits('src1', hits);
    expect(result.occluded).toBe(true);
    expect(result.totalTransmissionLoss).toBe(6);
  });

  it('computeFromHits ignores unknown materials', () => {
    const hits: OcclusionHit[] = [
      { distance: 5, materialId: 'unknown', thickness: 0.1 },
    ];
    const result = system.computeFromHits('src1', hits);
    expect(result.totalTransmissionLoss).toBe(0);
    expect(result.occluded).toBe(false);
  });

  // --- Volume multiplier ---
  it('getVolumeMultiplier returns 1 for no occlusion', () => {
    expect(system.getVolumeMultiplier(0)).toBeCloseTo(1, 3);
  });

  it('getVolumeMultiplier returns < 1 for partial occlusion', () => {
    const mult = system.getVolumeMultiplier(0.5);
    expect(mult).toBeGreaterThan(0);
    expect(mult).toBeLessThan(1);
  });

  it('getVolumeMultiplier returns near 0 for full occlusion', () => {
    const mult = system.getVolumeMultiplier(1);
    expect(mult).toBeLessThan(0.01);
  });

  // --- Cache ---
  it('computeOcclusion caches results', () => {
    const provider: RaycastProvider = () => [
      { distance: 5, materialId: 'glass', thickness: 0.1 },
    ];
    system.setRaycastProvider(provider);
    system.computeOcclusion({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');
    const cached = system.getCachedResult('src1');
    expect(cached).toBeDefined();
    expect(cached!.hitCount).toBe(1);
  });

  it('clearCache removes all cached results', () => {
    system.setRaycastProvider(() => [{ distance: 5, materialId: 'glass', thickness: 0.1 }]);
    system.computeOcclusion({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');
    system.clearCache();
    expect(system.getCachedResult('src1')).toBeUndefined();
  });
});
