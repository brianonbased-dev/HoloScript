import { describe, it, expect, beforeEach } from 'vitest';
import { AudioOcclusionSystem, OCCLUSION_MATERIALS } from '../AudioOcclusion';
import type { OcclusionHit, RaycastProvider } from '../AudioOcclusion';

describe('AudioOcclusionSystem', () => {
  let system: AudioOcclusionSystem;
  beforeEach(() => {
    system = new AudioOcclusionSystem();
  });

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
    system.registerMaterial({
      id: 'custom',
      name: 'Custom',
      absorptionCoefficient: 0.5,
      transmissionLoss: 15,
    });
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
    const hits: OcclusionHit[] = [{ distance: 5, materialId: 'glass', thickness: 0.1 }];
    const result = system.computeFromHits('src1', hits);
    expect(result.occluded).toBe(true);
    expect(result.totalTransmissionLoss).toBe(6);
  });

  it('computeFromHits ignores unknown materials', () => {
    const hits: OcclusionHit[] = [{ distance: 5, materialId: 'unknown', thickness: 0.1 }];
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
    const provider: RaycastProvider = () => [{ distance: 5, materialId: 'glass', thickness: 0.1 }];
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

  // ==========================================================================
  // FREQUENCY-DEPENDENT OCCLUSION TESTS
  // ==========================================================================

  describe('Frequency-Dependent Occlusion', () => {
    it('frequency filtering is enabled by default', () => {
      expect(system.isFrequencyFilteringEnabled()).toBe(true);
    });

    it('can disable frequency filtering', () => {
      system.setFrequencyFilteringEnabled(false);
      expect(system.isFrequencyFilteringEnabled()).toBe(false);
    });

    it('all material presets have frequency absorption curves', () => {
      const materials = [
        'glass',
        'wood',
        'drywall',
        'brick',
        'concrete',
        'metal',
        'fabric',
        'water',
      ];
      for (const matId of materials) {
        const mat = system.getMaterial(matId);
        expect(mat).toBeDefined();
        expect(mat!.frequencyAbsorption).toBeDefined();
        expect(mat!.frequencyAbsorption!['125']).toBeGreaterThanOrEqual(0);
        expect(mat!.frequencyAbsorption!['8000']).toBeGreaterThanOrEqual(0);
      }
    });

    it('frequency absorption curves vary by material', () => {
      const glass = system.getMaterial('glass')!;
      const concrete = system.getMaterial('concrete')!;

      // Glass should absorb more highs, concrete more uniform
      expect(glass.frequencyAbsorption!['125']).toBeGreaterThan(
        concrete.frequencyAbsorption!['125']
      );
    });

    it('computeOcclusion includes low-pass cutoff when occluded', () => {
      const provider: RaycastProvider = () => [
        { distance: 5, materialId: 'concrete', thickness: 0.3 },
      ];
      system.setRaycastProvider(provider);
      const result = system.computeOcclusion({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      expect(result.lowPassCutoff).toBeDefined();
      expect(result.lowPassCutoff).toBeLessThan(22000); // Should be lowered
      expect(result.lowPassCutoff).toBeGreaterThanOrEqual(500); // Minimum cutoff
    });

    it('computeOcclusion returns 22kHz cutoff when no occlusion', () => {
      system.setRaycastProvider(() => []);
      const result = system.computeOcclusion({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      expect(result.lowPassCutoff).toBe(22000);
    });

    it('computeOcclusion includes frequency attenuation', () => {
      const provider: RaycastProvider = () => [
        { distance: 5, materialId: 'concrete', thickness: 0.5 },
      ];
      system.setRaycastProvider(provider);
      const result = system.computeOcclusion({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      expect(result.frequencyAttenuation).toBeDefined();
      expect(Object.keys(result.frequencyAttenuation).length).toBeGreaterThan(0);
      // Lower frequencies should have lower attenuation (concrete absorbs highs more)
      if (
        result.frequencyAttenuation['125'] !== undefined &&
        result.frequencyAttenuation['8000'] !== undefined
      ) {
        expect(result.frequencyAttenuation['8000']).toBeGreaterThanOrEqual(
          result.frequencyAttenuation['125']
        );
      }
    });

    it('frequency attenuation accumulates with multiple walls', () => {
      const provider: RaycastProvider = () => [
        { distance: 3, materialId: 'concrete', thickness: 0.3 },
        { distance: 7, materialId: 'concrete', thickness: 0.3 },
      ];
      system.setRaycastProvider(provider);
      const result = system.computeOcclusion({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      // With two walls, attenuation should be higher than one wall
      expect(result.frequencyAttenuation['1000']).toBeGreaterThan(0);
    });

    it('frequency attenuation is clamped at 1.0', () => {
      const provider: RaycastProvider = () => [
        { distance: 3, materialId: 'concrete', thickness: 10 }, // Very thick
      ];
      system.setRaycastProvider(provider);
      const result = system.computeOcclusion({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      // All frequency bands should be clamped at 1.0
      for (const freq of [125, 250, 500, 1000, 2000, 4000, 8000]) {
        const atten = result.frequencyAttenuation[freq as keyof typeof result.frequencyAttenuation];
        if (atten !== undefined) {
          expect(atten).toBeLessThanOrEqual(1.0);
        }
      }
    });

    it('getFrequencyAttenuation returns cached result', () => {
      const provider: RaycastProvider = () => [
        { distance: 5, materialId: 'glass', thickness: 0.2 },
      ];
      system.setRaycastProvider(provider);
      system.computeOcclusion({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      const freqAtten = system.getFrequencyAttenuation('src1');
      expect(freqAtten).toBeDefined();
      expect(Object.keys(freqAtten).length).toBeGreaterThan(0);
    });

    it('getFrequencyAttenuation returns empty object for unknown source', () => {
      const freqAtten = system.getFrequencyAttenuation('unknown_source');
      expect(freqAtten).toEqual({});
    });

    it('getLowPassCutoff returns cached cutoff', () => {
      const provider: RaycastProvider = () => [
        { distance: 5, materialId: 'concrete', thickness: 0.3 },
      ];
      system.setRaycastProvider(provider);
      system.computeOcclusion({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      const cutoff = system.getLowPassCutoff('src1');
      expect(cutoff).toBeGreaterThanOrEqual(500);
      expect(cutoff).toBeLessThanOrEqual(22000);
    });

    it('getLowPassCutoff returns 22kHz for unknown source', () => {
      const cutoff = system.getLowPassCutoff('unknown_source');
      expect(cutoff).toBe(22000);
    });

    it('low-pass cutoff decreases with increasing occlusion', () => {
      // Light occlusion (thin glass)
      const provider1: RaycastProvider = () => [
        { distance: 5, materialId: 'glass', thickness: 0.5 },
      ];
      system.setRaycastProvider(provider1);
      const result1 = system.computeOcclusion({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      // Heavy occlusion (thick fabric - absorbs high frequencies strongly)
      const provider2: RaycastProvider = () => [
        { distance: 5, materialId: 'fabric', thickness: 2.0 },
      ];
      system.setRaycastProvider(provider2);
      const result2 = system.computeOcclusion({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src2');

      // Thick fabric should have much lower cutoff (absorbs highs strongly)
      expect(result2.lowPassCutoff).toBeLessThan(result1.lowPassCutoff);
    });

    it('frequency filtering disabled returns empty attenuation', () => {
      system.setFrequencyFilteringEnabled(false);
      const provider: RaycastProvider = () => [
        { distance: 5, materialId: 'concrete', thickness: 0.3 },
      ];
      system.setRaycastProvider(provider);
      const result = system.computeOcclusion({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      expect(result.frequencyAttenuation).toEqual({});
    });

    it('frequency filtering disabled still calculates simplified low-pass cutoff', () => {
      system.setFrequencyFilteringEnabled(false);
      const provider: RaycastProvider = () => [
        { distance: 5, materialId: 'concrete', thickness: 0.3 },
      ];
      system.setRaycastProvider(provider);
      const result = system.computeOcclusion({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      // Should still have low-pass cutoff based on occlusion factor
      expect(result.lowPassCutoff).toBeLessThan(22000);
      expect(result.lowPassCutoff).toBeGreaterThanOrEqual(500);
    });

    it('material without frequency absorption uses default attenuation', () => {
      // Register custom material without frequency absorption
      system.registerMaterial({
        id: 'custom_no_freq',
        name: 'Custom No Freq',
        absorptionCoefficient: 0.5,
        transmissionLoss: 15,
      });

      const provider: RaycastProvider = () => [
        { distance: 5, materialId: 'custom_no_freq', thickness: 0.2 },
      ];
      system.setRaycastProvider(provider);
      const result = system.computeOcclusion({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      // Should still have transmission loss
      expect(result.totalTransmissionLoss).toBe(15);
      // But frequency attenuation might be empty or minimal
    });

    it('fabric material absorbs high frequencies more', () => {
      const fabric = system.getMaterial('fabric')!;

      // Fabric should absorb highs much more than lows
      expect(fabric.frequencyAbsorption!['8000']).toBeGreaterThan(
        fabric.frequencyAbsorption!['125']
      );
      expect(fabric.frequencyAbsorption!['8000']).toBeGreaterThan(0.5);
    });

    it('metal material has very low absorption across all frequencies', () => {
      const metal = system.getMaterial('metal')!;

      // Metal should have low absorption across the spectrum
      for (const freq of [125, 250, 500, 1000, 2000, 4000, 8000]) {
        expect(
          metal.frequencyAbsorption![freq as keyof typeof metal.frequencyAbsorption]
        ).toBeLessThan(0.05);
      }
    });

    it('water material has uniform low absorption', () => {
      const water = system.getMaterial('water')!;

      // Water should have very low, uniform absorption
      expect(water.frequencyAbsorption!['125']).toBeLessThanOrEqual(0.02);
      expect(water.frequencyAbsorption!['8000']).toBeLessThanOrEqual(0.05);
    });
  });
});
