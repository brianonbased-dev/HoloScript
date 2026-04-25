import { describe, it, expect, beforeEach } from 'vitest';
import { AudioOcclusionSystem, OCCLUSION_MATERIALS } from '@holoscript/engine/audio';

describe('AudioOcclusionSystem', () => {
  let occ: AudioOcclusionSystem;

  beforeEach(() => {
    occ = new AudioOcclusionSystem();
  });

  it('has default materials registered', () => {
    expect(occ.getMaterial('glass')).toBeDefined();
    expect(occ.getMaterial('concrete')).toBeDefined();
    expect(occ.getMaterial('metal')).toBeDefined();
  });

  it('no occlusion without raycast provider', () => {
    const r = occ.computeOcclusion([0, 0, 0], [10, 0, 0], 'src1');
    expect(r.occluded).toBe(false);
    expect(r.occlusionFactor).toBe(0);
  });

  it('computes occlusion with raycast hits', () => {
    occ.setRaycastProvider(() => [{ distance: 3, materialId: 'glass', thickness: 0.1 }]);
    const r = occ.computeOcclusion([0, 0, 0], [10, 0, 0], 'src1');
    expect(r.occluded).toBe(true);
    expect(r.hitCount).toBe(1);
    expect(r.totalTransmissionLoss).toBe(6); // glass=6dB
    expect(r.materials).toContain('glass');
  });

  it('multiple materials accumulate loss', () => {
    occ.setRaycastProvider(() => [
      { distance: 2, materialId: 'glass', thickness: 0.1 },
      { distance: 5, materialId: 'concrete', thickness: 0.3 },
    ]);
    const r = occ.computeOcclusion([0, 0, 0], [10, 0, 0], 'src1');
    expect(r.totalTransmissionLoss).toBe(36); // glass 6 + concrete 30
  });

  it('caps total loss at maxTransmissionLoss', () => {
    occ.setMaxTransmissionLoss(20);
    occ.setRaycastProvider(() => [{ distance: 2, materialId: 'concrete', thickness: 0.3 }]);
    const r = occ.computeOcclusion([0, 0, 0], [10, 0, 0], 'src1');
    expect(r.totalTransmissionLoss).toBe(20);
    expect(r.occlusionFactor).toBe(1); // capped = max
  });

  it('computeFromHits works without raycast provider', () => {
    const r = occ.computeFromHits('src1', [{ distance: 1, materialId: 'wood', thickness: 0.2 }]);
    expect(r.occluded).toBe(true);
    expect(r.totalTransmissionLoss).toBe(12); // wood=12dB
  });

  it('getVolumeMultiplier converts factor to linear', () => {
    // Factor 0 → no loss → multiplier 1
    expect(occ.getVolumeMultiplier(0)).toBeCloseTo(1, 3);
    // Factor 1 → full maxLoss=60dB → multiplier = 10^(-60/20) = 0.001
    expect(occ.getVolumeMultiplier(1)).toBeCloseTo(0.001, 3);
  });

  it('caches results', () => {
    occ.setRaycastProvider(() => [{ distance: 3, materialId: 'glass', thickness: 0.1 }]);
    occ.computeOcclusion([0, 0, 0], [10, 0, 0], 'src1');
    expect(occ.getCachedResult('src1')).toBeDefined();
    expect(occ.getCachedResult('src1')!.hitCount).toBe(1);
  });

  it('clearCache removes cached results', () => {
    occ.setRaycastProvider(() => [{ distance: 3, materialId: 'glass', thickness: 0.1 }]);
    occ.computeOcclusion([0, 0, 0], [10, 0, 0], 'src1');
    occ.clearCache();
    expect(occ.getCachedResult('src1')).toBeUndefined();
  });

  it('registers custom material', () => {
    occ.registerMaterial({
      id: 'foam',
      name: 'Foam',
      absorptionCoefficient: 0.9,
      transmissionLoss: 1,
    });
    expect(occ.getMaterial('foam')?.transmissionLoss).toBe(1);
  });

  it('same-position source returns non-occluded', () => {
    occ.setRaycastProvider(() => [{ distance: 0, materialId: 'glass', thickness: 0 }]);
    const r = occ.computeOcclusion([5, 0, 0], [5, 0, 0], 'src1');
    expect(r.occluded).toBe(false);
  });
});
